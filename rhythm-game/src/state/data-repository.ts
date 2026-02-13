import { getAllBundledCharts, getAllBundledChartsMetadata } from "src/assets/bundled-charts";
import { EffectRack, serializeEffectRack } from "src/state/effect-rack";
import { filterInPlace } from "src/utils/array-utils";
import { assert } from "src/utils/assert";
import { AsyncCb, AsyncDone, AsyncCallback, AsyncCallbackResult, DONE, newError, parallelIterator, toTrackedCallback } from "src/utils/async-utils";
import * as idb from "src/utils/indexed-db";
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


function compressedChartToMetadata(compressedChart: SequencerChartCompressed): SequencerChartMetadata {
    return {
        id:   compressedChart.i,
        name: compressedChart.n
    };
}

const tables = {
    chart: idb.newDataMetadataTablePairDefinition<SequencerChartCompressed, SequencerChartMetadata>(
        "chart", "i", "id", compressedChartToMetadata
    ),
    // User-created presets.
    effectsRackPresets:      idb.newTableDefinition("effect_rack_presets", "id", idb.KEYGEN_AUTOINCREMENT),
    // System presets.
    effectRackPresetsSystem: idb.newTableDefinition("effect_rack_presets_system", "id", idb.KEYGEN_AUTOINCREMENT),
} as const satisfies idb.AllTables;

const tablesVersion = 5;


// This is actually the central place where we load/save all data. 
// This design may allow for smarter batching of saving/loading multiple different entities at once.
export type DataRepository = {
    db: IDBDatabase;
    charts: {
        allChartMetadata: SequencerChartMetadata[];
        loading: boolean;
    };
    effectRackPresets: {
        loading: boolean;
        allEffectRackPresets: EffectRackPreset[];
        groups: Map<string, EffectRackPreset[]>;
    };
    effectRackPresetsSystem: {
        autoSaved: EffectRackPreset | null;
    };
};

const SYSTEM_PRESET_IDS = {
    autoSaved: 1,
}

export function newDataRepository(cb: AsyncCallback<DataRepository>): AsyncDone {
    return idb.openConnection("KeyboardRhythmGameIDB", tablesVersion, tables, {
        onBlocked(event: IDBVersionChangeEvent) {
            console.error("IDB blocked!", { event });
        },
        onUnexpectedlyClosed() {
            console.error("IDB unexpectedly closed!");
        }
    }, onConnected);

    function onConnected(db: IDBDatabase | undefined, err: any): AsyncDone {
        if (err || !db) return cb(undefined, err);

        const repo: DataRepository = {
            db: db,
            charts: {
                allChartMetadata: [],
                loading: false,
            },
            effectRackPresets: {
                allEffectRackPresets: [],
                groups: new Map(),
                loading: false,
            },
            effectRackPresetsSystem: {
                autoSaved: null,
            }
        };

        updateAvailableMetadata(repo, []);

        return cb(repo, undefined);
    }
}

function repositoryReadTx(repo: DataRepository, tables: idb.AnyTableDef[]) {
    const tx = idb.newReadTransaction(repo.db, tables);
    return tx;
}

function repositoryWriteTx(repo: DataRepository, tables: idb.AnyTableDef[]) {
    const tx = idb.newWriteTransaction(repo.db, tables);
    return tx;
}

/////////////////////////////////////
// Charts

export function loadChartMetadataList(repo: DataRepository, cb: AsyncCb<SequencerChartMetadata[]>): AsyncDone {
    const tx = repositoryReadTx(repo, [tables.chart]);
    return loadChartMetadataListTx(repo, tx, cb);
}

/**
 * The first time it's called, it may take some time.
 * From then onwards, all mutations get optimistically forked into a cache and the database, 
 * so subsequent calls should be relatively instant.
 */
export function loadChartMetadataListTx(repo: DataRepository, tx: idb.ReadTransaction, cb: AsyncCb<SequencerChartMetadata[]>): AsyncDone {
    repo.charts.loading = true;

    return idb.getAllMetadata(tx, tables.chart, (charts) => {
        if (!charts) return DONE;

        repo.charts.loading = false;
        updateAvailableMetadata(repo, charts);

        return cb(repo.charts.allChartMetadata);
    });
}

function updateAvailableMetadata(repo: DataRepository, metadata: SequencerChartMetadata[]) {
    const bundled = getAllBundledChartsMetadata();
    repo.charts.allChartMetadata = [
        ...metadata,
        ...bundled
    ];
    repo.charts.allChartMetadata.sort((a, b) => {
        return a.name.localeCompare(b.name);
    });
}

