import {
    imButton,
    imButtonIsClicked
} from "src/components/button";
import {
    BLOCK,
    COL,
    imAlign,
    imBg,
    imFg,
    imFixed,
    imGap,
    imLayout,
    imLayoutEnd,
    imPadding,
    imPre,
    imSize,
    NA,
    PERCENT,
    PX,
    ROW
} from "src/components/core/layout";
import {
    imScrollContainerBegin,
    imScrollContainerEnd,
    newScrollContainer
} from "src/components/scroll-container";
import {
    cssVars
} from "src/components/core/stylesheets";
import {
    ImCache,
    imFor,
    imForEnd,
    imIf,
    imIfElse,
    imIfEnd,
    imMemo,
    imState,
    imTry,
    imTryCatch,
    imTryEnd,
    isFirstishRender
} from "src/utils/im-core";
import {
    EL_H3,
    elHasMousePress,
    elSetStyle,
    imEl,
    imElEnd,
    imStr,
    Stringifyable
} from "src/utils/im-dom";
import {
    runTest,
    Test,
    TEST_STATUS_NOT_RAN,
    TEST_STATUS_RAN,
    TEST_STATUS_RUNNING,
    TestSuite,
} from "src/utils/testing";
import { imGameplay } from "src/views/gameplay";

function imCode(c: ImCache) {
    if (isFirstishRender(c)) {
        elSetStyle(c, "fontFamily", "monospace");
        elSetStyle(c, "backgroundColor", cssVars.bg2);
    }
}

function newTestHarnessState(): {
    suites: TestSuite<unknown>[];
    tests: Test<unknown>[];
    runAllStaggered: {
        running: boolean;
        idx: number;
    }
} {
    return {
        suites: [],
        tests: [],
        runAllStaggered: {
            running: false,
            idx: 0,
        }
    };
}

