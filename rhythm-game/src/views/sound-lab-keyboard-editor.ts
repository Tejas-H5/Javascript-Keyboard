
// NOTE: this is currently the 'sound lab'
// Maybe in the future, it will go back to being just a tiny editor again. 

import { imButtonIsClicked } from "src/components/button.ts";
import { COL, imAlign, imFlex, imGap, imJustify, imLayoutBegin, imLayoutEnd, imScrollOverflow, PX, ROW, START } from "src/components/core/layout.ts";
import { imLine, LINE_HORIZONTAL, LINE_VERTICAL } from "src/components/im-line.ts";
import { pressKey } from "src/dsp/dsp-loop-interface.ts";
import { KeyboardConfig } from "src/state/keyboard-config.ts";
import { getKeyForKeyboardKey, InstrumentKey } from "src/state/keyboard-state.ts";
import { ImCache, imFor, imForEnd, imIf, imIfEnd, imState } from "src/utils/im-core.ts";
import { imStr } from "src/utils/im-dom.ts";
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
    
    selectedKeys: Set<InstrumentKey>;
};

export function newKeyboardConfigEditorState(config: KeyboardConfig): KeyboardConfigEditorState {
    return {
        keyboardConfig: config,
        undoBuffer: newJSONUndoBuffer<KeyboardConfig>(1000),

        deferredAction: undefined,

        reassigningSlotIdx: -1,
        reassigningPresetLookup: "",

        selectedKeys: new Set(),
    };
}

export function imKeyboardConfigEditor(c: ImCache, ctx: GlobalContext, editor: KeyboardConfigEditorState) {
    const presetListState = imState(c, presetsListState);

    imLayoutBegin(c, COL); imFlex(c); {
        imHeadingBegin(c); {
            imStr(c, "Keyboard 22");
        } imHeadingEnd(c);

        imLine(c, LINE_HORIZONTAL, 1);

        imLayoutBegin(c, COL); imFlex(c); {
            imLayoutBegin(c, ROW); imFlex(c); imGap(c, 5, PX); {
                const isReassigningSomething = editor.reassigningSlotIdx !== -1;

                imLayoutBegin(c, COL); imFlex(c); imAlign(c, START); imScrollOverflow(c); {
                    imFor(c); for (let slotIdx = 0; slotIdx < editor.keyboardConfig.synths.length; slotIdx++) {
                        const preset = editor.keyboardConfig.synths[slotIdx];
                        const isReassigning = editor.reassigningSlotIdx === slotIdx

                        if (isReassigningSomething && !isReassigning) continue;

                        imLayoutBegin(c, COL); {
                            imLayoutBegin(c, ROW); imGap(c, 10, PX); imAlign(c); { 
                                imLayoutBegin(c, ROW); imFlex(c); imAlign(c); imGap(c, 10, PX); {
                                    imStr(c, slotIdx);

                                    imStr(c, " -> ");

                                    imLayoutBegin(c, ROW); imJustify(c); imFlex(c); {
                                        imStr(c, preset ? preset.name : "Nothing");
                                    } imLayoutEnd(c);

                                    if (imIf(c) && !isReassigningSomething) {
                                        if (imButtonIsClicked(c, "-")) {
                                            editor.deferredAction = () => {
                                                editor.keyboardConfig.synths.splice(slotIdx, 1);
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
                                        editor.keyboardConfig.synths[slotIdx] = { ...ev.selection };
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
                        editor.keyboardConfig.synths.push(null);
                    }
                } imLayoutEnd(c);

                imLine(c, LINE_VERTICAL, 1);

                imLayoutBegin(c, COL); imFlex(c); imAlign(c); imJustify(c); {
                    // TODO: put actual UI here
                    imStr(c, "Try playing something, or clicking the keys with the mouse");
                } imLayoutEnd(c);
            } imLayoutEnd(c);

            imLayoutBegin(c, ROW); imFlex(c); imAlign(c); {
                const ui = imKeyboard(c, ctx);
                ui.selection = editor.selectedKeys;
                for (const key of ui.keysPressed) {
                    if (!editor.selectedKeys.has(key)) {
                        editor.selectedKeys.add(key);
                    } else {
                        editor.selectedKeys.delete(key);
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
