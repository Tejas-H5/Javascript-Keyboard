export function assert(value: boolean): asserts value {
    if (value === false) {
        throw new Error("Assertion failed");
    }
}

