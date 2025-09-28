import { BLOCK, COL, imAbsolute, imAlign, imBg, imFg, imFlex, imGap, imJustify, imLayout, imLayoutEnd, imRelative, imSize, NA, PERCENT, PX, ROW, START, STRETCH } from "src/components/core/layout";
import { cn, cssVars } from "src/components/core/stylesheets";
import { imLine, LINE_HORIZONTAL, LINE_VERTICAL } from "src/components/im-line";
import { debugFlags } from "src/debug-flags";
import { getCurrentOscillatorGainForOwner, pressKey, setScheduledPlaybackTime } from "src/dsp/dsp-loop-interface";
import {
    getKeyForKeyboardKey,
    InstrumentKey,
    KeyboardState
} from "src/state/keyboard-state";
import {
    CommandItem,
    FRACTIONAL_UNITS_PER_BEAT,
    getChartDurationInBeats,
    getLastMeasureBeats,
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
    getCurrentPlayingBeats,
    getSequencerPlaybackOrEditingCursor,
    getTimelineMusicNoteThreads,
    NoteMapEntry
} from "src/state/sequencer-state";
import { arrayAt } from "src/utils/array-utils";
import { assert } from "src/utils/assert";
import { copyColor, lerpColor, newColor } from "src/utils/colour";
import { getDeltaTimeSeconds, ImCache, imEndFor, imEndIf, imFor, imGet, imGetInline, imIf, imIfElse, imIfEnd, imMemo, imSet, imState, isFirstishRender } from "src/utils/im-core";
import { EL_B, elSetClass, elSetStyle, imEl, imElEnd, imStr, Stringifyable } from "src/utils/im-dom";
import { clamp, inverseLerp, max } from "src/utils/math-utils";
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
const PENALTY_QUANTIZATION_START_SECONDS = 0.5;

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
    end: number;
    midpoint: number;
    notesMap: Map<number, NoteMapEntry>;
    commandsList: CommandItem[];

    keysMap: Map<InstrumentKey, KeysMapEntry>;
    keyState: GameplayKeyState[];

    penaltyTimer: number;
    avoidPenalty: boolean;

    // Don't want to trigger practice mode by accident - it wipes all progress.
    practiceMode: {
        enabled: boolean;
        buttonHeld: boolean;
        measures: TimelineItemMeasure[];

        scoreThisMeasure: number;
        scoreMissedThisMeasure: number;

        nextMeasureIdx: number;
        nextMeasureIdxLast: number;
        nextMeasureIdxLastStartBeat: number;
        timerSeconds: number;

        maxScoreThisMeasure: number;
    };

    score: number;
    scoreMissed: number;
    bestPossibleScore: number;
    chartName: string;
};

type GameplayKeyState = {
    keyHeld: boolean;
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
    const bestPossibleScore = getBestPossibleScore(chart, 0, chart.timeline.length - 1);

    return {
        score: 0,
        scoreMissed: 0,
        bestPossibleScore: bestPossibleScore,
        chartName: chart.name,

        currentBeat: 0,
        end: 0,
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

                lastPressedBeatQuantized: -1,
            };
        }),

        penaltyTimer: -PENALTY_QUANTIZATION_START_SECONDS,
        avoidPenalty: false,

        practiceMode: {
            enabled: !!debugFlags.testPracticeMode,
            buttonHeld: false,
            timerSeconds: 0,
            nextMeasureIdx: 0,
            nextMeasureIdxLast: 0,
            nextMeasureIdxLastStartBeat: 0,
            measures: measures,
            scoreThisMeasure: 0,
            scoreMissedThisMeasure: 0,

            maxScoreThisMeasure: 0,
        },
    };
}

