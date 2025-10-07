import { imButtonIsClicked } from "src/components/button";
import { BLOCK, COL, imAlign, imBg, imFg, imFlex, imGap, imJustify, imLayout, imLayoutEnd, imPadding, imScrollOverflow, imSize, NA, PERCENT, PX, ROW, STRETCH } from "src/components/core/layout";
import { cssVars } from "src/components/core/stylesheets";
import { imLine, LINE_HORIZONTAL, LINE_VERTICAL } from "src/components/im-line";
import { InstrumentKey } from "src/state/keyboard-state";
import { CHART_STATUS_READONLY, getChartDurationInBeats, NoteItem, SequencerChart, TIMELINE_ITEM_NOTE, TimelineItem } from "src/state/sequencer-chart";
import { getCurrentChart } from "src/state/sequencer-state";
import { ChartSelectState, getCurrentChartMetadata, NAME_OPERATION_COPY } from "src/state/ui-state";
import { scrollIntoViewVH } from "src/utils/dom-utils";
import { ImCache, imFor, imForEnd, imGetInline, imIf, imIfElse, imIfEnd, imMemo, imSet, isFirstishRender } from "src/utils/im-core";
import { EL_H2, elHasMouseOver, elHasMousePress, elSetStyle, imEl, imElEnd, imStr } from "src/utils/im-dom";
import { arrayMax, clamp } from "src/utils/math-utils";
import {
    GlobalContext,
    openChartUpdateModal,
    playKeyPressForUI,
    setCurrentChartMeta,
    setViewEditChart,
    setViewPlayCurrentChart,
    setViewSoundLab,
    setViewStartScreen
} from "./app";
import { cssVarsApp } from "./styling";

function handleChartSelectKeyDown(ctx: GlobalContext, s: ChartSelectState): boolean {
    if (!ctx.keyPressState) return false;

    const { key, keyUpper, listNavAxis } = ctx.keyPressState;

    const currentChart = s.currentChart.loading ? null : getCurrentChart(ctx);

    if (currentChart && keyUpper === "E") {
        if (currentChart._savedStatus === CHART_STATUS_READONLY) {
            openChartUpdateModal(ctx, currentChart, NAME_OPERATION_COPY, "Bundled charts cannot be edited directly, and need to be copied first");
        } else {
            setViewEditChart(ctx);
        }
        return true;
    }

    if (keyUpper === "L") {
        setViewSoundLab(ctx);
        return true;
    }

    if (currentChart && key === "Enter") {
        if (currentChart.timeline.length === 0) {
            setViewEditChart(ctx);
        } else {
            setViewPlayCurrentChart(ctx);
        }
        return true;
    }

    if (key === "Escape") {
        setViewStartScreen(ctx);
        return true;
    }

    if (listNavAxis !== 0) {
        moveChartSelection(ctx, listNavAxis);
        return true;
    }

    return false;
}

export function moveChartSelection(ctx: GlobalContext, listNavAxis: number) {
    if (listNavAxis === 0) return;

    const availableCharts = ctx.repo.allChartMetadata;
    if (availableCharts.length === 0) return;

    let result;

    const meta = getCurrentChartMetadata(ctx);
    if (!meta) {
        result = setCurrentChartMeta(ctx, availableCharts[0]);
    } else {
        const idx = meta._index;
        const newIdx = clamp(idx + listNavAxis, 0, availableCharts.length - 1);
        result = setCurrentChartMeta(ctx, availableCharts[newIdx]);
    }

    return result;
}

