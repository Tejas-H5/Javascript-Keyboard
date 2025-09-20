import { imButtonIsClicked } from "src/components/button";
import { BLOCK, COL, imAlign, imBg, imFg, imFlex, imGap, imJustify, imLayout, imLayoutEnd, imPadding, imScrollOverflow, imSize, NA, PERCENT, PX, ROW, STRETCH } from "src/components/core/layout";
import { cssVars } from "src/components/core/stylesheets";
import { imLine, LINE_HORIZONTAL, LINE_VERTICAL } from "src/components/im-line";
import { getChartRepository, getSavedChartData } from "src/state/chart-repository";
import { InstrumentKey } from "src/state/keyboard-state";
import { getChartDurationInBeats, NoteItem, SequencerChart, TIMELINE_ITEM_NOTE, TimelineItem } from "src/state/sequencer-chart";
import { setSequencerChart } from "src/state/sequencer-state";
import { arrayAt } from "src/utils/array-utils";
import { scrollIntoViewVH } from "src/utils/dom-utils";
import { ImCache, imFor, imForEnd, imGetInline, imIf, imIfElse, imIfEnd, imMemo, imSet, isFirstishRender } from "src/utils/im-core";
import { EL_H2, elHasMouseOver, elHasMousePress, elSetStyle, imEl, imElEnd, imStr } from "src/utils/im-dom";
import { arrayMax } from "src/utils/math-utils";
import { GlobalContext, playKeyPressForUI, setCurrentChartIdx, setViewEditChart, setViewPlayCurrentChart, setViewSoundLab, setViewStartScreen } from "./app";
import { cssVarsApp } from "./styling";
import { loadAsyncVal } from "src/utils/promise-utils";

function handleChartSelectKeyDown(
    ctx: GlobalContext,
    currentChart: SequencerChart | null
): boolean {
    if (!ctx.keyPressState) return false;

    const { key, keyUpper, listNavAxis } = ctx.keyPressState;

    const ui = ctx.ui.chartSelect;
    const loadedCharts = ui.loadedChartMetadata.val;

    if (ui.idx >= loadedCharts.length) {
        ui.idx = loadedCharts.length - 1;
    }

    if (currentChart && keyUpper === "E") {
        setViewEditChart(ctx, currentChart);
        return true;
    }

    if (keyUpper === "L") {
        setViewSoundLab(ctx);
        return true;
    }

    if (currentChart && key === "Enter") {
        setSequencerChart(ctx.sequencer, currentChart);
        if (currentChart.timeline.length === 0) {
            setViewEditChart(ctx, currentChart);
        } else {
            setViewPlayCurrentChart(ctx, currentChart);
        }
        return true;
    }

    if (key === "Escape") {
        setViewStartScreen(ctx);
        return true;
    }

    if (listNavAxis !== 0 && loadedCharts.length > 0) {
        // We need to update the modal index too. because that used to be our source of truth xD
        setCurrentChartIdx(ctx, ui.idx + listNavAxis);
    }

    return false;
}

function imGetOrLoadCurrentChart(c: ImCache, ctx: GlobalContext) {
    const ui = ctx.ui.chartSelect;
    const loadedCharts = ui.loadedChartMetadata.val;
    const currentChartMetadata = arrayAt(loadedCharts, ui.idx);
    const currentChart = ui.currentChart.valOrLoading;

    if (imMemo(c, currentChartMetadata) && currentChartMetadata) {
        loadAsyncVal(ui.currentChart, 
            getChartRepository()
                .then(repo => getSavedChartData(repo, currentChartMetadata))
        );
    }

    return currentChart;
}

