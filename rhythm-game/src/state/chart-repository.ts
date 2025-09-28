import { getAllBundledCharts } from "src/assets/bundled-charts";
import { debugFlags, getTestSleepMs } from "src/debug-flags";
import { assert } from "src/utils/assert";
import * as idb from "src/utils/indexed-db";
import { AsyncData, newAsyncData, sleepForMs } from "src/utils/promise-utils";
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
import { filterInPlace } from "src/utils/array-utils";

const tables = {
    chartMetadata: idb.newTable<SequencerChartMetadata>("chart_metadata", "id", idb.KEYGEN_AUTOINCREMENT), 
    chartData:     idb.newTable<SequencerChartCompressed>("chart_data", "i", idb.KEYGEN_NONE),
} as const satisfies idb.AllTables;

export type ChartRepository = {
    db: IDBDatabase;
    allCharts: AsyncData<SequencerChartMetadata[]>;
};

export async function newChartRepository(): Promise<ChartRepository> {
    const db = await idb.openConnection("KeyboardRhythmGameIDB", 1, tables, {
        onBlocked(event: IDBVersionChangeEvent) {
            console.error("IDB blocked!", { event });
        },
        onUnexpectedlyClosed() {
            console.error("IDB unexpectedly closed!");
        }
    });

    return {
        db: db,
        allCharts: newAsyncData<SequencerChartMetadata[]>("", async () => []),
    };
}

// Only call this when the data is expected to be present by this point. I.e:
// - When you already have a chart, since the only way to know about the id of a chart 
//      is by looking it up in this array in the first place (in theory)
function assertAndGetAllCharts(repo: ChartRepository) {
    assert(!!repo.allCharts.data);
    return repo.allCharts.data;
}

export function reindexCharts(charts: SequencerChartMetadata[]) {
    for (let i = 0; i < charts.length; i++) {
        charts[i]._index = i;
    }
}

export function loadChartMetadataList(repo: ChartRepository) {
    repo.allCharts.cancel();
    repo.allCharts = newAsyncData(loadChartMetadataList.name, async () => {
        const tx     = await chartRepositoryReadTx(repo);
        const charts = await idb.getAll(tx, tables.chartMetadata);

        const testSleepMs = getTestSleepMs(debugFlags);
        if (testSleepMs) {
            await sleepForMs(testSleepMs)
        }

        const bundled = getAllBundledCharts()
            .map(toChartMetadata);

        charts.push(...bundled);

        reindexCharts(charts);

        return charts;
    });
    return repo.allCharts;
}

export async function cleanupChartRepo(repo: ChartRepository) {
    let cleanedUp: any[] = [];

    const tx = await chartRepositoryWriteTx(repo);
    const metadatas = await idb.getAll(tx, tables.chartMetadata);
    for (const chart of metadatas) {
        const data = await idb.getOne(tx, tables.chartData, chart.id);
        if (isBundledChartId(chart.id) || !data) {
            await idb.deleteOne(tx, tables.chartMetadata, chart.id);
            cleanedUp.push(chart);
        } else {
            let modified = false;

            if (data.n.trim() !== data.n) {
                data.n = data.n.trim();
                modified = true;
            }

            if (modified) {
                await idb.putOne(tx, tables.chartData, data);
                cleanedUp.push(chart);
            }
        }
    }

    const datas = await idb.getAll(tx, tables.chartData);
    for (const chart of datas) {
        const metadata = await idb.getOne(tx, tables.chartMetadata, chart.i);
        if (isBundledChartId(chart.i) || !metadata) {
            await idb.deleteOne(tx, tables.chartData, chart.i);
            cleanedUp.push(chart);
        } else {
            let modified = false;

            if (metadata.name.trim() !== metadata.name) {
                metadata.name = metadata.name.trim();
                modified = true;
            }

            if (modified) {
                await idb.putOne(tx, tables.chartMetadata, metadata);
                cleanedUp.push(chart);
            }
        }
    }

    if (cleanedUp.length > 0) {
        console.warn("Cleaned up non-matching or wrongly saved records: ", cleanedUp);
    }
}


// TODO: validate that this is even the right way to use indexed db, or even a good way

async function chartRepositoryReadTx(repo: ChartRepository) {
    const tx = idb.newReadTransaction(repo.db, tables);
    return tx;
}

