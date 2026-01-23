import { imButton, imButtonIsClicked } from "src/components/button";
import { BLOCK, COL, imAlign, imBg, imFixed, imGap, imLayoutBegin, imLayoutEnd, imNoWrap, imPadding, imPre, imSize, NA, PERCENT, PX, ROW } from "src/components/core/layout";
import { cssVars } from "src/components/core/stylesheets";
import { imScrollContainerBegin, imScrollContainerEnd, newScrollContainer } from "src/components/scroll-container";
import { resizeObjectPool } from "src/utils/array-utils";
import { assert } from "src/utils/assert";
import { imBlockBegin, imBlockEnd, ImCache, imFor, imForEnd, imIf, imIfElse, imIfEnd, imMemo, imState, imTry, imTryCatch, imTryEnd, isFirstishRender } from "src/utils/im-core";
import { EL_H3, EL_H4, elHasMousePress, elSetStyle, imElBegin, imElEnd, imStr, Stringifyable } from "src/utils/im-dom";
import { getAllTests, runTest, Test, TestingHarness, TestResult } from "src/utils/testing";
import { imLine, LINE_HORIZONTAL } from "./im-line";

function imCode(c: ImCache) {
    if (isFirstishRender(c)) {
        elSetStyle(c, "fontFamily", "monospace");
        elSetStyle(c, "backgroundColor", cssVars.bg2);
    }
}

type TestUi = {
    result: TestResult | null;
    viewingExpectations: boolean;
};

function newTestUiState(): TestUi {
    return {
        result: null,
        viewingExpectations: false,
    };
}

type TestHarnessUiState = {
    testUi: TestUi[];
    runAllStaggered: {
        running: boolean;
        idx: number;
    },
    harness: TestingHarness,
};

function newTestHarnessState(): TestHarnessUiState {
    return {
        testUi: [],
        runAllStaggered: {
            running: false,
            idx: 0,
        },
        harness: new TestingHarness(),
    };
}

function runTestHarnessTest(s: TestHarnessUiState, test: Test, testUi: TestUi) {
    testUi.result = runTest(s.harness, test.fn);
    testUi.viewingExpectations = false;
}


