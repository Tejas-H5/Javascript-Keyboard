import { getCurrentOscillatorGain, getCurrentOscillatorOwner } from "src/dsp/dsp-loop-interface";
import {
    InstrumentKey,
    KeyboardState
} from "src/state/keyboard-state";
import {
    getSequencerPlaybackOrEditingCursor,
    getTimelineMusicNoteThreads,
    NoteMapEntry
} from "src/state/sequencer-state";
import { lerpColor, newColor } from "src/utils/colour";
import { deltaTimeSeconds, imBeginList, imEnd, imEndList, imInit, imState, nextListRoot, setInnerText, setStyle } from "src/utils/im-dom-utils";
import { inverseLerp } from "src/utils/math-utils";
import { getNoteHashKey } from "src/utils/music-theory-utils";
import { GlobalContext } from "./app";
import {
    CommandItem,
    getItemLengthBeats,
    getItemStartBeats,
    NoteItem,
} from "src/state/sequencer-chart";
import { ALIGN_CENTER, ALIGN_STRETCH, COL, FLEX1, H1, imBeginAbsolute, imBeginLayout, imBeginSpace, JUSTIFY_CENTER, JUSTIFY_START, NOT_SET, OVERFLOW_HIDDEN, PERCENT, PX, RELATIVE, ROW } from "./layout";
import { cssVars, getCurrentTheme } from "./styling";

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

export function imGameplay(ctx: GlobalContext) {
    const s = imState(newGameplayState);

    s.start = getSequencerPlaybackOrEditingCursor(ctx.sequencer);

    getTimelineMusicNoteThreads(
        ctx.sequencer, s.start, s.start + GAMEPLAY_LOADAHEAD_BEATS,
        s.notesMap, s.commandsList
    );

    notesMapToKeysMap(ctx.keyboard, s.notesMap, s.keysMap);

    s.midpoint = Math.floor(s.keysMap.size / 2);

    imBeginLayout(FLEX1 | COL | ALIGN_STRETCH | JUSTIFY_CENTER | OVERFLOW_HIDDEN); {
        imBeginLayout(FLEX1 | ROW | ALIGN_STRETCH | JUSTIFY_CENTER | OVERFLOW_HIDDEN); {
            imBeginList();
            for (const val of s.keysMap.values()) {
                const thread = val._items;
                const instrumentKey = val.instrumentKey;
                const sGameplay = s;

                // Vertical note
                nextListRoot(); {
                    const s = imState(newVerticalNoteThreadState);

                    const owner = getCurrentOscillatorOwner(instrumentKey.index)
                    const signal = getCurrentOscillatorGain(instrumentKey.index)

                    const theme = getCurrentTheme();
                    const hasPress = (owner === 0 && signal > 0.001);

                    const wantedBgColor = thread.length > 0 ? theme.bg2 : theme.bg;
                    const wantedFgColor = thread.length > 0 ? theme.fg2 : theme.error;
                    lerpColor(wantedBgColor, wantedFgColor, hasPress ? signal : 0, s.currentBgColor);
                    const backgroundColor = s.currentBgColor.toCssString();

                    const imLetter = () => {
                        imBeginSpace(40, PX, 0, NOT_SET, COL | ALIGN_CENTER | JUSTIFY_CENTER | H1); {
                            imBeginLayout(); {
                                if (imInit()) {
                                    setStyle("height", "2ch");
                                }
                                setStyle("color", thread.length === 0 ? cssVars.bg2 : cssVars.fg);
                                setInnerText(instrumentKey ? instrumentKey.text : "?");
                            } imEnd();
                        } imEnd();
                    }

                    imBeginLayout(COL | ALIGN_STRETCH | JUSTIFY_START); {
                        imBeginList(); 
                        if (nextListRoot() && instrumentKey.isLeftmost) {
                            imBeginSpace(2, PX, 0, NOT_SET); {
                                imInit() && setStyle("background", cssVars.fg);
                            } imEnd();
                        } 
                        imEndList();

                        imLetter();

                        imBeginSpace(100, PERCENT, 2, PX); {
                            imInit() && setStyle("backgroundColor", cssVars.fg);
                        } imEnd();

                        imBeginSpace(100, PERCENT, 0, NOT_SET, FLEX1 | RELATIVE | OVERFLOW_HIDDEN); {
                            if (imInit()) {
                                setStyle("transition", "background-color 0.2s");
                            }

                            setStyle("backgroundColor", backgroundColor);

                            imBeginList();
                            for (let i = 0; i < thread.length; i++) {
                                const item = thread[i];

                                const start = sGameplay.start;

                                nextListRoot(); {
                                    const s = imState(newBarState);

                                    const end = start + GAMEPLAY_LOOKAHEAD_BEATS;
                                    const itemStart = getItemStartBeats(item);
                                    const itemLength = getItemLengthBeats(item);

                                    const dt = deltaTimeSeconds();

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

                                    const color = s.animation > 0.5 ? "#FFFF00" : cssVars.fg;
                                    // color = animation < 0.5 ? "#FFFF00" : s.instrumentKey.cssColours.normal;

                                    imBeginAbsolute(
                                        0, NOT_SET, 0, PX,
                                        0, NOT_SET, 0, PX,
                                    ); {
                                        if (imInit()) {
                                            setStyle("color", "transparent");
                                        }

                                        setStyle("bottom", bottomPercent + "%");
                                        setStyle("height", heightPercent + "%");

                                        imBeginSpace(100, PERCENT, 100, PERCENT, RELATIVE); {
                                            if (imInit()) {
                                                setStyle("backgroundColor", cssVars.fg);
                                            }

                                            imBeginAbsolute(
                                                2, PX, 2, PX,
                                                2, PX, 2, PX
                                            ); {
                                                if (imInit()) {
                                                    setStyle("transition", "transition: background-color 0.2s;");
                                                }

                                                setStyle("backgroundColor", color);
                                            } imEnd();
                                        } imEnd();

                                    } imEnd();
                                }
                            }
                            imEndList();
                        } imEnd();

                        imBeginSpace(100, PERCENT, 2, PX); {
                            imInit() && setStyle("backgroundColor", cssVars.fg);
                        } imEnd();

                        imLetter();

                    } imEnd();
                }
            }
            imEndList();
        } imEnd();
    } imEnd();
}