export function imChartSelect(c: ImCache, ctx: GlobalContext) {
    const s = ctx.ui.chartSelect;

    const keyPressState = ctx.keyPressState;

    if (keyPressState) {
        const { vAxis, hAxis, key } = keyPressState;

        // UI sound effects (before other key events)
        if (vAxis < 0 || hAxis < 0) {
            playKeyPressForUI(ctx, ctx.keyboard.keys[1][6]);
        } else if (vAxis > 0 || hAxis > 0) {
            playKeyPressForUI(ctx, ctx.keyboard.keys[1][8]);
        } else if (key === "Enter") {
            playKeyPressForUI(ctx, ctx.keyboard.keys[1][5]);
        } else if (key === "Escape") {
            playKeyPressForUI(ctx, ctx.keyboard.keys[1][1]);
        }
    }

    const availableCharts = ctx.repo.allChartMetadata;
    const currentChart = s.currentChart.loading ? null : getCurrentChart(ctx);

    imLayout(c, COL); imFlex(c); {
        imLayout(c, ROW); imAlign(c, STRETCH); imFlex(c); {
            imLayout(c, COL); imSize(c, 30, PERCENT, 0, NA); imJustify(c); imGap(c, 10, PX); {
                const scrollContainer = imLayout(c, COL); imFlex(c); imScrollOverflow(c, true); {
                    if (imIf(c) && availableCharts.length > 0) {
                        imFor(c); for (let i = 0; i < availableCharts.length; i++) {
                            const metadata = availableCharts[i];

                            const root = imLayout(c, ROW); imGap(c, 5, PX); imAlign(c); {
                                if (elHasMouseOver(c)) {
                                    setCurrentChartMeta(ctx, metadata);
                                }

                                const chartSelected = s.currentChartMeta === metadata;
                                const chartSelectedChanged = imMemo(c, chartSelected);
                                if (chartSelectedChanged && chartSelected) {
                                    scrollIntoViewVH(scrollContainer, root, 0.5);
                                }

                                if (isFirstishRender(c)) {
                                    elSetStyle(c, "transition", "background-color .1s ease, width .1s ease");
                                }

                                imBg(c, chartSelected ? cssVars.mg : cssVars.bg);
                                imFg(c, chartSelected ? cssVars.bg : "");

                                imStr(c, metadata.name);
                                if (currentChart && elHasMousePress(c)) {
                                    setViewPlayCurrentChart(ctx);
                                }
                            } imLayoutEnd(c);
                        } imForEnd(c);
                    } else {
                        imIfElse(c);
                        imLayout(c, BLOCK); {
                            // We have react-suspense at home. xD
                            // Actually we don't. I'm pretty sure it can be done though, but prob not worth the effort yet.
                            // It is a combination of pushing promises onto a global state stack,
                            // and then rendering the loading component to a background node while we evaluate the promises,
                            // and then switch the fallback out with the final component once the promises have loaded.
                            // I simply can't be bothered implementing it because I don't need it.
                            // The API would be similar to imIf()/imIfElse()/imIfEnd() but without
                            // an actual if statement. 
                            imStr(c, "Loading...");
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
                                setViewPlayCurrentChart(ctx);
                            }
                        } imIfEnd(c);

                        if (imButtonIsClicked(c, "Edit")) {
                            setViewEditChart(ctx);
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
                const bundled = currentChart._savedStatus === CHART_STATUS_READONLY;
                imLayout(c, COL); imFlex(c); {
                    imLayout(c, COL); imPadding(c, 10, PX, 10, PX, 10, PX, 10, PX); {
                        imEl(c, EL_H2); {
                            imLayout(c, ROW); {
                                imLayout(c, ROW); {
                                    imStr(c, currentChart.name);
                                } imLayoutEnd(c);

                                imLayout(c, BLOCK); imFlex(c, 1); imLayoutEnd(c);

                                imLayout(c, ROW); {
                                    imStr(c, "<Artist Name>");
                                } imLayoutEnd(c);

                                imLayout(c, BLOCK); imFlex(c, 1); imLayoutEnd(c);

                                imLayout(c, ROW); {
                                    imStr(c, bundled ? "TejasH5" : "Some player");
                                } imLayoutEnd(c);
                            } imLayoutEnd(c);
                        } imElEnd(c, EL_H2);

                        imLayout(c, BLOCK); {
                            if (isFirstishRender(c)) {
                                elSetStyle(c, "whiteSpace", "pre-wrap");
                            }

                            imStr(c, "<Artist name>\n<View link> | <purchase link>\nI made this map because blah blah blah balh. blah blah blah. I hope you like it!");
                        } imLayoutEnd(c);
                    } imLayoutEnd(c);

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

    if (!ctx.handled) {
        ctx.handled = handleChartSelectKeyDown(ctx, s);
    }
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

                const root = imLayout(c, ROW); imSize(c, 0, NA, 100, PERCENT); {
                    const height = root.clientHeight;
                    if (imMemo(c, height)) {
                        const fontSize = (height - (ctx.keyboard.keys.length * 2)) / ctx.keyboard.flatKeys.length;
                        elSetStyle(c, "lineHeight", "1");
                        elSetStyle(c, "fontSize", fontSize + "px");
                    }

                    imLayout(c, COL); {
                        imFor(c); for (const row of ctx.keyboard.keys) {
                            for (const key of row) {
                                imLayout(c, BLOCK); {
                                    imStr(c, key.keyboardKey);
                                    imStr(c, " -> ");
                                    imStr(c, key.noteText);
                                } imLayoutEnd(c);
                            }

                            imLine(c, LINE_HORIZONTAL, 2);
                        } imForEnd(c);
                    } imLayoutEnd(c);
                    imLayout(c, COL); imFlex(c); {
                        imFor(c); for (const row of ctx.keyboard.keys) {
                            for (const key of row) {
                                const count = s.keyFrequencies[key.index];
                                const normalized = count / s.maxFrequency;
                                imLayout(c, BLOCK); imBg(c, cssVarsApp.fg); {
                                    if (isFirstishRender(c)) {
                                        elSetStyle(c, "color", cssVars.bg);
                                    }

                                    imSize(c, 100 * normalized, PERCENT, 0, NA);
                                    imStr(c, count);
                                } imLayoutEnd(c);
                            }

                            imLayout(c, BLOCK); imBg(c, cssVarsApp.fg); imSize(c, 0, NA, 2, PX); imLayoutEnd(c);
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
                        imVerticalHistogram(c, vis.speed, vis.maxSpeed);
                    } imLayoutEnd(c);
                } imLayoutEnd(c);
            } imLayoutEnd(c);
        } imLayoutEnd(c);
    } imLayoutEnd(c);
}

function imVerticalHistogram(c: ImCache, arr: number[], arrMax: number) {
    // Avoid div by 0 issues
    arrMax = Math.max(arrMax, 0.000001);

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
