import { imButtonIsClicked } from "src/components/button.ts";
import { BLOCK, COL, EM, END, NA, PERCENT, PX, ROW, START, STRETCH, imui, cssVars, CssColor } from "src/utils/im-js/im-ui";
import { imLine, LINE_VERTICAL } from "src/components/im-line.ts";
import { debugFlags } from "src/debug-flags.ts";
import { getCurrentOscillatorGainForOwner, isKeyPressed, pressKey, setPlaybackTime } from "src/dsp/dsp-loop-interface.ts";
import {
    getKeyForKeyboardKey,
    InstrumentKey,
    KeyboardState
} from "src/state/keyboard-state.ts";
import { pausePlayback, resumePlayback } from "src/state/playing-pausing.ts";
import {
    CommandItem,
    FRACTIONAL_UNITS_PER_BEAT,
    getChartDurationInBeats,
    getTimeForBeats,
    isBeatWithinExclusive,
    isBeatWithinInclusve,
    NoteItem,
    SequencerChart,
    TIMELINE_ITEM_MEASURE,
    TIMELINE_ITEM_NOTE,
    TimelineItemMeasure
} from "src/state/sequencer-chart.ts";
import {
    getSequencerPlaybackOrEditingCursor,
    getTimelineMusicNoteThreads,
    NoteMapEntry
} from "src/state/sequencer-state.ts";
import { arrayAt } from "src/utils/array-utils.ts";
import { assert } from "src/utils/assert.ts";
import { im, ImCache, imdom, el, ev, Stringifyable, } from "src/utils/im-js";
import { clamp, inverseLerp, inverseLerp2, lerp, max } from "src/utils/math-utils.ts";
import { GlobalContext, setViewChartSelect, setViewEditChart } from "./app.ts";
import { cssVarsApp, getCurrentTheme } from "./styling.ts";

const SIGNAL_LOOKAHEAD_BEATS = 1 * FRACTIONAL_UNITS_PER_BEAT;
const GAMEPLAY_BEATS_VIEWPORT  = 3 * FRACTIONAL_UNITS_PER_BEAT;
const GAMEPLAY_BEATS_LOADAHEAD = 6 * FRACTIONAL_UNITS_PER_BEAT;

// every 1/n beats hit = 1 score
const SCOREABLE_BEAT_QUANTIZATION_REAL_BEATS = 16;
const SCOREABLE_BEAT_QUANTIZATION = FRACTIONAL_UNITS_PER_BEAT / SCOREABLE_BEAT_QUANTIZATION_REAL_BEATS;

// Every {PENALTY_QUANTIZATION} after {PENALTY_QUANTIZATION_START} where we don't hit any notes, our score will simply decline, 
// till it reaches zero. 
const PENALTY_QUANTIZATION_SECONDS = 0.1;
const PENALTY_QUANTIZATION_START_SECONDS = 0.35;

export function getBestPossibleScore(chart: SequencerChart, startBeat: number, endBeat: number) {
    if (chart.timeline.length === 0) return 0;

    let totalScore = 0;
    for (let i = 0; i < chart.timeline.length; i++) {
        // A note at the very start can be held all the way to the end of the chart.
        // so we actually have to iterate _ALL_ notes regardless of start and end beats.

        const item = chart.timeline[i];
        if (item.type !== TIMELINE_ITEM_NOTE)     continue;
        if (item.start + item.length < startBeat) continue;
        if (endBeat < item.start)                 continue;

        totalScore += getBestPossibleScoreForNote(item, startBeat, endBeat);
    }

    return totalScore;
}

export function getBestPossibleScoreForNote(item: NoteItem, startBeat = 0, endBeat: number = Number.MAX_SAFE_INTEGER): number {
    if (item.type !== TIMELINE_ITEM_NOTE) return 0;
    const itemStartBeat = Math.max(item.start, startBeat);
    const itemEndBeat = Math.min(endBeat, item.start + item.length);
    const score = Math.ceil((itemEndBeat - itemStartBeat) / SCOREABLE_BEAT_QUANTIZATION);
    return score;
}


export type KeysMapEntry = { 
    instrumentKey: InstrumentKey;

    // NOTE: this is a non-owning reference
    _items: NoteItem[];
};

export function notesMapToKeysMap(
    keyboard: KeyboardState,
    srcNotesMap: Map<number, NoteMapEntry>,
    dstKeysMap: Map<InstrumentKey, KeysMapEntry>,
) {
    for (const k of keyboard.flatKeys) {
        let block = dstKeysMap.get(k);
        if (!block) {
            block = { instrumentKey: k, _items: [] };
            dstKeysMap.set(k, block);
        }

        const notesMapEntry = srcNotesMap.get(k.noteId);
        if (!notesMapEntry) {
            continue;
        }

        block._items = notesMapEntry.items;
    }
}

function newBarState() {
    return { animation: 0 };
}

function newVerticalNoteThreadState() {
    return { 
        backgroundColor: "",
        currentBgColor: imui.newColor(0, 0, 0, 1),
    };
}

