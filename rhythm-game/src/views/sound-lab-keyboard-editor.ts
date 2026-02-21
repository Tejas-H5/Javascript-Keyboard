
// NOTE: this is currently the 'sound lab'
// Maybe in the future, it will go back to being just a tiny editor again. 

import { imTextInputOneLine } from "src/app-components/text-input-one-line.ts";
import { imButtonIsClicked } from "src/components/button.ts";
import { BLOCK, COL, imAlign, imBg, imFlex, imFlex1, imGap, imJustify, imLayoutBegin, imLayoutEnd, imPaddingRL, imScrollOverflow, imSize, INLINE_BLOCK, NA, PERCENT, PX, ROW, START } from "src/components/core/layout.ts";
import { imLine, LINE_HORIZONTAL, LINE_VERTICAL } from "src/components/im-line.ts";
import { pressKey } from "src/dsp/dsp-loop-interface.ts";
import { createKeyboardConfigPreset, loadKeyboardConfig } from "src/state/data-repository.ts";
import { effectRackToPreset, getDefaultSineWaveEffectRack, KeyboardConfig, keyboardConfigDeleteSlot } from "src/state/keyboard-config.ts";
import { getKeyForKeyboardKey } from "src/state/keyboard-state.ts";
import { assert } from "src/utils/assert.ts";
import { DONE } from "src/utils/async-utils.ts";
import { CssColor, newColorFromHsv } from "src/utils/colour.ts";
import { ImCache, imFor, imForEnd, imIf, imIfElse, imIfEnd, imMemo, imState, isFirstishRender } from "src/utils/im-core.ts";
import { elHasMousePress, elSetStyle, getGlobalEventSystem, imStr } from "src/utils/im-dom.ts";
import { GlobalContext } from "./app.ts";
import { imHoverable } from "./button.ts";
import { imKeyboard } from "./keyboard.ts";
import { imHeadingBegin, imHeadingEnd } from "./sound-lab-effect-rack-editor.ts";
import { imEffectRackList, newPresetsListState } from "./sound-lab-effect-rack-list.ts";

// No undo for now. Doesn't seem like we need it
export type KeyboardConfigEditorState = {
    keyboardConfig: KeyboardConfig;

    deferredAction: (() => void) | undefined;

    reassigningSlotIdx: number;
    
    selectedKeys: Set<number>;
    slotColours: CssColor[];

    isRenamingSlotIdx: number;

    version: number;

    presetsUi: {
        isRenaming: boolean;
    }
};

function onEdited(editor: KeyboardConfigEditorState) {
    editor.version += 1;
}

export function newKeyboardConfigEditorState(config: KeyboardConfig): KeyboardConfigEditorState {
    return {
        keyboardConfig: config,
        deferredAction: undefined,

        reassigningSlotIdx: -1,

        selectedKeys: new Set(),
        slotColours: [],

        isRenamingSlotIdx: -1,

        version: 0,

        presetsUi: {
            isRenaming: false,
        }
    };
}

type KeyboardConfigEditorEvent = null | {
    editSlot?: { slotIdx: number };
    updatedKeyboard?: KeyboardConfig; // may or may not be a copy...
};

