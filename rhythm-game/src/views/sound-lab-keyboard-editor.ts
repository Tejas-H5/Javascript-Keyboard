
// NOTE: this is currently the 'sound lab'
// Maybe in the future, it will go back to being just a tiny editor again. 

import { imButtonIsClicked } from "src/components/button.ts";
import { COL, imAlign, imBg, imFlex, imGap, imJustify, imLayoutBegin, imLayoutEnd, imScrollOverflow, PX, ROW, START } from "src/components/core/layout.ts";
import { imLine, LINE_HORIZONTAL, LINE_VERTICAL } from "src/components/im-line.ts";
import { pressKey } from "src/dsp/dsp-loop-interface.ts";
import { KeyboardConfig } from "src/state/keyboard-config.ts";
import { getKeyForKeyboardKey, KEYBOARD_LAYOUT_FLAT } from "src/state/keyboard-state.ts";
import { CssColor, newColorFromHsv } from "src/utils/colour.ts";
import { ImCache, imFor, imForEnd, imIf, imIfElse, imIfEnd, imMemo, imState, isFirstishRender } from "src/utils/im-core.ts";
import { elHasMousePress, elSetStyle, getGlobalEventSystem, imStr } from "src/utils/im-dom.ts";
import { JSONUndoBuffer, newJSONUndoBuffer } from "src/utils/undo-buffer-json.ts";
import { GlobalContext } from "./app.ts";
import { imKeyboard } from "./keyboard.ts";
import { imHeadingBegin, imHeadingEnd } from "./sound-lab-effect-rack-editor.ts";
import { imEffectRackList, presetsListState } from "./sound-lab-effect-rack-list.ts";

// I won't assume anything for now
export type KeyboardConfigEditorState = {
    keyboardConfig: KeyboardConfig;
    undoBuffer: JSONUndoBuffer<KeyboardConfig>;

    deferredAction: (() => void) | undefined;

    reassigningSlotIdx: number;
    reassigningPresetLookup: string;
    
    selectedKeys: Set<number>;
    slotColours: CssColor[];
};

export function newKeyboardConfigEditorState(config: KeyboardConfig): KeyboardConfigEditorState {
    return {
        keyboardConfig: config,
        undoBuffer: newJSONUndoBuffer<KeyboardConfig>(1000),

        deferredAction: undefined,

        reassigningSlotIdx: -1,
        reassigningPresetLookup: "",

        selectedKeys: new Set(),
        slotColours: [],
    };
}

