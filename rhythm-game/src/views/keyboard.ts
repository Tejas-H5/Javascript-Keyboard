import "src/css/layout.css";
import {
    getCurrentOscillatorGain,
    pressKey,
    releaseKey
} from "src/dsp/dsp-loop-interface";
import "src/main.css";
import {
    getCurrentPlayingTimeRelative,
} from "src/state/sequencer-state";
import { elementHasMouseDown, elementHasMouseHover, imBeginList, imEnd, imEndList, imInit, imStateInline, nextListRoot, setInnerText, setStyle } from "src/utils/im-dom-utils";
import { GlobalContext } from "./app";
import { timelineHasNoteAtPosition } from "src/state/sequencer-chart";
import { GAP5, imBeginAbsolute, imBeginLayout, imBeginSpace, NOT_SET, PX, ROW } from "./layout";
import { cssVars } from "./styling";
import { APP_VIEW_EDIT_CHART, APP_VIEW_PLAY_CHART } from "src/state/ui-state";


// TODO: KEYBOARD_OFFSETS
const offsets = [
    0,
    0.5,
    0.75,
    1.25,
    1.75,
];

export function imKeyboard(ctx: GlobalContext) {
    const keyboard = ctx.keyboard;
    const keys = keyboard.keys;

    let maxOffset = 0;
    const root = imBeginLayout().root; {
        const parent = root.parentElement!;
        const width = parent.clientWidth;
        const height = parent.clientHeight;
        const keySize = Math.min(width / maxOffset, height / (keyboard.keys.length));

        imBeginList();
        for (let rowIdx = 0; rowIdx < keys.length; rowIdx++) {
            const keyRow = keyboard.keys[rowIdx];
            let computedOffset = offsets[rowIdx] + keyRow.length + 1;
            maxOffset = Math.max(maxOffset, computedOffset);
            const startOffset = offsets[rowIdx];

            nextListRoot(); 
            
            imBeginLayout(ROW | GAP5); {
                imBeginSpace(startOffset * keySize, PX, 0, NOT_SET); imEnd();

                imBeginList();
                for (
                    let keyIdx = 0;
                    keyIdx < keyRow.length;
                    keyIdx++
                ) {
                    const key = keyRow[keyIdx];
                    nextListRoot(); {

                        const s = imStateInline(() => {
                            return { pressed: false };
                        });

                        const signal = getCurrentOscillatorGain(key.index);

                        const sequencer = ctx.sequencer;

                        const isEditOrPlay = ctx.ui.currentView === APP_VIEW_EDIT_CHART || ctx.ui.currentView === APP_VIEW_PLAY_CHART;
                        const hasNote = isEditOrPlay && timelineHasNoteAtPosition(
                            sequencer._currentChart,
                            sequencer.cursorStart, sequencer.cursorDivisor,
                            key.musicNote,
                        );

                        const PRESS_EFFECT = 5;

                        const pressEffect = PRESS_EFFECT * Math.max(signal, hasNote ? 1 : 0);

                        imBeginLayout(); {
                            if (imInit()) {
                                setStyle("fontFamily", "monospace");
                                setStyle("outline", `1px solid ${cssVars.fg}`);
                                setStyle("display", "inline-block");
                                setStyle("textAlign", "center");
                                setStyle("userSelect", "none");
                            }

                            setStyle("width", keySize + "px");
                            setStyle("height", keySize + "px");
                            setStyle("fontSize", (keySize / 2) + "px");
                            setStyle("color", signal > 0.1 ? cssVars.bg : cssVars.fg);
                            setStyle("transform", `translate(${pressEffect}px, ${pressEffect}px)`);

                            if (elementHasMouseDown() && !s.pressed) {
                                s.pressed = true;
                                pressKey(key.index, key.musicNote, false);
                            }
                            if (s.pressed && (!elementHasMouseHover() || !elementHasMouseDown())) {
                                s.pressed = false;
                                releaseKey(key.index, key.musicNote);
                            }

                            // indicator that shows if it's pressed on the sequencer
                            imBeginAbsolute(0, PX, 0, PX, 0, PX, 0, PX); {
                                setStyle("backgroundColor", hasNote ? cssVars.mg : cssVars.bg);
                            } imEnd();
                            // letter bg
                            imBeginAbsolute(0, PX, 0, PX, 0, PX, 0, PX); {
                                setStyle("backgroundColor", `rgba(0, 0, 0, ${signal})`);
                            } imEnd();
                            // letter text
                            imBeginAbsolute(5, PX, 0, PX, 0, NOT_SET, 0, PX); {
                                setInnerText(key.text);
                            } imEnd();
                            // note text
                            imBeginAbsolute(0, NOT_SET, 0, PX, 5, PX, 0, PX); {
                                if (imInit()) {
                                    setStyle("textAlign", "right");
                                }

                                setStyle("fontSize", (keySize / 4) + "px");
                                setStyle("paddingRight", (keySize / 10) + "px");
                                setInnerText(key.noteText);
                            } imEnd();
                            // approach square(s)
                            imBeginList();
                            // need to iterate over all the notes within the approach window, 
                            // could need multiple approach squares for this key.
                            const sequencer = ctx.sequencer;
                            if (sequencer.isPlaying) {
                                const currentTime = getCurrentPlayingTimeRelative(sequencer);

                                const scheduledKeyPresses = ctx.sequencer.scheduledKeyPresses;
                                for (let i = 0; i < scheduledKeyPresses.length; i++) {
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

                                    nextListRoot(); {
                                        const t = -relativeTime / APPROACH_WINDOW;
                                        const scale = 250 * Math.max(0, t)

                                        imBeginAbsolute(0, PX, 0, PX, 0, PX, 0, PX); {
                                            if (imInit()) {
                                                setStyle("backgroundColor", cssVars.playback);
                                            }
                                            setStyle("opacity", t + "");
                                        } imEnd();
                                        // This osu! style border kinda whack ngl.
                                        imBeginAbsolute(-scale, PX, -scale, PX, scale, PX, scale, PX); {
                                            if (imInit()) {
                                                setStyle("border", `5px solid ${cssVars.fg}`);
                                                setStyle("opacity", "1");
                                            }
                                        } imEnd();
                                    }
                                }
                            }
                            imEndList();
                        } imEnd();
                    }
                }
                imEndList();
            } imEnd();
        }
        imEndList();
    } imEnd();
}