export type GameplayState = {
    dt: number;
    currentBeat: number;
    currentBeatAnimated: number;
    end: number;
    endAnimated: number;
    midpoint: number;
    notesMap: Map<number, NoteMapEntry>;
    commandsList: CommandItem[];

    keysMap: Map<InstrumentKey, KeysMapEntry>;
    keyState: GameplayKeyState[];

    penaltyTimer: number;
    avoidPenalty: boolean;
    penaltyEnabled: boolean;

    measures: TimelineItemMeasure[];

    // Don't want to trigger practice mode by accident - it wipes all progress.
    practiceMode: {
        enabled: boolean;
        buttonHeld: boolean;

        scoreThisMeasure: number;
        scoreMissedThisMeasure: number;

        nextMeasureIdx: number;
        nextMeasureIdxLastStartBeat: number;
        timerSeconds: number;

        maxScoreThisMeasure: number;

        rewindAnimation: {
            t: number;
            started: boolean;
            rewindAmount: number;
            animatedCursorBeats: number;
            targetCursorBeats: number;
        };
    };

    score: number;
    scoreMissed: number;
    bestPossibleScore: number;
    chartName: string;

    pauseMenu: {
        isPaused: boolean;
        idx: number;
    }
};


type GameplayKeyState = {
    keyHeld: boolean;
    keyPressedThisFrame: boolean;
    keyReleasedThisFrame: boolean;

    // Shouldn't be able to move between multiple keys without releasing and pressing.
    // Don't want the game to award people full score for just holding down all the keys all the time.
    keyReleasedAtLeastOnce: boolean; 
    lastPressedItem: NoteItem | null;
    lastItemScore: number;
    lastItemScoreMissed: number;

    lastPressedBeatQuantized: number;
};

export function newGameplayState(
    keyboard: KeyboardState,
    chart: SequencerChart
): GameplayState {
    const measures = chart.timeline.filter(item => item.type === TIMELINE_ITEM_MEASURE);
    const bestPossibleScore = getBestPossibleScore(chart, 0, Number.MAX_SAFE_INTEGER);

    return {
        dt: 0,
        score: 0,
        scoreMissed: 0,
        bestPossibleScore: bestPossibleScore,
        chartName: chart.name,

        currentBeat: 0,
        currentBeatAnimated: 0,
        end: 0,
        endAnimated: 0,
        midpoint: 0,
        notesMap: new Map(),
        keysMap: new Map(),

        commandsList: [],

        keyState: Array(keyboard.flatKeys.length).fill(null).map((): GameplayKeyState => {
            return {
                lastPressedItem: null,
                lastItemScore: 0,
                lastItemScoreMissed: 0,
                keyHeld: false,
                keyPressedThisFrame: false,
                keyReleasedThisFrame: false,
                keyReleasedAtLeastOnce: false,

                lastPressedBeatQuantized: -1,
            };
        }),

        penaltyTimer: -PENALTY_QUANTIZATION_START_SECONDS,
        avoidPenalty: false,
        penaltyEnabled: false,

        measures: measures,

        practiceMode: {
            enabled: !!debugFlags.testPracticeMode,
            buttonHeld: false,
            timerSeconds: 0,
            nextMeasureIdx: 0,
            nextMeasureIdxLastStartBeat: 0,
            scoreThisMeasure: 0,
            scoreMissedThisMeasure: 0,

            maxScoreThisMeasure: 0,

            rewindAnimation: {
                t: 0,
                started: false,
                rewindAmount: 0,
                animatedCursorBeats: 0,
                targetCursorBeats: 0,
            },
        },

        pauseMenu: {
            isPaused: false,
            idx: 0,
        }
    };
}

function setPausedState(ctx: GlobalContext, s: GameplayState, state: boolean) {
    s.pauseMenu.isPaused = state;
    if (s.pauseMenu.isPaused) {
        pausePlayback(ctx);
    } else {
        resumePlayback(ctx);
    }
}

function handleGameplayKeyDown(ctx: GlobalContext, s: GameplayState): boolean {
    let handled = false;

    const rewindStarted = s.practiceMode.rewindAnimation.started;

    if (ctx.keyPressState)  {
        const { key, isRepeat } = ctx.keyPressState;
        const { keyboard } = ctx;

        if (key === "Escape") {
            setPausedState(ctx, s, !s.pauseMenu.isPaused);
            handled = true;
        } else {
            const instrumentKey = getKeyForKeyboardKey(keyboard, key);
            if (instrumentKey) {
                if (!rewindStarted) {
                    // Don't allow key presses during the rewind
                    pressKey(instrumentKey.index, instrumentKey.noteId, isRepeat);
                }

                handled = true;
            }
        }
    }

    // code to enable practice mode. 
    if (!handled && (ctx.keyPressState || ctx.keyReleaseState || ctx.blurredState)) {
        if (ctx.keyPressState && !ctx.keyPressState.isRepeat) {
            if (ctx.keyPressState.key === "Backspace") {
                if (s.practiceMode.enabled) {
                    // gamplayPracticeModeRewind(ctx, gameplayState, measureBeat);

                    const practiceMode = s.practiceMode;
                    const nextMeasureIdxPrev = practiceMode.nextMeasureIdx
                    const measureToRewindTo = arrayAt(s.measures, nextMeasureIdxPrev - 2);
                    const measureBeat = measureToRewindTo ? measureToRewindTo.start : 0;
                    practiceMode.nextMeasureIdx = nextMeasureIdxPrev;

                    practiceMode.rewindAnimation.started = true;
                    practiceMode.rewindAnimation.t = 0;
                    practiceMode.rewindAnimation.targetCursorBeats = measureBeat;

                } else {
                    s.practiceMode.buttonHeld = true;
                    s.practiceMode.timerSeconds = 0;
                }
                handled = true;
            }
        } else {
            if (ctx.keyReleaseState?.key === "Backspace" || ctx.blurredState) {
                s.practiceMode.buttonHeld = false;
                handled = true;
            }
        }
    }

    return handled;
}