export function imKeyboardConfigEditor(
    c: ImCache,
    ctx: GlobalContext,
    editor: KeyboardConfigEditorState
) {
    const presetListState = imState(c, presetsListState);

    const numSlots        = editor.keyboardConfig.synthSlots.length;
    const numSlotsChanged = imMemo(c, numSlots);

    // allocate colour slots
    {
        const oldLen = editor.slotColours.length;
        const newLen = editor.keyboardConfig.synthSlots.length;
        if (oldLen !== newLen) {
            editor.slotColours.length = newLen;
        }

        let start = oldLen - 1;
        if (numSlotsChanged) start = 0;
        for (let i = start; i < newLen; i++) {
            editor.keyboardConfig.synthSlots.length;
            editor.slotColours[i] = newColorFromHsv(i / (numSlots + 1), 1, 0.8)
        }
    }

    imLayoutBegin(c, COL); imFlex(c); {
        imHeadingBegin(c); {
            imStr(c, "Keyboard 22");
        } imHeadingEnd(c);

        imLine(c, LINE_HORIZONTAL, 1);

        imLayoutBegin(c, COL); imFlex(c); {
            imLayoutBegin(c, ROW); imFlex(c); {
                const isReassigningSomething = editor.reassigningSlotIdx !== -1;

                imLayoutBegin(c, COL); imFlex(c); imAlign(c, START); imScrollOverflow(c); {
                    imFor(c); for (let slotIdx = 0; slotIdx < editor.keyboardConfig.synthSlots.length; slotIdx++) {
                        const preset = editor.keyboardConfig.synthSlots[slotIdx];
                        const presetColor = editor.slotColours[slotIdx];
                        const isReassigning = editor.reassigningSlotIdx === slotIdx

                        if (isReassigningSomething && !isReassigning) continue;

                        imLayoutBegin(c, COL); {
                            imLayoutBegin(c, ROW); imGap(c, 10, PX); imAlign(c); imBg(c, presetColor.toCssString()); { 
                                imLayoutBegin(c, ROW); imFlex(c); imAlign(c); imGap(c, 10, PX); {
                                    if (isFirstishRender(c)) elSetStyle(c, "padding", "0 5px");

                                    if (imIf(c) && editor.selectedKeys.size > 0) {
                                        if (imButtonIsClicked(c, "Assign to " + slotIdx)) {
                                            for (const index of editor.selectedKeys) {
                                                editor.keyboardConfig.keymaps[index] = slotIdx;
                                            }
                                        }
                                    } else {
                                        imIfElse(c);

                                    } imIfEnd(c);


                                    imStr(c, "s");
                                    imStr(c, slotIdx);
                                    imStr(c, " -> ");

                                    imLayoutBegin(c, ROW); imJustify(c); imFlex(c); {
                                        imStr(c, preset ? preset.name : "Nothing");
                                    } imLayoutEnd(c);

                                    if (imIf(c) && !isReassigningSomething) {
                                        if (imButtonIsClicked(c, "-")) {
                                            editor.deferredAction = () => {
                                                editor.keyboardConfig.synthSlots.splice(slotIdx, 1);
                                            }
                                        }
                                    } imIfEnd(c);

                                    if (imButtonIsClicked(c, !isReassigning ? "Reassign" : "Done", isReassigning)) {
                                        if (isReassigning) {
                                            editor.reassigningSlotIdx = -1;
                                        } else {
                                            editor.reassigningSlotIdx = slotIdx;
                                        }
                                    }
                                } imLayoutEnd(c);
                            } imLayoutEnd(c);

                            if (imIf(c) && isReassigning) {
                                const ev = imEffectRackList(c, ctx, presetListState);
                                if (ev) {
                                    if (ev.selection) {
                                        editor.keyboardConfig.synthSlots[slotIdx] = { ...ev.selection };
                                    }
                                }

                                if (!ctx.handled) {
                                    if (ctx.keyPressState) {
                                        const { key } = ctx.keyPressState;
                                        if (key === "Escape") {
                                            editor.reassigningSlotIdx = -1;
                                        }
                                    }
                                }
                            } imIfEnd(c);
                        } imLayoutEnd(c);
                    } imForEnd(c);

                    if (imButtonIsClicked(c, "+")) {
                        editor.keyboardConfig.synthSlots.push(null);
                    }
                } imLayoutEnd(c);

                imLine(c, LINE_VERTICAL, 1);

                imLayoutBegin(c, COL); imFlex(c); imAlign(c); imJustify(c); {
                    // TODO: put actual UI here
                    imStr(c, "Try playing something, or clicking the keys with the mouse");
                } imLayoutEnd(c);
            } imLayoutEnd(c);

            imLayoutBegin(c, ROW); imFlex(c); imAlign(c); {
                if (imButtonIsClicked(c, "Clear", false, editor.selectedKeys.size > 0)) {
                    editor.selectedKeys.clear();
                }
            } imLayoutEnd(c);

            imLayoutBegin(c, ROW); imFlex(c); imAlign(c); {
                const ui = imKeyboard(c, ctx);
                ui.selection  = editor.selectedKeys;
                ui.config     = editor.keyboardConfig;
                ui.slotColors = editor.slotColours;

                // Click+drag to start and finish a new selection
                {
                    const mouse = getGlobalEventSystem().mouse;
                    if (elHasMousePress(c) && mouse.leftMouseButton) {
                        editor.selectedKeys.clear();
                    }
                    for (const key of ui.keysPressed) {
                        editor.selectedKeys.add(key.index);
                    }
                }
            } imLayoutEnd(c);
        } imLayoutEnd(c);
    } imLayoutEnd(c);

    if (editor.deferredAction) {
        const action = editor.deferredAction;
        editor.deferredAction = undefined;
        action();
    }

    if (!ctx.handled) {
        if (ctx.blurredState) {
        }

        if (ctx.keyReleaseState) {
        }

        if (ctx.keyPressState) {
            const { keyUpper, ctrlPressed, shiftPressed, key } = ctx.keyPressState;

            // if (keyUpper === "Z" && ctrlPressed && !shiftPressed) {
            //     editor.deferredAction = () => editorUndo(editor);
            //     ctx.handled = true;
            // } else if (
            //     (keyUpper === "Z" && ctrlPressed && shiftPressed) ||
            //     (keyUpper === "Y" && ctrlPressed && !shiftPressed)
            // ) {
            //     editor.deferredAction = () => editorRedo(editor);
            //     ctx.handled = true;
            // } else if (key === "Escape") {
            //     setViewChartSelect(ctx);
            //     ctx.handled = true;
            // }

            if (!ctx.handled) {
                const instrumentKey = getKeyForKeyboardKey(ctx.keyboard, key);
                if (instrumentKey) {
                    pressKey(instrumentKey.index, instrumentKey.noteId, ctx.keyPressState.isRepeat);
                    ctx.handled = true;
                }
            }

            if (ctx.handled) {
                ctx.keyPressState.e.preventDefault();
                ctx.keyPressState = null;
            }
        }
    }
}
