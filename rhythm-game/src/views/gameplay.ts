import { BLOCK, CENTER, COL, END, imAbsolute, imAlign, imBg, imFlex, imGap, imJustify, imLayout, imLayoutEnd, imRelative, imSize, imTextColor, NA, PERCENT, PX, ROW, START, STRETCH } from "src/components/core/layout";
import { getCurrentOscillatorGain, getCurrentOscillatorOwner } from "src/dsp/dsp-loop-interface";
import {
    InstrumentKey,
    KeyboardState
} from "src/state/keyboard-state";
import {
    CommandItem,
    getItemLengthBeats,
    getItemStartBeats,
    NoteItem
} from "src/state/sequencer-chart";
import {
    getSequencerPlaybackOrEditingCursor,
    getTimelineMusicNoteThreads,
    NoteMapEntry
} from "src/state/sequencer-state";
import { copyColor, lerpColor, newColor } from "src/utils/colour";
import { getDeltaTimeSeconds, ImCache, imEndFor, imEndIf, imFor, imGet, imGetInline, imIf, imIfEnd, imMemo, imSet, imState, isFirstishRender } from "src/utils/im-core";
import { EL_B, EL_I, elSetClass, elSetStyle, imEl, imElEnd, imStr } from "src/utils/im-dom";
import { clamp, inverseLerp } from "src/utils/math-utils";
import { getNoteHashKey } from "src/utils/music-theory-utils";
import { GlobalContext } from "./app";
import { cnApp, cssVarsApp, getCurrentTheme } from "./styling";
import { getOrCreateCurrentChart } from "src/state/saved-state";
import { assert } from "src/utils/assert";
import { imLine, LINE_HORIZONTAL } from "src/components/im-line";
import { cn } from "src/components/core/stylesheets";

const SIGNAL_LOOKAHEAD_BEATS = 1;
const GAMEPLAY_LOOKAHEAD_BEATS = 3;
const GAMEPLAY_LOADAHEAD_BEATS = 6;

export type KeysMapEntry = { 
    instrumentKey: InstrumentKey;

    // NOTE: this is a non-owning reference
    _items: NoteItem[];
};

