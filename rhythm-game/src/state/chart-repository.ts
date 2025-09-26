import { getAllBundledCharts } from "src/assets/bundled-charts";
import { TEST_ASYNCHRONICITY } from "src/debug-flags";
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

export function loadChartMetadataList(repo: ChartRepository) {
    repo.allCharts.cancel();
    repo.allCharts = newAsyncData(loadChartMetadataList.name, async () => {
        const tx     = await chartRepositoryReadTx(repo);
        const charts = await idb.getAll(tx, tables.chartMetadata);
        if (TEST_ASYNCHRONICITY) {
            await sleepForMs(100 + Math.random() * 500)
        }

        return charts;
    });
    return repo.allCharts;
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

export type SequencerChartMetadata 
    = Pick<SequencerChart, "id" | "name">
    & { bundled?: boolean; };

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
        if (TEST_ASYNCHRONICITY) {
            await sleepForMs(100 + Math.random() * 500);
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
        if (chart._savedStatus === CHART_STATUS_READONLY) {
            return { error: "Can't save a bundled chart. Copy it first" };
        }

        const chartCompressed = compressChart(chart);
        let metadata = toChartMetadata(chartCompressed);

        const tx = await chartRepositoryWriteTx(repo);

        let id = metadata.id;
        if (id !== undefined) {
            await idb.updateOne(tx, tables.chartMetadata, metadata);
        } else {
            const key = await idb.createOne(tx, tables.chartMetadata, metadata);
            const newId = key.valueOf();
            assert(typeof newId === "number");
            id = newId;
            metadata.id = newId;

            // Since we know what happens to the list when we create an item in the database, we can 
            // simply do the same on our side as well, rather than reloading all entries from the database.

            const allCharts = assertAndGetAllCharts(repo);
            const idx = allCharts.findIndex(val => val.id === newId);
            if (idx === -1) {
                allCharts.push(metadata);
            }
        }

        chartCompressed.i = id;
        await idb.updateOne(tx, tables.chartData, chartCompressed);

        // TODO: early return if already saved. 
        // But only after we start setting the unsaved status properly
        chart._savedStatus = CHART_STATUS_SAVED;

        if (TEST_ASYNCHRONICITY) {
            await sleepForMs(100 + Math.random() * 500);
        }

        return 0;
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

    if (TEST_ASYNCHRONICITY) {
        await sleepForMs(100 + Math.random() * 500);
    }
}

function toChartMetadata(chart: SequencerChartCompressed): SequencerChartMetadata {
    let result: SequencerChartMetadata = {
        id:   chart.i,
        name: chart.n,
    };

    if (chart.i !== undefined && chart.i > 0) {
        result.id = chart.i;
    }

    return result;
}