export function imChartSelect(c: ImCache, ctx: GlobalContext) {
    const ui = ctx.ui.chartSelect;
    const loadedCharts = ui.loadedChartMetadata.val;
    const currentChartMetadata = arrayAt(loadedCharts, ui.idx);
    const currentChart = imGetOrLoadCurrentChart(c, ctx);

    if (!ctx.handled) {
        ctx.handled = handleChartSelectKeyDown(ctx, currentChart);
    }

    const keyPressState = ctx.keyPressState;

    if (keyPressState) {
        const { vAxis, hAxis, key } = keyPressState;

        if (!ctx.handled) {
            // UI sound effects (before other key events)
            if (vAxis < 0 || hAxis < 0) {
                playKeyPressForUI(ctx, ctx.keyboard.keys[1][6]);
                ctx.handled = true;
            } else if (vAxis > 0 || hAxis > 0) {
                playKeyPressForUI(ctx, ctx.keyboard.keys[1][8]);
                ctx.handled = true;
            } else if (key === "Enter") {
                playKeyPressForUI(ctx, ctx.keyboard.keys[1][5]);
                ctx.handled = true;
            } else if (key === "Escape") {
                playKeyPressForUI(ctx, ctx.keyboard.keys[1][1]);
                ctx.handled = true;
            }
        }
    }

    imLayout(c, COL); imFlex(c); {
        imLayout(c, ROW); imAlign(c, STRETCH); imFlex(c); {
            imLayout(c, COL); imSize(c, 30, PERCENT, 0, NA); imJustify(c); imGap(c, 10, PX); {
                const scrollContainer = imLayout(c, COL); imFlex(c); imScrollOverflow(c, true); {
                    if (imIf(c) && loadedCharts.length > 0) {
                        imFor(c); for (let i = 0; i < loadedCharts.length; i++) {
                            const chart = loadedCharts[i];

                            const root = imLayout(c, ROW); imGap(c, 5, PX); imAlign(c); {
                                if (elHasMouseOver(c)) {
                                    ui.idx = i;
                                }

                                const chartSelected = ui.idx === i;
                                const chartSelectedChanged = imMemo(c, chartSelected);
                                if (chartSelectedChanged && chartSelected) {
                                    scrollIntoViewVH(scrollContainer, root, 0.5);
                                }

                                if (isFirstishRender(c)) {
                                    elSetStyle(c, "transition", "background-color .1s ease, width .1s ease");
                                }

                                imBg(c, chartSelected ? cssVars.mg : cssVars.bg);
                                imFg(c, chartSelected ? cssVars.bg : "");

                                imStr(c, chart.name);
                                if (currentChart && elHasMousePress(c)) {
                                    setViewPlayCurrentChart(ctx, currentChart);
                                }
                            } imLayoutEnd(c);
                        } imForEnd(c);
                    } else {
                        imIfElse(c);
                        imLayout(c, BLOCK); {
                            imStr(c, "No songs yet! You'll need to make some yourself");
                        } imLayoutEnd(c);
                    } imIfEnd(c);
                } imLayoutEnd(c);
                imLayout(c, ROW); imGap(c, 5, PX); {

                    if (imIf(c) && currentChart) {
                        if (imIf(c) && currentChart.timeline.length === 0) {
                            imStr(c, "Empty chart");
                        } else {
                            imIfElse(c);

                            if (imButtonIsClicked(c, "Play")) {
                                setViewPlayCurrentChart(ctx, currentChart);
                            }
                        } imIfEnd(c);

                        if (imButtonIsClicked(c, "Edit")) {
                            setViewEditChart(ctx, currentChart);
                        }
                    } else {
                        imIfElse(c);

                        imLayout(c, BLOCK); {
                            imStr(c, "Loading....");
                        } imLayoutEnd(c);
                    } imIfEnd(c);

                    imLayout(c, BLOCK); imFlex(c); imLayoutEnd(c);

                    if (imButtonIsClicked(c, "Back")) {
                        setViewStartScreen(ctx);
                    }

                    if (imButtonIsClicked(c, "The lab")) {
                        setViewSoundLab(ctx);
                    }
                } imLayoutEnd(c);

            } imLayoutEnd(c);

            imLine(c, LINE_VERTICAL, 1);

            if (imIf(c) && currentChart) {
                imLayout(c, COL); imFlex(c); {
                    if (imIf(c) && currentChartMetadata) {
                        imEl(c, EL_H2); {
                            imLayout(c, ROW); imPadding(c, 10, PX, 10, PX, 10, PX, 10, PX); {
                                imLayout(c, ROW); imFlex(c, 7); imJustify(c); {
                                    imStr(c, currentChartMetadata.name);
                                } imLayoutEnd(c);
                            } imLayoutEnd(c);
                        } imElEnd(c, EL_H2);
                    } imIfEnd(c);

                    imChartStatistics(c, ctx, currentChart);
                } imLayoutEnd(c);
            } else {
                imIfElse(c);

                imLayout(c, BLOCK); {
                    imStr(c, "Loading....");
                } imLayoutEnd(c);
            } imIfEnd(c);
        } imLayoutEnd(c);
    } imLayoutEnd(c);
}

