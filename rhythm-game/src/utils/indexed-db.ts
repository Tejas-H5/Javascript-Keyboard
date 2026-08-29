// IndexedDB API is kind of a pain to wokrk with. Makes sense to use a dependency of some sort.
// However, the idb npm package is very difficult to debug, and I can't really understand what it's doing.
// This would be fine if it worked, but I'm running into a bug where when I save something, it saves multiple times.
// It is very difficult to tell if the bug is something I'm doing, or something they're doing.
// So we're just writing our own simple wrapper around it, rather than rely on their proxified promisified mess.
//
// NOTE: it is no longer a thing wrapper over IDB. Rather, it is highly opinionated as to how you should and shouldn't use it.
// The aim is to simplify the usage code as much as possible. There are simply too many decisions we can make as to 
// how the database is being used, and most of the decisions don't matter - I think it would be better
// if I just had a package that just made what I have learned to be the best decisions just once.
//
// NOTE: We sacrifice optimal performance or usage patterns in favour of simplicity in some cases:
//      - transactions are specified to always span all tables, for instance. this simplifies upstream code significantly. 
//        we'll have to rewrite it to something else if this doesn't work.
//        This API would be better if indexeddb could simply figure out which tables were part of the tranasction
//        when it is initiated.
//
// NOTE: indexeddb transactions rely on you responding to an action directly in the event tick in which a callback was returned
// a bit like preventDefault(), so you cannot interlace other non-IDB async stuff between them - the transaction is gone by the time 
// it re-enters into your code. TODO: validate. I think its 1 event tick delay or something. There needs to be time for the round trip after all.

import { filterInPlace } from "./array-utils";
import { assert } from "./assert";
import { DISPATCHED_LATER, DONE, Then, Done, Result, GetResult } from "./async-utils";

export function bytesToMegabytes(bytes: number) {
    return bytes / 1024 / 1024;
}

// NOTE: You'll need to use this to monitor your indexed database usage.
// For some use-cases on some browsers (chrome and not firefox, surprisingly), 
// it will grow infinitely, and you won't realize till your storage takes up 15GB for the tab,
// at which point the tab can no longer open, so you can't debug it even if you wanted to.
function getEstimatedDataUsage(then: Then<number | undefined>): Done {
    navigator.storage.estimate().then((val): Done => {
        if (!val.usage) return then(undefined);
        return then(bytesToMegabytes(val.usage));
    });
    return DISPATCHED_LATER;
}

export type SingleTableDefiniton<T> = {
    name:    TableName<T>;
    keyPath: keyof T & string;
    keyGen:  KeyGenerator;
};

function log(...messages: any[]) {
    console.log("[idb]", ...messages);
}

function logError(...messages: any[]) {
    console.error("[idb]", ...messages);
}

// You would typically just put a bunch of schemas into a table, and use that to refer to the various stores.
export type AllTables = Record<string, AnyTableDef>;
export type AnyTableDef = SingleTableDefiniton<any> | MetadataPairTableDef<any, any>;

// A way to define pairs of tables - one to hold large json blobs and such being the 'data' table, and 
// another one to hold smaller information being the 'metadata't able.
// A very common pattern, but kinda annoying to set up each time. 
export type MetadataPairTableDef<TData, TMetadata> = {
    data:           SingleTableDefiniton<TData>; 
    metadata:       SingleTableDefiniton<TMetadata>

    toMetadata: (data: TData) => TMetadata;

    // NOTE: This is some kind of pattern fr fr..........
    loadedMetadata: number;
    queue:          Then<TMetadata[]>[] | undefined;
    allItemsAsync: TMetadata[];
};

export const KEYGEN_NONE = 0;
export const KEYGEN_AUTOINCREMENT = 1;

export type KeyGenerator
    = typeof KEYGEN_NONE
    | typeof KEYGEN_AUTOINCREMENT;

export type TableName<_T> = string & { __TableName: void; };

export function newTableDef<T>(
    name: string,
    keyPath: keyof T & string,
    keyGen: KeyGenerator = KEYGEN_NONE
): SingleTableDefiniton<T> {
    return {
        name: name as TableName<T>,
        keyPath: keyPath,
        keyGen
    };
}

function isMetadataPair(value: AnyTableDef): value is MetadataPairTableDef<any, any> {
    return "data" in value && "metadata" in value;
}

