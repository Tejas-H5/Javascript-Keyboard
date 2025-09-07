import { BLOCK, COL, imAbsolute, imAlign, imBg, imFlex, imJustify, imLayout, imLayoutEnd, imRelative, imSize, NA, PERCENT, PX, ROW, STRETCH } from "src/components/core/layout";
import { getCurrentOscillatorGain, getCurrentOscillatorOwner } from "src/dsp/dsp-loop-interface";
import {
    InstrumentKey,
    KeyboardState
} from "src/state/keyboard-state";
import {
    CommandItem,
    getItemLengthBeats,
    getItemStartBeats,
    NoteItem,
} from "src/state/sequencer-chart";
import {
    getSequencerPlaybackOrEditingCursor,
    getTimelineMusicNoteThreads,
    NoteMapEntry
} from "src/state/sequencer-state";
import { lerpColor, newColor } from "src/utils/colour";
import { getDeltaTimeSeconds, ImCache, imEndFor, imEndIf, imFor, imIf, imState, isFirstishRender } from "src/utils/im-core";
import { EL_H1, elSetStyle, imEl, imElEnd, imStr } from "src/utils/im-dom";
import { inverseLerp } from "src/utils/math-utils";
import { getNoteHashKey } from "src/utils/music-theory-utils";
import { GlobalContext } from "./app";
import { cssVarsApp, getCurrentTheme } from "./styling";

const GAMEPLAY_LOOKAHEAD_BEATS = 2;
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
    midpoint: number;
    notesMap: Map<string, NoteMapEntry>;
    keysMap: Map<string, KeysMapEntry>;
    commandsList: CommandItem[];
};

function newGameplayState(): GameplayState {
    return {
        start: 0,
        midpoint: 0,
        notesMap: new Map(),
        keysMap: new Map(),
        commandsList: [],
    };
}

export function imGameplay(c: ImCache, ctx: GlobalContext) {
    const s = imState(c, newGameplayState);

    s.start = getSequencerPlaybackOrEditingCursor(ctx.sequencer);

    getTimelineMusicNoteThreads(
        ctx.sequencer, s.start, s.start + GAMEPLAY_LOADAHEAD_BEATS,
        s.notesMap, s.commandsList
    );

    notesMapToKeysMap(ctx.keyboard, s.notesMap, s.keysMap);

    s.midpoint = Math.floor(s.keysMap.size / 2);

    imLayout(c, COL); imFlex(c); imAlign(c); imJustify(c); {
        imLayout(c, ROW); imFlex(c); imAlign(c, STRETCH); imJustify(c); {
            imFor(c); for (const val of s.keysMap.values()) {
                const thread = val._items;
                const instrumentKey = val.instrumentKey;
                const sGameplay = s;

                // Vertical note
                {
                    const s = imState(c, newVerticalNoteThreadState);

                    const owner = getCurrentOscillatorOwner(instrumentKey.index)
                    const signal = getCurrentOscillatorGain(instrumentKey.index)

                    const theme = getCurrentTheme();
                    const hasPress = (owner === 0 && signal > 0.001);

                    const wantedBgColor = thread.length > 0 ? theme.bg2 : theme.bg;
                    const wantedFgColor = thread.length > 0 ? theme.fg2 : theme.error;
                    lerpColor(wantedBgColor, wantedFgColor, hasPress ? signal : 0, s.currentBgColor);
                    const backgroundColor = s.currentBgColor.toCssString();

                    const imLetter = () => {
                        imLayout(c, COL); imSize(c, 40, PX, 0, NA); imAlign(c); imJustify(c); {
                            imLayout(c, BLOCK); {
                                if (isFirstishRender(c)) {
                                    elSetStyle(c,"height", "2ch");
                                }
                                elSetStyle(c,"color", thread.length === 0 ? cssVarsApp.bg2 : cssVarsApp.fg);

                                imEl(c, EL_H1); imStr(c, instrumentKey ? instrumentKey.text : "?"); imElEnd(c, EL_H1);
                            } imLayoutEnd(c);
                        } imLayoutEnd(c);
                    }

                    if (imIf(c) && instrumentKey.isLeftmost) {
                        imLayout(c, BLOCK); imSize(c, 2, PX, 0, NA); imBg(c, cssVarsApp.fg); imLayoutEnd(c);
                    } imEndIf(c);

                    imLayout(c, COL); imAlign(c); imJustify(c); {
                        imLetter();

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

                        imLetter();

                    } imLayoutEnd(c);

                    if (imIf(c) && instrumentKey.isRightmost) {
                        imLayout(c, BLOCK); imSize(c, 2, PX, 0, NA); {
                            if (isFirstishRender(c)) {
                                elSetStyle(c, "background", cssVarsApp.fg);
                            }
                        } imLayoutEnd(c);
                    } imIf(c);
                }
            } imEndFor(c);
        } imLayoutEnd(c);
    } imLayoutEnd(c);
}