export function imGameplay(c: ImCache, ctx: GlobalContext) {
    const chart = ctx.sequencer._currentChart;
    const keyboard = ctx.keyboard;
    const gameplayState = ctx.gameplay;
    assert(!!gameplayState);

    const durationBeats = getChartDurationInBeats(chart);

    const progressPercent = max(100 * gameplayState.currentBeat / durationBeats, 0);

    if (gameplayState.currentBeat >= durationBeats) {
        if (gameplayState.practiceMode.enabled) {
            setViewChartSelect(ctx);
        } else {
            // finished. should switch views next frame.
            ctx.ui.playView.result = gameplayState;
        }
    }

    gameplayState.currentBeat = getSequencerPlaybackOrEditingCursor(ctx.sequencer);
    if (gameplayState.practiceMode.rewindAnimation.started) {
        gameplayState.currentBeatAnimated = gameplayState.practiceMode.rewindAnimation.animatedCursorBeats;
    } else {
        gameplayState.currentBeatAnimated = gameplayState.currentBeat; 
    }

    gameplayState.end = gameplayState.currentBeat + GAMEPLAY_BEATS_LOADAHEAD;
    gameplayState.endAnimated = gameplayState.currentBeatAnimated + GAMEPLAY_BEATS_VIEWPORT;

    gameplayState.dt = gameplayState.pauseMenu.isPaused ? 0 : im.getDeltaTimeSeconds(c);

    if (gameplayState.penaltyEnabled) {
        gameplayState.penaltyTimer += gameplayState.dt;
        if (gameplayState.penaltyTimer > PENALTY_QUANTIZATION_SECONDS) {
            gameplayState.penaltyTimer = 0;

            if (gameplayState.score > 0) {
                gameplayState.score--;
            }
        }

        // NOTE: There will never be a game mechanic that increases the penalty, should you hit a wrong note. 
        // This is because 'wrong' notes are just notes that the charter did not think to put in,
        // and adding them might actually make for a better performance, and I do not want to penalize this.
        // This does mean, however, that a player can get top score on the level by mashing every key down at once.
        // This is ok - they will not do this, because if they do, then they will not find the experience fun, 
        // and if they have an audience of any sort, they will find the performance dull and boring.
    }

    // Required so that we can process certain inputs
    const EXTRA_BEATS = 1 * FRACTIONAL_UNITS_PER_BEAT;
    getTimelineMusicNoteThreads(
        ctx.sequencer, 
        gameplayState.currentBeatAnimated - EXTRA_BEATS, gameplayState.end + EXTRA_BEATS,
        gameplayState.notesMap, gameplayState.commandsList
    );

    notesMapToKeysMap(ctx.keyboard, gameplayState.notesMap, gameplayState.keysMap);

    gameplayState.midpoint = Math.floor(gameplayState.keysMap.size / 2);

    const practiceMode = gameplayState.practiceMode;
    updatePracticeMode(ctx, gameplayState, chart);

    imui.Begin(c, COL); imui.Flex(c); imui.Align(c, STRETCH); imui.Justify(c); imui.Relative(c); {
        if (im.isFirstishRender(c)) {
            imdom.setStyle(c, "userSelect", "none");
        }

        const { size: rootContainerSize } = imdom.TrackSize(c);

        // We want to put the game inside a container that maintains it's aspect ratio, so that 
        // I can play this on my 4:3 screen as well.
        // It also means there are fewer edge-cases I need to account for r.e playfield sizes

        const wantedAspectRatio = 16 / 9;
        let currentAspectRatio = rootContainerSize.width / rootContainerSize.height;
        let widthReduction = 0, heightReduction = 0;
        if (currentAspectRatio > wantedAspectRatio) {
            let wantedWidth = rootContainerSize.height * wantedAspectRatio;
            let wantedWidthPercent = 100 * (wantedWidth / rootContainerSize.width);
            widthReduction = 100 - wantedWidthPercent;
        } else {
            let wantedHeight = rootContainerSize.width / wantedAspectRatio;
            let wantedHeightPercent = 100 * (wantedHeight / rootContainerSize.height);
            heightReduction = 100 - wantedHeightPercent;
        }

        // Curtains
        {
            // Top and bottom 
            {
                imui.Begin(c, BLOCK); imui.Justify(c); imui.Bg(c, cssVars.fg);
                imui.Absolute(c, 0, PX, 0, PX, (100 - heightReduction / 2), PERCENT, 0, PX); imui.End(c);

                imui.Begin(c, BLOCK); imui.Justify(c); imui.Bg(c, cssVars.fg);
                imui.Absolute(c, (100 - heightReduction / 2), PERCENT, 0, PX, 0, PX, 0, PX); imui.End(c);
            }

            // Left and right
            {
                imui.Begin(c, BLOCK); imui.Justify(c); imui.Bg(c, cssVars.fg);
                imui.Absolute(c, 0, PX, (100 - widthReduction / 2), PERCENT, 0, PX, 0, PX); imui.End(c);

                imui.Begin(c, BLOCK); imui.Justify(c); imui.Bg(c, cssVars.fg);
                imui.Absolute(c, 0, PX, 0, PX, 0, PX, (100 - widthReduction / 2), PERCENT); imui.End(c);
            }
        }

        imui.Begin(c, ROW); imui.Justify(c); 
        imui.Absolute(c, heightReduction / 2, PERCENT, widthReduction / 2, PERCENT, heightReduction / 2, PERCENT, widthReduction / 2, PERCENT); {
            let totalNumCols = 0;
            for (const row of ctx.keyboard.keys) {
                totalNumCols = Math.max(totalNumCols, row.length)
            }

            const { size: playfieldSize } = imdom.TrackSize(c);
            const dividerWidth = 2;
            const playfieldWidth = playfieldSize.width - (ctx.keyboard.keys.length * dividerWidth);
            // const letterWidth = playfieldWidth / ctx.keyboard.flatKeys.length;
            const letterWidth = playfieldWidth / (totalNumCols * 4);

            imui.Begin(c, COL); imui.Absolute(c, 0, PX, 0, PX, 0, NA, 0, PX); imui.ZIndex(c, 10); imui.Bg(c, `rgba(255, 255, 255, 0.4)`); {
                imui.Begin(c, ROW); imui.FontSizeCss(c, cssVars.mediumText); imui.NoWrap(c); {
                    // using runway doesn' look as nice.
                    const runway = PENALTY_QUANTIZATION_START_SECONDS + PENALTY_QUANTIZATION_SECONDS;
                    const amountPenalized01 = (gameplayState.penaltyTimer + PENALTY_QUANTIZATION_START_SECONDS) / PENALTY_QUANTIZATION_START_SECONDS;

                    const colours = im.GetInline(c, imGameplay) ?? im.Set(c, {
                        barColor: imui.newColor(0, 0, 0, 0),
                        textColor: imui.newColor(0, 0, 0, 0),
                    });

                    const theme = getCurrentTheme();
                    imui.lerpColor(theme.calm, theme.danger, amountPenalized01, colours.barColor);
                    colours.barColor.a = 0.5;
                    // imui.lerpColor(theme.bg, theme.fg, amountPenalized01, colours.textColor);
                    imui.lerpColor(theme.fg, theme.fg, amountPenalized01, colours.textColor);

                    imui.Begin(c, BLOCK); imui.ZIndex(c, -1); {
                        // imui.Absolute(c, 0, PX, amountPenalized01 * 50, PERCENT, 0, PX, amountPenalized01 * 50, PERCENT);
                        imui.Absolute(c, 0, PX, 0, PX, 0, NA, 0, PX);
                        imui.Size(c, 0, NA, 2, EM);

                        if (im.isFirstishRender(c)) {
                            imdom.setStyle(c, "background", "rgba(0, 0, 0, 0");
                        }
                        if (im.Memo(c, amountPenalized01)) {
                            const c1 = colours.barColor;
                            const c2 = `rgba(255, 255, 255, 0)`;
                            imdom.setStyle(c, "background", `linear-gradient(180deg,${c1} 0%, ${c2} 100%)`);
                        }

                        // imui.Bg(c, colours.barColor.toString());
                    } imui.End(c);

                    imui.Begin(c, ROW); imui.Gap(c, 10, PX); imui.Flex(c); imui.Justify(c); imui.Fg(c, colours.textColor.toCssString()); {
                        imui.Begin(c, COL); imui.Align(c, START); imui.Flex(c); {
                            // TODO: font size should just fit horizontally
                            imui.Begin(c, ROW); imui.FontSize(c, 0.5, EM); {
                                im3DLookingText(c, chart.name);

                                if (im.If(c) && debugFlags.testGameplaySpeed !== 1) {
                                    im3DLookingText(c, "[TEST:" + debugFlags.testGameplaySpeed.toFixed(2) + "x]");
                                } im.IfEnd(c);
                            } imui.End(c);
                        } imui.End(c);

                        imui.Begin(c, ROW); imui.Relative(c); imui.Flex(c); {
                            let val;
                            const anim = practiceMode.rewindAnimation;
                            if (anim.started) {
                                val = " rewinding" + ".".repeat(Math.ceil(3 * practiceMode.rewindAnimation.rewindAmount));
                            } else if (gameplayState.practiceMode.enabled) {
                                val = "practice mode - measure " + (practiceMode.nextMeasureIdx + 1);
                            } else if (gameplayState.practiceMode.buttonHeld) {
                                const remaining = PRACTICE_MODE_HOLD_TIME_SECONDS - gameplayState.practiceMode.timerSeconds;
                                val = "hold for practice mode in " + remaining.toFixed(1) + "s..."
                            } else {
                                val = gameplayState.score;
                            }

                            im3DLookingText(c, val);
                        } imui.End(c);

                        imui.Begin(c, ROW); imui.Flex(c); imui.Justify(c, END); {
                            if (im.If(c) && gameplayState.practiceMode.enabled) {
                                let measuresCount = 0;
                                for (const item of chart.timeline) {
                                    if (item.type === TIMELINE_ITEM_MEASURE) {
                                        measuresCount++;
                                    }
                                }

                                const requiredScore = practiceMode.scoreThisMeasure + practiceMode.maxScoreThisMeasure;
                                im3DLookingText(c, gameplayState.score + " / " + requiredScore);
                            } im.IfEnd(c);
                        } imui.End(c);
                    } imui.End(c);
                } imui.End(c);
            } imui.End(c);

            gameplayState.avoidPenalty = true;
            
            // imui.Begin(c, ROW); imui.Flex(c); imui.Align(c, STRETCH); imui.Justify(c); imui.Relative(c); {
            //     im.For(c); for (const instrumentKey of keyboard.flatKeys) {
            //         const isLeftmost = 
            //         imGameplayKeyLane(c, gameplayState, instrumentKey, letterWidth, isLeftmost);
            //     } im.ForEnd(c);
            // } imui.End(c);
            //

            imui.Begin(c, COL); {
                imui.Begin(c, ROW); imui.Flex(c); imui.Align(c, STRETCH); imui.Justify(c); imui.Relative(c); {
                    if (im.isFirstishRender(c)) imdom.setStyle(c, "overflow", "hidden");

                    im.For(c); 
                    for (let j = 0; j < totalNumCols; j++) {
                        for (let i = 0; i < 2; i++) {
                            const row = ctx.keyboard.keys[i];
                            if (j >= row.length) break;

                            const instrumentKey = row[j];
                            const isTopRowKey = i % 2 === 0;
                            imGameplayKeyLane(c, gameplayState, instrumentKey, letterWidth, isTopRowKey);
                        }
                    }
                    im.ForEnd(c);
                } imui.End(c);
                imui.Begin(c, ROW); imui.Flex(c); imui.Align(c, STRETCH); imui.Justify(c); imui.Relative(c); {
                    if (im.isFirstishRender(c)) imdom.setStyle(c, "overflow", "hidden");

                    im.For(c); 
                    for (let j = 0; j < totalNumCols; j++) {
                        for (let i = 2; i < 4; i++) {
                            const row = ctx.keyboard.keys[i];
                            if (j >= row.length) break;

                            const instrumentKey = row[j];
                            const isTopRowKey = i % 2 === 0;
                            imGameplayKeyLane(c, gameplayState, instrumentKey, letterWidth, isTopRowKey);
                        }
                    }
                    im.ForEnd(c);
                } imui.End(c);
            } imui.End(c);

            // Can be set by multiple imGameplayKeyLane's
            if (gameplayState.avoidPenalty) {
                gameplayState.penaltyTimer = -PENALTY_QUANTIZATION_START_SECONDS;
            }

            imui.Begin(c, BLOCK); imui.Size(c, 0, NA, 10, PX); imui.Relative(c); {
                imui.Begin(c, BLOCK); imui.Absolute(c, 0, PX, (100 - progressPercent), PERCENT, 0, PX, 0, PX); imui.Bg(c, cssVars.fg); {
                } imui.End(c);
            } imui.End(c);
        } imui.End(c);
    } imui.End(c);

    if (im.If(c) && gameplayState.pauseMenu.isPaused) {
        // Pause menu

        imui.Begin(c, COL); imui.Align(c); imui.Justify(c); imui.Absolute(c, 0, PX, 0, PX, 0, PX, 0, PX); imui.Bg(c, `rgba(0,0,0, 0.4`); imui.ZIndex(c, 100); {
            if (im.isFirstishRender(c)) {
                imdom.setStyle(c, "fontSize", "3em");
            }

            imui.Begin(c, BLOCK); {
                im3DLookingText(c, "Paused");
            } imui.End(c);


            let uiIdx = 0;
            if (imPauseMenuButton(c, ctx, gameplayState, uiIdx, "Resume")) {
                setPausedState(ctx, gameplayState, false);
            }

            uiIdx++;
            if (imPauseMenuButton(c, ctx, gameplayState, uiIdx, "Quit")) {
                if (ctx.ui.playView.isTesting) {
                    setViewEditChart(ctx);
                } else {
                    setViewChartSelect(ctx);
                }
            }
        } imui.End(c);

        if (!ctx.handled) {
            if (ctx.keyPressState) {
                const listNavAxis = ctx.keyPressState.listNavAxis;
                gameplayState.pauseMenu.idx = clamp(gameplayState.pauseMenu.idx + listNavAxis, 0, 1);
                ctx.handled = true;
            }
        }
    } im.IfEnd(c);

    if (!ctx.handled) {
        ctx.handled = handleGameplayKeyDown(ctx, gameplayState);
    }
}

