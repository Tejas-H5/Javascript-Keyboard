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
import {
    ACB,
    ACR,
    AsyncCallback,
    AsyncCallbackResult,
    asyncResult,
    DISPATCHED_ELSEWHERE,
    DONE,
    newError,
    parallelIterator,
    toAsyncCallback
} from "./async-utils";

// NOTE: You'll need to use this to monitor your indexed database usage.
// For some use-cases on some browsers (chrome and not firefox, surprisingly), 
// it will grow infinitely, and you won't realize till your storage takes up 15GB for the tab,
// at which point the tab can no longer open, so you can't debug it even if you wanted to.
export function getEstimatedDataUsage(cb: AsyncCallback<StorageEstimate>) {
    toAsyncCallback(navigator.storage.estimate(), cb);
}

export type SingleTableDefiniton<T> = {
    name:    TableName<T>;
    keyPath: keyof T & string;
    keyGen:  KeyGenerator;
};

function logError(err: any) {
    console.error("[idb] - an error occurred: " + err);
}

// You would typically just put a bunch of schemas into a table, and use that to refer to the various stores.
export type AllTables = Record<string, AnyTableDef>;
export type AnyTableDef = SingleTableDefiniton<any> | MetadataPairTableDef<any, any>;

// A way to define pairs of tables - one to hold large json blobs and such being the 'data' table, and 
// another one to hold smaller information being the 'metadata't able.
// A very common pattern, but kinda annoying to set up each time. 
export type MetadataPairTableDef<TData, TMetadata> = {
    data: SingleTableDefiniton<TData>; 
    metadata: SingleTableDefiniton<TMetadata>

    getMetadata: (data: TData) => TMetadata;
    loadedMetadata: TMetadata[];
    loadedMetadataLoaded: boolean;
};

export const KEYGEN_NONE = 0;
export const KEYGEN_AUTOINCREMENT = 1;

export type KeyGenerator
    = typeof KEYGEN_NONE
    | typeof KEYGEN_AUTOINCREMENT;

export type TableName<_T> = string & { __TableName: void; };

export function newTableDefinition<T>(
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
    cb: ACB<IDBDatabase>,
): ACR {
    const openRequest = window.indexedDB.open(name, version);

    openRequest.onupgradeneeded = () => {
        console.log("Upgrading IndexedDB", name, version)

        const idb = openRequest.result;

        function processTableDef(table: SingleTableDefiniton<any>) {
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
            } catch (error) {
                if (error instanceof DOMException && error.name === "ConstraintError") {
                    // this error just means the table already exists - it can be ignored
                } else {
                    throw error;
                }
            }

            console.log("Created object store", table);
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
        cb(idb);
    };
    openRequest.onerror = (err) => {
        logError(err);
        cb(undefined, err);
    };
    openRequest.onblocked = (event) => {
        methods.onBlocked(event);
    };

    return DISPATCHED_ELSEWHERE;
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
        console.log('[read-tx] - ERROR', err);
    };
    transaction.oncomplete = function() {
        console.log('[read-tx] - DONE');
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
        console.log('[write-tx] - ERROR', err);
    };
    transaction.oncomplete = function() {
        console.log('[write-tx] - DONE');
    };

    const tx: TransactionData = { raw: transaction };
    return tx as WriteTransaction;
}

export function abortTransaction(tx: ReadTransaction | WriteTransaction) {
    tx.raw.abort();
}

export type ValidKey = string | number;

export function getOne<T>(
    tx: ReadTransaction,
    table: SingleTableDefiniton<T>,
    key: ValidKey,
    cb: AsyncCallback<T>
): AsyncCallbackResult {
    const store = tx.raw.objectStore(table.name);
    const txGetRequest: IDBRequest<T> = store.get(key);
    txGetRequest.onsuccess = () => cb(txGetRequest.result);
    txGetRequest.onerror   = (err) => {
        logError(err);
        cb(undefined, err);
    }
    return DONE;
}