export function cleanupChartRepo(repo: DataRepository, cb: AsyncCallback<void>): AsyncDone {
    let cleanedUp: any[] = [];

    const tx = repositoryWriteTx(repo, [tables.chart]);

    return idb.getAll(tx, tables.chart.metadata, (metadatas) => {
        if (!metadatas) return DONE;

        return parallelIterator(
            metadatas,
            (chart, iter) => {
                return idb.getOne(tx, tables.chart.data, chart.id, (data) => {
                    if (!data) {
                        // Ignore the error
                        return iter(); 
                    }

                    if (isBundledChartId(chart.id) || !data) {
                        cleanedUp.push(chart);
                        return idb.deleteOne(tx, tables.chart.metadata, chart.id, () => iter());
                    } 

                    let modified = false;

                    if (data.n.trim() !== data.n) {
                        data.n = data.n.trim();
                        modified = true;
                    }

                    if (modified) {
                        cleanedUp.push(chart);
                        return idb.putOne(tx, tables.chart.data, data, () => iter());
                    }

                    return iter();
                })
            },
            () => {
                if (cleanedUp.length > 0) {
                    console.warn("Cleaned up non-matching or wrongly saved records: ", cleanedUp);
                }
                return cb();
            }
        );
    });
}

export type SequencerChartMetadata = Pick<SequencerChart, "id" | "name">;

export function queryChart(
    repo: DataRepository,
    id: number,
    cb: AsyncCallback<SequencerChart>,
): AsyncCallbackResult {
    if (isBundledChartId(id)) {
        // Bundled charts will load substantially faster, since they come with the game
        const bundled = getAllBundledCharts();
        const chart = bundled.find(c => c.id === id)

        let err = chart ? undefined : Error("Couldn't find bundled chart for id=" + id);
        if (err) {
            console.log(err);
        }

        return cb(chart, err);
    }

    // TODO: cache this codepath

    const tx = repositoryReadTx(repo, [tables.chart]);

    return idb.getData(tx, tables.chart, id, (compressedChart, err) => {
        if (!compressedChart) {
            return cb(undefined, err);
        }

        // TODO: saved/unsaved status system to avoid needless saves/loads.
        // or remove if we think its useless.
        const chart = uncompressChart(compressedChart, CHART_STATUS_UNSAVED);
        return cb(chart);
    });
}

export function saveChart(repo: DataRepository, chart: SequencerChart, cb: AsyncCb<boolean>): AsyncDone {
    cb = toTrackedCallback(cb, "saveChart");

    if (isBundledChartId(chart.id)) {
        return cb(false, "Can't save a bundled chart. Copy it first");
    }

    if (chart._savedStatus === CHART_STATUS_READONLY) {
        return cb(false, "Can't save a readonly chart. Copy it first");
    }

    const tx = repositoryWriteTx(repo, [tables.chart]);

    const compressedChart = compressChart(chart);
    return idb.saveData(tx, tables.chart, compressedChart, (result, err) => {
        if (result === undefined) return cb(result, err);
        
        if (chart._savedStatus === CHART_STATUS_UNSAVED) {
            chart._savedStatus = CHART_STATUS_SAVED;
        }

        updateAvailableMetadata(repo, tables.chart.loadedMetadata);

        return cb(true);
    });
}

// Creates a chart, returns it's id
export function createChart(repo: DataRepository, chart: SequencerChart, cb: AsyncCb<boolean>): AsyncDone {
    cb = toTrackedCallback(cb, "createChart");

    chart.name = chart.name.trim();

    const tx = repositoryWriteTx(repo, [tables.chart]);

    const data = compressChart(chart);
    return idb.createData(tx, tables.chart, data, (id, err) => {
        if (!id || err) return cb(false, err);

        assert(data.i > 0);
        chart.id = data.i;

        return loadChartMetadataListTx(repo, tx, () => {
            if (chart._savedStatus === CHART_STATUS_UNSAVED) {
                chart._savedStatus = CHART_STATUS_SAVED;
            }
            return cb(true);
        })
    });
}