function imPauseMenuButton(
    c: ImCache,
    ctx: GlobalContext,
    gameplayState: GameplayState,
    uiIdx: number,
    text: string
): boolean {
    let result = false;
    imui.Begin(c, ROW); {
        const isSelected = uiIdx === gameplayState.pauseMenu.idx;

        const hasMouseOver = imdom.hasMouseOver(c);
        if (im.Memo(c, hasMouseOver) && hasMouseOver) {
            gameplayState.pauseMenu.idx = uiIdx;
        }

        if (im.If(c) && isSelected) {
            // The Inter font we're using for this game has a ligature that converts -> into a legit arrow character. 
            // Pretty crazy
            imui.Begin(c, BLOCK); imdom.Str(c, "->"); imui.End(c);

            if (!ctx.handled && ctx.keyPressState?.key === "Enter") {
                result = true;
                ctx.handled = true;
            }
        } im.IfEnd(c);

        if (imButtonIsClicked(c, text)) {
            result = true;
        }
    } imui.End(c);

    return result;
}

function imLetter(
    c: ImCache,
    gameplay: GameplayState,
    instrumentKey: InstrumentKey,
    thread: NoteItem[],
    signal: number,
    letterColor: CssColor | null,
    width: number,
    isTopRowKey: boolean,
) {
    let s; s = im.GetInline(c, imLetter) ?? im.Set(c, {
        textColor: imui.newColor(0, 0, 0, 1),
        bgColor: imui.newColor(0, 0, 0, 1),
    });

    const theme = getCurrentTheme();

    let next: NoteItem | undefined;
    if (thread.length > 0) {
        for (let i = 0; i < thread.length; i++) {
            const item = thread[i];
            if (item.start + item.length >= gameplay.currentBeat) {
                next = item;
                break;
            }
        }
    }

    let distanceToNextNoteNormalized = 1;
    if (next) {
        distanceToNextNoteNormalized = (next.start - gameplay.currentBeat) / SIGNAL_LOOKAHEAD_BEATS;

        if (distanceToNextNoteNormalized > 1) {
            distanceToNextNoteNormalized = 1;
        } else if (distanceToNextNoteNormalized < 0) {
            if (isBeatWithinInclusve(next, gameplay.currentBeat)) {
                distanceToNextNoteNormalized = 0;
            } else {
                distanceToNextNoteNormalized = 1;
            }
        }
    }

    imui.lerpColor(theme.fg, theme.bg2, clamp(distanceToNextNoteNormalized, 0, 1), s.textColor);

    s.bgColor = letterColor ?? theme.bg;

    imui.Begin(c, COL); imui.Size(c, width, PX, 0, NA); imui.FontSize(c, Math.floor(width * 0.55), PX); imui.Align(c); imui.Justify(c); imui.ZIndex(c, 10); {
        imui.Bg(c, s.bgColor.toString());
        imui.Fg(c, s.textColor.toString());

        const raisedHeight = 20;
        const raisedUnit = PX;

        if (im.If(c) && !isTopRowKey) {
            imui.Begin(c, BLOCK); imui.Size(c, 0, NA, raisedHeight, raisedUnit); imui.End(c);
        } im.IfEnd(c);

        imui.Begin(c, BLOCK); {
            if (im.isFirstishRender(c)) {
                imdom.setStyle(c, "fontSize", "2em");
                imdom.setStyle(c, "height", "1.3em");
            }

            imdom.ElBegin(c, el.B); {
                imdom.Str(c, instrumentKey ? instrumentKey.text : "?");
            } imdom.ElEnd(c, el.B);
        } imui.End(c);

        if (im.If(c) && isTopRowKey) {
            imui.Begin(c, BLOCK); imui.Size(c, 0, NA, raisedHeight, raisedUnit); imui.End(c);
        } im.IfEnd(c);
    } imui.End(c);
}

