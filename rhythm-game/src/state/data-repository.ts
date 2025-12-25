import { getAllBundledCharts } from "src/assets/bundled-charts";
import { sleepForAsyncTesting } from "src/debug-flags";
import { EffectRack, serializeEffectRack } from "src/dsp/dsp-loop-effect-rack";
import { filterInPlace } from "src/utils/array-utils";
import { assert } from "src/utils/assert";
import * as idb from "src/utils/indexed-db";
import { AsyncContext, newAsyncContext, waitFor, waitForOne } from "src/utils/promise-utils";
import {
    CHART_STATUS_READONLY,
    CHART_STATUS_SAVED,
    CHART_STATUS_UNSAVED,
    compressChart,
    isBundledChartId,
    SequencerChart,
    SequencerChartCompressed,
    uncompressChart
} from "./sequencer-chart";

/////////////////////////////////////
// Data repository core utils

const TBL_CHART_METADATA      = idb.newTableName<SequencerChartMetadata>("chart_metadata");
const TBL_CHART_DATA          = idb.newTableName<SequencerChartCompressed>("chart_data");
const TBL_EFFECT_RACK_PRESETS = idb.newTableName<EffectRackPreset>("effect_rack_presets");

const tables = {
    chartMetadata: idb.newTable(TBL_CHART_METADATA, "id", idb.KEYGEN_AUTOINCREMENT), 
    chartData:     idb.newTable(TBL_CHART_DATA,     "i",  idb.KEYGEN_NONE),

    effectsRackPresets: idb.newTable(TBL_EFFECT_RACK_PRESETS, "id", idb.KEYGEN_AUTOINCREMENT),
} as const satisfies idb.AllTables;

const tablesVersion = 3;

// This is actually the central place where we load/save all data. 
// This design may allow for smarter batching of saving/loading multiple different entities at once.
export type DataRepository = {
    db: IDBDatabase;
    charts: {
        allChartMetadata: SequencerChartMetadata[];
        allChartMetadataLoading: AsyncContext;
    };
    effectRackPresets: {
        allEffectRackPresets: EffectRackPreset[];
        allEffectRackPresetsLoading: AsyncContext;
    };
};

export function newDataRepository(): Promise<DataRepository> {
    const a = newAsyncContext("Initializing chart repository");

    const idbConnected = idb.openConnection("KeyboardRhythmGameIDB", tablesVersion, tables, {
        onBlocked(event: IDBVersionChangeEvent) {
            console.error("IDB blocked!", { event });
        },
        onUnexpectedlyClosed() {
            console.error("IDB unexpectedly closed!");
        }
    });

    return waitFor(a, [idbConnected], ([db]) => {
        const repo: DataRepository = {
            db: db,
            charts: {
                allChartMetadata: [],
                allChartMetadataLoading: newAsyncContext("Loading chart metadata list"),
            },
            effectRackPresets: {
                allEffectRackPresets: [],
                allEffectRackPresetsLoading: newAsyncContext("Loading effect rack presets"),
            }
        };

        setChartMetadataList(
            repo,
            getAllBundledCharts().map(toChartMetadata)
        );

        return repo;
    });
}

function repositoryReadTx(repo: DataRepository, tables: idb.AnyTable[]) {
    const tx = idb.newReadTransaction(repo.db, tables);
    return tx;
}

function repositoryWriteTx(repo: DataRepository, tables: idb.AnyTable[]) {
    const tx = idb.newWriteTransaction(repo.db, tables);
    return tx;
}

export type SaveResult = 0 | { error: string; }

/////////////////////////////////////
// Charts

export function loadChartMetadataList(repo: DataRepository) {
    const tx = repositoryReadTx(repo, [tables.chartMetadata]);

    return waitFor(repo.charts.allChartMetadataLoading.bump(), [
        idb.getAll(tx, tables.chartMetadata),
        sleepForAsyncTesting(),
    ], ([charts]) => {
        // Add bundled charts too.
        const bundled = getAllBundledCharts().map(toChartMetadata);
        setChartMetadataList(repo, [...charts, ...bundled]);
    });
}

function setChartMetadataList(repo: DataRepository, metadata: SequencerChartMetadata[]) {
    metadata.sort((a, b) => a.name.localeCompare(b.name));

    // reindex _at the end_
    for (let i = 0; i < metadata.length; i++) {
        metadata[i]._index = i;
    }

    repo.charts.allChartMetadata = metadata;
}

