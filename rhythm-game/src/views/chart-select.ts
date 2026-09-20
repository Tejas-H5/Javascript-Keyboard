import { imVerticalText } from "app-components/misc.ts";
import { imButtonIsClicked } from "components/button.ts";
import { imLine, LINE_HORIZONTAL, LINE_VERTICAL } from "components/im-line.ts";
import { InstrumentKey } from "state/keyboard-state.ts";
import { CHART_STATUS_READONLY, getChartDurationInBeats, isBundledChartId, NoteItem, SequencerChart, TIMELINE_ITEM_NOTE, TimelineItem } from "state/sequencer-chart.ts";
import { getCurrentChartOrNullIfLoading } from "state/sequencer-state.ts";
import { ChartSelectState, getCurrentChartMetadata } from "state/ui-state.ts";
import { assert } from "utils/assert.ts";
import { el, im, ImCache, imdom } from "imcf";
import { BLOCK, COL, cssVars, imui, NA, PERCENT, PX, ROW, scrollIntoViewVH, STRETCH } from "imcf/im-ui";
import { arrayMax, clamp, lerp } from "utils/math-utils.ts";
import {
    GlobalContext,
    playKeyPressForUI,
    setCurrentChartMeta,
    setViewEditChart,
    setViewPlayCurrentChart,
    setViewSoundLab,
    setViewStartScreen
} from "./app.ts";
import { imHoverable } from "./button.ts";
import { cssVarsApp } from "./styling.ts";
import { Done, DONE, Then } from "utils/async-utils.ts";
import { imGameplay, imGameplayKeyboard, newGameplayState, recomputeGameplayStuff } from "./gameplay.ts";
import { playAll, startPlaying } from "state/playing-pausing.ts";
import { imGameplayContainerBegin, imGameplayContainerEnd } from "./gameplay-elements.ts";

function handleChartSelectKeyDown(ctx: GlobalContext, s: ChartSelectState): boolean {
    if (!ctx.keyPressState) return false;

    const { key, keyUpper, listNavAxis } = ctx.keyPressState;

    const currentChart = getCurrentChartOrNullIfLoading(ctx);

    if (currentChart && keyUpper === "E") {
        setViewEditChart(ctx);
        return true;
    }

    if (keyUpper === "K") {
        // But, maybe this should be the selected chart?
        setViewSoundLab(ctx);
        return true;
    }

    if (currentChart && key === "Enter") {
        // UI sound effect - confirm
        // TODO: we can't do this because it breaks everything xDDDDD - for now we do this, then timeout the playing of the chart.
        playKeyPressForUI(ctx, 0.5);

        setTimeout(() => {
            if (currentChart.timeline.length === 0) {
                setViewEditChart(ctx);
            } else {
                setViewPlayCurrentChart(ctx);
            }
        }, 40);

        return true;
    }

    if (key === "Escape") {
        setViewStartScreen(ctx);
        return true;
    }

    if (listNavAxis !== 0) {
        moveChartSelection(ctx, listNavAxis, () => DONE);
        return true;
    }

    return false;
}

export function moveChartSelection(ctx: GlobalContext, listNavAxis: number, cb: Then<void>): Done {
    if (listNavAxis === 0) return cb();

    const availableCharts = ctx.repo.charts.allChartMetadata;
    if (availableCharts.length === 0) return cb();

    const meta = getCurrentChartMetadata(ctx);
    if (!meta) {
        return setCurrentChartMeta(ctx, availableCharts[0], cb);
    } 

    const idx = availableCharts.indexOf(meta);
    assert(idx !== -1);

    const newIdx = clamp(idx + listNavAxis, 0, availableCharts.length - 1);
    return setCurrentChartMeta(ctx, availableCharts[newIdx], () => {
        // UI sound effect
        const keyboardPitch = newIdx / availableCharts.length;
        const lowPitch = 0.2;
        const highPitch = 0.8;
        playKeyPressForUI(ctx, lerp(lowPitch, highPitch, 1 - keyboardPitch));
        return cb();
    });
}