function im3DLookingText(c: ImCache, value: Stringifyable) {
    imui.Begin(c, ROW); imui.Flex(c); imui.Justify(c); imui.Relative(c); {
        imui.Begin(c, ROW); imui.Flex(c); imui.Justify(c); imui.Absolute(c, 3, PX, 0, PX, 0, PX, 3, PX); {
            imui.Fg(c, cssVars.bg);
            imdom.Str(c, value);
        } imui.End(c);
        imui.Begin(c, ROW); imui.Flex(c); imui.Justify(c); imui.ZIndex(c, 2); {
            imui.Fg(c, cssVars.fg2);
            imdom.Str(c, value);
        } imui.End(c);
    } imui.End(c);
}

// TODO: I want to be able to press such that I can miss exactly half of the same note:
//
// [======|======|======|======|======|======|======|======] 
//   hit    miss   hit    miss    hit   miss   hit    miss
//
// Right now, this function isn't counting the final miss. 
// Sure it will never happen in gameplay, but the fact that our simple and straightforward
// code isn't emergently handling this naturally is actually a sign that it is wrong somehow.
//
// It's good enough for most gameplay, because it will correctly count all hits
// and all misses on a single note without overcounting or undercounting, so I will fix this 
// toggling mecahnic edge case later. There are far more important things to be coding
function updateCurrentItemScore(
    gameplayState: GameplayState,
    keyState: GameplayKeyState,
    item: NoteItem,
) {
    const currentBeat = gameplayState.currentBeat;
    const beatWithinItem = isBeatWithinInclusve(item, currentBeat);

    // Pressing a note works by establishing a grid on an individual note,
    // and awarding score just once for every time we have the key pressed down
    // in a particular quantization:
    //
    //   note start     quantization                         note end
    //        v           v                                       v
    //        [===========|===========|===========|===========|===]
    //              0          1            2          3        4  <--- Even though this last one is smaller, it's still awarder 1 score
    //                    q0          q1          q2         q3   q4
    //
    //   |         |         | <-- actual timeline beats might not be snapped to the note

    if (beatWithinItem) {
        let itemChanged = false;
        const finishedLastItem = keyState.lastPressedItem === null || keyState.keyReleasedAtLeastOnce;
        if (keyState.lastPressedItem !== item && finishedLastItem) {
            keyState.lastPressedItem = item;
            keyState.lastItemScore = 0;
            keyState.lastItemScoreMissed = 0;

            keyState.keyReleasedAtLeastOnce = false;

            itemChanged = true;
        }

        if (itemChanged) {
            keyState.lastPressedBeatQuantized = item.start;
        } else if (keyState.keyPressedThisFrame) {
            // Allow releasing and pressing on the same note,
            // without actually counting score from last to this.
            keyState.lastPressedBeatQuantized = Math.max(keyState.lastPressedBeatQuantized, currentBeat);
        }

        if (!keyState.keyHeld) {
            // We should be holding rn.
            gameplayState.avoidPenalty = false;
        }
    }

    if (keyState.keyHeld) {
        while (keyState.lastPressedBeatQuantized < currentBeat) {
            if (!isBeatWithinExclusive(item, keyState.lastPressedBeatQuantized)) {
                // Only quantized beats inside the note can be hit
                break;
            }

            keyState.lastPressedBeatQuantized += SCOREABLE_BEAT_QUANTIZATION;
            gameplayState.score++;
            keyState.lastItemScore++;
        }
    } else {
        while (
            keyState.lastPressedBeatQuantized + SCOREABLE_BEAT_QUANTIZATION 
                < currentBeat
        ) {
            if (!isBeatWithinExclusive(item, keyState.lastPressedBeatQuantized)) {
                // Only quantized beats inside the note can be missed.
                break;
            }

            keyState.lastPressedBeatQuantized += SCOREABLE_BEAT_QUANTIZATION;
            gameplayState.scoreMissed++;
            keyState.lastItemScoreMissed++;
        }
    }
}