export function openConnection(
    name: string, 
    version: number,  // Dont forget to bump whenever you add tables.
    tables: AllTables, 
    methods: {
        // When other tabs have this open: https://developer.mozilla.org/en-US/docs/Web/API/IDBOpenDBRequest/blocked_event
        onBlocked: (ev: IDBVersionChangeEvent) => void,
        // https://developer.mozilla.org/en-US/docs/Web/API/IDBDatabase/close_event
        onUnexpectedlyClosed: (ev: Event) => void,
    },
    then: Then<Result<IDBDatabase>>,
): Done {
    const openRequest = window.indexedDB.open(name, version);

    getEstimatedDataUsage(mb => {
        if (mb !== undefined) {
            if (mb > 5 * 1024) {
                logError("Your program is using over 5GB of storage. It won't be openable anymore if it starts using over 15 gb.");
            } else if (mb > 1024) {
                logError("Your program is using over 1GB of storage. There may be a bug somewhere");
            }
        } else {
            log("couldn't estimate storage usage...");
        }
        return DONE;
    });

    openRequest.onupgradeneeded = () => {
        log("Upgrading IndexedDB", name, version)

        const idb = openRequest.result;

        const processedTableNames = new Set<string>();

        function processTableDef(table: SingleTableDefiniton<any>) {
            if (processedTableNames.has(table.name)) {
                throw new Error("You repeated the same table name twice");
            }
            processedTableNames.add(table.name);

            let autoIncrement = undefined;
            if (table.keyGen === KEYGEN_AUTOINCREMENT) {
                autoIncrement = true;
            } else if (table.keyGen === KEYGEN_NONE) {
                autoIncrement = false;
            }

            try {
                idb.createObjectStore(table.name, {
                    keyPath: table.keyPath,
                    autoIncrement: autoIncrement,
                });
                log("Created object store", table);
            } catch (error) {
                if (error instanceof DOMException && error.name === "ConstraintError") {
                    // this error just means the table already exists - it can be ignored
                    log("Created object store", table);
                } else {
                    throw error;
                }
            }

        }

        // Don't delete object stores. 
        // This is because we don't want to delete user data in an automated fashion, on this side of the API boundary, ever.
        for (const key in tables) {
            const value = tables[key];

            if (isMetadataPair(value)) {
                processTableDef(value.data);
                processTableDef(value.metadata);
            } else {
                processTableDef(value);
            }
        }
    };
    openRequest.onsuccess = () => {
        const idb = openRequest.result;
        openRequest.result.onclose = (ev) => {
            methods.onUnexpectedlyClosed(ev);
        }
        then({ value: idb });
    };
    openRequest.onerror = (err) => {
        then({ error: "" + err });
    };
    openRequest.onblocked = (event) => {
        methods.onBlocked(event);
    };

    return DISPATCHED_LATER;
}

export type TransactionData = { raw: IDBTransaction; };
// TODO: ReadTransaction<T>, T extends TableDefiniton<any>[];
export type ReadTransaction  = TransactionData & { __ReadTransaction: void; };
export type WriteTransaction = ReadTransaction & { __WriteTransaction: void; };

function processTables(tables: AnyTableDef[], fn: (table: SingleTableDefiniton<any>) => void) {
    for (const table of tables) {
        if (isMetadataPair(table)) {
            fn(table.metadata);
            fn(table.data);
        } else {
            fn(table);
        }
    }
}

/** Specify the tables you actually want to read/write */
export function newReadTransaction(idb: IDBDatabase, tables: AnyTableDef[]): ReadTransaction {
    const tableNames: string[] = [];
    processTables(tables, t => tableNames.push(t.name));

    const transaction = idb.transaction(tableNames, "readonly");
    transaction.onerror = function(err) {
        log('[read-tx] - ERROR', err);
    };
    transaction.oncomplete = function() {
        log('[read-tx] - DONE');
    };

    const tx: TransactionData = { raw: transaction, };
    return tx as ReadTransaction;
}

/** Specify the tables you actually want to read/write */
export function newWriteTransaction(idb: IDBDatabase, tables: AnyTableDef[]): WriteTransaction {
    const tableNames: string[] = [];
    processTables(tables, t => tableNames.push(t.name));

    const transaction = idb.transaction(tableNames, "readwrite", { durability: "strict" });
    transaction.onerror = function(err) {
        log('[write-tx] - ERROR', err);
    };
    transaction.oncomplete = function() {
        log('[write-tx] - DONE');
    };

    const tx: TransactionData = { raw: transaction };
    return tx as WriteTransaction;
}

