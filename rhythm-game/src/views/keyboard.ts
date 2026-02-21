import { BLOCK, COL, imAbsolute, imAlign, imFlex, imGap, imJustify, imLayoutBegin, imLayoutEnd, imRelative, imSize, NA, PX, ROW, START } from "src/components/core/layout";
import {
    getCurrentOscillatorGain,
    pressKey,
    releaseKey
} from "src/dsp/dsp-loop-interface";
import { KeyboardConfig } from "src/state/keyboard-config";
import { InstrumentKey } from "src/state/keyboard-state";
import { timelineHasNoteAtPosition } from "src/state/sequencer-chart";
import {
    getCurrentPlayingTimeIntoChart,
} from "src/state/sequencer-state";
import { APP_VIEW_EDIT_CHART } from "src/state/ui-state";
import { arrayAt, filterInPlace } from "src/utils/array-utils";
import { CssColor } from "src/utils/colour";
import { ImCache, imFor, imForEnd, imGet, imIf, imIfEnd, imMemo, imSet, imState, inlineTypeId, isFirstishRender } from "src/utils/im-core";
import { elGet, elHasMouseOver, elHasMousePress, elSetClass, elSetStyle, getGlobalEventSystem, imStr } from "src/utils/im-dom";
import { lerp } from "src/utils/math-utils";
import { GlobalContext } from "./app";
import { cssVarsApp } from "./styling";


const KEYBOARD_OFFSETS = [
    0,
    0.25,
    0.5,
    0.75,
    1.0,
];

type KeyboardUiState = {
    keysPressed:  InstrumentKey[]
    keysReleased: InstrumentKey[]
    keysHeld:     InstrumentKey[]

    selection:    Set<number> | undefined;
    config:       KeyboardConfig | undefined;
    slotColours:  CssColor[] | undefined;
    isolateSlotIdx:  number;
};

function newKeyboardUiState(): KeyboardUiState {
    return {
        keysPressed: [],
        keysReleased: [],
        keysHeld: [],

        // Passed in externally
        selection:  undefined,
        config:     undefined,
        slotColours: undefined,
        isolateSlotIdx: -1,
    };
}