function gamplayPracticeModeRewind(
    ctx: GlobalContext,
    gameplayState: GameplayState,
    toBeats: number
) {
    // TODO: fix bug - the offset we end up at is not quite right, but it is close enough for now.
    const chart = ctx.sequencer._currentChart;
    const newTime  = getTimeForBeats(chart, toBeats);
    const timeOffset = getTimeForBeats(chart, ctx.sequencer.startBeats);
    setPlaybackTime(newTime - timeOffset);

    gameplayState.practiceMode.rewindAnimation.started = false;
    gameplayState.score = gameplayState.practiceMode.scoreThisMeasure;
    gameplayState.scoreMissed = gameplayState.practiceMode.scoreMissedThisMeasure;
    gameplayState.penaltyEnabled = false;
    for (const keyState of gameplayState.keyState) {
        keyState.lastPressedItem = null;
        keyState.lastItemScore = 0;
        keyState.lastItemScoreMissed = 0;

        // I'd rather not set this here- feels like this should naturally just work
        // because we're clearing out the lastPressedItem field, but it doesn't work,
        // and I can't be bothered figuring it out right now. 
        // TODO (low priority): debug why it doesn't work to just remove this line
        keyState.lastPressedBeatQuantized = -1;
    }
}

const PRACTICE_MODE_HOLD_TIME_SECONDS = 1;