export function abortTransaction(tx: ReadTransaction | WriteTransaction) {
    tx.raw.abort();
}

export type ValidKey = string | number;

export function keyIsNil(key: ValidKey): boolean {
    if (typeof key === "number") return key <= 0;
    if (typeof key === "string") return key.length === 0;
    throw new Error("Invalid key: " + key);
}

export function getOne<T>(
    tx: ReadTransaction,
    table: SingleTableDefiniton<T>,
    key: ValidKey,
    then: Then<GetResult<T>>
): Done {
    try {
        const store = tx.raw.objectStore(table.name);
        const txGetRequest: IDBRequest<T> = store.get(key);
        txGetRequest.onsuccess = () => then({ value: txGetRequest.result });
        txGetRequest.onerror = (err) => {
            logError(err);
            then({ error: "" + err });
        }
    } catch (err) {
        logError(err);
        then({ error: "" + err });
    }

    return DISPATCHED_LATER;
}

export function getAll<T>(tx: ReadTransaction, table: SingleTableDefiniton<T>, cb: Then<T[]>): Done {
    const store = tx.raw.objectStore(table.name);
    const txGetRequest: IDBRequest<T[]> = store.getAll();
    txGetRequest.onsuccess = () => cb(txGetRequest.result);
    txGetRequest.onerror   = (err) => {
        logError(err);
        cb([]);
    }
    return DONE;
}

// TODO: use cursors for pagination and range scans

/**
 * You can use this to either create something, if you're generating IDs yourself,
 * or to edit an existing thing. When you don't know the id of your thing, use {@link createOne} instead;
 */
export function putOne<T>(
    tx:    WriteTransaction,
    table: SingleTableDefiniton<T>,
    value: T,
    cb: Then<boolean>
): Done {
    const store = tx.raw.objectStore(table.name);
    const txGetRequest: IDBRequest = store.put({ ...value });
    txGetRequest.onsuccess = () => {
        cb(true);
    }
    txGetRequest.onerror = (err) => {
        logError(err);
        cb(false);
    }

    return DONE;
}

type WriteRequest<T> = {
    table: SingleTableDefiniton<T>; 
    value: T;
};

// Generics.
export function writeRequest<T>(
    table: SingleTableDefiniton<T>,
    value: T,
) {
    return { table, value };
}

/** See {@link putOne} */
export function putMany(
    tx: WriteTransaction,
    writes: WriteRequest<any>[],
    cb: Then<boolean>
): Done {
    for (const w of writes) {
        putOne(tx, w.table, w.value, finished);
    }

    let count = writes.length
    function finished() {
        count--;
        if (count === 0) cb(true);
        return DISPATCHED_LATER;
    }

    return  DISPATCHED_LATER;
}

/**
 * Deletes the value from the table, and resets it's id to the zero value.
 */
export function deleteOne(
    tx:    WriteTransaction,
    table: SingleTableDefiniton<any>,
    id:    ValidKey,
    then: Then<void>,
): Done {
    const store = tx.raw.objectStore(table.name);
    const txGetRequest: IDBRequest = store.delete(IDBKeyRange.only(id));
    txGetRequest.onsuccess = () => then();
    txGetRequest.onerror = (err) => {
        logError(err);
        then(undefined);
    }
    return DONE;
}

export function deleteMany(
    tx: WriteTransaction,
    deletions: {
        table: SingleTableDefiniton<any>,
        id: ValidKey,
    }[],
    cb: Then<void>,
): Done {
    for (const d of deletions) {
        deleteOne(tx, d.table, d.id, finished);
    }

    let count = deletions.length
    function finished() {
        count--;
        if (count === 0) cb();
        return DISPATCHED_LATER;
    }

    return DISPATCHED_LATER;
}

/**
 * Creates a _new_ value in the table (regardless of if the id is present or not),
 * and then assigns this new id to value[table.keyPath].
 */
