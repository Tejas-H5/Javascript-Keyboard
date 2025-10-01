import { BLOCK, COL, imAbsolute, imAlign, imBg, imFg, imFlex, imGap, imJustify, imLayout, imLayoutEnd, imRelative, imSize, imZIndex, INLINE, NA, PERCENT, PX, ROW, START, STRETCH } from "src/components/core/layout";
import { cn, cssVars } from "src/components/core/stylesheets";
import { imLine, LINE_HORIZONTAL, LINE_VERTICAL } from "src/components/im-line";
import { debugFlags } from "src/debug-flags";
import { getCurrentOscillatorGainForOwner, isKeyPressed, pressKey, setScheduledPlaybackTime } from "src/dsp/dsp-loop-interface";
import {
    getKeyForKeyboardKey,
    InstrumentKey,
    KeyboardState
} from "src/state/keyboard-state";
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
} from "src/state/sequencer-chart";
import {
    getSequencerPlaybackOrEditingCursor,
    getTimelineMusicNoteThreads,
    NoteMapEntry
} from "src/state/sequencer-state";
import { arrayAt } from "src/utils/array-utils";
import { assert } from "src/utils/assert";
import { copyColor, CssColor, lerpColor, newColor } from "src/utils/colour";
import { getDeltaTimeSeconds, ImCache, imEndFor, imEndIf, imFor, imForEnd, imGet, imGetInline, imIf, imIfEnd, imMemo, imSet, imState, isFirstishRender } from "src/utils/im-core";
import { EL_B, elSetClass, elSetStyle, imEl, imElEnd, imStr, Stringifyable } from "src/utils/im-dom";
import { clamp, inverseLerp, inverseLerp2, lerp, max } from "src/utils/math-utils";
import { GlobalContext, setViewChartSelect } from "./app";
import { cssVarsApp, getCurrentTheme } from "./styling";

const SIGNAL_LOOKAHEAD_BEATS   = 1 * FRACTIONAL_UNITS_PER_BEAT;
const GAMEPLAY_LOOKAHEAD_BEATS = 3 * FRACTIONAL_UNITS_PER_BEAT;
const GAMEPLAY_LOADAHEAD_BEATS = 6 * FRACTIONAL_UNITS_PER_BEAT;

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
        currentBgColor: newColor(0, 0, 0, 1),
    };
}

export type GameplayState = {
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
    };
}

function handleGameplayKeyDown(ctx: GlobalContext, gameplayState: GameplayState): boolean {
    let result = false;

    const rewindStarted = gameplayState.practiceMode.rewindAnimation.started;

    if (ctx.keyPressState)  {
        const { key, isRepeat } = ctx.keyPressState;
        const { keyboard } = ctx;

        if (key === "Escape") {
            setViewChartSelect(ctx);
            result = true;
        } else {
            const instrumentKey = getKeyForKeyboardKey(keyboard, key);
            if (instrumentKey) {
                if (!rewindStarted) {
                    // Don't allow key presses during the rewind
                    pressKey(instrumentKey.index, instrumentKey.noteId, isRepeat);
                }

                result = true;
            }
        }
    }

    // code to enable practice mode. 
    if (!result && (ctx.keyPressState || ctx.keyReleaseState || ctx.blurredState)) {
        if (ctx.keyPressState && !ctx.keyPressState.isRepeat) {
            if (ctx.keyPressState.key === "Backspace") {
                if (gameplayState.practiceMode.enabled) {
                    // gamplayPracticeModeRewind(ctx, gameplayState, measureBeat);

                    const practiceMode = gameplayState.practiceMode;
                    const nextMeasureIdxPrev = practiceMode.nextMeasureIdx
                    const measureToRewindTo = arrayAt(gameplayState.measures, nextMeasureIdxPrev - 2);
                    const measureBeat = measureToRewindTo ? measureToRewindTo.start : 0;
                    practiceMode.nextMeasureIdx = nextMeasureIdxPrev;

                    practiceMode.rewindAnimation.started = true;
                    practiceMode.rewindAnimation.t = 0;
                    practiceMode.rewindAnimation.targetCursorBeats = measureBeat;

                } else {
                    gameplayState.practiceMode.buttonHeld = true;
                    gameplayState.practiceMode.timerSeconds = 0;
                }
                result = true;
            }
        } else {
            if (ctx.keyReleaseState?.key === "Backspace" || ctx.blurredState) {
                gameplayState.practiceMode.buttonHeld = false;
                result = true;
            }
        }
    }

    return result;
}