export function getAll<T>(tx: ReadTransaction, table: SingleTableDefiniton<T>, cb: AsyncCallback<T[]>): AsyncCallbackResult {
    const store = tx.raw.objectStore(table.name);
    const txGetRequest: IDBRequest<T[]> = store.getAll();
    txGetRequest.onsuccess = () => cb(txGetRequest.result);
    txGetRequest.onerror   = (err) => {
        logError(err);
        cb(undefined, err);
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
    cb: AsyncCallback<boolean>
): AsyncCallbackResult {
    const store = tx.raw.objectStore(table.name);
    const txGetRequest: IDBRequest = store.put({ ...value });
    txGetRequest.onsuccess = () => {
        cb(true);
    }
    txGetRequest.onerror = (err) => {
        logError(err);
        cb(undefined, err);
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

export function putMany(
    tx: WriteTransaction,
    writes: WriteRequest<any>[],
    cb: AsyncCallback<boolean>
): AsyncCallbackResult {
    return parallelIterator(writes, (write, finished) => {
        return putOne(tx, write.table, write.value, () => finished());
    }, (_, err) => cb(true, err));
}

/**
 * Deletes the value from the table, and resets it's id to the zero value.
 */
export function deleteOne(
    tx:    WriteTransaction,
    table: SingleTableDefiniton<any>,
    id:    ValidKey,
    cb: AsyncCallback<void>,
): AsyncCallbackResult {
    const store = tx.raw.objectStore(table.name);
    const txGetRequest: IDBRequest = store.delete(IDBKeyRange.only(id));
    txGetRequest.onsuccess = () => cb();
    txGetRequest.onerror = (err) => {
        logError(err);
        cb(undefined, err);
    }
    return DONE;
}

export function deleteMany(
    tx: WriteTransaction,
    deletions: {
        table: SingleTableDefiniton<any>,
        id: ValidKey,
    }[],
    cb: AsyncCallback<void>,
): AsyncCallbackResult {
    return parallelIterator(deletions, (val, finished) => {
        return deleteOne(tx, val.table, val.id, finished);
    }, (_, err) => cb(undefined, err));
}

/**
 * Creates a _new_ value in the table (regardless of if the id is present or not),
 * and then assigns this new id to value[table.keyPath].
 */
export function createOne<T>(
    tx: WriteTransaction,
    table: SingleTableDefiniton<T>,
    value: T,
    cb: AsyncCallback<ValidKey>
): ACR {
    const store = tx.raw.objectStore(table.name);

    const payload: T = { ...value };
    delete payload[table.keyPath];

    const txGetRequest: IDBRequest = store.add(payload);
    txGetRequest.onsuccess = () => {
        const generatedId = txGetRequest.result;
        value[table.keyPath] = generatedId;
        cb(generatedId);
    };
    txGetRequest.onerror = (err) => {
        logError(err);
        cb(undefined, err);
    }

    return DISPATCHED_ELSEWHERE;
}

/**
 * If each row of your database contains lots of data, like JSON blobs, then it can be more efficient
 * to have a 'metadata' table and a 'data' table. Since it is a bit annoying to do this each time,
 * I've added a couple helpers for this - I don't want to end up in a situation where it may be better
 * to do two tables, but for short-term convenience sake, I just do one table.
 * It is actually very simple, but it is easy to fall into thinking otherwise.
 */
export function newDataMetadataTablePairDefinition<TData, TMetadata>(
    baseName: string,
    key: keyof TData & string,
    metadataKey: keyof TMetadata & string,
    getMetadata: (data: TData) => TMetadata,
): MetadataPairTableDef<TData, TMetadata> {
    const dataTable     = newTableDefinition<TData>(baseName + "_data", key, KEYGEN_NONE);
    const metadataTable = newTableDefinition<TMetadata>(baseName + "_metadata", metadataKey, KEYGEN_AUTOINCREMENT);

    return {
        data:           dataTable,
        metadata:       metadataTable,
        getMetadata:    getMetadata,
        loadedMetadata: [],
        loadedMetadataLoaded: false,
    };
}

// No getAllData function, to discourage such thing
export function getAllMetadata<TData, TMetadata>(
    tx: ReadTransaction,
    tables: MetadataPairTableDef<TData, TMetadata>,
    cb: AsyncCallback<TMetadata[]>
): AsyncCallbackResult {
    const len = tables.loadedMetadata.length;
    if (tables.loadedMetadataLoaded) {
        // Cached - run the callback synchronously, so that we don't lose the transaction.
        // Not sure if this is even possible with promises. Mabye it is. 
        // It's simpler to just use callbacks so that I don't have to think about it
        return cb(tables.loadedMetadata);
    }

    console.log("[getAllMetadata] - cache miss", tables);

    return getAll(tx, tables.metadata, (metadataList, err) => {
        if (!metadataList || err) {
            return cb(undefined, err);
        }

        // we don't handle this race condition yet
        assert(tables.loadedMetadata.length === len);

        tables.loadedMetadata = metadataList;
        tables.loadedMetadataLoaded = true;

        return cb(metadataList);
    });
}

export function getData<TData, TMedatada>(
    tx: ReadTransaction,
    tables: MetadataPairTableDef<TData, TMedatada>,
    id: ValidKey,
    cb: AsyncCallback<TData>,
): AsyncCallbackResult {
    return getOne(tx, tables.data, id, cb);
}

export function saveData<TData, TMetadata>(
    tx:      WriteTransaction,
    tables:  MetadataPairTableDef<TData, TMetadata>,
    newData: TData,
    cb:      ACB<boolean>,
): ACR {
    const id = newData[tables.data.keyPath] as ValidKey;

    const newMetadata = tables.getMetadata(newData);
    const idx         = tables.loadedMetadata.findIndex(m => m[tables.metadata.keyPath] === id);
    assert(idx !== -1); // How tf did they get this metadata otherwise ?

    const existingDataResult     = asyncResult<TData>(onGet);
    const existingMetadataResult = asyncResult<TMetadata>(onGet);

    getOne(tx, tables.data,     id, existingDataResult.callback);
    getOne(tx, tables.metadata, id, existingMetadataResult.callback);

    return DISPATCHED_ELSEWHERE;

    function onGet() {
        if (!existingDataResult.loaded || !existingMetadataResult.loaded) {
            return DONE;
        }

        const existingData     = existingDataResult.value;
        const existingMetadata = existingMetadataResult.value;

        if (!existingData || !existingMetadata) {
            return cb(undefined, newError("Metadata or data doesn't already exist"));
        }

        return putMany(tx, [
            writeRequest(tables.data, newData),
            writeRequest(tables.metadata, newMetadata),
        ], cb);
    }
}

export function createData<TData, TMetadata>(
    tx: WriteTransaction,
    tables: MetadataPairTableDef<TData, TMetadata>,
    newData: TData,
    cb: ACB<TMetadata>,
): ACR {
    const metadata = tables.getMetadata(newData);
    return createOne(tx, tables.metadata, metadata, (id, err) => {
        if (id === undefined || err) return cb(undefined, err);

        // Link the data the user passed in to the metadata by mutating it directly
        // @ts-expect-error I hardley knower
        newData[tables.data.keyPath] = id;

        putOne(tx, tables.data, newData, (_, err) => {
            assert(!err);

            // Since we know what happens to the list when we create an item in the database, we can 
            // simply do the same on our side as well, rather than reloading all entries from the database.
            const idx = tables
                .loadedMetadata
                .findIndex(val => val[tables.metadata.keyPath] === metadata[tables.metadata.keyPath]);

            if (idx === -1) {
                tables.loadedMetadata.push(metadata);
            }

            return cb(metadata);
        });

        return DONE;
    })
}

export function deleteData<TData, TMetadata>(
    tx:     WriteTransaction,
    tables: MetadataPairTableDef<TData, TMetadata>,
    id:     ValidKey,
    cb:     ACB<void>
): ACR {
    return deleteMany(tx, [
        { table: tables.metadata, id: id },
        { table: tables.data, id: id },
    ], (_, err) => {
        if (err) return cb(undefined, err);

        filterInPlace(tables.loadedMetadata, m => m[tables.metadata.keyPath] !== id);
        return cb();
    });
}


