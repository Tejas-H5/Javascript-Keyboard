import { getAllBundledCharts, getAllBundledChartsMetadata } from "src/assets/bundled-charts.ts";
import { filterInPlace } from "src/utils/array-utils.ts";
import { assert } from "src/utils/assert.ts";
import { AsyncCb, Done, AsyncCallback, AsyncCallbackResult, DONE, newError, parallelIterator, toTrackedCallback } from "src/utils/async-utils.ts";
import * as idb from "src/utils/indexed-db.ts";
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
import { EffectRackPreset, EffectRackPresetMetadata, effectRackPresetToMetadata, KeyboardConfig, keyboardConfigDeleteSlot } from "./keyboard-config.ts";
import { utf16ByteLength } from "src/utils/utf8.ts";

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

export function newDataRepository(cb: AsyncCallback<DataRepository>): Done {
    return idb.openConnection("KeyboardRhythmGameIDB", tablesVersion, tables, {
        onBlocked(event: IDBVersionChangeEvent) {
            console.error("IDB blocked!", { event });
        },
        onUnexpectedlyClosed() {
            console.error("IDB unexpectedly closed!");
        }
    }, onConnected);

    function onConnected(db: IDBDatabase | undefined, err: any): Done {
        if (err || !db) return cb(undefined, err);

        const repo: DataRepository = {
            db: db,
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

export function loadChartMetadataList(repo: DataRepository, cb: AsyncCb<SequencerChartMetadata[]>): Done {
    const tx = repositoryReadTx(repo, [tables.chart]);
    return loadChartMetadataListTx(repo, tx, cb);
}

/**
 * The first time it's called, it may take some time.
 * From then onwards, all mutations get optimistically forked into a cache and the database, 
 * so subsequent calls should be relatively instant.
 */
export function loadChartMetadataListTx(repo: DataRepository, tx: idb.ReadTransaction, cb: AsyncCb<SequencerChartMetadata[]>): Done {
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

export function cleanupChartRepo(repo: DataRepository, cb: AsyncCallback<void>): Done {
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

export function loadChart(
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

export function saveChart(repo: DataRepository, chart: SequencerChart, cb: AsyncCb<boolean>): Done {
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

        updateAvailableMetadata(repo, tables.chart.allItemsAsync.val);

        return cb(true);
    });
}

// Creates a chart, returns it's id
export function createChart(repo: DataRepository, chart: SequencerChart, cb: AsyncCb<boolean>): Done {
    cb = toTrackedCallback(cb, "createChart");

    chart.name = chart.name.trim();

    const tx = repositoryWriteTx(repo, [tables.chart]);

    const data = compressChart(chart);
    return idb.createData(tx, tables.chart, data, (val, err) => {
        if (!val || err) return cb(false, err);

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

export function deleteChart(repo: DataRepository, chartToDelete: SequencerChart, cb: AsyncCb<void>): Done {
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

export function loadAllEffectRackPresets(repo: DataRepository, cb: AsyncCb<EffectRackPresetMetadata[]>): Done {
    cb = toTrackedCallback(cb, "loadAllEffectRackPresets");
    const tx = repositoryReadTx(repo, [tables.effectRackPresets])
    return idb.getAllMetadata(tx, tables.effectRackPresets, (list, err) => {
        if (!list || err) return cb(undefined, err);
        recomputeEffectRackPresets(repo);
        return cb(list);
    });
}

export function loadEffectRackPreset(repo: DataRepository, meta: EffectRackPresetMetadata, cb: AsyncCb<EffectRackPreset>): Done {
    cb = toTrackedCallback(cb, "loadEffectRackPreset");
    const tx = repositoryReadTx(repo, [tables.effectRackPresets]);
    return idb.getData(tx, tables.effectRackPresets, meta.id, cb);
}

export function createEffectRackPreset(
    repo: DataRepository,
    preset: EffectRackPreset,
    cb: AsyncCb<{ data: EffectRackPreset; metadata: EffectRackPresetMetadata }>
): Done {
    cb = toTrackedCallback(cb, "createEffectRackPreset");

    const tx = repositoryWriteTx(repo, [tables.effectRackPresets]);
    return idb.createData(tx, tables.effectRackPresets, preset, (val, err) => {
        if (!val || err) return cb(undefined, err);

        recomputeEffectRackPresets(repo);
        return cb(val);
    });
}

export function updateEffectRackPreset(repo: DataRepository, preset: EffectRackPreset, cb: AsyncCb): Done {
    cb = toTrackedCallback(cb, "updateEffectRackPreset");
    const tx = repositoryWriteTx(repo, [tables.effectRackPresets]);
    return idb.updateData(tx, tables.effectRackPresets, preset, () => {
        recomputeEffectRackPresets(repo);
        return cb();
    });
}

export function deleteEffectRackPreset(repo: DataRepository, preset: EffectRackPreset, cb: AsyncCb): Done {
    cb = toTrackedCallback(cb, "deleteEffectRackPreset");
    const tx = repositoryWriteTx(repo, [tables.effectRackPresets]);
    return idb.deleteData(tx, tables.effectRackPresets, preset.id, () => {
        recomputeEffectRackPresets(repo);
        return cb();
    })
}

function recomputeEffectRackPresets(repo: DataRepository) {
    repo.effectRackPresets.allEffectRackPresets = [
        ...repo.tables.effectRackPresets.allItemsAsync.val
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

export function loadAllKeyboardConfigPresets(repo: DataRepository, cb: AsyncCb<KeyboardConfigMetadata[]>): Done {
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
    cb: AsyncCb<boolean>,
): Done {
    cb = toTrackedCallback(cb, "saveKeyboardConfig");
    const tx = repositoryWriteTx(repo, [tables.keyboardPresets]);
    return idb.updateData(tx, tables.keyboardPresets, config, (val, err) => {
        recomputeKeyboardConfigPresets(repo);
        return cb(val, err);
    });
}

export function createKeyboardConfigPreset(
    repo: DataRepository,
    preset: KeyboardConfig,
    cb: AsyncCb<{ data: KeyboardConfig; metadata: KeyboardConfigMetadata }>,
): Done {
    cb = toTrackedCallback(cb, "createKeyboardConfigPreset");
    const tx = repositoryWriteTx(repo, [tables.keyboardPresets]);
    return idb.createData(tx, tables.keyboardPresets, preset, (val, err) => {
        recomputeKeyboardConfigPresets(repo);
        return cb(val, err);
    });
}

export function loadKeyboardConfig(
    repo: DataRepository,
    metadata: KeyboardConfigMetadata,
    cb: AsyncCb<KeyboardConfig>,
): Done {
    cb = toTrackedCallback(cb, "loadKeyboardConfig");
    const tx = repositoryReadTx(repo, [tables.keyboardPresets]);
    return idb.getData(tx, tables.keyboardPresets, metadata.id, cb);
}

export function deleteKeyboardConfig(repo: DataRepository, toDelete: KeyboardConfig, cb: AsyncCb<void>): Done {
    if (toDelete.id <= 0) {
        // Our work here is done :)
        return cb(undefined);
    }

    const tx = repositoryWriteTx(repo, [tables.chart]);
    return idb.deleteData(tx, tables.chart, toDelete.id, (val, err) => {
        recomputeKeyboardConfigPresets(repo);
        return cb(val, err);
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
    for (const preset of repo.tables.keyboardPresets.allItemsAsync.val) {
        forEachPresetGroup(preset.name, group => {
            let presets = groups.get(group) ?? [];
            presets.push(preset);
            groups.set(group, presets);
        });
    }
}

/////////////////////////////////////
// Next section