export function createOne<T>(
    tx: WriteTransaction,
    table: SingleTableDefiniton<T>,
    value: T,
    cb: Then<Result<ValidKey>>
): Done {
    const store = tx.raw.objectStore(table.name);

    const payload: T = { ...value };
    delete payload[table.keyPath];

    const txGetRequest: IDBRequest = store.add(payload);
    txGetRequest.onsuccess = () => {
        const generatedId = txGetRequest.result;
        value[table.keyPath] = generatedId;
        cb({ value: generatedId });
    };
    txGetRequest.onerror = (err) => {
        logError(err);
        cb({ error: "" + err });
    }

    return DISPATCHED_LATER;
}

/**
 * If each row of your database contains lots of data, like JSON blobs, then it can be more efficient
 * to have a 'metadata' table and a 'data' table. Since it is a bit annoying to do this each time,
 * I've added a couple helpers for this - I don't want to end up in a situation where it may be better
 * to do two tables, but for short-term convenience sake, I just do one table.
 * It is actually very simple, but it is easy to fall into thinking otherwise.
 */
export function newMetadataPairTableDef<TData, TMetadata>(
    baseName: string,
    getMetadata: (data: TData) => TMetadata,
    key: keyof TData & string,
    metadataKey: keyof TMetadata & string,
): MetadataPairTableDef<TData, TMetadata> {
    const dataTable     = newTableDef<TData>(baseName + "_data", key, KEYGEN_NONE);
    const metadataTable = newTableDef<TMetadata>(baseName + "_metadata", metadataKey, KEYGEN_AUTOINCREMENT);

    return {
        data:           dataTable,
        metadata:       metadataTable,
        toMetadata:     getMetadata,
        loadedMetadata: 0,
        queue: undefined,
        allItemsAsync:  [],
    };
}

// No getAllData function, to discourage such thing
export function getAllMetadata<TData, TMetadata>(
    tx: ReadTransaction,
    tables: MetadataPairTableDef<TData, TMetadata>,
    cb: Then<TMetadata[]>
): Done {
    if (tables.loadedMetadata === 0) {
        tables.loadedMetadata = 1;
        getAll(tx, tables.metadata, val => {
            tables.loadedMetadata = 2;
            tables.allItemsAsync = val;
            cb(val);
            if (tables.queue) {
                for (const cb of tables.queue) {
                    try {
                        cb(val);
                    } catch (err) {
                        console.error(getAllMetadata, "fahhh ", err);
                    }
                }
            }
            return DONE;
        });
    } else if (tables.loadedMetadata === 1) {
        if (!tables.queue) {
            tables.queue = [];
        }
        tables.queue.push(cb);
    } else {
        cb(tables.allItemsAsync);
    }

    return DONE;
}

export function getData<TData, TMedatada>(
    tx: ReadTransaction,
    tables: MetadataPairTableDef<TData, TMedatada>,
    id: ValidKey,
    cb: Then<TData | undefined>,
): Done {
    return getOne(tx, tables.data, id, data => {
        if ("error" in data) {
            return cb(undefined);
        }
        return cb(data.value);
    });
}

/**
 * Updates one _Existing_ data/metadata pair
 */
export function updateData<TData, TMetadata>(
    tx:      WriteTransaction,
    tables:  MetadataPairTableDef<TData, TMetadata>,
    newData: TData,
    cb:      Then<boolean>,
): Done {
    const id  = newData[tables.data.keyPath] as ValidKey;
    const idx = tables.allItemsAsync.findIndex(m => m[tables.metadata.keyPath] === id);
    if (idx === -1) {
        logError("Metadata was not present in loaded metadata list. Only metadata we have first loaded can be updated.");
        return cb(false);
    }

    const target      = tables.allItemsAsync[idx];
    const newMetadata = tables.toMetadata(newData);

    // Update metadata optimistically
    assignToObject(target, newMetadata);

    let existingData: GetResult<TData>;
    let existingMetadata: GetResult<TMetadata>;
    getOne(tx, tables.data, id, val => {
        existingData = val;
        return onGet();
    });
    getOne(tx, tables.metadata, id, val => {
        existingMetadata = val;
        return onGet();
    });

    function onGet() {
        if (existingData && existingMetadata) {
            if (!existingData.value || !existingMetadata.value) {
                logError("Metadata or data with this ID doesn't already exist");
                return cb(false);
            }

            putOne(tx, tables.data, newData, onPut);
            putOne(tx, tables.metadata, newMetadata, onPut);

            let count = 0;
            function onPut(): Done {
                count++;
                if (count === 2) {
                    return cb(true);
                }
                return DISPATCHED_LATER;
            }
        }

        return DISPATCHED_LATER;
    }

    return DISPATCHED_LATER;
}

