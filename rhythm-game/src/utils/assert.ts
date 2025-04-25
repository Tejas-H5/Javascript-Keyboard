/**
 * Assertions are used to catch bugs.
 * Making this a no-op will sometimes improve performance. But I am not sure you want to do that just yet. 
 * Wait for me to add a comprehensive suite of tests for this framework before you do that.
 *
 * Every assertion should have a comment above it explaining why it's there, to make
 * debugging for users easier. It also means the final minimized code without comments doesn't have
 * a bunch of long error strings in there increasing it's size, and that
 * you only need to put a breakpoint here to respond to the vast majority of failures.
 */
export function assert(value: unknown): asserts value {
    if (!value) {
        throw new Error("Assertion failed");
    }
}

export function typeGuard(s: never) {
    assert(false);
}