export function notesMapToKeysMap(
    keyboard: KeyboardState,
    srcNotesMap: Map<string, NoteMapEntry>,
    dstKeysMap: Map<string, KeysMapEntry>,
) {
    for (const k of keyboard.flatKeys) {
        let block = dstKeysMap.get(k.keyboardKey);
        if (!block) {
            block = { instrumentKey: k, _items: [] };
            dstKeysMap.set(k.keyboardKey, block);
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

type GameplayState = {
    start: number;
    end: number;
    midpoint: number;
    notesMap: Map<string, NoteMapEntry>;
    keysMap: Map<string, KeysMapEntry>;
    commandsList: CommandItem[];

    score: number;
};

function newGameplayState(): GameplayState {
    return {
        score: 0,

        start: 0,
        end: 0,
        midpoint: 0,
        notesMap: new Map(),
        keysMap: new Map(),
        commandsList: [],
    };
}

export function imGameplay(c: ImCache, ctx: GlobalContext) {
    const focusChanged = imMemo(c, true);
    let gameplayState = imGet(c, newGameplayState);
    if (!gameplayState || focusChanged) {
        console.log("Recreated gameplay state");
        gameplayState = imSet(c, newGameplayState());
    }

    gameplayState.start = getSequencerPlaybackOrEditingCursor(ctx.sequencer);
    gameplayState.end = gameplayState.start + GAMEPLAY_LOADAHEAD_BEATS;

    getTimelineMusicNoteThreads(
        ctx.sequencer, 
        gameplayState.start, gameplayState.end,
        gameplayState.notesMap, gameplayState.commandsList
    );

    notesMapToKeysMap(ctx.keyboard, gameplayState.notesMap, gameplayState.keysMap);

    gameplayState.midpoint = Math.floor(gameplayState.keysMap.size / 2);

    const chart = ctx.sequencer._currentChart;

    imLayout(c, COL); imFlex(c); imJustify(c); {
        imLayout(c, ROW); {
            if (isFirstishRender(c)) {
                elSetClass(c, cn.mediumFont);
            }

            imLayout(c, ROW); imGap(c, 10, PX); imFlex(c); {
                imStr(c, chart.name);
            } imLayoutEnd(c);

            imLayout(c, ROW); imGap(c, 10, PX); imFlex(c);  imJustify(c, CENTER); {
                imEl(c, EL_I); imStr(c, gameplayState.score); imElEnd(c, EL_I);
            } imLayoutEnd(c);

            imLayout(c, ROW); imGap(c, 10, PX); imFlex(c); imJustify(c, END); {
            } imLayoutEnd(c);
        } imLayoutEnd(c);

        imLine(c, LINE_HORIZONTAL, 1);

        imLayout(c, ROW); imFlex(c); imAlign(c, STRETCH); imJustify(c); {
            imFor(c); for (const val of gameplayState.keysMap.values()) {
                const thread = val._items;
                const instrumentKey = val.instrumentKey;
                const sGameplay = gameplayState;

                // Vertical note
                {
                    const s = imState(c, newVerticalNoteThreadState);

                    const owner = getCurrentOscillatorOwner(instrumentKey.index)
                    const signal = getCurrentOscillatorGain(instrumentKey.index)
                    const playerSignal = owner === 0 ? signal : 0;

                    const theme = getCurrentTheme();
                    
                    const backgroundColor = s.currentBgColor.toCssString();

                    copyColor(theme.bg, s.currentBgColor);

                    if (imIf(c) && instrumentKey.isLeftmost) {
                        imLayout(c, BLOCK); imSize(c, 2, PX, 0, NA); imBg(c, cssVarsApp.fg); imLayoutEnd(c);
                    } imEndIf(c);

                    imLayout(c, COL); imAlign(c, STRETCH); imJustify(c, START); {
                        imLetter(c, gameplayState, instrumentKey, thread, playerSignal);

                        imLayout(c, BLOCK); imSize(c, 100, PERCENT, 2, PX); imBg(c, cssVarsApp.fg); {
                        } imLayoutEnd(c);

                        imLayout(c, BLOCK); imSize(c, 100, PERCENT, 0, NA); imRelative(c); imFlex(c); {
                            if (isFirstishRender(c)) {
                                elSetStyle(c,"transition", "background-color 0.2s");
                            }

                            elSetStyle(c,"backgroundColor", backgroundColor);

                            imFor(c); for (let i = 0; i < thread.length; i++) {
                                const item = thread[i];

                                const start = sGameplay.start;

                                {
                                    const s = imState(c, newBarState);

                                    const end = start + GAMEPLAY_LOOKAHEAD_BEATS;
                                    const itemStart = getItemStartBeats(item);
                                    const itemLength = getItemLengthBeats(item);

                                    const dt = getDeltaTimeSeconds(c);

                                    let bottomPercent = 100 * inverseLerp(itemStart, start, end);
                                    let heightPercent = 100 * itemLength / GAMEPLAY_LOOKAHEAD_BEATS;

                                    if (bottomPercent <= 0) {
                                        // prevent the bar from going past the midpoint line
                                        heightPercent += bottomPercent;
                                        bottomPercent = 0;

                                    }

                                    if (bottomPercent < 0.1) {
                                        // give user an indication that they should care about the fact that this bar has reached the bottm.
                                        // hopefully they'll see the keyboard letter just below it, and try pressing it.
                                        s.animation += dt;
                                        if (s.animation > 1) {
                                            s.animation = 0;
                                        }
                                    } else {
                                        s.animation = 0;
                                    }

                                    const color = s.animation > 0.5 ? "#FFFF00" : cssVarsApp.fg;
                                    // color = animation < 0.5 ? "#FFFF00" : s.instrumentKey.cssColours.normal;

                                    imLayout(c, BLOCK); imAbsolute(c, 0, NA, 0, PX, 0, NA, 0, PX); {
                                        if (isFirstishRender(c)) {
                                            elSetStyle(c,"color", "transparent");
                                        }

                                        elSetStyle(c,"bottom", bottomPercent + "%");
                                        elSetStyle(c,"height", heightPercent + "%");

                                        imLayout(c, BLOCK); imSize(c, 100, PERCENT, 100, PERCENT); imRelative(c); {
                                            if (isFirstishRender(c)) {
                                                elSetStyle(c,"backgroundColor", cssVarsApp.fg);
                                            }

                                            imLayout(c, BLOCK); imAbsolute(c, 2, PX, 2, PX, 2, PX, 2, PX); {
                                                if (isFirstishRender(c)) {
                                                    elSetStyle(c,"transition", "transition: background-color 0.2s;");
                                                }

                                                elSetStyle(c,"backgroundColor", color);
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

                        imLetter(c, gameplayState, instrumentKey, thread, playerSignal);
                    } imLayoutEnd(c);

                    if (imIf(c) && instrumentKey.isRightmost) {
                        imLayout(c, BLOCK); imSize(c, 2, PX, 0, NA); {
                            if (isFirstishRender(c)) {
                                elSetStyle(c, "background", cssVarsApp.fg);
                            }
                        } imLayoutEnd(c);
                    } imIfEnd(c);
                }
            } imEndFor(c);
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
