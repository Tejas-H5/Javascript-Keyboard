// IndexedDB API is kind of a pain to wokrk with. Makes sense to use a dependency of some sort.
// However, the idb npm package is very difficult to debug, and I can't really understand what it's doing.
// This would be fine if it worked, but I'm running into a bug where when I save something, it saves multiple times.
// It is very difficult to tell if the bug is something I'm doing, or something they're doing.
// So we're just writing our own simple wrapper around it, rather than rely on their proxified promisified mess.
//
// NOTE: it is no longer a thing wrapper over IDB. Rather, it is highly opinionated as to how you should and shouldn't use it.
// The aim is to simplify the usage code as much as possible. 
//
// NOTE: We sacrifice optimal performance or usage patterns in favour of simplicity in some cases:
//      - transactions are specified to always span all tables, for instance. this simplifies upstream code significantly. 
//        we'll have to rewrite it to something else if this doesn't work.
//        This API would be better if indexeddb could simply figure out which tables were part of the tranasction
//        when it is initiated.
//
// NOTE: indexeddb transactions rely on you responding to an action directly in the event tick in which a callback was returned
// a bit like preventDefault(), so you cannot interlace other non-IDB async stuff between them - the transaction is gone by the time 
// it re-enters into your code.


// NOTE: You'll need to use this to monitor your indexed database usage.
// For some use-cases on some browsers (chrome and not firefox, surprisingly), 
// it will grow infinitely, and you won't realize till your storage takes up 15GB for the tab,
// at which point the tab can no longer open, so you can't debug it even if you wanted to.
export function getEstimatedDataUsage() {
    return navigator.storage.estimate();
}

export type Table<_T> = {
    name:    string;
    keyPath: string;
    keyGen:  KeyGenerator;
};

// You would typically just put a bunch of schemas into a table, and use that to refer to the various stores.
export type AllTables = Record<string, Table<any>>;


export const KEYGEN_NONE = 0;
export const KEYGEN_AUTOINCREMENT = 1;

export type KeyGenerator
    = typeof KEYGEN_NONE
    | typeof KEYGEN_AUTOINCREMENT;

export function newTable<T>(
    name: string,
    keyPath: string,
    keyGen: KeyGenerator = KEYGEN_NONE
): Table<T> {
    return {
        name,
        keyPath,
        keyGen
    };
}

export function openConnection(name: string, version: number, tables: AllTables, methods: {
    // When other tabs have this open: https://developer.mozilla.org/en-US/docs/Web/API/IDBOpenDBRequest/blocked_event
    onBlocked: (ev: IDBVersionChangeEvent) => void,
    // https://developer.mozilla.org/en-US/docs/Web/API/IDBDatabase/close_event
    onUnexpectedlyClosed: (ev: Event) => void,
}): Promise<IDBDatabase> {
    return new Promise<IDBDatabase>((resolve, reject) => {
        const openRequest = window.indexedDB.open(name, version);

        openRequest.onupgradeneeded = () => {
            console.log("Upgrading IndexedDB", name, version)

            const idb = openRequest.result;

            // Don't delete object stores. 
            // This is because we don't want to delete user data in an automated fashion, on this side of the API boundary, ever.
            for (const key in tables) {
                const value = tables[key];

                let autoIncrement = undefined;
                if (value.keyGen === KEYGEN_AUTOINCREMENT) {
                    autoIncrement = true;
                } else if (value.keyGen === KEYGEN_NONE) {
                    autoIncrement = false;
                }

                idb.createObjectStore(value.name, {
                    keyPath: value.keyPath,
                    autoIncrement: autoIncrement,
                });

                console.log("Created object store", value);
            }
        };
        openRequest.onsuccess = () => {
            openRequest.result.onclose = (ev) => {
                methods.onUnexpectedlyClosed(ev);
            }
            resolve(openRequest.result);
        };
        openRequest.onerror = (err) => {
            reject(err);
        };
        openRequest.onblocked = (event) => {
            methods.onBlocked(event);
        };
    });
}

export type TransactionData = { raw: IDBTransaction; };
export type ReadTransaction  = TransactionData & { __ReadTransaction: void; };
export type WriteTransaction = ReadTransaction & { __WriteTransaction: void; };

export function newReadTransaction(idb: IDBDatabase, tables: AllTables): ReadTransaction {
    const tableNames = Object.values(tables).map(t => t.name);
    const transaction = idb.transaction(tableNames, "readonly");
    const tx: TransactionData = { raw: transaction, };
    return tx as ReadTransaction;
}

export function newWriteTransaction(idb: IDBDatabase, tables: AllTables): WriteTransaction {
    const tableNames = Object.values(tables).map(t => t.name);
    const transaction = idb.transaction(tableNames, "readwrite", { durability: "strict" });
    const tx: TransactionData = { 
        raw: transaction, 
    };
    return tx as WriteTransaction;
}

export function abortTransaction(tx: ReadTransaction | WriteTransaction) {
    tx.raw.abort();
}

export type ValidKey = string | number;

export function getOne<T>(tx: ReadTransaction, table: Table<T>, key: ValidKey): Promise<T | undefined> {
    return new Promise<T | undefined>((resolve, reject) => {
        const store = tx.raw.objectStore(table.name);
        const txGetRequest: IDBRequest<T> = store.get(key);
        txGetRequest.onsuccess = () => resolve(txGetRequest.result);
        txGetRequest.onerror   = (err) => reject(err);
    });
}

export function getAll<T>(tx: ReadTransaction, table: Table<T>): Promise<T[]> {
    return new Promise<T[]>((resolve, reject) => {
        const store = tx.raw.objectStore(table.name);
        const txGetRequest: IDBRequest<T[]> = store.getAll();
        txGetRequest.onsuccess = () => resolve(txGetRequest.result);
        txGetRequest.onerror   = (err) => reject(err);
    });
}

// TODO: use cursors for pagination and range scans

// You can use this to either create something, if you're generating IDs yourself,
// or to edit an existing thing
export function putOne<T>(tx: WriteTransaction, table: Table<T>, value: T): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        const store = tx.raw.objectStore(table.name);
        const txGetRequest: IDBRequest = store.put(value);
        txGetRequest.onsuccess = () => resolve(txGetRequest.result);
        txGetRequest.onerror   = (err) => reject(err);
    });
}

export function deleteOne<T>(tx: WriteTransaction, table: Table<T>, id: ValidKey): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        const store = tx.raw.objectStore(table.name);
        const txGetRequest: IDBRequest = store.delete(IDBKeyRange.only(id));
        txGetRequest.onsuccess = () => resolve(txGetRequest.result);
        txGetRequest.onerror   = (err) => reject(err);
    });
}

export function createOne<T extends object>(tx: WriteTransaction, table: Table<T>, value: T): Promise<ValidKey> {
    return new Promise<ValidKey>((resolve, reject) => {
        const store = tx.raw.objectStore(table.name);
        const payload: Record<string, any> = { ...value };
        delete payload[table.keyPath];
        const txGetRequest: IDBRequest = store.add(payload);
        txGetRequest.onsuccess = () => resolve(txGetRequest.result);
        txGetRequest.onerror   = (err) => reject(err);
    });
}

