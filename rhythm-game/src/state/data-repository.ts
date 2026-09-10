import { getAllBundledCharts, getAllBundledChartsMetadata } from "assets/bundled-charts.ts";
import { assert } from "utils/assert.ts";
import { CANCELLED, DONE, Done, PARALLELISM, Result, Then, trackTask } from "utils/async-utils.ts";
import * as idb from "utils/indexed-db.ts";
import { utf16ByteLength } from "utils/utf8.ts";
import { EffectRackPreset, EffectRackPresetMetadata, effectRackPresetToMetadata, KeyboardConfig } from "./keyboard-config.ts";
import {
    CHART_STATUS_READONLY,
    CHART_STATUS_SAVED,
    CHART_STATUS_UNSAVED,
    compressChart,
    isBundledChartId,
    SequencerChart,
    SequencerChartCompressed,
    uncompressChart
} from "./sequencer-chart.ts";

function logError(...messages: any[]) {
    console.error("[data-repository]", ...messages);
}

/////////////////////////////////////
// Data repository core utils


function compressedChartToMetadata(compressedChart: SequencerChartCompressed): SequencerChartMetadata {
    return {
        id:   compressedChart.i,
        name: compressedChart.n
    };
}

const tables = {
    chart:             idb.newMetadataPairTableDef("chart",         compressedChartToMetadata,  "i", "id"),
    keyboardPresets:   idb.newMetadataPairTableDef("keyboard",      keyboardConfigToMetadata,   "id", "id"),
    effectRackPresets: idb.newMetadataPairTableDef("effect_rack_2", effectRackPresetToMetadata, "id", "id"),
} as const satisfies idb.AllTables;

const tablesVersion = 9;


// This is actually the central place where we load/save all data. 
// This design may allow for smarter batching of saving/loading multiple different entities at once.
export type DataRepository = {
    db: IDBDatabase;
    tables: typeof tables;
    charts: {
        // Live array. Reference should not change randomly.
        allChartMetadata: SequencerChartMetadata[];
        loading: boolean;
    };
    effectRackPresets: {
        loading: boolean;
        groups: Map<string, EffectRackPresetMetadata[]>;
        // Like the list in tables.effectRackPresets, but sorted and possibly filtered.
        allEffectRackPresets: EffectRackPresetMetadata[];
    };
    keyboardConfigPresets: {
        groups: Map<string, KeyboardConfigMetadata[]>;
    };
};