/**
 * saveData   -> Create or save data, don't care what ID it gets
 * updateData -> Update existing data we already created, ID is irrelevant
 * createData -> Create new data, want a new ID and don't care what it is
 * putData    -> Create or save data, to this very specific ID.
 */

/**
 * If the id is nil, creates a new data/metadata pair.
 * Else, updates the existing data/metadata pair.
 */
export function saveData<TData, TMetadata>(
    tx:      WriteTransaction,
    tables:  MetadataPairTableDef<TData, TMetadata>,
    newData: TData,
    cb:      Then<Result<boolean>>,
): Done {
    const id  = newData[tables.data.keyPath] as ValidKey;

    if (keyIsNil(id)) {
        return createData(tx, tables, newData, (result) => {
            if ("error" in result) {
                return cb({ error: result.error });
            } 
            return cb({ value: true });
        });
    }

    return updateData(tx, tables, newData, () => cb({ value: true }));
}

export function createData<TData, TMetadata>(
    tx: WriteTransaction,
    tables: MetadataPairTableDef<TData, TMetadata>,
    newData: TData,
    cb: Then<Result<{ data: TData; metadata: TMetadata }>>,
): Done {
    const metadata = tables.toMetadata(newData);

    return createOne(tx, tables.metadata, metadata, (idResult) => {
        if ("error" in idResult) return cb({ error: idResult.error });

        // Link the data the user passed in to the metadata by mutating it directly
        // @ts-expect-error I hardley knower
        newData[tables.data.keyPath] = idResult.value;

        putOne(tx, tables.data, newData, () => {
            // Since we know what happens to the list when we create an item in the database, we can 
            // simply do the same on our side as well, rather than reloading all entries from the database.
            const idx = tables
                .allItemsAsync
                .findIndex(val => val[tables.metadata.keyPath] === metadata[tables.metadata.keyPath]);

            if (idx !== -1) {
                return cb({ error: "Something else already created this data while we were creating it !!!"});
            }

            tables.allItemsAsync.push(metadata);
            return cb({ value: { data: newData, metadata: metadata } });
        });

        return DONE;
    })
}

export function putData<TData, TMetadata>(
    tx: WriteTransaction,
    tables: MetadataPairTableDef<TData, TMetadata>,
    newData: TData,
    cb: Then<boolean>,
    id: ValidKey,
): Done {
    assert(typeof newData[tables.data.keyPath] === typeof id);

    // @ts-expect-error it is not smart enough to notice the assert above
    newData[tables.data.keyPath] = id;
    const newMetadata = tables.toMetadata(newData);

    putOne(tx, tables.metadata, newMetadata, () => {
        const idx = tables.allItemsAsync.findIndex(m => m[tables.metadata.keyPath] === id);
        if (idx === -1) {
            tables.allItemsAsync.push(newMetadata);
        } else {
            assignToObject(tables.allItemsAsync[idx], newMetadata);
        }

        return onWritten();
    });

    putOne(tx, tables.data, newData, onWritten);

    let count = 0;
    function onWritten(): Done {
        count++;
        if (count === 2) return cb(true);
        return DISPATCHED_LATER;
    }

    return DISPATCHED_LATER;
}

// Allows object references to be stable
function assignToObject<T>(dst: T, src: T) {
    for (const k in src) {
        dst[k] = src[k];
    }
}

export function deleteData<TData, TMetadata>(
    tx:     WriteTransaction,
    tables: MetadataPairTableDef<TData, TMetadata>,
    id:     ValidKey,
    cb:     Then<void>
): Done {
    deleteOne(tx, tables.metadata, id,  () => {
        filterInPlace(tables.allItemsAsync, m => m[tables.metadata.keyPath] !== id);
        return onDeleted();
    });

    deleteOne(tx, tables.data, id,  onDeleted);

    let completed = 0;
    function onDeleted(): Done {
        completed++;
        if (completed === 2) return cb();
        return DISPATCHED_LATER;
    }

    return DISPATCHED_LATER;
}


