import { IDBPDatabase, IDBPTransaction, openDB } from "idb";
import { CHART_STATUS_BUNDLED, CHART_STATUS_UNSAVED, compressChart, SequencerChart, SequencerChartCompressed, uncompressChart } from "./sequencer-chart";
import { assert } from "src/utils/assert";
import { getAllBundledCharts } from "src/assets/bundled-charts";
import { sleepForMs } from "src/utils/promise-utils";
import { TEST_ASYNCHRONICITY } from "src/debug-flags";

type ChartRepository = {
    db: IDBPDatabase<unknown>;
};

const tables = {
    chart_metadata: "chart_metadata", // Contains metadata
    chart_data:     "chart_data",     // Contains actual chart data. Can be thousands of timeline objects per chart
} as const;

const allTableNames = Object.keys(tables);

let repo: ChartRepository | null = null;

export async function getChartRepository(): Promise<ChartRepository> {
    if (repo) return repo;

    const db = await openDB("KeyboardRhythmGameIDB", 1, {
        upgrade(db) {
            db.createObjectStore(tables.chart_metadata, {
                keyPath: "id",
                autoIncrement: true,
            });
            db.createObjectStore(tables.chart_data, {
                keyPath: "i",
                autoIncrement: false,
            });
        },
        blocked(currentVersion: number, blockedVersion: number | null, event: IDBVersionChangeEvent) {
            console.error("IDB blocked!", { currentVersion, blockedVersion, event });
        },
        blocking(currentVersion: number, blockedVersion: number | null, event: IDBVersionChangeEvent) {
            console.error("IDB blocking!", { currentVersion, blockedVersion, event });
        },
        terminated() {
            console.error("IDB terminated!");
        }
    });

    repo = { db: db, };
    return repo;
}

export type SequencerChartMetadata 
    = Partial<Pick<SequencerChart, "id">>  // undefined id -> create instead of update
    & Pick<SequencerChart, "name">
    & { bundled?: boolean; };

// For now, let's just return everything, it's not clear how pagination API needs to look like yet
export async function getSavedChartsMetadata(
    r: ChartRepository,
    tx?: ReadTx,
): Promise<SequencerChartMetadata[]> {
    if (TEST_ASYNCHRONICITY) {
        await sleepForMs(100 + Math.random() * 500);
    }

    if (!tx) tx = newReadTx(r);

    const metadataStore = tx.objectStore(tables.chart_metadata);

    const items = await metadataStore.getAll();

    const bundledItemsMetadata = getAllBundledCharts()
        .map((item): SequencerChartMetadata => {
            return { name: item.name, bundled: true, }
        });
    items.push(...bundledItemsMetadata);

    return items;
}

export async function getSavedChartFull(
    r: ChartRepository,
    meta: SequencerChartMetadata,
    tx?: ReadTx,
): Promise<SequencerChart> {
    if (TEST_ASYNCHRONICITY) {
        await sleepForMs(100 + Math.random() * 500);
    }

    const id = meta.id;
    if (!tx) tx = newReadTx(r);
    if (!id) {
        // Bundled charts will load substantially faster, since they come with the game

        if (!meta.bundled) {
            throw new Error("Non-bundled charts need an id");
        }

        // check if it's a builtin chart
        const bundled = getAllBundledCharts();
        const chart = bundled.find(c => c.name === meta.name)
        if (!chart) {
            throw new Error("Couldn't find bundled chart!");
        }

        return chart;
    }

    assert(id >= 0);

    assert(typeof id === "number");

    const compressedChart = await r.db.get(tables.chart_data, IDBKeyRange.only(id));

    // TODO: we can change the status after the first modification, or something like that
    const chart = uncompressChart(compressedChart, CHART_STATUS_UNSAVED);

    return chart;
}

export async function saveChart(
    repo: ChartRepository,
    chart: SequencerChart,
    tx?: WriteTx
): Promise<void> {
    if (TEST_ASYNCHRONICITY) {
        await sleepForMs(100 + Math.random() * 500);
    }

    if (!tx) tx = newWriteTx(repo);
    if (chart._savedStatus === CHART_STATUS_BUNDLED) {
        throw new Error("Can't save a bundled chart. Copy it first");
    }

    const chartCompressed = compressChart(chart);
    let metadata = toChartMetadata(chartCompressed);

    const metadataStore = tx.objectStore(tables.chart_metadata);
    const dataStore     = tx.objectStore(tables.chart_data);

    let id = metadata.id;
    if (id !== undefined) {
        await metadataStore.put(metadata);
    } else {
        const key = await metadataStore.add(metadata);
        const newId = key.valueOf();
        assert(typeof newId === "number");
        id = newId;
    }

    chartCompressed.i = id;
    await dataStore.put(chartCompressed);
}

export async function deleteChart(
    r: ChartRepository,
    chart: SequencerChart,
    tx?: WriteTx
): Promise<void> {
    if (TEST_ASYNCHRONICITY) {
        await sleepForMs(100 + Math.random() * 500);
    }

    if (!tx) tx = newWriteTx(r);
    if (chart._savedStatus === CHART_STATUS_BUNDLED) {
        throw new Error("Can't delete a bundled chart");
    }

    if (chart.id < 0) return;

    const metadataStore = tx.objectStore(tables.chart_metadata);
    const dataStore     = tx.objectStore(tables.chart_data);

    await metadataStore.delete(chart.id);
    await dataStore.delete(chart.id);
}

function toChartMetadata(chart: SequencerChartCompressed): SequencerChartMetadata {
    let result: SequencerChartMetadata = {
        name: chart.n,
    };

    if (chart.i !== undefined && chart.i > 0) {
        result.id = chart.i;
    }

    return result;
}

type WriteTx = IDBPTransaction<unknown, string[], "readwrite"> & { __WriteTx: void };
type ReadTx = WriteTx |
    (IDBPTransaction<unknown, string[], "readonly"> & { __ReadTx: void });

function newReadTx(r: ChartRepository): ReadTx {
    const tx = r.db.transaction(allTableNames, "readonly", { durability: "relaxed" });
    return tx as unknown as ReadTx; // dont care 
}

function newWriteTx(r: ChartRepository): WriteTx {
    const tx = r.db.transaction(allTableNames, "readwrite", { durability: "strict" });
    return tx as unknown as WriteTx; // dont care 
}