export function cleanupChartRepo(a: AsyncContext, repo: DataRepository) {
    let cleanedUp: any[] = [];

    const tx = repositoryWriteTx(repo, [tables.chartMetadata, tables.chartData]);

    return waitFor(a, [
        idb.getAll(tx, tables.chartMetadata),
    ], ([
        metadatas
    ]) => {

        const chartCleanedTasks = metadatas.map(chart => {
            const chartMetadataLoaded = waitForOne(a, idb.getOne(tx, tables.chartData, chart.id));

            return waitFor(a, [chartMetadataLoaded, sleepForAsyncTesting()], ([data]) => {
                if (isBundledChartId(chart.id) || !data) {
                    cleanedUp.push(chart);
                    return idb.deleteOne(tx, tables.chartMetadata, chart.id);
                } else {
                    let modified = false;

                    if (data.n.trim() !== data.n) {
                        data.n = data.n.trim();
                        modified = true;
                    }

                    if (modified) {
                        cleanedUp.push(chart);
                        return idb.putOne(tx, tables.chartData, data);
                    }
                    return;
                }
            })
        });

        const allChartsCleaned = waitFor(a, chartCleanedTasks, () => true);

        return waitFor(a, [allChartsCleaned], () => {
            if (cleanedUp.length > 0) {
                console.warn("Cleaned up non-matching or wrongly saved records: ", cleanedUp);
            }
        });
    });
}

export type SequencerChartMetadata = Pick<SequencerChart, "id" | "name"> & { _index: number; };

export function queryChart(a: AsyncContext, repo: DataRepository, id: number): Promise<SequencerChart> {
    if (isBundledChartId(id)) {
        // Bundled charts will load substantially faster, since they come with the game
        const bundled = getAllBundledCharts();
        const chart = bundled.find(c => c.id === id)
        if (!chart) {
            throw new Error("Couldn't find bundled chart for id=" + id);
        }

        return Promise.resolve(chart);
    }

    // TODO: cache this codepath

    const tx = repositoryReadTx(repo, [tables.chartData]);

    const compresedChartLoaded = waitForOne(a, idb.getOne(tx, tables.chartData, id));

    const slept = sleepForAsyncTesting();

    return waitFor(a, [compresedChartLoaded, slept], ([compressedChart]) => {
        if (!compressedChart) {
            throw new Error("Couldn't find a chart with id=" + id);
        }

        // TODO: saved/unsaved status system to avoid needless saves/loads.
        // or remove if we think its useless.
        const chart = uncompressChart(compressedChart, CHART_STATUS_UNSAVED);
        return chart;
    });
}

export function saveChart(a: AsyncContext, repo: DataRepository, chart: SequencerChart): Promise<SaveResult> {
    if (isBundledChartId(chart.id)) {
        return Promise.resolve({ error: "Can't save a bundled chart. Copy it first" });
    }

    if (chart._savedStatus === CHART_STATUS_READONLY) {
        return Promise.resolve({ error: "Can't save a readonly chart. Copy it first" });
    }

    const tx = repositoryWriteTx(repo, [tables.chartData, tables.chartMetadata]);

    const existingMetadataLoaded = waitForOne(a, idb.getOne(tx, tables.chartMetadata, chart.id));
    const existingDataLoaded     = waitForOne(a, idb.getOne(tx, tables.chartData, chart.id));

    const existingLoaded = waitFor(a, [
        existingMetadataLoaded, 
        existingDataLoaded,
    ], ([
        existingMetadata, 
        existingData
    ]) => {
        if (!existingMetadata) {
            throw new Error("Metadata doesn't already exist");
        }
        if (!existingData) {
            throw new Error("Data doesn't already exist");
        }
    })

    const metadataAndDataSaved = waitFor(a, [existingLoaded], () => {
        const chartCompressed = compressChart(chart);
        const metadata        = toChartMetadata(chart);

        return waitFor(a, [
            idb.putOne(tx, tables.chartMetadata, metadata),
            idb.putOne(tx, tables.chartData, chartCompressed),
        ], () => true);
    });

    return waitFor(a, [
        metadataAndDataSaved,
        sleepForAsyncTesting(),
    ], () => {
        if (chart._savedStatus === CHART_STATUS_UNSAVED) {
            chart._savedStatus = CHART_STATUS_SAVED;
        }

        return 0;
    });
}

function asNumericId(id: idb.ValidKey): number {
    assert(typeof id === "number");
    return id;
}

