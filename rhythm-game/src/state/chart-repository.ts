import { IDBPDatabase, IDBPTransaction, openDB } from "idb";
import { CHART_STATUS_BUNDLED, chartToCompressed, SequencerChart, SequencerChartCompressed } from "./sequencer-chart";
import { assert } from "src/utils/assert";
import { getAllBundledCharts } from "src/assets/bundled-charts";

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
                keyPath: "id",
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

export type SequencerChartMetadata = {
    id?: number;
    bundled?: boolean;
    name: string;
};

export type SequencerChartData = {
    id?: number;
    data: string;
};

// For now, let's just return everything, it's not super clear how the pagination API needs to look like.
export async function getSavedChartsMetadata(
    r: ChartRepository,
    tx?: ReadTx,
): Promise<SequencerChartMetadata[]> {
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

export async function getSavedChartData(
    r: ChartRepository,
    meta: SequencerChartMetadata,
    tx?: ReadTx,
): Promise<SequencerChart> {
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
    const item = await r.db.get(tables.chart_data, IDBKeyRange.only(id));

    return item;
}

export async function saveChart(
    r: ChartRepository,
    chart: SequencerChart,
    tx?: WriteTx
): Promise<void> {
    if (!tx) tx = newWriteTx(r);
    if (chart._status === CHART_STATUS_BUNDLED) {
        throw new Error("Can't save a bundled chart. Copy it first");
    }

    const chartCompressed = chartToCompressed(chart);
    const metadata = toChartMetadata(chartCompressed);
    const data     = toChartData(chartCompressed);

    const metadataStore = tx.objectStore(tables.chart_metadata);
    const dataStore     = tx.objectStore(tables.chart_data);

    await metadataStore.put(metadata);
    await dataStore.put(data);
}

export async function deleteChart(
    r: ChartRepository,
    chart: SequencerChart,
    tx?: WriteTx
): Promise<void> {
    if (!tx) tx = newWriteTx(r);
    if (chart._status === CHART_STATUS_BUNDLED) {
        throw new Error("Can't delete a bundled chart");
    }

    if (chart.id < 0) return;

    const metadataStore = tx.objectStore(tables.chart_metadata);
    const dataStore     = tx.objectStore(tables.chart_data);

    await metadataStore.delete(chart.id);
    await dataStore.delete(chart.id);
}

function toChartMetadata(chart: SequencerChartCompressed): SequencerChartMetadata {
    return {
        id: chart.i < 0 ? undefined : chart.i,
        name: chart.n,
    };
}

function toChartData(chart: SequencerChartCompressed): SequencerChartData {
    return {
        id: chart.i < 0 ? undefined : chart.i,
        data: JSON.stringify(chart),
    };
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

