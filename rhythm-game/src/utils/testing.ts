import { assert } from "./assert";

export type Fork = {
    name: string;
    value: boolean;
};

export type TestFn = (t: TestingHarness) => void;

export type Test = {
    name: string;
    fn: TestFn;
};

export type TestExpectation = {
    desc: string;
    failure?: null | {
        permutation: Fork[];
    };
};

export type TestResult = {
    expectationsPerFork: TestExpectation[][];
    passed: boolean;
    totalExpectations: number;
};

export function newTestResult(): TestResult {
    return {
        expectationsPerFork: [],
        passed: false,
        totalExpectations: 0,
    };
}

const tests: Test[] = [];

export function test(name: string, test: TestFn) {
    tests.push({
        name, 
        fn: test,
    });
}

export function getAllTests() {
    return tests;
}

export class TestingHarness {
    forksStack: Fork[] = [];
    currentFork = -1;
    result = newTestResult();
}

export function runTestWrapped(t: TestingHarness, test: TestFn) {
    t.result.expectationsPerFork.push([]);

    try {
        t.currentFork = -1;

        test(t);
    } catch(e) {
        if (e instanceof TestHarnessError) {
        } else {
            try {
                expect(t, "Expected test to not throw: " + e, false);
            } catch {
            }
        }
    }
}

export function runTest(t: TestingHarness, test: TestFn): TestResult {
    t.result = newTestResult();
    t.forksStack.length = 0;
    t.result.passed = true;

    runTestWrapped(t, test);

    // Keep rerunning the test till we've exhausted every fork.
    // while forks:
    //      if forks is like [... some permutation ... true]:
    //          we should try [... some permutation ... false];
    //          Assuming the test is deterministic, the exact same codepath should run in subsequent runs, 
    //          but the final call to fork() will be false.
    //          This may uncover more fork() calls. eventually, one of those calls will not generate any further calls to fork().
    //          This will be false. But there may have been several other `false` items in the path beforehand. We can remove those,
    //          and set the top of the stack to `false` and try again.

    while (t.forksStack.length > 0) {
        while (t.forksStack.length > 0) {
            const lastFork = t.forksStack[t.forksStack.length - 1];
            if (lastFork.value === false) {
                t.forksStack.pop();
            } else {
                break;
            }
        }

        if (t.forksStack.length > 0) {
            const lastFork = t.forksStack[t.forksStack.length - 1];
            assert(lastFork.value === true);
            lastFork.value = false;

            runTestWrapped(t, test);
        }
    }

    return t.result;
}

/**
 * This method is the main reason why I bothered rewriting this test framework. 
 * It allows a single test function to specify a 'branching point' or a 'fork in the path' within a test, 
 * effectively signalling to the test runner that the same test method should be reran, once with 
 * the call to fork returning true, and again where it returns false.
 *
 * It allows a single test to fork into several different tests, which has several benefits:
 * - More tests and scenarios can be tested with less code
 * - More tests that reuse the same data or test edge-cases with various scenarios, that were 
 *      previously painful to add, can now be easily tested.
 * - The same testing data, as well as outecomes from previous tests, can be reused far more easily.
 *      It becomes far easier to understand new testing pathways, since you can just build it
 *      on top of the understanding of previous testsing pathways.
 *
 * For normal `expect fn(input) == output` style tests, it isn't as useful, but it 
 * is VERY useful for testing anything that holds state and can do different things based
 * on a sequence of method calls (this is quite a lot of things).
 *
 * This structure also doesn't require that the 'testing state' is serializeable - since the 
 * method is being reran from the top-down for every fork, the testing state just gets recreated.
 *
 * ```ts
 * registerTest(t => {
 *      const { blah } = setupTheTest();
 *      
 *      if (t.fork("Initial state")) {
 *          t.expect("calling foo should work", blah.foo());
 *          t.expect("Calling bar should return 0", blah.bar() === 0);
 *          return;
 *      }
 *
 *      blah.lock();
 *
 *      if (t.fork("Locking twice")) {
 *          blah.lock();
 *          // We want to run ever single after this twice - once where we only locked once, and once where we locked twice
 *      }
 *
 *      t.expect("calling foo not work if locked", !blah.foo());
 *      t.expectThrows("Calling bar", () => blah.bar());
 *
 *      blah.unlock();
 *
 *      t.expect("calling foo to work if unlocked", blah.foo());
 *      t.expectThrows("Calling bar works after unlocked", blah.bar() === 0);
 *
 * });
 * ```
 */
export function fork(t: TestingHarness, scenario: string): boolean {
    t.currentFork += 1;
    assert(t.currentFork <= t.forksStack.length);

    if (t.currentFork === t.forksStack.length) {
        t.forksStack.push({ name: scenario, value: true });
    }

    return t.forksStack[t.currentFork].value;
}

// Also used for type narrowing
export function expectNotNullish<T>(t: TestingHarness, val: T | null | undefined): asserts val is T {
    expect(t, "Value should not be null or undefined", val != null);
}