export function imKeyboard(c: ImCache, ctx: GlobalContext): KeyboardUiState {
    const state = imState(c, newKeyboardUiState);
    state.keysPressed.length  = 0;
    state.keysReleased.length = 0;

    const keyboard = ctx.keyboard;
    const keys     = keyboard.keys;

    const parent = elGet(c);
    let maxOffset = 0;
    for (let rowIdx = 0; rowIdx < keys.length; rowIdx++) {
        const keyRow = keyboard.keys[rowIdx];
        let computedOffset = KEYBOARD_OFFSETS[rowIdx] + keyRow.length + 1;
        maxOffset = Math.max(maxOffset, computedOffset);
    }

    imLayoutBegin(c, COL); imFlex(c); imAlign(c); {
        elSetClass(c, "keyboard");

        const mouse = getGlobalEventSystem().mouse;

        if (elHasMousePress(c)) {
            keyboard.hasClicked = mouse.leftMouseButton;
        } 
        if (!mouse.leftMouseButton) {
            keyboard.hasClicked = false;
        }

        const width   = parent.clientWidth;
        const height  = parent.clientHeight;
        const keySize = Math.min(width / maxOffset, height / (keyboard.keys.length));

        imLayoutBegin(c, COL); imFlex(c); {
            imFor(c); for (let rowIdx = 0; rowIdx < keys.length; rowIdx++) {
                const keyRow      = keyboard.keys[rowIdx];
                const startOffset = KEYBOARD_OFFSETS[rowIdx];

                imLayoutBegin(c, ROW); imGap(c, 5, PX); imJustify(c, START); {
                    imLayoutBegin(c, BLOCK); imSize(c, startOffset * keySize, PX, 0, NA); imLayoutEnd(c);

                    imFor(c); for (
                        let keyIdx = 0;
                        keyIdx < keyRow.length;
                        keyIdx++
                    ) {
                        const key = keyRow[keyIdx];
                        let s; s = imGet(c, inlineTypeId(imKeyboard));
                        if (!s) s = imSet(c, { pressed: false });

                        const signal = getCurrentOscillatorGain(key.index);
                        const isSelected = state.selection && state.selection.has(key.index);
                        const PRESS_EFFECT = 5;

                        const sequencer  = ctx.sequencer;
                        const isEditView = ctx.ui.currentView === APP_VIEW_EDIT_CHART;

                        const hasNote = isEditView && timelineHasNoteAtPosition(
                            sequencer._currentChart,
                            sequencer.cursor,
                            key.noteId,
                        );

                        const pressEffect = PRESS_EFFECT * Math.max(signal, hasNote ? 1 : 0);

                        imLayoutBegin(c, BLOCK); imRelative(c); {
                            if (isFirstishRender(c)) {
                                elSetStyle(c, "fontFamily", "monospace");
                                elSetStyle(c, "outline", `1px solid ${cssVarsApp.fg}`);
                                elSetStyle(c, "display", "inline-block");
                                elSetStyle(c, "textAlign", "center");
                                elSetStyle(c, "userSelect", "none");
                            }

                            if (imMemo(c, keySize)) {
                                elSetStyle(c, "width", keySize + "px");
                                elSetStyle(c, "height", keySize + "px");
                                elSetStyle(c, "fontSize", (keySize / 2) + "px");
                            }

                            if (imMemo(c, signal)) {
                                elSetStyle(c, "color", signal > 0.1 ? cssVarsApp.bg : cssVarsApp.fg);
                            }

                            if (imMemo(c, pressEffect)) {
                                elSetStyle(c, "transform", `translate(${pressEffect}px, ${pressEffect}px)`);
                            }

                            const isPressing = keyboard.hasClicked && elHasMouseOver(c) && mouse.leftMouseButton;
                            const isPressingChanged = imMemo(c, isPressing);

                            // UI uses this for key presses.
                            // I actually don't think we should select the keys with the keyboard.
                            {
                                if (isPressing) {
                                    if (!state.keysHeld.includes(key)) {
                                        state.keysPressed.push(key);
                                        state.keysHeld.push(key);
                                    }
                                } else {
                                    if (state.keysHeld.includes(key)) {
                                        state.keysReleased.push(key);
                                        filterInPlace(state.keysHeld, k => k !== key);
                                    }
                                }
                            }

                            if (isPressingChanged) {
                                if (isPressing) {
                                    s.pressed = true;
                                    pressKey(key.index, key.noteId, false);
                                } else if (s.pressed) {
                                    s.pressed = false;
                                    releaseKey(key.index, key.noteId);
                                }
                            }

                            // indicator that shows if it's pressed on the sequencer
                            imLayoutBegin(c, BLOCK); imAbsolute(c, 0, PX, 0, PX, 0, PX, 0, PX); {
                                if (imMemo(c, hasNote)) {
                                    elSetStyle(c, "backgroundColor", hasNote ? cssVarsApp.mg : cssVarsApp.bg);
                                }
                            } imLayoutEnd(c);
                            // letter bg
                            imLayoutBegin(c, BLOCK); imAbsolute(c, 0, PX, 0, PX, 0, PX, 0, PX); {
                                let color;

                                if (state.config && state.slotColours) {
                                    const keySlot = state.config.keymaps[key.index];
                                    let slotIdx = keySlot;
                                    if (state.isolateSlotIdx !== -1) {
                                        slotIdx = state.isolateSlotIdx;
                                    }
                                    const slotColor = arrayAt(state.slotColours, slotIdx);
                                    if (slotColor) {
                                        color = slotColor.toCssString(lerp(0.4, 1, signal));
                                    }
                                }

                                if (!color) {
                                    color = `rgba(0, 0, 0, ${signal})`;
                                }

                                elSetStyle(c, "backgroundColor", color);

                                if (imMemo(c, isSelected)) {
                                    elSetStyle(c, "border", !isSelected ? "" : "3px solid " + cssVarsApp.fg);
                                }
                            } imLayoutEnd(c);
                            // letter text
                            imLayoutBegin(c, BLOCK); imAbsolute(c, 5, PX, 0, PX, 0, PX, 0, PX); {
                                imStr(c, key.text);
                            } imLayoutEnd(c);
                            // note text
                            imLayoutBegin(c, BLOCK); imAbsolute(c, 0, NA, 0, PX, 5, PX, 0, PX); {
                                if (isFirstishRender(c)) {
                                    elSetStyle(c, "textAlign", "right");
                                }

                                if (imMemo(c, keySize)) {
                                    elSetStyle(c, "fontSize", (keySize / 4) + "px");
                                    elSetStyle(c, "paddingRight", (keySize / 10) + "px");
                                }

                                imStr(c, key.noteText);
                            } imLayoutEnd(c);

                            if (imIf(c) && state.config) {
                                // slot text
                                imLayoutBegin(c, BLOCK); imAbsolute(c, 0, NA, 0, NA, 5, PX, 8, PX); {
                                    if (imMemo(c, keySize)) {
                                        elSetStyle(c, "fontSize", (keySize / 4) + "px");
                                        elSetStyle(c, "paddingRight", (keySize / 10) + "px");
                                    }

                                    imStr(c, "s");
                                    imStr(c, state.config.keymaps[key.index]);
                                } imLayoutEnd(c);
                            } imIfEnd(c);

                            // approach square(s)
                            // need to iterate over all the notes within the approach window, 
                            // could need multiple approach squares for this key.
                            const sequencer = ctx.sequencer;
                            if (imIf(c) && !sequencer.isPaused) {
                                const currentTime = getCurrentPlayingTimeIntoChart(sequencer);

                                const scheduledKeyPresses = ctx.sequencer.scheduledKeyPresses;
                                imFor(c); for (let i = 0; i < scheduledKeyPresses.length; i++) {
                                    const scheduledPress = scheduledKeyPresses[i];
                                    if (scheduledPress.keyIndex !== key.index) {
                                        continue;
                                    }

                                    const APPROACH_WINDOW = 500;
                                    const PERSIST_WINDOW = 200;

                                    const relativeTime = currentTime - scheduledPress.time;
                                    if (relativeTime < -APPROACH_WINDOW) {
                                        continue;
                                    }

                                    if (relativeTime > PERSIST_WINDOW) {
                                        continue;
                                    }

                                    const t = -relativeTime / APPROACH_WINDOW;
                                    const scale = 250 * Math.max(0, t)

                                    imLayoutBegin(c, BLOCK); imAbsolute(c, 0, PX, 0, PX, 0, PX, 0, PX); {
                                        if (isFirstishRender(c)) {
                                            elSetStyle(c, "backgroundColor", cssVarsApp.playback);
                                        }
                                        if (imMemo(c, t)) {
                                            elSetStyle(c, "opacity", t + "");
                                        }
                                    } imLayoutEnd(c);
                                    // This osu! style border kinda whack ngl.
                                    imLayoutBegin(c, BLOCK); imAbsolute(c, -scale, PX, -scale, PX, scale, PX, scale, PX); {
                                        if (isFirstishRender(c)) {
                                            elSetStyle(c, "border", `5px solid ${cssVarsApp.fg}`);
                                            elSetStyle(c, "opacity", "1");
                                        }
                                    } imLayoutEnd(c);
                                } imForEnd(c);
                            } imIfEnd(c);
                        } imLayoutEnd(c);
                    } imForEnd(c);
                } imLayoutEnd(c);
            } imForEnd(c);
        } imLayoutEnd(c);
    } imLayoutEnd(c);

    return state;
}
