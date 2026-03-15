import { imui, BLOCK, ROW, COL, PX, NA, CssColor, START } from "src/utils/im-js/im-ui";
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
import { im, ImCache, imdom, el, ev, } from "src/utils/im-js";

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
    const state = im.State(c, newKeyboardUiState);
    state.keysPressed.length  = 0;
    state.keysReleased.length = 0;

    const keyboard = ctx.keyboard;
    const keys     = keyboard.keys;

    const parent = imdom.getElement(c);
    let maxOffset = 0;
    for (let rowIdx = 0; rowIdx < keys.length; rowIdx++) {
        const keyRow = keyboard.keys[rowIdx];
        let computedOffset = KEYBOARD_OFFSETS[rowIdx] + keyRow.length + 1;
        maxOffset = Math.max(maxOffset, computedOffset);
    }

    imui.Begin(c, COL); imui.Flex(c); imui.Align(c); {
        imdom.setClass(c, "keyboard");

        const mouse = imdom.getMouse();

        if (imdom.hasMousePress(c)) {
            keyboard.hasClicked = mouse.leftMouseButton;
        } 
        if (!mouse.leftMouseButton) {
            keyboard.hasClicked = false;
        }

        const width   = parent.clientWidth;
        const height  = parent.clientHeight;
        const keySize = Math.min(width / maxOffset, height / (keyboard.keys.length));

        imui.Begin(c, COL); imui.Flex(c); {
            im.For(c); for (let rowIdx = 0; rowIdx < keys.length; rowIdx++) {
                const keyRow      = keyboard.keys[rowIdx];
                const startOffset = KEYBOARD_OFFSETS[rowIdx];

                imui.Begin(c, ROW); imui.Gap(c, 5, PX); imui.Justify(c, START); {
                    imui.Begin(c, BLOCK); imui.Size(c, startOffset * keySize, PX, 0, NA); imui.End(c);

                    im.For(c); for (
                        let keyIdx = 0;
                        keyIdx < keyRow.length;
                        keyIdx++
                    ) {
                        const key = keyRow[keyIdx];
                        let s; s = im.GetInline(c, imKeyboard);
                        if (!s) s = im.Set(c, { pressed: false });

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

                        imui.Begin(c, BLOCK); imui.Relative(c); {
                            if (im.isFirstishRender(c)) {
                                imdom.setStyle(c, "fontFamily", "monospace");
                                imdom.setStyle(c, "outline", `1px solid ${cssVarsApp.fg}`);
                                imdom.setStyle(c, "display", "inline-block");
                                imdom.setStyle(c, "textAlign", "center");
                                imdom.setStyle(c, "userSelect", "none");
                            }

                            if (im.Memo(c, keySize)) {
                                imdom.setStyle(c, "width", keySize + "px");
                                imdom.setStyle(c, "height", keySize + "px");
                                imdom.setStyle(c, "fontSize", (keySize / 2) + "px");
                            }

                            if (im.Memo(c, signal)) {
                                imdom.setStyle(c, "color", signal > 0.1 ? cssVarsApp.bg : cssVarsApp.fg);
                            }

                            if (im.Memo(c, pressEffect)) {
                                imdom.setStyle(c, "transform", `translate(${pressEffect}px, ${pressEffect}px)`);
                            }

                            const isPressing = keyboard.hasClicked && imdom.hasMouseOver(c) && mouse.leftMouseButton;
                            const isPressingChanged = im.Memo(c, isPressing);

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
                            imui.Begin(c, BLOCK); imui.Absolute(c, 0, PX, 0, PX, 0, PX, 0, PX); {
                                if (im.Memo(c, hasNote)) {
                                    imdom.setStyle(c, "backgroundColor", hasNote ? cssVarsApp.mg : cssVarsApp.bg);
                                }
                            } imui.End(c);
                            // letter bg
                            imui.Begin(c, BLOCK); imui.Absolute(c, 0, PX, 0, PX, 0, PX, 0, PX); {
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

                                imdom.setStyle(c, "backgroundColor", color);

                                if (im.Memo(c, isSelected)) {
                                    imdom.setStyle(c, "border", !isSelected ? "" : "3px solid " + cssVarsApp.fg);
                                }
                            } imui.End(c);
                            // letter text
                            imui.Begin(c, BLOCK); imui.Absolute(c, 5, PX, 0, PX, 0, PX, 0, PX); {
                                imdom.Str(c, key.text);
                            } imui.End(c);
                            // note text
                            imui.Begin(c, BLOCK); imui.Absolute(c, 0, NA, 0, PX, 5, PX, 0, PX); {
                                if (im.isFirstishRender(c)) {
                                    imdom.setStyle(c, "textAlign", "right");
                                }

                                if (im.Memo(c, keySize)) {
                                    imdom.setStyle(c, "fontSize", (keySize / 4) + "px");
                                    imdom.setStyle(c, "paddingRight", (keySize / 10) + "px");
                                }

                                imdom.Str(c, key.noteText);
                            } imui.End(c);

                            if (im.If(c) && state.config) {
                                // slot text
                                imui.Begin(c, BLOCK); imui.Absolute(c, 0, NA, 0, NA, 5, PX, 8, PX); {
                                    if (im.Memo(c, keySize)) {
                                        imdom.setStyle(c, "fontSize", (keySize / 4) + "px");
                                        imdom.setStyle(c, "paddingRight", (keySize / 10) + "px");
                                    }

                                    imdom.Str(c, "s");
                                    imdom.Str(c, state.config.keymaps[key.index]);
                                } imui.End(c);
                            } im.IfEnd(c);

                            // approach square(s)
                            // need to iterate over all the notes within the approach window, 
                            // could need multiple approach squares for this key.
                            const sequencer = ctx.sequencer;
                            if (im.If(c) && !sequencer.isPaused) {
                                const currentTime = getCurrentPlayingTimeIntoChart(sequencer);

                                const scheduledKeyPresses = ctx.sequencer.scheduledKeyPresses;
                                im.For(c); for (let i = 0; i < scheduledKeyPresses.length; i++) {
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

                                    imui.Begin(c, BLOCK); imui.Absolute(c, 0, PX, 0, PX, 0, PX, 0, PX); {
                                        if (im.isFirstishRender(c)) {
                                            imdom.setStyle(c, "backgroundColor", cssVarsApp.playback);
                                        }
                                        if (im.Memo(c, t)) {
                                            imdom.setStyle(c, "opacity", t + "");
                                        }
                                    } imui.End(c);
                                    // This osu! style border kinda whack ngl.
                                    imui.Begin(c, BLOCK); imui.Absolute(c, -scale, PX, -scale, PX, scale, PX, scale, PX); {
                                        if (im.isFirstishRender(c)) {
                                            imdom.setStyle(c, "border", `5px solid ${cssVarsApp.fg}`);
                                            imdom.setStyle(c, "opacity", "1");
                                        }
                                    } imui.End(c);
                                } im.ForEnd(c);
                            } im.IfEnd(c);
                        } imui.End(c);
                    } im.ForEnd(c);
                } imui.End(c);
            } im.ForEnd(c);
        } imui.End(c);
    } imui.End(c);

    return state;
}
