import { getAllBundledCharts } from "src/assets/bundled-charts";
import { sleepForAsyncTesting } from "src/debug-flags";
import { arrayAt, filterInPlace } from "src/utils/array-utils";
import { assert } from "src/utils/assert";
import * as idb from "src/utils/indexed-db";
import { clamp } from "src/utils/math-utils";
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

const tables = {
    chartMetadata: idb.newTable<SequencerChartMetadata>("chart_metadata", "id", idb.KEYGEN_AUTOINCREMENT), 
    chartData:     idb.newTable<SequencerChartCompressed>("chart_data", "i", idb.KEYGEN_NONE),
} as const satisfies idb.AllTables;

// This is actually the central place where we load/save all data. 
// This design may allow for smarter batching of saving/loading multiple different entities at once.
export type DataRepository = {
    db: IDBDatabase;
    charts: {
        allChartMetadata: SequencerChartMetadata[];
        allChartMetadataLoading: AsyncContext;
    };
};

export function newChartRepository(): Promise<DataRepository> {
    const a = newAsyncContext("Initializing chart repository");

    const idbConnected = idb.openConnection("KeyboardRhythmGameIDB", 1, tables, {
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
            }
        };

        setChartMetadataList(
            repo,
            getAllBundledCharts().map(toChartMetadata)
        );

        return repo;
    });
}

export function loadChartMetadataList(repo: DataRepository) {
    const tx = repositoryReadTx(repo);

    return waitFor(repo.charts.allChartMetadataLoading.bump(), [
        idb.getAll(tx, tables.chartMetadata),
        sleepForAsyncTesting(),
    ], ([charts]) => {
        // Add bundled charts too.
        const bundled = getAllBundledCharts().map(toChartMetadata);
        setChartMetadataList(repo, [...charts, ...bundled]);
    });
}

export function setChartMetadataList(repo: DataRepository, metadata: SequencerChartMetadata[]) {
    metadata.sort((a, b) => a.name.localeCompare(b.name));

    // reindex _at the end_
    for (let i = 0; i < metadata.length; i++) {
        metadata[i]._index = i;
    }

    repo.charts.allChartMetadata = metadata;
}

export function cleanupChartRepo(a: AsyncContext, repo: DataRepository) {
    let cleanedUp: any[] = [];

    const tx = chartRepositoryWriteTx(repo);

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


// TODO: validate that this is even the right way to use indexed db, or even a good way

function repositoryReadTx(repo: DataRepository) {
    const tx = idb.newReadTransaction(repo.db, tables);
    return tx;
}

function chartRepositoryWriteTx(repo: DataRepository) {
    const tx = idb.newWriteTransaction(repo.db, tables);
    return tx;
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

    const tx = repositoryReadTx(repo);

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

export type SaveResult = 0 | { error: string; }

export function saveChart(a: AsyncContext, repo: DataRepository, chart: SequencerChart): Promise<SaveResult> {
    if (isBundledChartId(chart.id)) {
        return Promise.resolve({ error: "Can't save a bundled chart. Copy it first" });
    }

    if (chart._savedStatus === CHART_STATUS_READONLY) {
        return Promise.resolve({ error: "Can't save a readonly chart. Copy it first" });
    }

    const tx = chartRepositoryWriteTx(repo);

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

// Creates a chart, returns it's id
export function createChart(a: AsyncContext, repo: DataRepository, chart: SequencerChart): Promise<number> {
    chart.name = chart.name.trim();

    const tx = chartRepositoryWriteTx(repo);

    const data     = compressChart(chart);
    const metadata = toChartMetadata(chart);

    const metadataCreated = waitForOne(a, idb.createOne(tx, tables.chartMetadata, metadata));

    const metadataIdCreated = waitFor(a, [metadataCreated], ([metadataKey]) => {
        const id = metadataKey.valueOf(); assert(typeof id === "number");
        return id;
    });

    const dataCreated = waitFor(a, [metadataIdCreated], ([id]) => {
        // Link the data to the metadata
        data.i = id;
        return idb.putOne(tx, tables.chartData, data);
    });

    return waitFor(a, [metadataIdCreated, dataCreated], ([id]) => {
        // Since we know what happens to the list when we create an item in the database, we can 
        // simply do the same on our side as well, rather than reloading all entries from the database.

        const allCharts = repo.charts.allChartMetadata;
        const idx = allCharts.findIndex(val => val.id === id);
        if (idx === -1) {
            allCharts.push(metadata);
        }

        return id;
    });
}

export function deleteChart(a: AsyncContext, repo: DataRepository, chartToDelete: SequencerChart): Promise<void> {
    if (chartToDelete._savedStatus === CHART_STATUS_READONLY) {
        throw new Error("Can't delete a bundled chart");
    }

    if (chartToDelete.id <= 0) {
        return Promise.resolve();
    }

    const tx = chartRepositoryWriteTx(repo);

    return waitFor(a, [
        idb.deleteOne(tx, tables.chartMetadata, chartToDelete.id),
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

// You would mainly use this for list navigation, and not to actually find which chart 
// is actually at a particular index
export function getChartAtIndex(repo: DataRepository, idx: number): SequencerChartMetadata {
    idx = clamp(idx, 0, repo.charts.allChartMetadata.length - 1);
    const result = arrayAt(repo.charts.allChartMetadata, idx);
    // We can only do this, because our game is pre-bundled with some 'official' charts.
    assert(!!result);
    return result;
}
