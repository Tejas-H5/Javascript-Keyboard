
// NOTE: this is currently the 'sound lab'
// Maybe in the future, it will go back to being just a tiny editor again. 

import { imButtonIsClicked } from "src/components/button";
import { COL, imAlign, imFlex, imGap, imLayoutBegin, imLayoutEnd, PX, ROW } from "src/components/core/layout";
import { imLine, LINE_HORIZONTAL } from "src/components/im-line";
import { pressKey } from "src/dsp/dsp-loop-interface";
import { KeyboardConfig } from "src/state/keyboard-config";
import { getKeyForKeyboardKey } from "src/state/keyboard-state";
import { ImCache, imFor, imForEnd } from "src/utils/im-core";
import { imStr } from "src/utils/im-dom";
import { JSONUndoBuffer, newJSONUndoBuffer } from "src/utils/undo-buffer-json";
import { GlobalContext } from "./app";
import { imKeyboard } from "./keyboard";
import { imHeadingBegin, imHeadingEnd } from "./sound-lab-effect-rack-editor";

// I won't assume anything for now
export type KeyboardConfigEditorState = {
    keyboardConfig: KeyboardConfig;
    undoBuffer: JSONUndoBuffer<KeyboardConfig>;
};

export function newKeyboardConfigEditorState(config: KeyboardConfig): KeyboardConfigEditorState {
    return {
        keyboardConfig: config,
        undoBuffer: newJSONUndoBuffer<KeyboardConfig>(1000),
    };
}

export function imKeyboardConfigEditor(c: ImCache, ctx: GlobalContext, editor: KeyboardConfigEditorState) {
    imLayoutBegin(c, COL); imFlex(c); {
        imHeadingBegin(c); {
            imStr(c, "keyboard layout");
        } imHeadingEnd(c);

        imLine(c, LINE_HORIZONTAL, 1);

        imLayoutBegin(c, COL); imFlex(c); {
            imLayoutBegin(c, COL); imFlex(c); {
                imFor(c); for (let i = 0; i < editor.keyboardConfig.synths.length; i++) {
                    imLayoutBegin(c, ROW); imGap(c, 10, PX); imAlign(c); {
                        if (imButtonIsClicked(c, "-")) {
                            editor.keyboardConfig.synths.push(null);
                        }

                        imLayoutBegin(c, ROW); imFlex(c); { 
                            const preset = editor.keyboardConfig.synths[i];
                            imStr(c, "slot "); imStr(c, i); imStr(c, ": ");
                            imStr(c, preset ? preset.name : "Not set");
                        } imLayoutEnd(c);
                    } imLayoutEnd(c);
                } imForEnd(c);

                if (imButtonIsClicked(c, "+")) {
                    editor.keyboardConfig.synths.push(null);
                }
            } imLayoutEnd(c);

            imLayoutBegin(c, ROW); imFlex(c); imAlign(c); {
                imKeyboard(c, ctx);
            } imLayoutEnd(c);
        } imLayoutEnd(c);
    } imLayoutEnd(c);

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
