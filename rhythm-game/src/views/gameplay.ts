import { BLOCK, CENTER, COL, END, imAbsolute, imAlign, imBg, imFlex, imGap, imJustify, imLayout, imLayoutEnd, imPadding, imRelative, imSize, imTextColor, NA, PERCENT, PX, ROW, START, STRETCH } from "src/components/core/layout";
import { cn } from "src/components/core/stylesheets";
import { imLine, LINE_HORIZONTAL, LINE_VERTICAL } from "src/components/im-line";
import { getCurrentOscillatorGain, getCurrentOscillatorGainForOwner, getCurrentOscillatorOwner } from "src/dsp/dsp-loop-interface";
import {
    InstrumentKey,
    KeyboardState
} from "src/state/keyboard-state";
import {
    CommandItem,
    getChartDurationInBeats,
    getItemLengthBeats,
    getItemStartBeats,
    gteBeats,
    lteBeats,
    NoteItem,
    SequencerChart,
    TIMELINE_ITEM_NOTE
} from "src/state/sequencer-chart";
import {
    getSequencerPlaybackOrEditingCursor,
    getTimelineMusicNoteThreads,
    NoteMapEntry
} from "src/state/sequencer-state";
import { assert } from "src/utils/assert";
import { copyColor, lerpColor, newColor } from "src/utils/colour";
import { getDeltaTimeSeconds, ImCache, imEndFor, imEndIf, imFor, imGet, imGetInline, imIf, imIfEnd, imMemo, imSet, imState, isFirstishRender } from "src/utils/im-core";
import { EL_B, EL_I, elSetClass, elSetStyle, imEl, imElEnd, imStr } from "src/utils/im-dom";
import { clamp, inverseLerp, max } from "src/utils/math-utils";
import { getNoteHashKey } from "src/utils/music-theory-utils";
import { GlobalContext } from "./app";
import { cssVarsApp, getCurrentTheme } from "./styling";

const SIGNAL_LOOKAHEAD_BEATS = 1;
const GAMEPLAY_LOOKAHEAD_BEATS = 1.5;
const GAMEPLAY_LOADAHEAD_BEATS = 6;

// every 1/n beats hit = 1 score
const SCOREABLE_BEAT_QUANTIZATION = 16;

// Every {PENALTY_QUANTIZATION} after {PENALTY_QUANTIZATION_START} where we don't hit any notes, our score will simply decline, 
// till it reaches zero. 
const PENALTY_QUANTIZATION_SECONDS = 0.1;
const PENALTY_QUANTIZATION_START_SECONDS = 0.3;

export function getBestPossibleScore(chart: SequencerChart) {
    let totalScore = 0;
    for (const item of chart.timeline) {
        if (item.type !== TIMELINE_ITEM_NOTE) continue;

        const beats = getItemLengthBeats(item);
        totalScore += Math.floor(SCOREABLE_BEAT_QUANTIZATION * beats);
    }
    return totalScore;
}

export type KeysMapEntry = { 
    instrumentKey: InstrumentKey;

    // NOTE: this is a non-owning reference
    _items: NoteItem[];
};