export function imChartSelect(c: ImCache, ctx: GlobalContext) {
    const s = ctx.ui.chartSelect;

    const availableCharts = ctx.repo.charts.allChartMetadata;
    const currentChart = getCurrentChartOrNullIfLoading(ctx);

    imui.Begin(c, COL); imui.Flex(c); {
        imui.Begin(c, ROW); imui.Align(c, STRETCH); imui.Flex(c); {
            imui.Begin(c, COL); imui.Size(c, 30, PERCENT, 0, NA); imui.Justify(c); imui.Gap(c, 10, PX); {
                const scrollContainer = imui.Begin(c, COL); imui.Flex(c); imui.ScrollOverflow(c, true); {
                    if (im.If(c) && availableCharts.length > 0) {
                        const lastSelected = im.GetInline(c, imChartSelect) ?? im.Set(c, { id: 0 });

                        im.For(c); for (let i = 0; i < availableCharts.length; i++) {
                            const metadata = availableCharts[i];
                            const chartSelected = s.currentChartMeta === metadata;

                            const root = imui.Begin(c, ROW); imui.Gap(c, 5, PX); imui.Align(c); {
                                imHoverable(c, chartSelected);
                                if (imdom.hasMouseOver(c)) {
                                    if (lastSelected.id !== metadata.id) {
                                        lastSelected.id = metadata.id;
                                        setCurrentChartMeta(ctx, metadata, () => DONE);
                                    }
                                }

                                const chartSelectedChanged = im.Memo(c, chartSelected);
                                if (chartSelectedChanged && chartSelected) {
                                    scrollIntoViewVH(scrollContainer, root, 0.5);
                                }

                                imdom.Str(c, metadata.name);
                                if (currentChart && imdom.hasMousePress(c)) {
                                    setViewPlayCurrentChart(ctx);
                                }

                                imui.Flex1(c);

                                imdom.Str(c, isBundledChartId(metadata.id) ? "[bundled]" : "");
                            } imui.End(c);
                        } im.ForEnd(c);
                    } else {
                        im.IfElse(c);
                        imui.Begin(c, BLOCK); {
                            // We have react-suspense at home. xD
                            // Actually we don't. I'm pretty sure it can be done though, but prob not worth the effort yet.
                            // It is a combination of pushing promises onto a global state stack,
                            // and then rendering the loading component to a background node while we evaluate the promises,
                            // and then switch the fallback out with the final component once the promises have loaded.
                            // I simply can't be bothered implementing it because I don't need it.
                            // The API would be similar to im.If()/im.IfElse()/im.IfEnd() but without
                            // an actual if statement. 
                            imdom.Str(c, "Loading...");
                        } imui.End(c);
                    } im.IfEnd(c);
                } imui.End(c);
                imui.Begin(c, ROW); imui.Gap(c, 5, PX); imui.Align(c); {
                    if (im.If(c) && currentChart) {
                        if (im.If(c) && currentChart.timeline.length === 0) {
                            imdom.Str(c, "Empty chart");
                        } else {
                            im.IfElse(c);

                            if (imButtonIsClicked(c, "Play")) {
                                setViewPlayCurrentChart(ctx);
                            }
                        } im.IfEnd(c);

                        if (imButtonIsClicked(c, "Edit")) {
                            setViewEditChart(ctx);
                        }
                    } else {
                        im.IfElse(c);

                        imui.Begin(c, BLOCK); {
                            imdom.Str(c, "Loading....");
                        } imui.End(c);
                    } im.IfEnd(c);

                    imui.Begin(c, BLOCK); imui.Flex(c); imui.End(c);

                    if (imButtonIsClicked(c, "Back")) {
                        setViewStartScreen(ctx);
                    }

                    if (imButtonIsClicked(c, "Keyboard")) {
                        // But, maybe this should be the selected chart?
                        setViewSoundLab(ctx);
                    }
                } imui.End(c);

            } imui.End(c);

            imLine(c, LINE_VERTICAL, 1);

            if (im.If(c) && currentChart) {
                const bundled = currentChart._savedStatus === CHART_STATUS_READONLY;
                imui.Begin(c, COL); imui.Flex(c); {
                    imui.Begin(c, COL); imui.Padding(c, 10, PX, 10, PX, 10, PX, 10, PX); {
                        imdom.ElBegin(c, el.H2); {
                            imui.Begin(c, ROW); {
                                imui.Begin(c, ROW); {
                                    imdom.Str(c, currentChart.name);
                                } imui.End(c);

                                imui.Begin(c, BLOCK); imui.Flex(c, 1); imui.End(c);

                                imui.Begin(c, ROW); {
                                    imdom.Str(c, "<Artist Name>");
                                } imui.End(c);

                                imui.Begin(c, BLOCK); imui.Flex(c, 1); imui.End(c);

                                imui.Begin(c, ROW); {
                                    imdom.Str(c, bundled ? "[Bundled]" : "Some player");
                                } imui.End(c);
                            } imui.End(c);
                        } imdom.ElEnd(c, el.H2);

                        imui.Begin(c, BLOCK); {
                            if (im.IsFirstRender(c)) {
                                imdom.setStyle(c, "whiteSpace", "pre-wrap");
                            }

                            imdom.Str(c, "<Artist name>\n<View link> | <purchase link>\nI made this map because blah blah blah balh. blah blah blah. I hope you like it!");
                        } imui.End(c);
                    } imui.End(c);

                    // imChartStatistics(c, ctx, currentChart);

                    const chartChanged = im.Memo(c, currentChart);

                    let gameplayState = im.Get(c, newGameplayState);
                    if (!gameplayState || chartChanged) {
                        gameplayState = im.Set(c, newGameplayState(ctx.keyboard, currentChart));
                        playAll(ctx, { isUserDriven: false });
                    }
                    recomputeGameplayStuff(ctx, gameplayState, im.getDeltaTimeSeconds(c));

                    imui.Begin(c, BLOCK); imui.Flex(c); imui.Relative(c); {
                        imGameplayContainerBegin(c, true); {
                            imGameplayKeyboard(c, ctx, gameplayState, null);
                        } imGameplayContainerEnd(c);
                    } imui.End(c);
                } imui.End(c);
            } else {
                im.IfElse(c);

                imui.Begin(c, BLOCK); {
                    imdom.Str(c, "Loading....");
                } imui.End(c);
            } im.IfEnd(c);
        } imui.End(c);
    } imui.End(c);

    if (!ctx.handled) {
        ctx.handled = handleChartSelectKeyDown(ctx, s);
    }
}

