// Utils to serialize and deserialize values to and from JSON.
// Serilizing is fairly simple. 
// However, we want the data we deserialize to all have the same optimized 'hidden class' as the normal objects we create within the app.
// Getting this wrong is supposed to have an adverse effect on all downstream code. This is mainly a javascript problem, and 
// won't appear in other languages that have comptime or RTTI/reflection.
// We also want the code to be resistant to schema change.
// For this reason, deserialization is more complicated, but it's worth it.
// This was the tradeoff between literally serializing every field, or using some library that probably doesn't 
// even know or care about javascript internals. Because what's the point of using plain objects for your state
// if the engine just de-optimizes all of them as soon as you load them?

export function asNull(val: unknown): null | undefined {
    return val === null ? null : undefined;
}

export function asString(val: unknown): string | undefined {
    return typeof val === "string" ? val : undefined;
}

export function asNumber(val: unknown): number | undefined {
    return typeof val === "number" ? val : undefined;
}

export function asBoolean(val: unknown): boolean | undefined {
    return typeof val === "boolean" ? val : undefined;
}

export function asTrue(val: unknown): true | undefined {
    return val === true ? true : undefined;
}

export function asFalse(val: unknown): false | undefined {
    return val === false ? false : undefined;
}

export function asObject(val: unknown, reinterpretEntriesAsObject = true): Record<string, unknown> | undefined {
    if (val != null && val.constructor === Object) {
        return val as Record<string, unknown>;
    }

    if (reinterpretEntriesAsObject) {
        const entries = asStringOrNumberEntriesList(val, true, u => u);
        if (entries) {
            return Object.fromEntries(entries);
        }
    }

    return undefined;
}

export function asArray<T>(val: unknown, castFn?: (u: unknown) => u is T): T[] | undefined {
    if (!Array.isArray(val)) return undefined;
    if (!castFn) return val;
    if (!val.every(castFn)) return undefined;
    return val;
}

export function asDate(val: unknown): Date | undefined {
    if (typeof val === "string") {
        if (val.length === 24 || val.length === 27) {
            const parsed = new Date(val);
            if (!isNaN(parsed.getTime())) {
                return parsed;
            }
        }
    }

    return undefined;
}

export function asStringMap<T>(val: unknown, mapFn: (u: unknown) => T | undefined): Map<string, T> | undefined {
    return new Map(asStringOrNumberEntriesList(val, true, mapFn));
}

export function asNumberMap<T>(val: unknown, mapFn: (u: unknown) => T | undefined): Map<number, T> | undefined {
    return new Map(asStringOrNumberEntriesList(val, false, mapFn));
}

function asStringOrNumberEntriesList<T>(val: unknown, stringKeys: false, mapFn: (u: unknown) => T | undefined): [number, T][] | undefined;
function asStringOrNumberEntriesList<T>(val: unknown, stringKeys: true, mapFn: (u: unknown) => T | undefined): [string, T][] | undefined; 
function asStringOrNumberEntriesList<T>(val: unknown, stringKeys: boolean, mapFn: (u: unknown) => T | undefined): [number, T][] | [string, T][] | undefined {
    let arr = asArray(val);
    if (!arr) {
        // Objects may also be re-interpreted as maps
        const obj = asObject(val, false);
        if (obj) {
            arr = Object.entries(obj);
        }
    }

    if (!arr) return undefined;

    if (stringKeys) {
        const entries: [string, T][] = [];

        for (let i = 0; i < arr.length; i++) {
            const entry = asArray(arr[i]);

            // every map entry must be valid.
            if (!entry) return undefined;
            if (entry.length !== 2) return undefined;

            const val = mapFn(entry[1]);
            if (val === undefined) continue;

            const k = asString(entry[0]);
            if (k === undefined) return undefined;
            entries.push([k, val]);
        }

        return entries;
    } else {
        const entries: [number, T][] = [];

        for (let i = 0; i < arr.length; i++) {
            const entry = asArray(arr[i]);

            // every map entry must be valid.
            if (!entry) return undefined;
            if (entry.length !== 2) return undefined;

            const val = mapFn(entry[1]);
            if (val === undefined) continue;

            const k = asNumber(entry[0]);
            if (k === undefined) return undefined;
            entries.push([k, val]);
        }

        return entries;
    }
}

export function asStringSet(val: unknown): Set<string> | undefined {
    const arr = asArray(val);
    if (!arr) return undefined;
    
    for (let i = 0; i < arr.length; i++) {
        const val = asString(arr[i]);
        if (val === undefined) return undefined;
    }

    return new Set(arr as string[]);
}

export function asNumberSet(val: unknown): Set<number> | undefined {
    const arr = asArray(val);
    if (!arr) return undefined;
    
    for (let i = 0; i < arr.length; i++) {
        const val = asNumber(arr[i]);
        if (val === undefined) return undefined;
    }

    return new Set(arr as number[]);
}


type JSONRecord = Record<string, unknown>;

// NOTE: we don't expect to ever see `undefined` as a serialized value.
// This will never change.

export const NULLABLE = 1 << 0;