export function expectEqual<T>(t: TestingHarness, expectation: string, a: T, b: T, opts?: DeepEqualsOptions) {
    // expectEqual(blah, value, === expected) is what we're thinking when we are writing this method.
    // but deepEqual's argument order were decided in terms of the output message, `expected a, but got b`.
    // That is the opposite. Let's just flip them here
    const result = deepEquals(b, a, opts);
    if (result.mismatches.length > 0) {
        expect(
            t,
            expectation + " - objects to be deep equal:\n\n" +
            result.mismatches.map(m => `${m.path} - expected ${JSON.stringify(m.expected)}, got ${JSON.stringify(m.got)}\n`).join(""),
            false,
        );
    } else {
        expect(t, expectation + " - objects to be deep === equal (and they were)", true);
    }
}


// NOTE: I would have preferred t.expect, but then I can't have `test(t =>` and must have `test((t: TestingHarness) => ` instead
// due to some typescript thing.
export function expect(
    t: TestingHarness,
    expectation: string,
    result: boolean
): asserts result {
    const ex: TestExpectation = {
        desc: expectation,
    };
    assert(t.result.expectationsPerFork.length > 0);
    const expectations = t.result.expectationsPerFork[t.result.expectationsPerFork.length - 1];
    expectations.push(ex);

    t.result.totalExpectations += 1;

    if (result === false) {
        t.result.passed = false;
        ex.failure = {
            permutation: t.forksStack.map(f => ({ ...f })),
        };
        ex.desc = "Expectation not met - " + ex.desc;
        throw new TestHarnessError(ex.desc);
    }
}

export function tryFn(fn: () => void) {
    let err: unknown | null;
    try {
        fn();
    } catch (e) {
        err = e;
    }
    return err;
}


class TestHarnessError extends Error {
    constructor(message: string) {
        super(message);
    }
}


export type DeepEqualsResult = {
    currentPath: string[];
    mismatches: DeepEqualsMismatch[];
    numMatches: number;
};

export type DeepEqualsMismatch = {
    path:     string;
    expected: unknown;
    got:      unknown;
};

export type DeepEqualsOptions = {
    failFast?: boolean;
    floatingPointTolerance?: number;
};

export function deepEquals<T>(
    a: T,
    b: T,
    opts: DeepEqualsOptions = {},
): DeepEqualsResult {
    const result: DeepEqualsResult = { currentPath: [], mismatches: [], numMatches: 0 };

    deepEqualsInternal(result, a, b, opts, "root");

    return result;
}

function pushDeepEqualsMismatch(
    result: DeepEqualsResult,
    expected: unknown,
    got: unknown,
) {
    const path = result.currentPath.join("");
    result.mismatches.push({ path, expected, got });
}

// TODO: print all the inequalitieis
function deepEqualsInternal<T>(
    result: DeepEqualsResult,
    a: T,
    b: T,
    opts: DeepEqualsOptions,
    pathKey: string,
): boolean {
    let primitiveMatched = false;
    if (a === b) {
        primitiveMatched = true;
    } else if (typeof a === "number" && typeof b === "number") {
        if (isNaN(a) && isNaN(b)) {
            primitiveMatched = true;
        } else {
            const tolerance = opts.floatingPointTolerance ?? 0;
            if (Math.abs(a - b) < tolerance) {
                primitiveMatched = true;
            }
        }
    }

    if (primitiveMatched) {
        result.numMatches++;
        return true;
    }

    result.currentPath.push(pathKey);

    if (
        (typeof a !== "object" || typeof b !== "object") ||
        (a === null || b === null)
    ) {
        // Strict-equals would have worked if these were the case.
        pushDeepEqualsMismatch(result, a, b);
        result.currentPath.pop();
        return false;
    }

    let popPath = false;
    let matched = true;

    if (Array.isArray(a)) {
        matched = false;
        if (Array.isArray(b)) {
            matched = true;
            for (let i = 0; i < a.length; i++) {
                if (!deepEqualsInternal(result, a[i], b[i], opts, "[" + i + "]")) {
                    matched = false;
                    if (opts.failFast) break;
                }
            }
        }
    } else if (a instanceof Set) {
        matched = false;
        if (b instanceof Set && b.size === a.size) {
            matched = true;
            for (const val of a) {
                if (!b.has(val)) {
                    matched = false;
                    break;
                }
            }
        }
    } else if (a instanceof Map) {
        matched = false;
        if (b instanceof Map && a.size === b.size) {
            matched = true;

            for (const [k, aVal] of a) {
                if (b.has(k)) {
                    const bVal = b.get(k);
                    if (!deepEqualsInternal(result, aVal, bVal, opts, ".get(" + k + ")")) {
                        matched = false;
                        if (opts.failFast) break;
                    }
                }
            }
        }
    } else {
        // a is just an object
        for (const k in a) {
            if (!(k in b)) {
                matched = false;
                if (opts.failFast) break;
            }

            if (!deepEqualsInternal(result, a[k], b[k], opts, "." + k)) {
                matched = false;
                if (opts.failFast) break;
            }
        }
    }

    result.currentPath.pop();
    return matched;
}

function deepCompareArraysAnyOrder<T>(a: T[], b: T[]) {
    for (let i = 0; i < b.length; i++) {
        let anyEqual = false;
        for (let j = 0; j < b.length; j++) {
            if (deepEquals(a[i], b[j])) {
                anyEqual = true;
                break;
            }
        }
        if (!anyEqual) return false;
    }
    return true;
}