// TODO: Remove completely
function imChartStatistics(
    c: ImCache,
    ctx: GlobalContext,
    currentChart: SequencerChart
) {
    let musicNoteHashToKeyboardKeyIdx; musicNoteHashToKeyboardKeyIdx = im.GetInline(c, im.GetInline);
    if (!musicNoteHashToKeyboardKeyIdx) {
        musicNoteHashToKeyboardKeyIdx = im.Set(c, new Map<number, InstrumentKey>());
        for (const key of ctx.keyboard.flatKeys) {
            musicNoteHashToKeyboardKeyIdx.set(key.noteId, key);
        }
    }

    const currentChartChanged = im.Memo(c, currentChart);
    let s; s = im.GetInline(c, imChartStatistics);
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

        s = im.Set(c, val);
    }

    imui.Begin(c, COL); imui.Flex(c); {
        imLine(c, LINE_HORIZONTAL, 1);

        imui.Begin(c, ROW); imui.Align(c, STRETCH); imui.Flex(c); {

            imui.Begin(c, BLOCK); imui.Size(c, 20, PERCENT, 0, NA); imui.Padding(c, 5, PX, 10, PX, 10, PX, 10, PX); {
                imui.Begin(c, BLOCK); {
                    imdom.Str(c, currentChart.timeline.length);
                    imdom.Str(c, " notes");
                } imui.End(c);

                // Flexbox has to be the most overpowered layout concept. Can literally make any layout.
                // can literally derive table layout from flexbox. lmao. As much as I shit on web,
                // they got several things right

                const root = imui.Begin(c, ROW); imui.Size(c, 0, NA, 100, PERCENT); {
                    const height = root.clientHeight;
                    if (im.Memo(c, height)) {
                        const fontSize = (height - (ctx.keyboard.keys.length * 2)) / ctx.keyboard.flatKeys.length;
                        imdom.setStyle(c, "lineHeight", "1");
                        imdom.setStyle(c, "fontSize", fontSize + "px");
                    }

                    imui.Begin(c, COL); {
                        im.For(c); for (const row of ctx.keyboard.keys) {
                            for (const key of row) {
                                imui.Begin(c, BLOCK); {
                                    imdom.Str(c, key.keyboardKey);
                                    imdom.Str(c, " -> ");
                                    imdom.Str(c, key.noteText);
                                } imui.End(c);
                            }

                            imLine(c, LINE_HORIZONTAL, 2);
                        } im.ForEnd(c);
                    } imui.End(c);
                    imui.Begin(c, COL); imui.Flex(c); {
                        im.For(c); for (const row of ctx.keyboard.keys) {
                            for (const key of row) {
                                const count = s.keyFrequencies[key.index];
                                const normalized = count / s.maxFrequency;
                                imui.Begin(c, BLOCK); imui.Bg(c, cssVarsApp.fg); {
                                    if (im.IsFirstRender(c)) {
                                        imdom.setStyle(c, "color", cssVars.bg);
                                    }

                                    imui.Size(c, 100 * normalized, PERCENT, 0, NA);
                                    imdom.Str(c, count);
                                } imui.End(c);
                            }

                            imui.Begin(c, BLOCK); imui.Bg(c, cssVarsApp.fg); imui.Size(c, 0, NA, 2, PX); imui.End(c);
                        } im.ForEnd(c);
                    } imui.End(c);
                } imui.End(c);
            } imui.End(c);

            imLine(c, LINE_VERTICAL, 1);

            const root = imui.Begin(c, COL); imui.Flex(c); imui.Align(c, STRETCH); {
                const width = root.clientWidth;
                const widthChanged = im.Memo(c, root.clientWidth);

                imui.Begin(c, ROW); imui.Flex(c); {
                    imVerticalText(c); {
                        imdom.Str(c, "Transitions");
                    } imui.End(c);

                    imLine(c, LINE_VERTICAL, 1);

                    imui.Begin(c, ROW); imui.Flex(c); {
                        let vis; vis = im.GetInline(c, imChartStatistics);
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

                            vis = im.Set(c, { transitions, maxTransitions });
                        }

                        imVerticalHistogram(c, vis.transitions, vis.maxTransitions);
                    } imui.End(c);
                } imui.End(c);

                imLine(c, LINE_HORIZONTAL, 1);

                imui.Begin(c, ROW); imui.Flex(c); {
                    imVerticalText(c); {
                        imdom.Str(c, "Concurrency");
                    } imui.End(c);

                    imLine(c, LINE_VERTICAL, 1);

                    imui.Begin(c, ROW); imui.Flex(c); {
                        let vis; vis = im.GetInline(c, imChartStatistics);
                        if (!vis || currentChartChanged || widthChanged) {
                            const n = Math.floor(width / 4);
                            const concurrency: number[] = Array(n).fill(0);

                            for (const item of currentChart.timeline) {
                                if (item.type !== TIMELINE_ITEM_NOTE) continue;

                                const bucket = Math.floor(getItemStart01(currentChart, item) * concurrency.length);
                                concurrency[bucket]++;
                            }

                            const maxConcurrency = Math.max(7, arrayMax(concurrency));

                            vis = im.Set(c, { concurrency, maxConcurrency });
                        }

                        imVerticalHistogram(c, vis.concurrency, vis.maxConcurrency);
                    } imui.End(c);
                } imui.End(c);

                imLine(c, LINE_HORIZONTAL, 1);

                imui.Begin(c, ROW); imui.Flex(c); {
                    imVerticalText(c); {
                        imdom.Str(c, "Speed");
                    } imui.End(c);

                    imLine(c, LINE_VERTICAL, 1);

                    imui.Begin(c, ROW); imui.Flex(c); {
                        let vis; vis = im.GetInline(c, imChartStatistics);
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

                            vis = im.Set(c, { speed, maxSpeed });
                        }
                        imVerticalHistogram(c, vis.speed, vis.maxSpeed);
                    } imui.End(c);
                } imui.End(c);
            } imui.End(c);
        } imui.End(c);
    } imui.End(c);
}

function imVerticalHistogram(c: ImCache, arr: number[], arrMax: number) {
    // Avoid div by 0 issues
    arrMax = Math.max(arrMax, 0.000001);

    imui.Begin(c, ROW); imui.Align(c, STRETCH); imui.Flex(c); {
        im.For(c); for (const val of arr) {
            imui.Begin(c, COL); imui.Flex(c); {
                imui.Begin(c, BLOCK); imui.Flex(c); imui.End(c);
                const percent = 100 * val / arrMax;
                imui.Begin(c, BLOCK); {
                    imui.Bg(c, cssVars.fg); imui.Size(c, 0, NA, percent, PERCENT);
                } imui.End(c);
            } imui.End(c);
        } im.ForEnd(c);
    } imui.End(c);
}

function getItemStart01(chart: SequencerChart, item: TimelineItem) {
    const duration = getChartDurationInBeats(chart);
    const startBeats = item.start;
    return startBeats / duration;
}