export function imGameplay(c: ImCache, ctx: GlobalContext) {
    const chart = ctx.sequencer._currentChart;
    const keyboard = ctx.keyboard;

    const chartChanged = imMemo(c, chart);

    let gameplayState = imGet(c, newGameplayState);
    if (!gameplayState || chartChanged) {
        gameplayState = imSet(c, newGameplayState(ctx.keyboard, chart));
    }

    const durationBeats = getChartDurationInBeats(chart);
    const progressPercent = Math.round(max(100 * gameplayState.currentBeat / durationBeats, 0));
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

    gameplayState.end = gameplayState.currentBeat + GAMEPLAY_LOADAHEAD_BEATS;
    gameplayState.endAnimated = gameplayState.currentBeatAnimated + GAMEPLAY_LOOKAHEAD_BEATS;

    const dt = getDeltaTimeSeconds(c);

    if (gameplayState.penaltyEnabled) {
        gameplayState.penaltyTimer += dt;
        if (gameplayState.penaltyTimer > PENALTY_QUANTIZATION_SECONDS) {
            gameplayState.penaltyTimer = 0;

            if (gameplayState.score > 0) {
                gameplayState.score--;
            }
        }
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

    if (!ctx.handled) {
        ctx.handled = handleGameplayKeyDown(ctx, gameplayState);
    }

    const practiceMode = gameplayState.practiceMode;
    updatePracticeMode(ctx, gameplayState, chart);

    imLayout(c, COL); imFlex(c); imJustify(c); {
        imLayout(c, ROW); imRelative(c); imZIndex(c, 10); {
            if (isFirstishRender(c)) {
                elSetClass(c, cn.mediumFont);
                elSetClass(c, cn.noWrap);
            }

            // using runway doesn' look as nice.
            const runway = PENALTY_QUANTIZATION_START_SECONDS + PENALTY_QUANTIZATION_SECONDS;
            const amountPenalized01 = (gameplayState.penaltyTimer + PENALTY_QUANTIZATION_START_SECONDS) / PENALTY_QUANTIZATION_START_SECONDS;

            const colours = imGetInline(c, imGameplay) ?? imSet(c, { 
                barColor: newColor(0, 0, 0, 0),
                textColor: newColor(0, 0, 0, 0),
            });

            const theme = getCurrentTheme();
            lerpColor(theme.calm, theme.danger, amountPenalized01, colours.barColor);
            lerpColor(theme.bg, theme.fg, amountPenalized01, colours.textColor);

            imLayout(c, BLOCK); imZIndex(c, -1); {
                imAbsolute(c, 0, PX, amountPenalized01 * 50, PERCENT, 0, PX, amountPenalized01 * 50, PERCENT);
                imBg(c, colours.barColor.toString());
            } imLayoutEnd(c);

            imLayout(c, ROW); imGap(c, 10, PX); imFlex(c); imJustify(c); imFg(c, colours.textColor.toCssString()); {
                imLayout(c, ROW); imFlex(c); imJustify(c); {
                    imStr(c, chart.name);

                    if (imIf(c) && debugFlags.testGameplaySlow) {
                        imStr(c, "[TEST:Slow]");
                    } imIfEnd(c);
                } imLayoutEnd(c);

                imLayout(c, ROW); imFlex(c); imJustify(c); imRelative(c); {
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
                } imLayoutEnd(c);

                imLayout(c, ROW); imFlex(c); imJustify(c); {
                    if (imIf(c) && gameplayState.practiceMode.enabled) {
                        let measuresCount = 0;
                        for (const item of chart.timeline) {
                            if (item.type === TIMELINE_ITEM_MEASURE) {
                                measuresCount++;
                            }
                        }

                        imLayout(c, INLINE); {
                            imStr(c, gameplayState.score);
                        } imLayoutEnd(c);

                        imStr(c, " / ");

                        const requiredScore = practiceMode.scoreThisMeasure + practiceMode.maxScoreThisMeasure;
                        imStr(c, requiredScore);

                        imStr(c, " | ");
                    } imIfEnd(c);

                    imStr(c, progressPercent); imStr(c, "%");
                } imLayoutEnd(c);
            } imLayoutEnd(c);
        } imLayoutEnd(c);

        imLine(c, LINE_HORIZONTAL, 1);

        imLayout(c, ROW); imFlex(c); imAlign(c, STRETCH); imJustify(c); imRelative(c); {
            gameplayState.avoidPenalty = true;

            imFor(c); for (let rowIdx = 0; rowIdx < keyboard.keys.length; rowIdx++) {
                const row = keyboard.keys[rowIdx];
                imFor(c); for (let keyRowIdx = 0; keyRowIdx < row.length; keyRowIdx++) {
                    const instrumentKey = row[keyRowIdx];

                    const thread = gameplayState.keysMap.get(instrumentKey)?._items;
                    assert(!!thread);

                    const sGameplay = gameplayState;

                    const keyIdx = instrumentKey.index;
                    const keyState = gameplayState.keyState[keyIdx];
                    assert(!!keyState);

                    const keySignal = isKeyPressed(instrumentKey.index);
                    let keyGain = getCurrentOscillatorGainForOwner(instrumentKey.index, 0);

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


                    // Vertical note
                    {
                        const s = imState(c, newVerticalNoteThreadState);


                        const theme = getCurrentTheme();

                        copyColor(theme.bg, s.currentBgColor);

                        if (imIf(c) && instrumentKey.isLeftmost) {
                            imLayout(c, BLOCK); imSize(c, 2, PX, 0, NA); imBg(c, cssVarsApp.fg); imLayoutEnd(c);
                        } imEndIf(c);

                        imLayout(c, COL); imAlign(c, STRETCH); imJustify(c, START); {
                            imLayout(c, BLOCK); imSize(c, 100, PERCENT, 2, PX); imBg(c, cssVarsApp.fg); {
                            } imLayoutEnd(c);

                            imLayout(c, BLOCK); imSize(c, 100, PERCENT, 0, NA); imRelative(c); imFlex(c); {
                                imFor(c); for (let i = 0; i < thread.length; i++) {
                                    const item = thread[i];
                                    const s = imState(c, newBarState);
                                    const currentBeatInItem = isBeatWithinInclusve(item, gameplayState.currentBeatAnimated);

                                    if (item.type !== TIMELINE_ITEM_NOTE) continue;

                                    updateCurrentItemScore(gameplayState, keyState, item);

                                    let heightPercent = 100 * item.length / GAMEPLAY_LOOKAHEAD_BEATS;
                                    let bottomPercent = 100 * inverseLerp(item.start, gameplayState.currentBeatAnimated, sGameplay.endAnimated);
                                    if (bottomPercent <= 0) {
                                        // the bar is below the thing. 
                                        heightPercent += bottomPercent;
                                        if (heightPercent < 0) heightPercent = 0;
                                        bottomPercent = 0;
                                    }

                                    const dt = getDeltaTimeSeconds(c);
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

                                    imLayout(c, BLOCK); imAbsolute(c, 0, NA, 0, PX, bottomPercent, PERCENT, 0, PX); imSize(c, 0, NA, heightPercent, PERCENT); {
                                        if (isFirstishRender(c)) {
                                            elSetStyle(c, "color", "transparent");
                                        }

                                        imLayout(c, BLOCK); imSize(c, 100, PERCENT, 100, PERCENT); imRelative(c); imBg(c, cssVarsApp.fg); {
                                            imLayout(c, BLOCK); imAbsolute(c, 2, PX, 2, PX, 2, PX, 2, PX); imBg(c, color); {
                                            } imLayoutEnd(c);
                                        } imLayoutEnd(c);
                                    } imLayoutEnd(c);
                                } imEndFor(c);

                                imFor(c); for (const measure of gameplayState.measures) {
                                    let bottomPercent = 100 * inverseLerp2(gameplayState.currentBeatAnimated, measure.start, gameplayState.endAnimated);
                                    if (bottomPercent > 100) continue;
                                    if (bottomPercent < -5)   continue;

                                    imLayout(c, BLOCK); imAbsolute(c, 0, NA, 0, PX, bottomPercent, PERCENT, 0, PX); imSize(c, 0, NA, 5, PX);
                                    imBg(c, cssVars.mg); {
                                    } imLayoutEnd(c);
                                } imForEnd(c);
                            } imLayoutEnd(c);

                            imLayout(c, BLOCK); imSize(c, 0, NA, 2, PX); {
                                if (isFirstishRender(c)) {
                                    elSetStyle(c, "backgroundColor", cssVarsApp.fg);
                                }
                            } imLayoutEnd(c);


                            let letterColor;
                            if (keyState.keyHeld && keyState.lastPressedItem) {
                                const itemBestPossibleScore = getBestPossibleScoreForNote(keyState.lastPressedItem);
                                const progress = (keyState.lastItemScore / itemBestPossibleScore);
                                if (progress < 0.4)       letterColor = theme.unhit;
                                else if (progress < 0.95) letterColor = theme.mediumHit;
                                else                      letterColor = theme.fullyHit;
                            } else {
                                letterColor = null;
                            }

                            imLetter(c, gameplayState, instrumentKey, thread, keyGain, letterColor);
                        } imLayoutEnd(c);
                    }
                } imEndFor(c);
                imLine(c, LINE_VERTICAL, 2);
            } imEndFor(c);

            if (gameplayState.avoidPenalty) {
                gameplayState.penaltyTimer = -PENALTY_QUANTIZATION_START_SECONDS;
            }
        } imLayoutEnd(c);
    } imLayoutEnd(c);
}

function imLetter(
    c: ImCache,
    gameplay: GameplayState,
    instrumentKey: InstrumentKey,
    thread: NoteItem[],
    signal: number,
    letterColor: CssColor | null,
) {
    let s; s = imGetInline(c, imLetter) ?? imSet(c, {
        textColor: newColor(0, 0, 0, 1),
        bgColor: newColor(0, 0, 0, 1),
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

    lerpColor(theme.fg, theme.bg2, clamp(distanceToNextNoteNormalized, 0, 1), s.textColor);

    s.bgColor = letterColor ?? theme.bg;

    imLayout(c, COL); imSize(c, 40, PX, 0, NA); imAlign(c); imJustify(c); imZIndex(c, 10); {
        imBg(c, s.bgColor.toString());
        imFg(c, s.textColor.toString());

        imLayout(c, BLOCK); {
            if (isFirstishRender(c)) {
                elSetStyle(c, "fontSize", "2em");
                elSetStyle(c, "height", "1.3em");
            }

            imEl(c, EL_B); {
                imStr(c, instrumentKey ? instrumentKey.text : "?");
            } imElEnd(c, EL_B);
        } imLayoutEnd(c);
    } imLayoutEnd(c);
}

function im3DLookingText(c: ImCache, value: Stringifyable) {
    imLayout(c, ROW); imFlex(c); imJustify(c); imRelative(c); {
        imLayout(c, ROW); imFlex(c); imJustify(c); imAbsolute(c, 0, PX, 0, PX, 0, PX, 0, PX); {
            if (isFirstishRender(c)) {
                elSetStyle(c, "transform", "translate(3px, 3px)");
            }

            imFg(c, cssVars.bg);
            imStr(c, value);
        } imLayoutEnd(c);
        imLayout(c, ROW); imFlex(c); imJustify(c); imAbsolute(c, 0, PX, 0, PX, 0, PX, 0, PX); {
            imFg(c, cssVars.fg);
            imStr(c, value);
        } imLayoutEnd(c);
    } imLayoutEnd(c);
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
    const newTime  = getTimeForBeats(chart, toBeats + ctx.sequencer.startBeats);
    setScheduledPlaybackTime(newTime);

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

function updatePracticeMode(
    ctx: GlobalContext,
    gameplayState: GameplayState,
    chart: SequencerChart,
) {
    const practiceMode = gameplayState.practiceMode;
    if (!practiceMode.enabled) {
        if (practiceMode.buttonHeld) {
            if (practiceMode.timerSeconds > PRACTICE_MODE_HOLD_TIME_SECONDS) {
                practiceMode.enabled = true;
                // this is just the first rewind. Afterwards, 
                // we rewind automatically whenever we didn't score enough in a measure.

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
        let nextMeasureBeat = nextMeasure ? nextMeasure.start : measures[measures.length - 1].start;

        practiceMode.maxScoreThisMeasure = getBestPossibleScore(chart, thisMeasureBeat, nextMeasureBeat);
    }
}