export function imKeyboardConfigEditor(
    c: ImCache,
    ctx: GlobalContext,
    editor: KeyboardConfigEditorState,
): KeyboardConfigEditorEvent {
    let result: KeyboardConfigEditorEvent = null;

    const config = editor.keyboardConfig;

    const presetListState = imState(c, newPresetsListState);
    const numSlots        = config.synthSlots.length;
    const numSlotsChanged = imMemo(c, numSlots);

    if (imMemo(c, editor.version)) {
        result = { updatedKeyboard: editor.keyboardConfig };
    }

    if (config.id <= 0) {
        editor.presetsUi.isRenaming = false;
    }

    // allocate colour slots
    {
        const oldLen = editor.slotColours.length;
        const newLen = config.synthSlots.length;
        if (oldLen !== newLen) {
            editor.slotColours.length = newLen;
        }

        let start = oldLen - 1;
        if (numSlotsChanged) start = 0;
        for (let i = start; i < newLen; i++) {
            config.synthSlots.length;
            editor.slotColours[i] = newColorFromHsv(i / (numSlots + 1), 1, 0.8)
        }
    }

    imLayoutBegin(c, COL); imFlex(c); {
        imLayoutBegin(c, ROW); imPaddingRL(c, 5, PX, 5, PX); {
            imFlex1(c);

            imHeadingBegin(c); imFlex(c); {
                imLayoutBegin(c, INLINE_BLOCK); {
                    const ev = imTextInputOneLine(c, config.name, undefined, false);
                    if (ev) {
                        if (ev.newName !== undefined) {
                            config.name = ev.newName;
                            onEdited(editor);
                        }
                        if (ev.submit || ev.cancel) {
                        }
                    }
                } imLayoutEnd(c);
            } imHeadingEnd(c);

            imFlex1(c);


            imLayoutBegin(c, ROW); imGap(c, 10, PX); {
                if (imButtonIsClicked(c, "Rename", false, config.id > 0)) {
                    editor.presetsUi.isRenaming = true;
                }

                if (imButtonIsClicked(c, "New preset", false)) {
                    createKeyboardConfigPreset(ctx.repo, editor.keyboardConfig, (data, err) => {
                        if (!data || err) return DONE;

                        editor.keyboardConfig       = data;
                        editor.presetsUi.isRenaming = true;

                        return DONE;
                    });
                }
            } imLayoutEnd(c);
        } imLayoutEnd(c);

        imLine(c, LINE_HORIZONTAL, 1);

        imLayoutBegin(c, COL); imFlex(c); {

            imLayoutBegin(c, ROW); imFlex(c); {
                imKeyboardConfigEditorKeyboard(c, ctx, editor, true, -1);

                imKeyboardConfigEditorPresetsList(c, ctx, editor);
            } imLayoutEnd(c);

            imLine(c, LINE_HORIZONTAL, 1);

            imLayoutBegin(c, ROW); imAlign(c); imGap(c, 20, PX); {
                imStr(c, "Slide mouse over the keys to select them");

                if (imButtonIsClicked(c, "Deselect", false, editor.selectedKeys.size > 0)) {
                    editor.selectedKeys.clear();
                }
            } imLayoutEnd(c);

            imLayoutBegin(c, ROW); imFlex(c); {
                const isReassigningSomething = editor.reassigningSlotIdx !== -1;

                imLayoutBegin(c, COL); imFlex(c, 1.8); imAlign(c, START); imScrollOverflow(c); {
                    imFor(c); for (let slotIdx = 0; slotIdx < config.synthSlots.length; slotIdx++) {
                        const preset = config.synthSlots[slotIdx];
                        const presetColor = editor.slotColours[slotIdx];
                        const isReassigning = editor.reassigningSlotIdx === slotIdx

                        if (isReassigningSomething && !isReassigning) continue;

                        imLayoutBegin(c, COL); {
                            imLayoutBegin(c, ROW); imGap(c, 10, PX); imAlign(c); imBg(c, presetColor.toCssString()); { 
                                imLayoutBegin(c, ROW); imFlex(c); imAlign(c); imGap(c, 10, PX); {
                                    if (isFirstishRender(c)) elSetStyle(c, "padding", "0 5px");

                                    imStr(c, "s");
                                    imStr(c, slotIdx);
                                    imStr(c, " -> ");

                                    imLayoutBegin(c, ROW); imJustify(c); imFlex(c); {
                                        const isRenaming = editor.isRenamingSlotIdx === slotIdx;

                                        const ev = imTextInputOneLine(c, preset.name, undefined, isRenaming);
                                        if (ev) {
                                            if (ev.newName !== undefined) {
                                                preset.name = ev.newName;
                                                onEdited(editor);
                                            }
                                            if (ev.submit || ev.cancel) {
                                                editor.isRenamingSlotIdx = -1;
                                            }
                                        }
                                    } imLayoutEnd(c);


                                    if (imButtonIsClicked(c, "Assign to " + slotIdx, false, editor.selectedKeys.size > 0)) {
                                        for (const index of editor.selectedKeys) {
                                            config.keymaps[index] = slotIdx;
                                        }
                                        onEdited(editor);
                                    }

                                    if (imButtonIsClicked(c, !isReassigning ? "Reassign" : "Done", isReassigning)) {
                                        if (isReassigning) {
                                            editor.reassigningSlotIdx = -1;
                                        } else {
                                            editor.reassigningSlotIdx = slotIdx;
                                        }
                                        onEdited(editor);
                                    }

                                    if (imButtonIsClicked(c, "Edit effect rack", false, !isReassigningSomething)) {
                                        result = { editSlot: { slotIdx } }
                                    }

                                    if (imButtonIsClicked(c, "-")) {
                                        editor.reassigningSlotIdx = -1;
                                        editor.deferredAction = () => {
                                            keyboardConfigDeleteSlot(config, slotIdx);
                                            onEdited(editor);
                                        }
                                    }
                                } imLayoutEnd(c);
                            } imLayoutEnd(c);

                            if (imIf(c) && isReassigning) {
                                const ev = imEffectRackList(c, ctx, presetListState);
                                if (ev) {
                                    if (ev.selection) {
                                        assert(slotIdx < config.synthSlots.length);
                                        config.synthSlots[slotIdx] = { ...ev.selection };
                                        onEdited(editor);
                                    }
                                }

                                if (!ctx.handled) {
                                    if (ctx.keyPressState) {
                                        const { key } = ctx.keyPressState;

                                        if (key === "Escape") {
                                            if (editor.isRenamingSlotIdx !== -1) {
                                                editor.reassigningSlotIdx = -1;
                                                ctx.handled = true;
                                            } else if (editor.isRenamingSlotIdx !== -1) {
                                                editor.isRenamingSlotIdx = -1;
                                                ctx.handled = true;
                                            }
                                        }
                                    }
                                }
                            } imIfEnd(c);
                        } imLayoutEnd(c);
                    } imForEnd(c);

                    if (imIf(c) && !isReassigningSomething) {
                        if (imButtonIsClicked(c, "+")) {
                            const newPreset = effectRackToPreset(getDefaultSineWaveEffectRack());
                            config.synthSlots.push(newPreset);
                            const slotIdx =  config.synthSlots.length - 1;
                            editor.isRenamingSlotIdx = slotIdx
                            for (const index of editor.selectedKeys) {
                                config.keymaps[index] = slotIdx;
                            }
                            onEdited(editor);
                        }
                    } imIfEnd(c);
                } imLayoutEnd(c);
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

    return result;
}

export function imKeyboardConfigEditorKeyboard(
    c: ImCache,
    ctx: GlobalContext,
    editor: KeyboardConfigEditorState,
    allowSelection: boolean,
    isolateSlot: number,
) {
    imLayoutBegin(c, ROW); imFlex(c); imAlign(c); {
        const ui = imKeyboard(c, ctx);
        ui.selection   = editor.selectedKeys;
        ui.config      = editor.keyboardConfig;
        ui.slotColours = editor.slotColours;
        ui.isolateSlotIdx = isolateSlot;

        if (allowSelection) {
            const mouse = getGlobalEventSystem().mouse;
            if (elHasMousePress(c) && mouse.leftMouseButton) {
                editor.selectedKeys.clear();
            }
            for (const key of ui.keysPressed) {
                editor.selectedKeys.add(key.index);
            }
        }
    } imLayoutEnd(c);
}

function imKeyboardConfigEditorPresetsList(c: ImCache, ctx: GlobalContext, editor: KeyboardConfigEditorState) {
    const ui = editor.presetsUi;

    imLine(c, LINE_VERTICAL, 1);

    imLayoutBegin(c, COL); imSize(c, 30, PERCENT, 0, NA); imScrollOverflow(c); {
        const keyboardPresets = ctx.repo.tables.keyboardPresets;
        imFor(c); for (const preset of keyboardPresets.loadedMetadata) {
            const selected = preset.id === editor.keyboardConfig.id;

            imLayoutBegin(c, BLOCK); imHoverable(c, selected); {
                if (elHasMousePress(c)) {
                    // selection is set asyncronously after it's actually loaded, and that is ok

                    loadKeyboardConfig(ctx.repo, preset, (config, err) => {
                        if (!config || err) return DONE;

                        editor.keyboardConfig = config;
                        ui.isRenaming = false;
                        onEdited(editor);

                        return DONE;
                    });
                }

                if (imIf(c) && selected && ui.isRenaming) {
                    const ev = imTextInputOneLine(c, preset.name, undefined, true);
                    if (ev) {
                        if (ev.newName !== undefined) {
                            editor.keyboardConfig.name = ev.newName;
                            onEdited(editor);
                        }
                        if (ev.submit || ev.cancel) {
                            ui.isRenaming = false;
                        }
                    }
                } else {
                    imIfElse(c);

                    imStr(c, preset.name);
                } imIfEnd(c);
            } imLayoutEnd(c);
        } imForEnd(c);
    } imLayoutEnd(c);
}