// If you set a value with `{@link setValue}`, this method will skip that value.
export function deserializeObjectKey<T extends JSONRecord, K extends string & keyof T>(
    dst: T,
    src: JSONRecord,
    key: string,
    flags = 0,
    rootName = ""
) {
    const recordValue = src[key]; 
    if (recordValue === undefined) {
        // can skip this field. Either it wasn't present in the serialized state therefore this app
        // could have never generated it in the first place, or we set it to undefined because we already got to it.
        return;
    }

    const defaultValue = dst[key];
    if (defaultValue == null) {
        throw new Error(`Error deserializing field ${rootName + "." + key}: Default value was ${defaultValue}, we can't infer how to deserialize it. Extra deserialization code required.`)
    }

    // const defaultType = typeof defaultValue;

    let result: unknown = undefined;

    if (recordValue == null) {
        if (flags & NULLABLE) {
            // nullable is something that a user must explicitly set. We don't want to allow null by default
            result = recordValue;
        } else {
            throw new Error(`Error deserializing field ${rootName + "." + key}: Didn't expect null here`)
        }
    } else if (defaultValue.constructor === Object) {
        const reinterpreted = asObject(recordValue);
        if (reinterpreted === undefined) {
            throw new Error(`Error deserializing field ${rootName + "." + key}: Expected a plain object here`)
        }

        // actual plain object, and not some other class/object thing. we can just recurse into it, actually
        deserializeObject(defaultValue as JSONRecord, reinterpreted, rootName + "." + key);
        result = defaultValue;
    } else {
        const isArray = Array.isArray(defaultValue) || Array.isArray(recordValue);
        const isMap = defaultValue instanceof Map;
        const isSet = defaultValue instanceof Set;

        if (isArray || isMap || isSet) {
            // We want to force the user to manually de-serialize container classes. We can't infer the contents of these
            // containers from the default value. Even if we could, we want them to use their actual constructor to create
            // these objects, such that the hidden class can be identical to the other objects.
            throw new Error(`Error deserializing field ${rootName + "." + key}: Got ${isArray ? "an array" : isMap ? "a map" : "a set"} here. We can't infer how to serialize it. Extra deserialization code required.`)
        } else if (defaultValue instanceof Date) {
            result = asDate(recordValue);
        } else if (defaultValue === true || defaultValue === false) {
            result = asBoolean(recordValue);
        } else if (typeof defaultValue === "number") {
            result = asNumber(recordValue);
        } else if (typeof defaultValue === "string") {
            result = asString(recordValue);
        }
    }

    if (result === undefined) {
        throw new Error(`Error deserializing field ${rootName + "." + key}: Couldn't successfully parse this value`)
    }

    dst[key as K] = result as T[K]; 
    src[key] = undefined;
}

export function deserializeObject<T extends JSONRecord>(dst: T, src: JSONRecord, rootName = "") {
    for (const k in dst) {
        deserializeObjectKey(dst, src, k, 0, rootName);
    }
}

/**
 * Grabs a value, clears it, then returns it.
 * You can set dryRun = true while you're working on it.
 */
export function extractKey<T>(src: JSONRecord, key: string & keyof T) {
    const val = src[key];
    src[key] = undefined; // don't 'deserialize' this again
    return val;
}

/**
 * Grabs a value, clears it, then returns it.
 * You can set dryRun = true while you're working on it.
 */
export function extractKeyDefined<T>(src: JSONRecord, key: string & keyof T) {
    const val = src[key];
    src[key] = undefined; // don't 'deserialize' this again
    if (val === undefined) {
        throw new Error("Expected " + key + " to be defined");
    }
    return val;
}

export function extractArray<T>(src: JSONRecord, key: string  & keyof T): JSONRecord | undefined {
    const val = extractKey(src, key);
    return asObject(val);
}



/**
 * Does more than you'd expect.
 * - Fields starting with _ are removed to save space - we assume they are 'computed' fields
 *  that are either derived from the other fields, or may be reset to a default value each time we reload the state
 * - Maps are converted to an array of entries
 * - Sets are converted to an array of keys
 * - Dates are converted to an iso-string
 *
 * Also, some things can't be serialized.
 */
export function serializeToJSON(val: Record<string, unknown>) {
    const serializable = getJSONSerializable(val);
    return JSON.stringify(serializable);
}


function getJSONSerializable(val: unknown): unknown {
    if (val === undefined) {
        // or rather, they shouldn't
        throw new Error("undefined values can't be serialized");
    }

    if (Array.isArray(val)) {
        return val.map(getJSONSerializable);
    }

    if (val instanceof Map) {
        const entries: [string | number, unknown][] = [];

        for (const [k, v] of val) {
            if (v === undefined) continue;
            if (asString(k) === undefined && asNumber(k) === undefined) {
                throw new Error("Only maps with string or number keys can be serialized");
            }

            entries.push([k, getJSONSerializable(v)]);
        }

        return entries;
    }

    if (val instanceof Set) {
        const entries: unknown[] = [];

        for (const v of val) {
        if (v === undefined) continue;
            entries.push(getJSONSerializable(v));
        }

        return entries;
    }

    if (val != null && val.constructor === Object) {
        const entries: [string, unknown][] = [];

        for (const [kU, v] of Object.entries(val)) {
            if (v === undefined) continue;

            if (!kU.startsWith("_")) {
                entries.push([kU, getJSONSerializable(v)]);
            }
        }

        return Object.fromEntries(entries);
    }

    return val;
}
