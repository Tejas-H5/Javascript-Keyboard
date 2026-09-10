import { imButtonIsClicked } from "components/button";
import { imui, BLOCK, ROW, COL, PX, NA, cssVars, PERCENT } from "imcf/im-ui";

import { imScrollContainerBegin, imScrollContainerEnd, newScrollContainer } from "components/scroll-container";
import { resizeObjectPool } from "utils/array-utils";
import { assert } from "utils/assert";
import { el, im, ImCache, imdom, Stringifyable } from "imcf";

import { getAllTests, runTest, Test, TestingHarness, TestResult } from "utils/testing";
import { imLine, LINE_HORIZONTAL } from "./im-line";

function imCode(c: ImCache) {
    if (im.IsFirstRender(c)) {
        imdom.setStyle(c, "fontFamily", "monospace");
        imdom.setStyle(c, "backgroundColor", cssVars.bg2);
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
    const s = im.State(c, newTestHarnessState);

    const tests = getAllTests();
    if (im.Memo(c, tests.length)) {
        resizeObjectPool(s.testUi, newTestUiState, tests.length);
        runAll(s, tests);
    }

    const tryState = im.Try(c); try {
        if (im.If(c) && !tryState.err) {
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

            const sc = im.State(c, newScrollContainer);
            imScrollContainerBegin(c, sc); {
                imui.Begin(c, BLOCK); imui.Bg(c, cssVars.bg); {
                    imui.Begin(c, ROW); imui.Gap(c, 5, PX); imui.Align(c); {
                        imui.Begin(c, BLOCK); imui.Size(c, 0, PX, 0, NA); imui.End(c);

                        imdom.ElBegin(c, el.H3); imdom.Str(c, "Tests"); imdom.ElEnd(c, el.H3);

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
                    } imui.End(c);

                    im.For(c); for (let testIdx = 0; testIdx < tests.length; testIdx++) {
                        const test = tests[testIdx]; assert(!!test);
                        const testUi = s.testUi[testIdx]; assert(!!testUi);

                        imui.Begin(c, COL); imui.Gap(c, 10, PX); {
                            imui.Begin(c, ROW); imui.Gap(c, 5, PX); imui.Align(c); {
                                imui.Begin(c, BLOCK); imui.Size(c, 0, PX, 0, NA); imui.End(c);

                                imdom.ElBegin(c, el.H4); imdom.Str(c, test.name); imdom.ElEnd(c, el.H4);

                                imui.Begin(c, BLOCK); imui.Size(c, 0, NA, 100, PERCENT); imui.Padding(c, 10, PX, 10, PX, 10, PX, 10, PX); imCode(c); {
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

                                    if (im.Memo(c, bg)) {
                                        imdom.setStyle(c, "backgroundColor", bg);
                                    }

                                    if (im.Memo(c, textCol)) {
                                        imdom.setStyle(c, "color", textCol);
                                    }

                                    imdom.Str(c, text);
                                } imui.End(c);

                                if (im.If(c) && testUi.result) {
                                    const text = `forks=${testUi.result.expectationsPerFork.length}, expectations=${testUi.result.totalExpectations}`;
                                    if (imButtonIsClicked(c, text, testUi.viewingExpectations)) {
                                        testUi.viewingExpectations = !testUi.viewingExpectations;
                                    }
                                } im.IfEnd(c);

                                if (imButtonIsClicked(c, "Rerun")) {
                                    runTestHarnessTest(s, test, testUi);
                                }
                            } imui.End(c);
                            imui.Begin(c, COL); imui.Padding(c, 0, NA, 0, NA, 0, NA, 10, PX); imui.Gap(c, 5, PX); {
                                if (im.If(c) && testUi.result && testUi.result.expectationsPerFork.length > 0) {
                                    im.For(c); for (const expectations of testUi.result.expectationsPerFork) {
                                        const anyFailed = expectations.some(ex => ex.failure);
                                        if (im.If(c) && anyFailed || testUi.viewingExpectations) {
                                            imLine(c, LINE_HORIZONTAL);
                                        } im.IfEnd(c);

                                        im.For(c); for (const ex of expectations) {
                                            if (im.If(c) && (ex.failure || testUi.viewingExpectations)) {
                                                imui.Begin(c, ROW); {
                                                    imui.Begin(c, BLOCK); imui.Pre(c); {
                                                        imdom.Str(c, ex.desc);
                                                    } imui.End(c);

                                                    imui.Begin(c, BLOCK); imui.Size(c, 20, PX, 0, NA); imui.End(c);

                                                    imui.Begin(c, BLOCK); imui.Gap(c, 10, PX); {
                                                        let first = true;
                                                        im.For(c); ex.failure?.permutation.forEach(f => {
                                                            imui.Begin(c, BLOCK); imui.NoWrap(c); {
                                                                if (im.If(c) && !first) {
                                                                    imdom.Str(c, " -> ");
                                                                } im.IfEnd(c);
                                                                first = false;

                                                                imdom.Str(c, f.name);
                                                                imdom.Str(c, ": ");
                                                                imdom.Str(c, f.value ? "true" : "false");
                                                            } imui.End(c);
                                                        }); im.ForEnd(c);
                                                    } imui.End(c);
                                                } imui.End(c);
                                            } im.IfEnd(c);
                                        } im.ForEnd(c);
                                    } im.ForEnd(c);
                                } else if (im.IfElse(c) && testUi.result && testUi.result.expectationsPerFork.length === 0) {
                                    imui.Begin(c, BLOCK); imCode(c); imui.Pre(c); {
                                        imdom.Str(c, "Test had no expectations");
                                    } imui.End(c);
                                } else if (im.IfElse(c) && !testUi.result) {
                                    imdom.Str(c, "Test not ran");
                                } im.IfEnd(c);
                            } imui.End(c);
                        } imui.End(c);
                    } im.ForEnd(c);
                } imui.End(c);
            } imScrollContainerEnd(c);
        } else {
            im.IfElse(c);

            imui.Begin(c, BLOCK); imCode(c); {
                imdom.Str(c, tryState.err);
            } imui.End(c);

            if (imButtonIsClicked(c, "OK")) {
                if (imdom.hasMousePress(c)) {
                    tryState.recover();
                }
            }
        } im.IfEnd(c);
    } catch (e) {
        im.Catch(c, tryState, e);
        console.error("An error occured while rendering: ", e);
    } im.TryEnd(c, tryState);
}

function runAll(s: TestHarnessUiState, tests: Test[]) {
    for (let testIdx = 0; testIdx < tests.length; testIdx++) {
        const test = tests[testIdx]; assert(!!test);
        const testUi = s.testUi[testIdx]; assert(!!testUi);
        runTestHarnessTest(s, test, testUi);
    }
}