async function chartRepositoryWriteTx(repo: ChartRepository) {
    const tx = idb.newWriteTransaction(repo.db, tables);
    return tx;
}

export type SequencerChartMetadata = Pick<SequencerChart, "id" | "name"> & { _index: number; };

export function queryChart(repo: ChartRepository, id: number): AsyncData<SequencerChart> {
    return newAsyncData(queryChart.name, async () => {
        if (isBundledChartId(id)) {
            // Bundled charts will load substantially faster, since they come with the game
            const bundled = getAllBundledCharts();
            const chart = bundled.find(c => c.id === id)
            if (!chart) {
                throw new Error("Couldn't find bundled chart for id=" + id);
            }

            return chart;
        }

        // TODO: cache this codepath

        const tx = await chartRepositoryReadTx(repo);
        const compressedChart = await idb.getOne(tx, tables.chartData, id);
        const testSleepMs = getTestSleepMs(debugFlags);
        if (testSleepMs) {
            await sleepForMs(testSleepMs)
        }

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

export function saveChart(repo: ChartRepository, chart: SequencerChart): AsyncData<SaveResult> {
    return newAsyncData(saveChart.name, async () => {
        if (isBundledChartId(chart.id)) {
            return { error: "Can't save a bundled chart. Copy it first" };
        }
        if (chart._savedStatus === CHART_STATUS_READONLY) {
            return { error: "Can't save a readonly chart. Copy it first" };
        }

        const tx = await chartRepositoryWriteTx(repo);
        const existingMetadata = await idb.getOne(tx, tables.chartMetadata, chart.id);
        if (!existingMetadata) {
            throw new Error("Metadata doesn't already exist");
        }
        const existingData = await idb.getOne(tx, tables.chartData, chart.id);
        if (!existingData) {
            throw new Error("Data doesn't already exist");
        }

        const chartCompressed = compressChart(chart);
        let metadata = toChartMetadata(chart);

        await idb.putOne(tx, tables.chartMetadata, metadata);
        await idb.putOne(tx, tables.chartData, chartCompressed);

        if (chart._savedStatus === CHART_STATUS_UNSAVED) {
            chart._savedStatus = CHART_STATUS_SAVED;
        }

        const testSleepMs = getTestSleepMs(debugFlags);
        if (testSleepMs) {
            await sleepForMs(testSleepMs)
        }

        return 0;
    });
}

export function createChart(
    repo: ChartRepository,
    chart: SequencerChart
): AsyncData<number> {
    return newAsyncData(createChart.name, async () => {
        const tx = await chartRepositoryWriteTx(repo);

        const data     = compressChart(chart);
        const metadata = toChartMetadata(chart);
        const validKey = await idb.createOne(tx, tables.chartMetadata, metadata);
        // Link the data to the metadata
        const id = validKey.valueOf(); assert(typeof id === "number");
        data.i = id;
        await idb.putOne(tx, tables.chartData, data);

        // Since we know what happens to the list when we create an item in the database, we can 
        // simply do the same on our side as well, rather than reloading all entries from the database.

        const allCharts = assertAndGetAllCharts(repo);
        const idx = allCharts.findIndex(val => val.id === id);
        if (idx === -1) {
            allCharts.push(metadata);
        }

        return id;
    });
}

export async function deleteChart(
    repo: ChartRepository,
    chartToDelete: SequencerChart
): Promise<void> {
    const tx = await chartRepositoryWriteTx(repo);

    if (chartToDelete._savedStatus === CHART_STATUS_READONLY) {
        throw new Error("Can't delete a bundled chart");
    }

    if (chartToDelete.id <= 0) return;

    // Optimistic delete
    const allCharts = assertAndGetAllCharts(repo);
    filterInPlace(allCharts, chart => chartToDelete.id !== chart.id);

    await idb.deleteOne(tx, tables.chartMetadata, chartToDelete.id);
    await idb.deleteOne(tx, tables.chartData, chartToDelete.id);

    const testSleepMs = getTestSleepMs(debugFlags);
    if (testSleepMs) {
        await sleepForMs(testSleepMs)
    }
}

function toChartMetadata(chart: SequencerChart): SequencerChartMetadata {
    let result: SequencerChartMetadata = {
        id:   chart.id,
        name: chart.name,
        _index: 0,
    };
    return result;
}