// Creates a chart, returns it's id
export function createChart(a: AsyncContext, repo: DataRepository, chart: SequencerChart): Promise<number> {
    chart.name = chart.name.trim();

    const tx = repositoryWriteTx(repo, [tables.chartMetadata, tables.chartData]);

    const data     = compressChart(chart);
    const metadata = toChartMetadata(chart);

    const metadataCreated = waitForOne(a, idb.createOne(tx, tables.chartMetadata, metadata));

    const dataCreated = waitFor(a, [metadataCreated], ([]) => {
        // Link the data to the metadata
        data.i = metadata.id;
        return idb.putOne(tx, tables.chartData, data);
    });

    return waitFor(a, [metadataCreated, dataCreated], ([]) => {
        // Since we know what happens to the list when we create an item in the database, we can 
        // simply do the same on our side as well, rather than reloading all entries from the database.

        const allCharts = repo.charts.allChartMetadata;
        const idx = allCharts.findIndex(val => val.id === metadata.id);
        if (idx === -1) {
            allCharts.push(metadata);
        }

        return metadata.id;
    });
}

export function deleteChart(a: AsyncContext, repo: DataRepository, chartToDelete: SequencerChart): Promise<void> {
    if (chartToDelete._savedStatus === CHART_STATUS_READONLY) {
        throw new Error("Can't delete a bundled chart");
    }

    if (chartToDelete.id <= 0) {
        return Promise.resolve();
    }

    const tx = repositoryWriteTx(repo, [tables.chartData, tables.chartMetadata]);

    const metadata = repo.charts.allChartMetadata.find(m => m.id === chartToDelete.id);
    if (!metadata) {
        console.error("Not present in the metadata list: ", chartToDelete);
        return Promise.resolve();
    }

    return waitFor(a, [
        idb.deleteOne(tx, tables.chartMetadata, metadata.id),
        idb.deleteOne(tx, tables.chartData, chartToDelete.id),
        sleepForAsyncTesting(),
    ], () => {
        const allCharts = repo.charts.allChartMetadata;
        filterInPlace(allCharts, chart => chartToDelete.id !== chart.id);
        setChartMetadataList(repo, allCharts);
    });
}

export function toChartMetadata(chart: SequencerChart): SequencerChartMetadata {
    let result: SequencerChartMetadata = {
        id:   chart.id,
        name: chart.name,
        _index: 0,
    };
    return result;
}

export function findChartMetadata(repo: DataRepository, id: number): SequencerChartMetadata | undefined {
    return repo.charts.allChartMetadata.find(chart => chart.id === id);
}

/////////////////////////////////////
// Effects rack presets

export type EffectRackPreset = {
    id: number;
    name: string;
    serialized: string;
};

export function effectRackToPreset(effectRack: EffectRack): EffectRackPreset {
    return {
        id: 0,
        name: "Unnamed",
        serialized: serializeEffectRack(effectRack),
    };
}

export function loadAllEffectRackPresets(repo: DataRepository): Promise<void> {
    const a = repo.effectRackPresets.allEffectRackPresetsLoading;

    const tx = repositoryReadTx(repo, [tables.effectsRackPresets])

    a.bump();
    const effectsLoaded = waitForOne(a, idb.getAll(tx, tables.effectsRackPresets));

    return waitFor(a, [effectsLoaded], ([effects]) => {
        repo.effectRackPresets.allEffectRackPresets = effects;
        sortPresetsByName(repo);
    });
}

export function createEffectRackPreset(repo: DataRepository, preset: EffectRackPreset): Promise<void> {
    repo.effectRackPresets.allEffectRackPresets.push(preset);

    const tx = repositoryWriteTx(repo, [tables.effectsRackPresets]);
    const a = newAsyncContext("Creating effects rack preset");
    return waitFor(a, [idb.createOne(tx, tables.effectsRackPresets, preset)], () => {
        sortPresetsByName(repo);
    })
}

export function updateEffectRackPreset(repo: DataRepository, preset: EffectRackPreset): Promise<void> {
    assert(preset.id > 0);
    assert(repo.effectRackPresets.allEffectRackPresets.indexOf(preset) !== -1);

    const tx = repositoryWriteTx(repo, [tables.effectsRackPresets]);
    const a = newAsyncContext("Updating effects rack preset");
    return waitFor(a, [idb.putOne(tx, tables.effectsRackPresets, preset)], () => {
        sortPresetsByName(repo);
    })
}

export function deleteEffectRackPreset(repo: DataRepository, preset: EffectRackPreset): Promise<void> {
    const tx = repositoryWriteTx(repo, [tables.effectsRackPresets]);
    const a = newAsyncContext("Deleting effects rack preset");
    const deleted = waitForOne(a, idb.deleteOne(tx, tables.effectsRackPresets, preset.id));
    return waitFor(a, [deleted], () => {
        filterInPlace(repo.effectRackPresets.allEffectRackPresets, p => p !== preset);
        sortPresetsByName(repo);
    });
}

function sortPresetsByName(repo: DataRepository) {
    const presets = repo.effectRackPresets.allEffectRackPresets;
    presets.sort((a, b) => a.name.localeCompare(b.name));
}
