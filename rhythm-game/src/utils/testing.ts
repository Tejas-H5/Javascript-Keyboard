import { assert } from "./assert";

export type TestSuite<T> = {
    name: string;
    ctxFn: () => T;
    tests: Test<T>[];
};

export type Test<T> = {
    code: (test: Test<T>, ctx: T) => void | Promise<void>;
    name: string;
    status: TestStatus;
    suite?: TestSuite<T>;

    error: any;
    results: TestRequirementResult[];
    passed: boolean;
};

export type TestRequirementResult = {
    title: string;
    expectations: {
        ok: boolean;
        message: string;
    }[];
};


export const TEST_STATUS_NOT_RAN = 0;
export const TEST_STATUS_RUNNING = 1;
export const TEST_STATUS_RAN = 2;

export type TestStatus = 
    typeof TEST_STATUS_NOT_RAN |
    typeof TEST_STATUS_RUNNING |
    typeof TEST_STATUS_RAN;

export function testSuite<T>(name: string, ctxFn: () => T, tests: Test<T>[]): TestSuite<T> {
    const suite: TestSuite<T> = {
        name,
        ctxFn,
        tests
    };

    for (const test of tests) {
        assert(!test.suite);
        test.suite = suite;
    }

    return suite;
}

export function newTest<T>(name: string, code: (test: Test<T>, ctx: T) => void): Test<T> {
    return {
        name,
        code,
        status: TEST_STATUS_NOT_RAN,
        error: null,
        results: [],
        passed: false,
    };
}

export function runTest<T>(test: Test<T>, debug = false) {
    assert(!!test.suite);

    if (test.status === TEST_STATUS_RUNNING) {
        // TODO: terminate this test, and rerun it. I don't know how to terminate a test that has a while (true) {} in it though.
        console.warn("This test is already running");
        return;
    }

    let isPromise = false;
    test.status = TEST_STATUS_RUNNING;
    test.error = null;
    test.results.length = 0;
    test.passed = false;

    try {
        const ctx = test.suite.ctxFn();

        if (debug) {
            debugger;
        }

        // Step into this function call to debug your test
        const res = test.code(test, ctx);

        if (res instanceof Promise) {
            isPromise = true;
            res.catch(e => test.error = e)
               .finally(() => test.status = TEST_STATUS_RAN);
        }
    } catch (e) {
        if (!isPromise) {
            test.error = e;
        } else {
            throw e;
        }
    } finally {
        if (!isPromise) {
            test.status = TEST_STATUS_RAN;
        }

        if (test.results.length === 0) {
            test.passed = false;
        } else {
            test.passed = true;
            for (const req of test.results) {
                for (const ex of req.expectations) {
                    if (!ex.ok) {
                        test.passed = false;
                        break;
                    }
                }
            }
        }
    }
}

export function expectEqual<T>(
    test: Test<any>,
    requirement: string,
    a: T,
    b: T,
    opts?: DeepEqualsOptions
) {
    // expectEqual(blah, value, === expected) is what we're thinking when we are writing this method.
    // but deepEqual's argument order were decided in terms of the output message, `expected a, but got b`.
    // That is the opposite. Let's just flip them here
    const result = deepEquals(b, a, opts);

    if (result.mismatches.length === 0) {
        addResult(test, requirement, `All deep-equality checks passed`, true);
    } else {
        if (result.numMatches > 0) {
            addResult(test, requirement, `${result.numMatches} deep-equality checks passed, but...`, true);
        }
        for (const m of result.mismatches) {
            const resultMessage = `${m.path} - Expected ${m.expected}, got ${m.got}`;
            addResult(test, requirement, resultMessage, false);
        }
    }
}

export function powerSetTests<T>(firstTests: Test<T>[], secondTests: Test<T>[]): Test<T>[] {
    const powerSet: Test<T>[] = [];

    for (const tj of secondTests) {
        for (const ti of firstTests) {
            powerSet.push(newTest(`(${ti.name}) x (${tj.name})`, (test, ctx) => {
                ti.code(test, ctx);
                tj.code(test, ctx);
            }));
        }
    }

    return powerSet;
}

export function forEachRange(n: number, len: number, fn: (pos: number, len: number) => void) {
    assert(len <= n);
    for (let l = 1; l <= len; l++) {
        for (let i = 0; i < n - l + 1; i++) {
            fn(i, l);
        }
    }
}

type DeepEqualsResult = {
    currentPath: string[];
    mismatches: DeepEqualsMismatch[];
    numMatches: number;
};

type DeepEqualsMismatch = {
    path:     string;
    expected: unknown;
    got:      unknown;
};

type DeepEqualsOptions = {
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

// Also used for type narrowing
export function expectNotNull<T>(
    test: Test<unknown>, 
    val: T | null | undefined,
    requirement: string,
    name: string = "Result"
): asserts val is T {
    const valIsNotNull = val != null;
    if (!valIsNotNull) {
        addResult(test, requirement, name + " was unexpectedly " + val, false);
    } else {
        addResult(test, requirement, name + " was null" + val, true);
    }
}

function addResult(
    test: Test<unknown>,
    requirement: string,
    message: string,
    ok: boolean
) {
    let result = test.results.find(r => r.title === requirement);
    if (!result) {
        result = { title: requirement, expectations: [] };
        test.results.push(result);
    }

    result.expectations.push({
        message,
        ok
    });
}