export function newDataRepository(cb: Then<DataRepository>): Done {
    cb = trackTask("Loading data repository", cb);

    return idb.openConnection("KeyboardRhythmGameIDB", tablesVersion, tables, {
        onBlocked(event: IDBVersionChangeEvent) {
            console.error("IDB blocked!", { event });
        },
        onUnexpectedlyClosed() {
            console.error("IDB unexpectedly closed!");
        }
    }, onConnected);

    function onConnected(db: Result<IDBDatabase>): Done {
        if ("error" in db) {
            // The program simply cannot start without the database. 
            // I suppose we could run in 'new game' mode without any save data, but I'd rather not).
            // Imagine spending a bunch of time making a chart, and it didnt save. 
            // But we knew all along it wouldnt save. xd
            throw new Error(db.error);
        }

        const repo: DataRepository = {
            db: db.value,
            tables: tables,
            charts: {
                allChartMetadata: [],
                loading: false,
            },
            effectRackPresets: {
                allEffectRackPresets: [],
                groups: new Map(),
                loading: false,
            },
            keyboardConfigPresets:  {
                groups: new Map(),
            }
        };

        updateAvailableMetadata(repo, []);

        return cb(repo);
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

export function loadChartMetadataList(repo: DataRepository, cb: Then<SequencerChartMetadata[]>): Done {
    const tx = repositoryReadTx(repo, [tables.chart]);
    return loadChartMetadataListTx(repo, tx, cb);
}

/**
 * The first time it's called, it may take some time.
 * From then onwards, all mutations get optimistically forked into a cache and the database, 
 * so subsequent calls should be relatively instant.
 */
export function loadChartMetadataListTx(repo: DataRepository, tx: idb.ReadTransaction, cb: Then<SequencerChartMetadata[]>): Done {
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
    repo.charts.allChartMetadata.length = 0;
    repo.charts.allChartMetadata.push(
        ...metadata,
        ...bundled
    );
    repo.charts.allChartMetadata.sort((a, b) => {
        return a.name.localeCompare(b.name);
    });
}

export function cleanupChartRepo(repo: DataRepository, cb: Then<void>): Done {
    let cleanedUp: any[] = [];

    const tx = repositoryWriteTx(repo, [tables.chart]);

    return idb.getAll(tx, tables.chart.metadata, (metadatas) => {
        if (!metadatas) return cb();

        for (const chart of metadatas) {
            idb.getOne(tx, tables.chart.data, chart.id, (data) => {
                if ("error" in data) {
                    return onProcessedChart();
                }

                if (isBundledChartId(chart.id) || !data.value) {
                    cleanedUp.push(chart);
                    return idb.deleteOne(tx, tables.chart.metadata, chart.id, onProcessedChart);
                } 

                let modified = false;

                if (data.value.n.trim() !== data.value.n) {
                    data.value.n = data.value.n.trim();
                    modified = true;
                }

                if (modified) {
                    cleanedUp.push(chart);
                    return idb.putOne(tx, tables.chart.data, data.value, () => onProcessedChart());
                }

                return onProcessedChart();
            })
        }

        let count = metadatas.length;
        function onProcessedChart(): Done {
            count--;
            return PARALLELISM;
        }

        return PARALLELISM;
    });
}

export type SequencerChartMetadata = Pick<SequencerChart, "id" | "name">;

export function loadChart(
    repo: DataRepository,
    id: number,
    cb: Then<SequencerChart | undefined>,
): Done {
    if (isBundledChartId(id)) {
        // Bundled charts will load substantially faster, since they ship with the game
        const bundled = getAllBundledCharts();
        const chart = bundled.find(c => c.id === id)

        let err = chart ? undefined : Error("Couldn't find bundled chart for id=" + id);
        if (err) {
            console.log(err);
        }

        return cb(chart);
    }

    // TODO: cache this codepath

    const tx = repositoryReadTx(repo, [tables.chart]);

    return idb.getData(tx, tables.chart, id, (compressedChart) => {
        if (!compressedChart) return cb(undefined);

        // TODO: saved/unsaved status system to avoid needless saves/loads.
        // or remove if we think its useless.
        const chart = uncompressChart(compressedChart, CHART_STATUS_UNSAVED);
        return cb(chart);
    });
}

export function saveChart(repo: DataRepository, chart: SequencerChart, cb: Then<Result<boolean>>): Done {
    cb = trackTask("saveChart", cb);

    if (isBundledChartId(chart.id)) {
        return cb({ error: "Can't save a bundled chart. Copy it first" });
    }

    if (chart._savedStatus === CHART_STATUS_READONLY) {
        return cb({ error: "Can't save a readonly chart. Copy it first" });
    }

    const tx = repositoryWriteTx(repo, [tables.chart]);

    const compressedChart = compressChart(chart);
    return idb.saveData(tx, tables.chart, compressedChart, (result) => {
        if ("error" in result) return cb({ error: result.error });

        if (chart._savedStatus === CHART_STATUS_UNSAVED) {
            chart._savedStatus = CHART_STATUS_SAVED;
        }

        updateAvailableMetadata(repo, tables.chart.allItemsAsync);

        return cb({ value: true });
    });
}

// Creates a chart, returns it's id
export function createChart(
    repo: DataRepository,
    chart: SequencerChart,
    cb: Then<Result<SequencerChartMetadata>>,
): Done {
    cb = trackTask("createChart", cb);

    chart.name = chart.name.trim();

    const tx = repositoryWriteTx(repo, [tables.chart]);

    const data = compressChart(chart);
    return idb.createData(tx, tables.chart, data, (val) => {
        if ("error" in val) {
            logError(val.error);
            return cb({ error: val.error });
        }

        const medata = val.value.metadata;

        assert(data.i > 0);
        chart.id = data.i;

        return loadChartMetadataListTx(repo, tx, () => {
            if (chart._savedStatus === CHART_STATUS_UNSAVED) {
                chart._savedStatus = CHART_STATUS_SAVED;
            }
            return cb({ value: medata });
        })
    });
}

export function deleteChart(repo: DataRepository, chartToDelete: SequencerChart, cb: Then<void>): Done {
    cb = trackTask("deleteChart", cb);

    if (chartToDelete._savedStatus === CHART_STATUS_READONLY) {
        logError("Can't delete a bundled chart");
        return cb();
    }

    if (chartToDelete.id <= 0) {
        // Our work here is done :)
        return cb();
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

export function loadAllEffectRackPresets(repo: DataRepository, cb: Then<EffectRackPresetMetadata[]>): Done {
    cb = trackTask("loadAllEffectRackPresets", cb);
    const tx = repositoryReadTx(repo, [tables.effectRackPresets])
    return idb.getAllMetadata(tx, tables.effectRackPresets, (list) => {
        recomputeEffectRackPresets(repo);
        return cb(list);
    });
}

export function loadEffectRackPreset(repo: DataRepository, meta: EffectRackPresetMetadata, cb: Then<EffectRackPreset>): Done {
    cb = trackTask("loadEffectRackPreset", cb);
    const tx = repositoryReadTx(repo, [tables.effectRackPresets]);
    return idb.getData(tx, tables.effectRackPresets, meta.id, preset => {
        if (!preset) {
            logError("We expected the preset to be present if you were able to have a reference to it's metadata object");
            return CANCELLED;
        }

        return cb(preset);
    });
}

export function createEffectRackPreset(
    repo: DataRepository,
    preset: EffectRackPreset,
    cb: Then<{ data: EffectRackPreset; metadata: EffectRackPresetMetadata } | undefined>
): Done {
    cb = trackTask("createEffectRackPreset", cb);

    const tx = repositoryWriteTx(repo, [tables.effectRackPresets]);
    return idb.createData(tx, tables.effectRackPresets, preset, (val) => {
        if ("error" in val) {
            logError(val);
            return DONE;
        }

        recomputeEffectRackPresets(repo);
        return cb(val.value);
    });
}

export function updateEffectRackPreset(repo: DataRepository, preset: EffectRackPreset, cb: Then<void>): Done {
    cb = trackTask("updateEffectRackPreset", cb);
    const tx = repositoryWriteTx(repo, [tables.effectRackPresets]);
    return idb.updateData(tx, tables.effectRackPresets, preset, () => {
        recomputeEffectRackPresets(repo);
        return cb();
    });
}

export function deleteEffectRackPreset(repo: DataRepository, preset: EffectRackPreset, cb: Then<void>): Done {
    cb = trackTask("deleteEffectRackPreset", cb);
    const tx = repositoryWriteTx(repo, [tables.effectRackPresets]);
    return idb.deleteData(tx, tables.effectRackPresets, preset.id, () => {
        recomputeEffectRackPresets(repo);
        return cb();
    })
}

function recomputeEffectRackPresets(repo: DataRepository) {
    repo.effectRackPresets.allEffectRackPresets = [
        ...repo.tables.effectRackPresets.allItemsAsync
    ];

    const presets = repo.effectRackPresets.allEffectRackPresets;
    presets.sort((a, b) => a.name.localeCompare(b.name));

    const groups = repo.effectRackPresets.groups;
    groups.clear();
    for (const preset of repo.effectRackPresets.allEffectRackPresets) {
        forEachPresetGroup(preset.name, group => {
            let presets = groups.get(group) ?? [];
            presets.push(preset);
            groups.set(group, presets);
        });
    }
}

export function forEachPresetGroup(name: string, iter: (group: string) => void) {
    let idx = 0;
    let inGroup = false;
    while (idx < name.length) {
        const startIdx = name.indexOf("[", idx);
        if (startIdx === -1) break;

        const endIdx = name.indexOf("]", startIdx);
        if (endIdx === -1) break;

        inGroup = true;
        iter(name.substring(startIdx, endIdx + 1));

        idx = endIdx + 1;
    }

    if (!inGroup) {
        iter(DEFAULT_GROUP_NAME);
    }
}

export const DEFAULT_GROUP_NAME = "ungrouped";

/////////////////////////////////////
// Keyboard Configs

export function loadAllKeyboardConfigPresets(repo: DataRepository, cb: Then<KeyboardConfigMetadata[]>): Done {
    const tx = repositoryReadTx(repo, [tables.keyboardPresets]);
    return idb.getAllMetadata(tx, tables.keyboardPresets, (list) => {
        recomputeKeyboardConfigPresets(repo);
        return cb(list);
    });
}

// TODO: debounced, keyed on id
export function saveKeyboardConfig(
    repo: DataRepository,
    config: KeyboardConfig,
    cb: Then<boolean>,
): Done {
    cb = trackTask("saveKeyboardConfig", cb);
    const tx = repositoryWriteTx(repo, [tables.keyboardPresets]);
    return idb.updateData(tx, tables.keyboardPresets, config, () => {
        recomputeKeyboardConfigPresets(repo);
        return cb(true);
    });
}

export function createKeyboardConfigPreset(
    repo: DataRepository,
    preset: KeyboardConfig,
    cb: Then<{ data: KeyboardConfig; metadata: KeyboardConfigMetadata }>,
): Done {
    cb = trackTask("createKeyboardConfigPreset", cb);
    const tx = repositoryWriteTx(repo, [tables.keyboardPresets]);
    return idb.createData(tx, tables.keyboardPresets, preset, (val) => {
        if ("error" in val) {
            logError(val.error);
            return DONE;
        }

        recomputeKeyboardConfigPresets(repo);
        return cb(val.value);
    });
}

export function loadKeyboardConfig(
    repo: DataRepository,
    metadata: KeyboardConfigMetadata,
    cb: Then<KeyboardConfig | undefined>,
): Done {
    cb = trackTask("loadKeyboardConfig", cb);
    const tx = repositoryReadTx(repo, [tables.keyboardPresets]);
    return idb.getData(tx, tables.keyboardPresets, metadata.id, cb);
}

export function deleteKeyboardConfig(repo: DataRepository, toDelete: KeyboardConfig, cb: Then<void>): Done {
    if (toDelete.id <= 0) {
        // Our work here is done :)
        return cb(undefined);
    }

    const tx = repositoryWriteTx(repo, [tables.chart]);
    return idb.deleteData(tx, tables.chart, toDelete.id, (val) => {
        recomputeKeyboardConfigPresets(repo);
        return cb(val);
    });
}

export type KeyboardConfigMetadata = {
    id: number;
    name: string;
    serializedBytes: number;
} & { readonly __KeyboardConfigMetadata: unique symbol; };

export function keyboardConfigToMetadata(config: KeyboardConfig): KeyboardConfigMetadata {
    let bytes = 0;
    for (const slot of config.synthSlots) {
        bytes += utf16ByteLength(slot.serialized);
    }

    return {
        id:   config.id,
        name: config.name,
        serializedBytes: bytes,
    } as KeyboardConfigMetadata;
}

function recomputeKeyboardConfigPresets(repo: DataRepository) {
    const groups = repo.keyboardConfigPresets.groups;
    groups.clear();
    for (const preset of repo.tables.keyboardPresets.allItemsAsync) {
        forEachPresetGroup(preset.name, group => {
            let presets = groups.get(group) ?? [];
            presets.push(preset);
            groups.set(group, presets);
        });
    }
}

/////////////////////////////////////
// Next section
