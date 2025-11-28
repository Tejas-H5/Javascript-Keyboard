// I've found a significant speedup by writing code like
// if (x === false ) instaed of if (!x). 
// You won't need to do this in 99.9999% of your code, but it 
// would be nice if the library did it.
export function assert(value: boolean): asserts value {
    // Funnily enough - writing it like this ends up being very slow with the dev tools open. 
    // I'm guessing the JIT can't inline methods with early returns when some debug=true setting has been set somewhere.
    // Even putting a breakpoint on this line slows the app to a crawl for persumably similar reasons.
    // if (value === true) return;
    // throw new Error("Assertion failed - " + message);

    if (value === false) {
        throw new Error("Assertion failed");
    }
}

export function mustGetDefined<T>(val: T | undefined, field = "this value"): T {
    if (val === undefined) throw new Error(`Expected ${field} to not be undefined`);
    return val;
}

export function unreachable(val?: never, message = "This code should be unreachable"): never {
    throw new Error(message);
}