export function deleteChart(repo: DataRepository, chartToDelete: SequencerChart, cb: AsyncCb<void>): AsyncDone {
    cb = toTrackedCallback(cb, "deleteChart");

    if (chartToDelete._savedStatus === CHART_STATUS_READONLY) {
        return cb(undefined, newError("Can't delete a bundled chart"));
    }

    if (chartToDelete.id <= 0) {
        // Our work here is done :)
        return cb(undefined);
    }

    const tx = repositoryWriteTx(repo, [tables.chart]);
    return idb.deleteData(tx, tables.chart, chartToDelete.id, () => {
        return loadChartMetadataListTx(repo, tx, () => {
            return cb();
        });
    });
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

export function loadAllEffectRackPresets(repo: DataRepository, cb: AsyncCb<EffectRackPreset[]>): AsyncDone {
    const tx = repositoryReadTx(repo, [tables.effectsRackPresets])
    return idb.getAll(tx, tables.effectsRackPresets, (effects, err) => {
        if (!effects) {
            console.error("Couldn't load effect rack:", err);
            effects = [];
        }

        repo.effectRackPresets.allEffectRackPresets = effects;
        recomputePresets(repo);

        return cb(repo.effectRackPresets.allEffectRackPresets);
    });
}

export function getLoadedPreset(repo: DataRepository, id: number): EffectRackPreset | undefined {
    return repo.effectRackPresets.allEffectRackPresets
        .find(p => p.id === id);
}

export function createEffectRackPreset(repo: DataRepository, preset: EffectRackPreset, cb: AsyncCb): AsyncDone {
    cb = toTrackedCallback(cb, "createEffectRackPreset");

    repo.effectRackPresets.allEffectRackPresets.push(preset);
    const tx = repositoryWriteTx(repo, [tables.effectsRackPresets]);
    return idb.createOne(tx, tables.effectsRackPresets, preset, () => {
        recomputePresets(repo);
        return cb();
    });
}

export function updateEffectRackPreset(repo: DataRepository, preset: EffectRackPreset, cb: AsyncCb): AsyncDone {
    cb = toTrackedCallback(cb, "updateEffectRackPreset");

    assert(preset.id > 0);
    assert(repo.effectRackPresets.allEffectRackPresets.indexOf(preset) !== -1);

    const tx = repositoryWriteTx(repo, [tables.effectsRackPresets]);
    return idb.putOne(tx, tables.effectsRackPresets, preset, () => {
        recomputePresets(repo);
        return cb();
    })
}

export function deleteEffectRackPreset(repo: DataRepository, preset: EffectRackPreset, cb: AsyncCb): AsyncDone {
    cb = toTrackedCallback(cb, "deleteEffectRackPreset");

    const tx = repositoryWriteTx(repo, [tables.effectsRackPresets]);
    return idb.deleteOne(tx, tables.effectsRackPresets, preset.id, () => {
        filterInPlace(repo.effectRackPresets.allEffectRackPresets, p => p !== preset);
        recomputePresets(repo);
        return cb();
    })
}

export function loadAutosavedEffectRackPreset(repo: DataRepository, cb: AsyncCb<EffectRackPreset>): AsyncDone {
    if (repo.effectRackPresetsSystem.autoSaved) {
        return cb(repo.effectRackPresetsSystem.autoSaved);
    }

    cb = toTrackedCallback(cb, "loadAutosavedEffectRackPreset");

    const tx = repositoryReadTx(repo, [tables.effectRackPresetsSystem]);
    return idb.getOne(tx, tables.effectRackPresetsSystem, SYSTEM_PRESET_IDS.autoSaved, cb);
}

export function updateAutosavedEffectRackPreset(repo: DataRepository, preset: EffectRackPreset, cb: AsyncCb<boolean>): AsyncDone {
    cb = toTrackedCallback(cb, "updateAutosavedEffectRackPreset");

    preset.id = SYSTEM_PRESET_IDS.autoSaved;
    repo.effectRackPresetsSystem.autoSaved = preset;

    const tx = repositoryWriteTx(repo, [tables.effectRackPresetsSystem]);
    return idb.putOne(tx, tables.effectRackPresetsSystem, preset, cb);
}

function recomputePresets(repo: DataRepository) {
    const presets = repo.effectRackPresets.allEffectRackPresets;
    presets.sort((a, b) => a.name.localeCompare(b.name));

    const groups = repo.effectRackPresets.groups;
    groups.clear();
    for (const preset of repo.effectRackPresets.allEffectRackPresets) {
        forEachPresetGroup(preset, group => {
            let presets = groups.get(group);
            if (!presets) {
                presets = [];
                groups.set(group, presets);
            }

            presets.push(preset);
        });
    }
}

export function forEachPresetGroup(preset: EffectRackPreset, iter: (group: string) => void) {
    let idx = 0;
    let inGroup = false;
    while (idx < preset.name.length) {
        const startIdx = preset.name.indexOf("[", idx);
        if (startIdx === -1) break;

        const endIdx = preset.name.indexOf("]", startIdx);
        if (endIdx === -1) break;

        inGroup = true;
        iter(preset.name.substring(startIdx, endIdx + 1));

        idx = endIdx + 1;
    }

    if (!inGroup) {
        iter(DEFAULT_GROUP_NAME);
    }
}

export const DEFAULT_GROUP_NAME = "ungrouped";