export function notesMapToKeysMap(
    keyboard: KeyboardState,
    srcNotesMap: Map<string, NoteMapEntry>,
    dstKeysMap: Map<InstrumentKey, KeysMapEntry>,
) {
    for (const k of keyboard.flatKeys) {
        let block = dstKeysMap.get(k);
        if (!block) {
            block = { instrumentKey: k, _items: [] };
            dstKeysMap.set(k, block);
        }

        const noteHashKey = getNoteHashKey(k.musicNote);
        const notesMapEntry = srcNotesMap.get(noteHashKey);
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
    start: number;
    end: number;
    midpoint: number;
    notesMap: Map<string, NoteMapEntry>;
    commandsList: CommandItem[];

    keysMap: Map<InstrumentKey, KeysMapEntry>;
    keyState: GameplayKeyState[];

    penaltyTimer: number;

    score: number;
    bestPossibleScore: number;
    chartName: string;
};

type GameplayKeyState = {
    lastPressedQuantizedBeat: number;
    lastPressedItem: NoteItem | null;
    lastReleasedItem: NoteItem | null;
};

export function newGameplayState(keyboard: KeyboardState, chart: SequencerChart): GameplayState {
    return {
        score: 0,
        bestPossibleScore: getBestPossibleScore(chart),
        chartName: chart.name,

        start: 0,
        end: 0,
        midpoint: 0,
        notesMap: new Map(),
        keysMap: new Map(),

        commandsList: [],

        keyState: Array(keyboard.flatKeys.length).fill(null).map((): GameplayKeyState => {
            return {
                lastPressedQuantizedBeat: -1,
                lastPressedItem: null,
                lastReleasedItem: null,
            };
        }),

        penaltyTimer: -PENALTY_QUANTIZATION_START_SECONDS,
    };
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
    const progressPercent = Math.round(max(100 * gameplayState.start / durationBeats, 0));
    if (gteBeats(gameplayState.start, durationBeats)) {
        // finished. should switch views next frame.
        ctx.ui.playView.result = gameplayState;
    }

    gameplayState.start = getSequencerPlaybackOrEditingCursor(ctx.sequencer);
    gameplayState.end = gameplayState.start + GAMEPLAY_LOADAHEAD_BEATS;

    const dt = getDeltaTimeSeconds(c);

    gameplayState.penaltyTimer += dt;
    if (gameplayState.penaltyTimer > PENALTY_QUANTIZATION_SECONDS) {
        gameplayState.penaltyTimer = 0;

        if (gameplayState.score > 0) {
            gameplayState.score--;
        }
    }

    getTimelineMusicNoteThreads(
        ctx.sequencer, 
        gameplayState.start, gameplayState.end,
        gameplayState.notesMap, gameplayState.commandsList
    );

    notesMapToKeysMap(ctx.keyboard, gameplayState.notesMap, gameplayState.keysMap);

    gameplayState.midpoint = Math.floor(gameplayState.keysMap.size / 2);

    imLayout(c, COL); imFlex(c); imJustify(c); {
        imLayout(c, ROW); {
            if (isFirstishRender(c)) {
                elSetClass(c, cn.mediumFont);
            }

            imLayout(c, ROW); imGap(c, 10, PX); imFlex(c); {
                imStr(c, chart.name);
                imStr(c, " - ");

                imStr(c, progressPercent);
                imStr(c, "%");
            } imLayoutEnd(c);

            imLayout(c, ROW); imGap(c, 10, PX); imFlex(c);  imJustify(c, CENTER); {
            } imLayoutEnd(c);

            imLine(c, LINE_VERTICAL, 1);

            imLayout(c, ROW); imGap(c, 10, PX); imFlex(c); imJustify(c, END); imRelative(c); {
                // using runway doesn' look as nice.
                const runway = PENALTY_QUANTIZATION_START_SECONDS + PENALTY_QUANTIZATION_SECONDS;
                const amountPenalized01 = (gameplayState.penaltyTimer + PENALTY_QUANTIZATION_START_SECONDS) / PENALTY_QUANTIZATION_START_SECONDS;

                const colours = imGetInline(c, imGameplay) 
                              ?? imSet(c, { barColor: newColor(0, 0, 0, 0) });
                
                const theme = getCurrentTheme();
                lerpColor(theme.calm, theme.danger, amountPenalized01, colours.barColor);


                imLayout(c, BLOCK); {
                    if (isFirstishRender(c)) {
                        elSetStyle(c, "zIndex", "-1");
                    }

                    // Looks like I've independently arrived at something very close to the osu! healthbar ...
                    imAbsolute(c, 0, PX, 0, PX, 0, PX, amountPenalized01 * 100, PERCENT); 
                    imBg(c, colours.barColor.toString());
                } imLayoutEnd(c);

                imEl(c, EL_I); imPadding(c, 0, PX, 10, PX, 0, PX, 10, PX); imStr(c, gameplayState.score); imElEnd(c, EL_I);
            } imLayoutEnd(c);
        } imLayoutEnd(c);

        imLine(c, LINE_HORIZONTAL, 1);

        imLayout(c, ROW); imFlex(c); imAlign(c, STRETCH); imJustify(c); {
            let avoidPenalty = true;

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
                                    const start = sGameplay.start;

                                    {
                                        const s = imState(c, newBarState);

                                        const end = start + GAMEPLAY_LOOKAHEAD_BEATS;
                                        const itemStart = getItemStartBeats(item);
                                        const itemLength = getItemLengthBeats(item);
                                        const itemEnd = itemStart + itemLength;

                                        const dt = getDeltaTimeSeconds(c);

                                        let bottomPercent = 100 * inverseLerp(itemStart, start, end);
                                        let heightPercent = 100 * itemLength / GAMEPLAY_LOOKAHEAD_BEATS;

                                        if (bottomPercent <= 0) {
                                            // prevent the bar from going past the midpoint line
                                            heightPercent += bottomPercent;
                                            bottomPercent = 0;
                                        }

                                        const itemInRange = lteBeats(itemStart, start) && lteBeats(start, itemEnd);
                                        const quantizedBeats = Math.floor(SCOREABLE_BEAT_QUANTIZATION * start);
                                        const finishedPressingLastKey = keyState.lastReleasedItem === keyState.lastPressedItem;
                                        const startedPressingThisQuarterBeat = keyState.lastPressedQuantizedBeat >= quantizedBeats;
                                        const itemIsCurrent = keyState.lastPressedItem === item;

                                        const canPressThisQuarterBeat =
                                            itemInRange &&
                                            !startedPressingThisQuarterBeat &&
                                            (finishedPressingLastKey || itemIsCurrent);

                                        if (canPressThisQuarterBeat && keySignal) {
                                            keyState.lastPressedQuantizedBeat = quantizedBeats;
                                            gameplayState.score += 1;
                                            keyState.lastPressedItem = item;
                                        } else if (!keySignal && !finishedPressingLastKey) {
                                            keyState.lastReleasedItem = keyState.lastPressedItem;
                                        }

                                        if (itemInRange && keyState.lastPressedItem !== item) {
                                            avoidPenalty = false;
                                        }

                                        if (itemInRange) {
                                            // give user an indication that they should care about the fact that this bar has reached the bottom.
                                            // hopefully they'll see the keyboard letter just below it, and try pressing it.
                                            s.animation += dt;
                                            if (s.animation > 1) {
                                                s.animation = 0;
                                            }
                                        } else {
                                            s.animation = 0;
                                        }

                                        const color = s.animation > 0.5 ? "#FFFF00" : cssVarsApp.fg;

                                        imLayout(c, BLOCK); imAbsolute(c, 0, NA, 0, PX, 0, NA, 0, PX); {
                                            if (isFirstishRender(c)) {
                                                elSetStyle(c, "color", "transparent");
                                            }

                                            elSetStyle(c, "bottom", bottomPercent + "%");
                                            elSetStyle(c, "height", heightPercent + "%");

                                            imLayout(c, BLOCK); imSize(c, 100, PERCENT, 100, PERCENT); imRelative(c); {
                                                if (isFirstishRender(c)) {
                                                    elSetStyle(c, "backgroundColor", cssVarsApp.fg);
                                                }

                                                imLayout(c, BLOCK); imAbsolute(c, 2, PX, 2, PX, 2, PX, 2, PX); {
                                                    if (isFirstishRender(c)) {
                                                        elSetStyle(c, "transition", "transition: background-color 0.2s;");
                                                    }

                                                    elSetStyle(c, "backgroundColor", color);
                                                } imLayoutEnd(c);
                                            } imLayoutEnd(c);

                                        } imLayoutEnd(c);
                                    }
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

            if (avoidPenalty) {
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
        let start = getItemStartBeats(thread[0]);
        distanceToNextNoteNormalized = clamp((start - gameplay.start) / SIGNAL_LOOKAHEAD_BEATS, 0, 1);
    }

    lerpColor(theme.fg, theme.bg2, distanceToNextNoteNormalized, s.textColor);
    lerpColor(s.textColor, theme.bg, signal, s.textColor);
    lerpColor(theme.bg, theme.fg, signal, s.bgColor);

    imLayout(c, COL); imSize(c, 40, PX, 0, NA); imAlign(c); imJustify(c);  {
        imBg(c, s.bgColor.toString());
        imTextColor(c, s.textColor.toString());

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