export function enablePracticeMode(s: GameplayState) {
    s.practiceMode.enabled = true;
}

function updatePracticeMode(
    ctx: GlobalContext,
    gameplayState: GameplayState,
    chart: SequencerChart,
) {
    const practiceMode = gameplayState.practiceMode;
    if (!practiceMode.enabled) {
        if (practiceMode.buttonHeld) {
            if (practiceMode.timerSeconds > PRACTICE_MODE_HOLD_TIME_SECONDS) {
                // this is just the first rewind. Afterwards,
                // we rewind automatically whenever we didn't score enough in a measure.
                enablePracticeMode(gameplayState);

                // TODO: this code should also invoke the animation

                const measureToRewindTo = arrayAt(gameplayState.measures, gameplayState.practiceMode.nextMeasureIdx - 1);
                const measureBeat = measureToRewindTo ? measureToRewindTo.start : 0;
                gamplayPracticeModeRewind(ctx, gameplayState, measureBeat);
            }
            practiceMode.timerSeconds += ctx.deltaTime;
        }
    }

    if (practiceMode.rewindAnimation.started) {

        const anim = practiceMode.rewindAnimation;
        let t0 = 0, t1 = 0;

        anim.rewindAmount = 0;

        const rewindDurationSeconds = 0.4;
        t0 = t1; t1 += rewindDurationSeconds;

        anim.animatedCursorBeats = gameplayState.currentBeat;
        if (t0 <= anim.t && anim.t <= t1) {
            const t = inverseLerp2(t0, anim.t, t1);
            anim.animatedCursorBeats = lerp(gameplayState.currentBeat, anim.targetCursorBeats, t);
            anim.rewindAmount = t;
        }

        if (anim.t > t1) {
            anim.started = false;
            gamplayPracticeModeRewind(ctx, gameplayState, anim.targetCursorBeats);
        }

        anim.t += ctx.deltaTime;
    } else {

        // Compute current measure:
        // |         |         |      |           |   |             |
        // ^         ^                                     ^             ^
        // start    measure 0                       final measure       end of chart
        //
        // The measures are actual timeline items, whic doesn't include the start and end of the chart,
        // so we'll need to account for those. 
        // This is also why practiceMode.nextMeasureIdx = measures.length;.

        const measures = gameplayState.measures;
        let nextMeasureIdx = measures.length;;
        for (let i = 0; i < measures.length; i++) {
            const measure = measures[i];
            if (gameplayState.currentBeat < measure.start) {
                nextMeasureIdx = i;
                break;
            }
        }

        // Did it change? anything need to be done?
        // Sometimes we might rewind further. No action required, hence < instead of !==
        if (nextMeasureIdx !== practiceMode.nextMeasureIdx) {
            practiceMode.nextMeasureIdx = nextMeasureIdx;
            gameplayState.practiceMode.scoreThisMeasure = gameplayState.score;
            gameplayState.practiceMode.scoreMissedThisMeasure = gameplayState.scoreMissed;
        }

        const thisMeasure = arrayAt(measures, practiceMode.nextMeasureIdx - 1);
        const nextMeasure = arrayAt(measures, practiceMode.nextMeasureIdx);
        let thisMeasureBeat = thisMeasure ? thisMeasure.start : 0;
        let nextMeasureBeat = nextMeasure ? nextMeasure.start : getChartDurationInBeats(chart);

        practiceMode.maxScoreThisMeasure = getBestPossibleScore(chart, thisMeasureBeat, nextMeasureBeat);
    }
}

