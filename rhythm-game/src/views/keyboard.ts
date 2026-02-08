import { BLOCK, COL, imAbsolute, imAlign, imFlex, imGap, imJustify, imLayoutBegin, imLayoutEnd, imRelative, imSize, NA, PX, ROW, START } from "src/components/core/layout";
import {
    getCurrentOscillatorGain,
    pressKey,
    releaseKey
} from "src/dsp/dsp-loop-interface";
import { timelineHasNoteAtPosition } from "src/state/sequencer-chart";
import {
    getCurrentPlayingTimeIntoChart,
} from "src/state/sequencer-state";
import { APP_VIEW_EDIT_CHART } from "src/state/ui-state";
import { ImCache, imFor, imForEnd, imGet, imIf, imIfEnd, imMemo, imSet, inlineTypeId, isFirstishRender } from "src/utils/im-core";
import { elGet, elHasMouseOver, elHasMousePress, elSetClass, elSetStyle, getGlobalEventSystem, imStr } from "src/utils/im-dom";
import { GlobalContext } from "./app";
import { cssVarsApp } from "./styling";


// TODO: KEYBOARD_OFFSETS
const offsets = [
    0,
    0.25,
    0.5,
    0.75,
    1.0,
];

export function imKeyboard(c: ImCache, ctx: GlobalContext) {
    const keyboard = ctx.keyboard;
    const keys = keyboard.keys;

    const parent = elGet(c);
    let maxOffset = 0;
    for (let rowIdx = 0; rowIdx < keys.length; rowIdx++) {
        const keyRow = keyboard.keys[rowIdx];
        let computedOffset = offsets[rowIdx] + keyRow.length + 1;
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

        const width = parent.clientWidth;
        const height = parent.clientHeight;
        const keySize = Math.min(width / maxOffset, height / (keyboard.keys.length));

        imLayoutBegin(c, COL); imFlex(c); {
            imFor(c); for (let rowIdx = 0; rowIdx < keys.length; rowIdx++) {
                const keyRow = keyboard.keys[rowIdx];
                const startOffset = offsets[rowIdx];

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
                        const PRESS_EFFECT = 5;

                        const sequencer = ctx.sequencer;

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
                                if (imMemo(c, signal)) {
                                    elSetStyle(c, "backgroundColor", `rgba(0, 0, 0, ${signal})`);
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

                            // approach square(s)
                            // need to iterate over all the notes within the approach window, 
                            // could need multiple approach squares for this key.
                            const sequencer = ctx.sequencer;
                            if (imIf(c) && !sequencer.isPaused) {
                                const currentTime = getCurrentPlayingTimeIntoChart(sequencer);

                                const scheduledKeyPresses = ctx.sequencer.scheduledKeyPresses;
                                imFor(c); for (let i = 0; i < scheduledKeyPresses.length; i++) {
                                    const scheduledPress = scheduledKeyPresses[i];
                                    if (scheduledPress.keyId !== key.index) {
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
}