export function imTestHarness(c: ImCache) {
    const s = imState(c, newTestHarnessState);

    const tests = getAllTests();
    if (imMemo(c, tests.length)) {
        resizeObjectPool(s.testUi, newTestUiState, tests.length);
        runAll(s, tests);
    }

    const tryState = imTry(c); try {
        if (imIf(c) && !tryState.err) {
            if (s.runAllStaggered.running) {
                if (s.runAllStaggered.idx >= tests.length) {
                    s.runAllStaggered.running = false;
                } else {
                    // Running tests one by one makes it easier to spot which test is causing an infinite loop.
                    const test = tests[s.runAllStaggered.idx];
                    const testUi = s.testUi[s.runAllStaggered.idx];
                    s.runAllStaggered.idx++;
                    runTestHarnessTest(s, test, testUi);
                }
            }

            const sc = imState(c, newScrollContainer);
            imScrollContainerBegin(c, sc); {
                imLayoutBegin(c, BLOCK); imBg(c, cssVars.bg); {
                    imLayoutBegin(c, ROW); imGap(c, 5, PX); imAlign(c); {
                        imLayoutBegin(c, BLOCK); imSize(c, 0, PX, 0, NA); imLayoutEnd(c);

                        imElBegin(c, EL_H3); imStr(c, "Tests"); imElEnd(c, EL_H3);

                        if (imButtonIsClicked(c, "Run failed")) {
                            assert(false) // TODO: IMPLEMENT
                        }

                        // Identical to 'Run all', but completes slower, and is more error prone. It does look cooler tho
                        if (imButtonIsClicked(c, "Run all staggered")) {
                            s.runAllStaggered.running = true;
                            s.runAllStaggered.idx = 0;
                        }

                        if (imButtonIsClicked(c, "Run all")) {
                            runAll(s, tests);
                        }
                    } imLayoutEnd(c);

                    imFor(c); for (let testIdx = 0; testIdx < tests.length; testIdx++) {
                        const test = tests[testIdx]; assert(!!test);
                        const testUi = s.testUi[testIdx]; assert(!!testUi);

                        imLayoutBegin(c, COL); imGap(c, 10, PX); {
                            imLayoutBegin(c, ROW); imGap(c, 5, PX); imAlign(c); {
                                imLayoutBegin(c, BLOCK); imSize(c, 0, PX, 0, NA); imLayoutEnd(c);

                                imElBegin(c, EL_H4); imStr(c, test.name); imElEnd(c, EL_H4);

                                imLayoutBegin(c, BLOCK); imSize(c, 0, NA, 100, PERCENT); imPadding(c, 10, PX, 10, PX, 10, PX, 10, PX); imCode(c); {
                                    let bg = "";
                                    let text: Stringifyable = "";
                                    let textCol = "";

                                    if (s.runAllStaggered.running && testIdx > s.runAllStaggered.idx) {
                                        text = "Queued";
                                    } else if (s.runAllStaggered.running && s.runAllStaggered.idx === testIdx) {
                                        text = "Running";
                                    } else if (testUi.result === null) {
                                        text = "Not ran";
                                    } else {
                                        let passed = testUi.result.passed;

                                        if (passed) {
                                            text = "PASSED";
                                            bg = "#00FF00";
                                            textCol = "#000000";
                                        } else {
                                            text = "FAILED";
                                            bg = "#FF0000";
                                            textCol = "#FFFFFF";
                                        }
                                    }

                                    if (imMemo(c, bg)) {
                                        elSetStyle(c, "backgroundColor", bg);
                                    }

                                    if (imMemo(c, textCol)) {
                                        elSetStyle(c, "color", textCol);
                                    }

                                    imStr(c, text);
                                } imLayoutEnd(c);

                                if (imIf(c) && testUi.result) {
                                    const text = `forks=${testUi.result.expectationsPerFork.length}, expectations=${testUi.result.totalExpectations}`;
                                    if (imButtonIsClicked(c, text, testUi.viewingExpectations)) {
                                        testUi.viewingExpectations = !testUi.viewingExpectations;
                                    }
                                } imIfEnd(c);

                                if (imButtonIsClicked(c, "Rerun")) {
                                    runTestHarnessTest(s, test, testUi);
                                }
                            } imLayoutEnd(c);
                            imLayoutBegin(c, COL); imPadding(c, 0, NA, 0, NA, 0, NA, 10, PX); imGap(c, 5, PX); {
                                if (imIf(c) && testUi.result && testUi.result.expectationsPerFork.length > 0) {
                                    imFor(c); for (const expectations of testUi.result.expectationsPerFork) {
                                        const anyFailed = expectations.some(ex => ex.failure);
                                        if (imIf(c) && anyFailed || testUi.viewingExpectations) {
                                            imLine(c, LINE_HORIZONTAL);
                                        } imIfEnd(c);

                                        imFor(c); for (const ex of expectations) {
                                            if (imIf(c) && (ex.failure || testUi.viewingExpectations)) {
                                                imLayoutBegin(c, ROW); {
                                                    imLayoutBegin(c, BLOCK); imPre(c); {
                                                        imStr(c, ex.desc);
                                                    } imLayoutEnd(c);

                                                    imLayoutBegin(c, BLOCK); imSize(c, 20, PX, 0, NA); imLayoutEnd(c);

                                                    imLayoutBegin(c, BLOCK); imGap(c, 10, PX); {
                                                        let first = true;
                                                        imFor(c); ex.failure?.permutation.forEach(f => {
                                                            imLayoutBegin(c, BLOCK); imNoWrap(c); {
                                                                if (imIf(c) && !first) {
                                                                    imStr(c, " -> ");
                                                                } imIfEnd(c);
                                                                first = false;

                                                                imStr(c, f.name);
                                                                imStr(c, ": ");
                                                                imStr(c, f.value ? "true" : "false");
                                                            } imLayoutEnd(c);
                                                        }); imForEnd(c);
                                                    } imLayoutEnd(c);
                                                } imLayoutEnd(c);
                                            } imIfEnd(c);
                                        } imForEnd(c);
                                    } imForEnd(c);
                                } else if (imIfElse(c) && testUi.result && testUi.result.expectationsPerFork.length === 0) {
                                    imLayoutBegin(c, BLOCK); imCode(c); imPre(c); {
                                        imStr(c, "Test had no expectations");
                                    } imLayoutEnd(c);
                                } else if (imIfElse(c) && !testUi.result) {
                                    imStr(c, "Test not ran");
                                } imIfEnd(c);
                            } imLayoutEnd(c);
                        } imLayoutEnd(c);
                    } imForEnd(c);
                } imLayoutEnd(c);
            } imScrollContainerEnd(c);
        } else {
            imIfElse(c);

            imLayoutBegin(c, BLOCK); imCode(c); {
                imStr(c, tryState.err);
            } imLayoutEnd(c);

            if (imButtonIsClicked(c, "OK")) {
                if (elHasMousePress(c)) {
                    tryState.recover();
                }
            }
        } imIfEnd(c);
    } catch (e) {
        imTryCatch(c, tryState, e);
        console.error("An error occured while rendering: ", e);
    } imTryEnd(c, tryState);
}

function runAll(s: TestHarnessUiState, tests: Test[]) {
    for (let testIdx = 0; testIdx < tests.length; testIdx++) {
        const test = tests[testIdx]; assert(!!test);
        const testUi = s.testUi[testIdx]; assert(!!testUi);
        runTestHarnessTest(s, test, testUi);
    }
}
