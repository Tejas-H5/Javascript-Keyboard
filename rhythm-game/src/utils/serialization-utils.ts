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
 * Copies over values from the loaded object to the default object.
 * This is more than enough to implement a custom migration method for 99% of local state migrations.
 * This is only recursive down plain objects (and not arrays, for isntance), and all happens in-place.
 *
 * WARNING:if you use objects as a container for kv pairs, this method will clear out said object.
 */
export function autoMigrate<T extends object>(loadedData: T, currentSchemaVerCreator: () => T): T {
    const currentObjectVersion = currentSchemaVerCreator();
    return autoMigrateInternal(loadedData, currentObjectVersion);
}

// Implementation detail: By copying the loaded data _into_ the default data, all loaded date can share the same hidden class as the default data.
//
// Don't let people accidentally reuse the same default schema in multiple places, which would create strange cyclical references.
function autoMigrateInternal<T extends object>(loadedData: T, defaultSchema: T): T {
    for (const key in loadedData) {
        if (!(key in defaultSchema)) {
            continue
        }

        const defaultValue = defaultSchema[key];
        let loadedValue = loadedData[key];

        // recurse down objects
        if (isPlainObject(loadedValue)) {
            if (!isPlainObject(defaultValue)) {
                throw new Error(`Migration failed - loaded a plain object when the default value wasn't a plain object.`);
            }

            // If you've loaded data from JSON, this should never happen
            loadedValue = autoMigrateInternal(loadedValue, defaultValue);
        }

        defaultSchema[key] = loadedData[key];
    }

    return defaultSchema;
}

function isPlainObject(val: unknown): val is object {
    return val !== null && 
        typeof val === "object" && 
        Object.getPrototypeOf(val) === Object.prototype;
}