export function imTestHarness(
    c: ImCache,
    testSuites: TestSuite<any>[],
) {
    const s = imState(c, newTestHarnessState);

    const tryState = imTry(c); try {
        if  (imMemo(c, testSuites)) {
            s.suites = testSuites;
            s.tests = s.suites.flatMap(s => s.tests);
            for (const suite of s.suites) {
                for (const test of suite.tests) {
                    if (test.status === TEST_STATUS_NOT_RAN) {
                        runTest(test);
                    }
                }
            }
        }

        if (imIf(c) && !tryState.err) {
            if (s.runAllStaggered.running) {
                if (s.runAllStaggered.idx >= s.tests.length) {
                    s.runAllStaggered.running = false;
                } else {
                    // Running tests one by one makes it easier to spot which test is causing an infinite loop.
                    const test = s.tests[s.runAllStaggered.idx];
                    s.runAllStaggered.idx++;
                    runTest(test);
                }
            }

            imLayout(c, BLOCK); imBg(c, cssVars.bg); 
            imFixed(c, 0, PX, 0, PX, 0, PX, 0, PX); {
                imLayout(c, ROW); imGap(c, 5, PX); {
                    imEl(c, EL_H3); imStr(c, "Tests"); imElEnd(c, EL_H3);

                    if (imButtonIsClicked(c, "Run failed")) {
                        for (const test of s.tests) {
                            if (test.error !== null) runTest(test);
                        }
                    }

                    if (imButtonIsClicked(c, "Run all staggered")) {
                        s.runAllStaggered.running = true;
                        s.runAllStaggered.idx = 0;
                    }

                    if (imButtonIsClicked(c, "Run all")) {
                        for (const test of s.tests) {
                            runTest(test);
                        }
                    }
                } imLayoutEnd(c);


                const sc = imState(c, newScrollContainer);
                imScrollContainerBegin(c, sc); {
                    imFor(c); for (const suite of s.suites) {
                        const tests = suite.tests;

                        imEl(c, EL_H3); imStr(c, suite.name); imElEnd(c, EL_H3); 

                        imLayout(c, COL); imGap(c, 10, PX);  {
                            imFor(c); for (let i = 0; i < tests.length; i++) {
                                const test = tests[i];

                                imLayout(c, COL);  {
                                    imLayout(c, ROW);  imGap(c, 5, PX); imAlign(c); {
                                        imLayout(c, BLOCK); imSize(c, 0, NA, 100, PERCENT); imPadding(c, 10, PX, 10, PX, 10, PX, 10, PX); imCode(c); {
                                            let bg = "";
                                            let text: Stringifyable = "";
                                            let textCol = "";

                                            if (s.runAllStaggered.running && i > s.runAllStaggered.idx) {
                                                text = "Queued";
                                            } else if (s.runAllStaggered.running && s.runAllStaggered.idx === i) {
                                                text = "Runnin";
                                            } else if (test.status !== TEST_STATUS_RAN) {
                                                text = test.status === TEST_STATUS_NOT_RAN ? "Not ran" :
                                                    test.status === TEST_STATUS_RUNNING ? "Running" :
                                                        "";
                                            } else {
                                                let passed = test.passed;
                                                if (test.error !== null) {
                                                    passed = false;
                                                    text = test.error;
                                                }

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

                                            if (imMemo(c,textCol)) {
                                                elSetStyle(c, "color", textCol);
                                            }

                                            imStr(c, text);
                                        } imLayoutEnd(c);

                                        if (imButtonIsClicked(c, "Debug")) {
                                            runTest(test, true);
                                        }

                                        if (imButtonIsClicked(c, "Rerun")) {
                                            runTest(test);
                                        }

                                        imStr(c, test.name);

                                        if (imIf(c) && test.error) {
                                            imLayout(c, BLOCK); imPre(c); imFg(c, "#F00"); {
                                                imStr(c, test.error);
                                            } imLayoutEnd(c);
                                        } imIfEnd(c);
                                    } imLayoutEnd(c);
                                    imLayout(c, COL); imPadding(c, 0, NA, 0, NA, 0, NA, 10, PX); imGap(c, 5, PX); {
                                        if (imIf(c) && test.results.length > 0) {
                                            imFor(c); for (const req of test.results) {
                                                imLayout(c, ROW); {
                                                    imLayout(c, BLOCK); {
                                                        imStr(c, req.title);
                                                    } imLayoutEnd(c);

                                                    imLayout(c, BLOCK); imSize(c, 20, PX, 0, NA); imLayoutEnd(c);

                                                    imLayout(c, BLOCK); {
                                                        imFor(c); for (const ex of req.expectations) {
                                                            imLayout(c, ROW); {
                                                                imLayout(c, BLOCK); imCode(c); imPre(c); {
                                                                    imBg(c, ex.ok ? "#0F0" : "#F00");
                                                                    imFg(c, ex.ok ? "#000" : "#FFF");
                                                                    imStr(c, ex.ok ? "pass" : "fail");
                                                                } imLayoutEnd(c);

                                                                imLayout(c, BLOCK); imSize(c, 10, PX, 0, NA); imLayoutEnd(c);

                                                                imLayout(c, BLOCK); imPre(c); {
                                                                    imStr(c, ex.message);
                                                                } imLayoutEnd(c);
                                                            } imLayoutEnd(c);
                                                        } imForEnd(c);
                                                    } imLayoutEnd(c);
                                                } imLayoutEnd(c);
                                            } imForEnd(c);
                                        } else {
                                            imIfElse(c);

                                            imLayout(c, BLOCK); imCode(c); imPre(c); {
                                                imStr(c, "Test had no requirements");
                                            } imLayoutEnd(c);
                                        } imIfEnd(c);
                                    } imLayoutEnd(c);
                                } imLayoutEnd(c);
                            } imForEnd(c);
                        } imLayoutEnd(c);
                    } imForEnd(c);
                } imScrollContainerEnd(c);
            } imLayoutEnd(c);
        } else {
            imIfElse(c);

            imLayout(c, BLOCK); imCode(c); {
                imStr(c, tryState.err);
            } imLayoutEnd(c);

            imLayout(c, BLOCK); imButton(c); {
                imStr(c, "Ok");

                if (elHasMousePress(c)) {
                    tryState.recover();
                }
            } imLayoutEnd(c);
        } imIfEnd(c);
    } catch (e) {
        imTryCatch(c, tryState, e);
        console.error("An error occured while rendering: ", e);
    } imTryEnd(c, tryState);
}
