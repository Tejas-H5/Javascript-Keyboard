/**
 * Recursively clones a JSON-serializable plain object, assuming that
 * all properties starting with '_' are computed, i.e not the ground truth, and
 * safe to strip off all objects.
 *
 * NOTE: {@link obj} is assumed to be JSON-serializable, and non-cyclic.
 */
export function recursiveCloneNonComputedFields(obj: any): any {
    if (Array.isArray(obj)) {
        return obj.map((x) => recursiveCloneNonComputedFields(x));
    }

    if (typeof obj === "object" && obj !== null) {
        const clone = {};
        for (const key in obj) {
            if (key[0] === "_") {
                continue;
            }

            // @ts-ignore
            clone[key] = recursiveCloneNonComputedFields(obj[key]);
        }
        return clone;
    }

    return obj;
}


/**
 * Automatically sets unset values to their defaults and removes values that aren't present in an object.
 * This is more than enough to implement a custom migration method for 99% of local state migrations.
 * This is only recursive down plain objects (and not arrays, for isntance), and all happens in-place.
 *
 * WARNING:if you use objects as a container for kv pairs, this method will clear out said object.
 */
export function autoMigrate<T extends object>(loadedData: T, currentSchemaVerCreator: () => T) {
    const currentObjectVersion = currentSchemaVerCreator();
    autoMigrateInternal(loadedData, currentObjectVersion);
}

// Don't let people accidentally reuse the same default schema in multiple places, which would create strange cyclical references.
export function autoMigrateInternal<T extends object>(loadedData: T, defaultSchema: T) {
    // delete keys we no longer care about
    for (const k in loadedData) {
        if (!(k in defaultSchema)) {
            delete loadedData[k];
        }
    }

    for (const k in defaultSchema) {
        const defaultValue = defaultSchema[k];

        // update the keys that we didn't set
        if (!(k in loadedData)) {
            loadedData[k] = defaultValue;
            continue;
        }

        const val = loadedData[k];
        if (val === undefined) {
            // If you've loaded data from JSON, this should never happen
            delete loadedData[k];
            continue;
        }

        // recurse down objects
        if (isPlainObject(defaultValue)) {
            if (!isPlainObject(val)) {
                throw new Error(`Migration failed - the type of ${k} appears to have changed.`);
            }

            // If you've loaded data from JSON, this should never happen
            autoMigrateInternal(val, defaultValue);
            continue;
        }
    }
}

function isPlainObject(val: unknown): val is object {
    return val !== null && 
        typeof val === "object" && 
        Object.getPrototypeOf(val) === Object.prototype;
}

