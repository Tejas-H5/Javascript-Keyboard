//  - drops all properties with '_' from every object
// NOTE: the state shouldn't be cyclic. do not attempt to make this resistant to cycles,
// it is _supposed_ to throw that too much recursion exception
export function recursiveShallowCopyRemovingComputedFields(obj: any): any {
    if (Array.isArray(obj)) {
        return obj.map((x) => recursiveShallowCopyRemovingComputedFields(x));
    }

    if (typeof obj === "object" && obj !== null) {
        const clone = {};
        for (const key in obj) {
            if (key[0] === "_") {
                continue;
            }

            // @ts-ignore
            clone[key] = recursiveShallowCopyRemovingComputedFields(obj[key]);
        }
        return clone;
    }

    return obj;
}