function handleGameplayKeyDown(ctx: GlobalContext, gameplayState: GameplayState): boolean {
    let result = false;

    if (ctx.keyPressState)  {
        const { key, isRepeat } = ctx.keyPressState;
        const { keyboard } = ctx;

        if (key === "Escape") {
            setViewChartSelect(ctx);
            result = true;
        } else {
            const instrumentKey = getKeyForKeyboardKey(keyboard, key);
            if (instrumentKey) {
                pressKey(instrumentKey.index, instrumentKey.noteId, isRepeat);
                result = true;
            }
        }
    }

    // code to enable practice mode. 
    if (!result && (ctx.keyPressState || ctx.keyReleaseState || ctx.blurredState)) {
        if (ctx.keyPressState && !ctx.keyPressState.isRepeat) {
            if (ctx.keyPressState.key === "Backspace") {
                if (gameplayState.practiceMode.enabled) {
                    gamplayPracticeModeRewind(ctx, gameplayState, gameplayState.currentBeat);
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
    gameplayState.end = gameplayState.currentBeat + GAMEPLAY_LOADAHEAD_BEATS;

    const dt = getDeltaTimeSeconds(c);

    gameplayState.penaltyTimer += dt;
    if (gameplayState.penaltyTimer > PENALTY_QUANTIZATION_SECONDS) {
        gameplayState.penaltyTimer = 0;

        if (gameplayState.score > 0) {
            gameplayState.score--;
        }
    }

    // Required so that we can process certain inputs
    const EXTRA_BEATS = 1 * FRACTIONAL_UNITS_PER_BEAT;

    getTimelineMusicNoteThreads(
        ctx.sequencer, 
        gameplayState.currentBeat - EXTRA_BEATS, gameplayState.end + EXTRA_BEATS,
        gameplayState.notesMap, gameplayState.commandsList
    );

    notesMapToKeysMap(ctx.keyboard, gameplayState.notesMap, gameplayState.keysMap);

    gameplayState.midpoint = Math.floor(gameplayState.keysMap.size / 2);

    if (!ctx.handled) {
        ctx.handled = handleGameplayKeyDown(ctx, gameplayState);
    }

    const PRACTICE_MODE_HOLD_TIME_SECONDS = 1;

    const practiceMode = gameplayState.practiceMode;
    if (!practiceMode.enabled) {
        if (practiceMode.buttonHeld) {
            if (practiceMode.timerSeconds > PRACTICE_MODE_HOLD_TIME_SECONDS) {
                practiceMode.enabled = true;
                // this is just the first rewind. Afterwards, 
                // we rewind automatically whenever we didn't score enough in a measure.
                gamplayPracticeModeRewind(ctx, gameplayState, gameplayState.currentBeat);
            }
            practiceMode.timerSeconds += dt;
        }
    }

    updatePracticeMode(ctx, gameplayState, chart);

    imLayout(c, COL); imFlex(c); imJustify(c); {
        imLayout(c, ROW); imRelative(c); {
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

            imLayout(c, BLOCK); {
                if (isFirstishRender(c)) {
                    elSetStyle(c, "zIndex", "-1");
                }

                imAbsolute(c, 0, PX, amountPenalized01 * 50, PERCENT, 0, PX, amountPenalized01 * 50, PERCENT);
                imBg(c, colours.barColor.toString());
            } imLayoutEnd(c);

            imLayout(c, ROW); imGap(c, 10, PX); imFlex(c); imJustify(c); imFg(c, colours.textColor.toCssString()); {
                if (isFirstishRender(c)) {
                    elSetStyle(c, "zIndex", "1");
                }

                imLayout(c, ROW); imFlex(c); imJustify(c); {
                    imStr(c, chart.name);

                    if (imIf(c) && debugFlags.testGameplaySlow) {
                        imStr(c, "[TEST:Slow]");
                    } imIfEnd(c);
                } imLayoutEnd(c);

                imLayout(c, ROW); imFlex(c); imJustify(c); imRelative(c); {
                    let val;
                    if (gameplayState.practiceMode.enabled) {
                        val = "practice mode";
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

                        imStr(c, "Measure ")
                        imStr(c, practiceMode.nextMeasureIdx + 1); 

                        imStr(c, ": ");

                        imStr(c, gameplayState.score);
                        imStr(c, " / ");

                        const requiredScore = practiceMode.scoreThisMeasure + practiceMode.maxScoreThisMeasure;
                        imStr(c, requiredScore);
                        // imStr(c, " - ("); 
                        // imStr(c, practiceMode.scoreSinceThisMeasure);
                        // imStr(c, " + "); 
                        // imStr(c, practiceMode.scoreMissedSinceThisMeasure);
                        // imStr(c, ") /"); 
                        // imStr(c, practiceMode.maxScoreThisMeasure);
                    } else {
                        imIfElse(c);
                        imStr(c, progressPercent); imStr(c, "%");
                    } imIfEnd(c);
                } imLayoutEnd(c);
            } imLayoutEnd(c);
        } imLayoutEnd(c);

        imLine(c, LINE_HORIZONTAL, 1);

        imLayout(c, ROW); imFlex(c); imAlign(c, STRETCH); imJustify(c); {
            gameplayState.avoidPenalty = true;

            imFor(c); for (let rowIdx = 0; rowIdx < keyboard.keys.length; rowIdx++) {
            // imFor(c); for (let rowIdx = keyboard.keys.length - 1; rowIdx >= 0; rowIdx--) {) {
                const row = keyboard.keys[rowIdx];
                imFor(c); for (let keyRowIdx = 0; keyRowIdx < row.length; keyRowIdx++) {
                    const instrumentKey = row[keyRowIdx];

                    const thread = gameplayState.keysMap.get(instrumentKey)?._items;
                    assert(!!thread);

                    const sGameplay = gameplayState;

                    const keyIdx = instrumentKey.index;
                    const keyState = gameplayState.keyState[keyIdx];
                    assert(!!keyState);

                    // Vertical note
                    {
                        const s = imState(c, newVerticalNoteThreadState);

                        let keySignal = getCurrentOscillatorGainForOwner(instrumentKey.index, 0);

                        const theme = getCurrentTheme();

                        const backgroundColor = s.currentBgColor.toCssString();

                        copyColor(theme.bg, s.currentBgColor);

                        if (imIf(c) && instrumentKey.isLeftmost) {
                            imLayout(c, BLOCK); imSize(c, 2, PX, 0, NA); imBg(c, cssVarsApp.fg); imLayoutEnd(c);
                        } imEndIf(c);

                        imLayout(c, COL); imAlign(c, STRETCH); imJustify(c, START); {
                            imLetter(c, gameplayState, instrumentKey, thread, keySignal);

                            imLayout(c, BLOCK); imSize(c, 100, PERCENT, 2, PX); imBg(c, cssVarsApp.fg); {
                            } imLayoutEnd(c);

                            imLayout(c, BLOCK); imSize(c, 100, PERCENT, 0, NA); imRelative(c); imFlex(c); {
                                if (isFirstishRender(c)) {
                                    elSetStyle(c, "transition", "background-color 0.2s");
                                }

                                elSetStyle(c, "backgroundColor", backgroundColor);

                                imFor(c); for (let i = 0; i < thread.length; i++) {
                                    const item = thread[i];
                                    const currentBeat = sGameplay.currentBeat;

                                    const s = imState(c, newBarState);
                                    const currentBeatInItem = isBeatWithinInclusve(item, currentBeat);

                                    if (item.type !== TIMELINE_ITEM_NOTE) continue;

                                    updateCurrentItemScore(gameplayState, keyState, item, keySignal);

                                    const gameplayAreaEndBeat = currentBeat + GAMEPLAY_LOOKAHEAD_BEATS;
                                    let heightPercent = 100 * item.length / GAMEPLAY_LOOKAHEAD_BEATS;
                                    let bottomPercent = 100 * inverseLerp(item.start, currentBeat, gameplayAreaEndBeat);
                                    if (bottomPercent <= 0) {
                                        // the bar is below the thing. 
                                        heightPercent += bottomPercent;
                                        if (heightPercent < 0) heightPercent = 0;
                                        bottomPercent = 0;
                                    }

                                    const dt = getDeltaTimeSeconds(c);
                                    if (currentBeatInItem) {
                                        // give user an indication that they should care about the fact that this bar has reached the bottom.
                                        // hopefully they'll see the keyboard letter just below it, and try pressing it.
                                        s.animation += dt;
                                        if (s.animation > 1) {
                                            s.animation = 0;
                                        }
                                    } else {
                                        s.animation = 0;
                                    }

                                    let color = s.animation > 0.5 ? "#FFFF00" : cssVarsApp.fg;

                                    imLayout(c, BLOCK); imAbsolute(c, 0, NA, 0, PX, bottomPercent, PERCENT, 0, PX); imSize(c, 0, NA, heightPercent, PERCENT); {
                                        if (isFirstishRender(c)) {
                                            elSetStyle(c, "color", "transparent");
                                        }

                                        imLayout(c, BLOCK); imSize(c, 100, PERCENT, 100, PERCENT); imRelative(c); imBg(c, cssVarsApp.fg); {
                                            imLayout(c, BLOCK); imAbsolute(c, 2, PX, 2, PX, 2, PX, 2, PX); imBg(c, color); {
                                                if (isFirstishRender(c)) {
                                                    elSetStyle(c, "transition", "transition: background-color 0.2s;");
                                                }
                                            } imLayoutEnd(c);
                                        } imLayoutEnd(c);

                                    } imLayoutEnd(c);
                                } imEndFor(c);
                            } imLayoutEnd(c);

                            imLayout(c, BLOCK); imSize(c, 100, PERCENT, 2, PX); {
                                if (isFirstishRender(c)) {
                                    elSetStyle(c, "backgroundColor", cssVarsApp.fg);
                                }
                            } imLayoutEnd(c);

                            imLetter(c, gameplayState, instrumentKey, thread, keySignal);
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
) {
    let s; s = imGetInline(c, imLetter) ?? imSet(c, {
        textColor: newColor(0, 0, 0, 1),
        bgColor: newColor(0, 0, 0, 1),
    });

    const theme = getCurrentTheme();

    let distanceToNextNoteNormalized = 1;
    if (thread.length > 0) {
        let start = thread[0].start;
        distanceToNextNoteNormalized = clamp((start - gameplay.currentBeat) / SIGNAL_LOOKAHEAD_BEATS, 0, 1);
    }

    lerpColor(theme.fg, theme.bg2, distanceToNextNoteNormalized, s.textColor);
    lerpColor(s.textColor, theme.bg, signal, s.textColor);
    lerpColor(theme.bg, theme.fg, signal, s.bgColor);

    imLayout(c, COL); imSize(c, 40, PX, 0, NA); imAlign(c); imJustify(c);  {
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
    keySignal: number
) {
    const currentBeat = gameplayState.currentBeat;
    const beatWithinItem = isBeatWithinInclusve(item, currentBeat);
    if (beatWithinItem) {
        let itemChanged = false;
        if (keyState.lastPressedItem !== item) {
            keyState.lastPressedItem = item;
            keyState.lastItemScore = 0;
            keyState.lastItemScoreMissed = 0;

            itemChanged = true;
        }

        let keyPressed = false;
        let keyReleased = false;
        if (!keyState.keyHeld && !!keySignal) {
            keyPressed = true;
            keyState.keyHeld = true;
        } else if (!keySignal && keyState.keyHeld) {
            keyState.keyHeld = false;
            keyReleased = true;
        }

        // Pressing a note works by establishing a grid on an individual note,
        // and awarding score just once for every type we have the key pressed down
        // in a particular quantization:
        //
        //   note start     quantization                         note end
        //        v           v                                       v
        //        [===========|===========|===========|===========|===]
        //              0          1            2          3        4
        //                    q0          q1          q2         q3   q4
        //
        //   |         |         | <-- actual timeline beats might not be snapped to the note

        if (itemChanged) {
            keyState.lastPressedBeatQuantized = item.start;
        } else if (keyPressed) {
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
    fromBeat: number
) {
    const chart = ctx.sequencer._currentChart;
    const newTime  = getTimeForBeats(chart, fromBeat);
    setScheduledPlaybackTime(newTime);

    gameplayState.score = gameplayState.practiceMode.scoreThisMeasure;
    gameplayState.scoreMissed = gameplayState.practiceMode.scoreMissedThisMeasure;
    for (const keyState of gameplayState.keyState) {
        keyState.lastPressedItem = null;
        keyState.lastItemScore = 0;
        keyState.lastItemScoreMissed = 0;
    }
}


function updatePracticeMode(
    ctx: GlobalContext,
    gameplayState: GameplayState,
    chart: SequencerChart,
) {
    const practiceMode = gameplayState.practiceMode;

    // Compute current measure:
    // |         |         |      |           |   |             |
    // ^         ^                                     ^             ^
    // start    measure 0                       final measure       end of chart
    //
    // The measures are actual timeline items, whic doesn't include the start and end of the chart,
    // so we'll need to account for those. 
    // This is also why practiceMode.nextMeasureIdx = measures.length;.

    const measures = gameplayState.practiceMode.measures;
    practiceMode.nextMeasureIdx = measures.length;
    for (let i = 0; i < measures.length; i++) {
        const measure = measures[i];
        if (measure.start >= gameplayState.currentBeat) {
            practiceMode.nextMeasureIdx = i;
            break;
        }
    }

    // Did it change? anything need to be done?
    if (practiceMode.nextMeasureIdxLast !== practiceMode.nextMeasureIdx) {
        const prevMeasureIdx = practiceMode.nextMeasureIdxLast;

        let rewound = false;
        if (practiceMode.enabled) {
            // If we missed too many times, go back to the last measure, so we can try again
            
            const requiredScore = practiceMode.scoreThisMeasure + practiceMode.maxScoreThisMeasure;
            const TOO_MANY_MISSES = 5;
            if (requiredScore - gameplayState.score > TOO_MANY_MISSES) {
                rewound = true;

                const measureToRewindTo = arrayAt(measures, prevMeasureIdx - 1);

                const measureBeat = measureToRewindTo ? measureToRewindTo.start : 0;

                gamplayPracticeModeRewind(ctx, gameplayState, measureBeat);
            }
        }

        if (!rewound) {
            practiceMode.nextMeasureIdxLast = practiceMode.nextMeasureIdx;
            gameplayState.practiceMode.scoreThisMeasure = gameplayState.score;
            gameplayState.practiceMode.scoreMissedThisMeasure = gameplayState.scoreMissed;
        } else {
            // Don't compute next measure's scores
            practiceMode.nextMeasureIdx = practiceMode.nextMeasureIdxLast;
        }
    }

    const thisMeasure = arrayAt(measures, practiceMode.nextMeasureIdx - 1);
    const nextMeasure = arrayAt(measures, practiceMode.nextMeasureIdx);
    let thisMeasureBeat = thisMeasure ? thisMeasure.start : 0;
    let nextMeasureBeat = nextMeasure ? nextMeasure.start : measures[measures.length - 1].start;

    practiceMode.maxScoreThisMeasure = getBestPossibleScore(chart, thisMeasureBeat, nextMeasureBeat);
}