function imGameplayKeyLane(
    c: ImCache,
    gameplayState: GameplayState,
    instrumentKey: InstrumentKey,
    laneWidth: number,
    isTopRowKey: boolean,
) {
    const thread = gameplayState.keysMap.get(instrumentKey)?._items;
    assert(!!thread);

    const sGameplay = gameplayState;

    const keyIdx = instrumentKey.index;
    const keyState = gameplayState.keyState[keyIdx];
    assert(!!keyState);

    const keySignal = isKeyPressed(instrumentKey.index);
    let keyGain = getCurrentOscillatorGainForOwner(instrumentKey.index, 0);

    if (!gameplayState.pauseMenu.isPaused) {
        // Handle input for this lane

        keyState.keyPressedThisFrame = false;
        keyState.keyReleasedThisFrame = false;
        if (keySignal && !keyState.keyHeld) {
            keyState.keyPressedThisFrame = true;
            keyState.keyHeld = true;
        } else if (!keySignal && keyState.keyHeld) {
            keyState.keyHeld = false;
            keyState.keyReleasedAtLeastOnce = true;
            keyState.keyReleasedThisFrame = true;
        }

        if (keyState.keyHeld) {
            // Enable the penalty mechanic, only after we press any key at least once.
            gameplayState.penaltyEnabled = true;
        }
    }


    // Vertical note
    const s = im.State(c, newVerticalNoteThreadState);

    const theme = getCurrentTheme();
    imui.copyColor(theme.bg, s.currentBgColor);

    imui.Begin(c, COL); imui.Align(c, STRETCH); imui.Justify(c, START); {
        imui.Begin(c, BLOCK); imui.Size(c, 100, PERCENT, 2, PX); imui.Bg(c, cssVarsApp.fg); {
        } imui.End(c);

        imui.Begin(c, BLOCK); imui.Size(c, 100, PERCENT, 0, NA); imui.Relative(c); imui.Flex(c); {
            im.For(c); for (let i = 0; i < thread.length; i++) {
                const item = thread[i];
                const s = im.State(c, newBarState);
                const currentBeatInItem = isBeatWithinInclusve(item, gameplayState.currentBeatAnimated);

                if (item.type !== TIMELINE_ITEM_NOTE) continue;

                updateCurrentItemScore(gameplayState, keyState, item);

                let heightPercent = 100 * item.length / GAMEPLAY_BEATS_VIEWPORT;
                let bottomPercent = 100 * inverseLerp(item.start, gameplayState.currentBeatAnimated, sGameplay.endAnimated);
                if (bottomPercent <= 0) {
                    // the bar is below the thing. 
                    heightPercent += bottomPercent;
                    if (heightPercent < 0) heightPercent = 0;
                    bottomPercent = 0;
                }

                const dt = gameplayState.dt;
                if (currentBeatInItem && !keyState.keyHeld) {
                    // give user an indication that they should care about the fact that this bar has reached the bottom.
                    // hopefully they'll see the keyboard letter just below it, and try pressing it.
                    s.animation += dt;
                    if (s.animation > 1) {
                        s.animation = 0;
                    }
                } else {
                    s.animation = 0;
                }


                let color;
                if (s.animation > 0.5) {
                    color = theme.unhit.toCssString();
                } else {
                    color = cssVarsApp.fg;
                }

                imui.Begin(c, BLOCK); imui.Absolute(c, 0, NA, 0, PX, bottomPercent, PERCENT, 0, PX); imui.Size(c, 0, NA, heightPercent, PERCENT); {
                    if (im.isFirstishRender(c)) {
                        imdom.setStyle(c, "color", "transparent");
                    }

                    imui.Begin(c, BLOCK); imui.Size(c, 100, PERCENT, 100, PERCENT); imui.Relative(c); imui.Bg(c, cssVarsApp.fg); {
                        imui.Begin(c, BLOCK); imui.Absolute(c, 2, PX, 2, PX, 2, PX, 2, PX); imui.Bg(c, color); {
                        } imui.End(c);
                    } imui.End(c);
                } imui.End(c);
            } im.ForEnd(c);

            im.For(c); for (const measure of gameplayState.measures) {
                let bottomPercent = 100 * inverseLerp2(gameplayState.currentBeatAnimated, measure.start, gameplayState.endAnimated);
                if (bottomPercent > 100) continue;
                if (bottomPercent < -5) continue;

                imui.Begin(c, BLOCK); imui.Absolute(c, 0, NA, 0, PX, bottomPercent, PERCENT, 0, PX); imui.Size(c, 0, NA, 2, PX);
                imui.Bg(c, cssVars.mg); {
                } imui.End(c);
            } im.ForEnd(c);
        } imui.End(c);

        imui.Begin(c, BLOCK); imui.Size(c, 0, NA, 2, PX); {
            if (im.isFirstishRender(c)) {
                imdom.setStyle(c, "backgroundColor", cssVarsApp.fg);
            }
        } imui.End(c);


        let letterColor;
        if (keyState.keyHeld && keyState.lastPressedItem && !keyState.keyReleasedAtLeastOnce) {
            const itemBestPossibleScore = getBestPossibleScoreForNote(keyState.lastPressedItem);
            const progress = (keyState.lastItemScore / itemBestPossibleScore);
            if (progress < 0.4) letterColor = theme.lowHit;
            else if (progress < 0.95) letterColor = theme.mediumHit;
            else letterColor = theme.fullyHit;
        } else {
            if (keyState.keyHeld) {
                letterColor = theme.unhit;
            } else {
                letterColor = null;
            }
        }

        imLetter(c, gameplayState, instrumentKey, thread, keyGain, letterColor, laneWidth, isTopRowKey);
    } imui.End(c);
}