function imChartStatistics(
    c: ImCache,
    ctx: GlobalContext,
    currentChart: SequencerChart
) {
    let musicNoteHashToKeyboardKeyIdx; musicNoteHashToKeyboardKeyIdx = imGetInline(c, imGetInline);
    if (!musicNoteHashToKeyboardKeyIdx) {
        musicNoteHashToKeyboardKeyIdx = imSet(c, new Map<number, InstrumentKey>());
        for (const key of ctx.keyboard.flatKeys) {
            musicNoteHashToKeyboardKeyIdx.set(key.noteId, key);
        }
    }

    const currentChartChanged = imMemo(c, currentChart);
    let s; s = imGetInline(c, imChartStatistics);
    if (!s || currentChartChanged) {
        const val = {
            keyFrequencies: Array(ctx.keyboard.flatKeys.length).fill(0) as number[],
            maxFrequency: 0,
        };

        for (const item of currentChart.timeline) {
            if (item.type !== TIMELINE_ITEM_NOTE) continue;

            const key = musicNoteHashToKeyboardKeyIdx.get(item.noteId);
            if (key) {
                val.keyFrequencies[key.index]++;
            }
        }

        val.maxFrequency = arrayMax(val.keyFrequencies);

        s = imSet(c, val);
    }

    imLayout(c, COL); imFlex(c); {
        imLine(c, LINE_HORIZONTAL, 1);

        imLayout(c, ROW); imAlign(c, STRETCH); imFlex(c); {

            imLayout(c, BLOCK); imSize(c, 20, PERCENT, 0, NA); imPadding(c, 5, PX, 10, PX, 10, PX, 10, PX); {
                imLayout(c, BLOCK); {
                    imStr(c, currentChart.timeline.length);
                    imStr(c, " notes");
                } imLayoutEnd(c);

                // Flexbox has to be the most overpowered layout concept. Can literally make any layout.
                // can literally derive table layout from flexbox. lmao. As much as I shit on web,
                // they got several things right

                imLayout(c, ROW); {
                    if (isFirstishRender(c)) {
                        elSetStyle(c, "fontSize", "13px");
                        elSetStyle(c, "lineHeight", "1");
                    }

                    imLayout(c, COL); {
                        imFor(c); for (const key of ctx.keyboard.flatKeys) {
                            imLayout(c, BLOCK); {
                                imStr(c, key.noteText);
                            } imLayoutEnd(c);
                        } imForEnd(c);
                    } imLayoutEnd(c);
                    imLayout(c, COL); imFlex(c); {
                        imFor(c); for (const key of ctx.keyboard.flatKeys) {
                            const count = s.keyFrequencies[key.index];
                            const normalized = count / s.maxFrequency;
                            imLayout(c, BLOCK); imBg(c, cssVarsApp.fg); {
                                if (isFirstishRender(c)) {
                                    elSetStyle(c, "color", cssVars.bg);
                                }

                                imSize(c, 100 * normalized, PERCENT, 100, PERCENT);
                                imStr(c, count);
                            } imLayoutEnd(c);
                        } imForEnd(c);
                    } imLayoutEnd(c);
                } imLayoutEnd(c);
            } imLayoutEnd(c);

            imLine(c, LINE_VERTICAL, 1);

            const root = imLayout(c, COL); imFlex(c); imAlign(c, STRETCH); {
                const width = root.clientWidth;
                const widthChanged = imMemo(c, root.clientWidth);

                imLayout(c, ROW); imFlex(c); {
                    imVerticalText(c); {
                        imStr(c, "Transitions");
                    } imLayoutEnd(c);

                    imLine(c, LINE_VERTICAL, 1);

                    imLayout(c, ROW); imFlex(c); {
                        let vis; vis = imGetInline(c, imChartStatistics);
                        if (!vis || currentChartChanged || widthChanged) {
                            const n = Math.floor(width / 4);
                            const transitions: number[] = Array(n).fill(0);

                            let lastItem: NoteItem | null = null;
                            for (const item of currentChart.timeline) {
                                if (item.type !== TIMELINE_ITEM_NOTE) continue;
                                if (lastItem) {
                                    const lastKey = musicNoteHashToKeyboardKeyIdx.get(lastItem.noteId);
                                    const key = musicNoteHashToKeyboardKeyIdx.get(item.noteId);
                                    if (lastKey && key) {
                                        const bucket = Math.floor(getItemStart01(currentChart, item) * transitions.length);

                                        // I've noticed that transitoning up or down a row is pretty difficult, 
                                        // so this may be accurate enough
                                        const physicalDistance = Math.abs(key.index - lastKey.index);
                                        transitions[bucket] += physicalDistance;
                                    }
                                }
                                lastItem = item;
                            }

                            const maxTransitions = Math.max(7, arrayMax(transitions));

                            vis = imSet(c, { transitions, maxTransitions });
                        }

                        imVerticalHistogram(c, vis.transitions, vis.maxTransitions);
                    } imLayoutEnd(c);
                } imLayoutEnd(c);

                imLine(c, LINE_HORIZONTAL, 1);

                imLayout(c, ROW); imFlex(c); {
                    imVerticalText(c); {
                        imStr(c, "Concurrency");
                    } imLayoutEnd(c);

                    imLine(c, LINE_VERTICAL, 1);

                    imLayout(c, ROW); imFlex(c); {
                        let vis; vis = imGetInline(c, imChartStatistics);
                        if (!vis || currentChartChanged || widthChanged) {
                            const n = Math.floor(width / 4);
                            const concurrency: number[] = Array(n).fill(0);

                            for (const item of currentChart.timeline) {
                                if (item.type !== TIMELINE_ITEM_NOTE) continue;

                                const bucket = Math.floor(getItemStart01(currentChart, item) * concurrency.length);
                                concurrency[bucket]++;
                            }

                            const maxConcurrency = Math.max(7, arrayMax(concurrency));

                            vis = imSet(c, { concurrency, maxConcurrency });
                        }

                        imVerticalHistogram(c, vis.concurrency, vis.maxConcurrency);
                    } imLayoutEnd(c);
                } imLayoutEnd(c);

                imLine(c, LINE_HORIZONTAL, 1);

                imLayout(c, ROW); imFlex(c); {
                    imVerticalText(c); {
                        imStr(c, "Speed");
                    } imLayoutEnd(c);

                    imLine(c, LINE_VERTICAL, 1);

                    imLayout(c, ROW); imFlex(c); {
                        let vis; vis = imGetInline(c, imChartStatistics);
                        if (!vis || currentChartChanged || widthChanged) {
                            const n = Math.floor(width / 4);
                            const speed: number[] = Array(n).fill(0);

                            let lastItem: NoteItem | null = null;
                            for (const item of currentChart.timeline) {
                                if (item.type !== TIMELINE_ITEM_NOTE) continue;
                                if (lastItem) {
                                    const a = lastItem.start;
                                    const b = item.start;
                                    const dist = b - a;
                                    if (dist > 0) {
                                        const bucket = Math.floor(getItemStart01(currentChart, item) * speed.length);
                                        speed[bucket] += 1 / dist;
                                    }
                                }
                                lastItem = item;
                            }

                            const maxSpeed = arrayMax(speed);

                            vis = imSet(c, { speed, maxSpeed });
                        }

                        imVerticalHistogram(c, vis.speed, vis. maxSpeed);
                    } imLayoutEnd(c);
                } imLayoutEnd(c);
            } imLayoutEnd(c);
        } imLayoutEnd(c);
    } imLayoutEnd(c);
}

function imVerticalHistogram(c: ImCache, arr: number[], arrMax: number) {
    imLayout(c, ROW); imAlign(c, STRETCH); imFlex(c); {
        imFor(c); for (const val of arr) {
            imLayout(c, COL); imFlex(c); {
                imLayout(c, BLOCK); imFlex(c); imLayoutEnd(c);
                const percent = 100 * val / arrMax;
                imLayout(c, BLOCK); {
                    imBg(c, cssVars.fg); imSize(c, 0, NA, percent, PERCENT);
                } imLayoutEnd(c);
            } imLayoutEnd(c);
        } imForEnd(c);
    } imLayoutEnd(c);
}

function imVerticalText(c: ImCache) {
    imLayout(c, ROW); {
        if (isFirstishRender(c)) {
            elSetStyle(c, "writingMode", "sideways-lr");
            elSetStyle(c, "textOrientation", "mixed");
        }
    }
}

function getItemStart01(chart: SequencerChart, item: TimelineItem) {
    const duration = getChartDurationInBeats(chart);
    const startBeats = item.start;
    return startBeats / duration;
}
