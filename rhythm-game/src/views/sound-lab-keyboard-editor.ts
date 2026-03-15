
// NOTE: this is currently the 'sound lab'
// Maybe in the future, it will go back to being just a tiny editor again. 

import { imTextInputOneLine } from "src/app-components/text-input-one-line.ts";
import { imButtonIsClicked } from "src/components/button.ts";
import { BLOCK, COL, CssColor, imui, INLINE_BLOCK, NA, PERCENT, PX, ROW, START } from "src/utils/im-js/im-ui";
import { imLine, LINE_HORIZONTAL, LINE_VERTICAL } from "src/components/im-line.ts";
import { pressKey } from "src/dsp/dsp-loop-interface.ts";
import { createKeyboardConfigPreset, loadKeyboardConfig } from "src/state/data-repository.ts";
import { effectRackToPreset, getDefaultSineWaveEffectRack, KeyboardConfig, keyboardConfigDeleteSlot } from "src/state/keyboard-config.ts";
import { getKeyForKeyboardKey } from "src/state/keyboard-state.ts";
import { assert } from "src/utils/assert.ts";
import { DONE } from "src/utils/async-utils.ts";
import { im, ImCache, imdom, el, ev, } from "src/utils/im-js";

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

    const presetListState = im.State(c, newPresetsListState);
    const numSlots        = config.synthSlots.length;
    const numSlotsChanged = im.Memo(c, numSlots);

    if (im.Memo(c, editor.version)) {
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
            editor.slotColours[i] = imui.newColorFromHsv(i / (numSlots + 1), 1, 0.8)
        }
    }

    imui.Begin(c, COL); imui.Flex(c); {
        imui.Begin(c, ROW); imui.PaddingRL(c, 5, PX, 5, PX); {
            imui.Flex1(c);

            imHeadingBegin(c); imui.Flex(c); {
                imui.Begin(c, INLINE_BLOCK); {
                    const ev = imTextInputOneLine(c, config.name, undefined, false);
                    if (ev) {
                        if (ev.newName !== undefined) {
                            config.name = ev.newName;
                            onEdited(editor);
                        }
                        if (ev.submit || ev.cancel) {
                            ctx.handled = true
                        }
                    }
                } imui.End(c);
            } imHeadingEnd(c);

            imui.Flex1(c);

            imui.Begin(c, ROW); imui.Gap(c, 10, PX); {
                if (imButtonIsClicked(c, "Rename", false, config.id > 0)) {
                    editor.presetsUi.isRenaming = true;
                }

                if (imButtonIsClicked(c, "New preset", false)) {
                    createKeyboardConfigPreset(ctx.repo, editor.keyboardConfig, (data, err) => {
                        if (!data || err) return DONE;

                        editor.keyboardConfig       = data.data;
                        editor.presetsUi.isRenaming = true;

                        return DONE;
                    });
                }
            } imui.End(c);
        } imui.End(c);

        imLine(c, LINE_HORIZONTAL, 1);

        imui.Begin(c, COL); imui.Flex(c); {

            imui.Begin(c, ROW); imui.Flex(c); {
                imKeyboardConfigEditorKeyboard(c, ctx, editor, true, -1);

                imKeyboardConfigEditorPresetsList(c, ctx, editor);
            } imui.End(c);

            imLine(c, LINE_HORIZONTAL, 1);

            imui.Begin(c, ROW); imui.Align(c); imui.Gap(c, 20, PX); {
                imdom.Str(c, "Slide mouse over the keys to select them");

                if (imButtonIsClicked(c, "Deselect", false, editor.selectedKeys.size > 0)) {
                    editor.selectedKeys.clear();
                }
            } imui.End(c);

            imui.Begin(c, ROW); imui.Flex(c); {
                const isReassigningSomething = editor.reassigningSlotIdx !== -1;

                imui.Begin(c, COL); imui.Flex(c, 1.8); imui.Align(c, START); imui.ScrollOverflow(c); {
                    im.For(c); for (let slotIdx = 0; slotIdx < config.synthSlots.length; slotIdx++) {
                        const preset = config.synthSlots[slotIdx];
                        const presetColor = editor.slotColours[slotIdx];
                        const isReassigning = editor.reassigningSlotIdx === slotIdx

                        if (isReassigningSomething && !isReassigning) continue;

                        imui.Begin(c, COL); {
                            imui.Begin(c, ROW); imui.Gap(c, 10, PX); imui.Align(c); imui.Bg(c, presetColor.toCssString()); { 
                                imui.Begin(c, ROW); imui.Flex(c); imui.Align(c); imui.Gap(c, 10, PX); {
                                    if (im.isFirstishRender(c)) imdom.setStyle(c, "padding", "0 5px");

                                    imdom.Str(c, "s");
                                    imdom.Str(c, slotIdx);
                                    imdom.Str(c, " -> ");

                                    imui.Begin(c, ROW); imui.Justify(c); imui.Flex(c); {
                                        const isRenaming = editor.isRenamingSlotIdx === slotIdx;

                                        const ev = imTextInputOneLine(c, preset.name, undefined, isRenaming);
                                        if (ev) {
                                            console.log("EVVVV", ev)
                                            if (ev.newName !== undefined) {
                                                preset.name = ev.newName;
                                                onEdited(editor);
                                            }
                                            if (ev.submit || ev.cancel) {
                                                editor.isRenamingSlotIdx = -1;
                                            }
                                            ctx.handled = true;
                                        }
                                    } imui.End(c);


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
                                } imui.End(c);
                            } imui.End(c);

                            if (im.If(c) && isReassigning) {
                                const ev = imEffectRackList(c, ctx, presetListState);
                                if (ev) {
                                    if (ev.selectionLoaded) {
                                        assert(slotIdx < config.synthSlots.length);
                                        config.synthSlots[slotIdx] = { ...ev.selectionLoaded };
                                        onEdited(editor);
                                    }
                                }
                            } im.IfEnd(c);
                        } imui.End(c);
                    } im.ForEnd(c);

                    if (im.If(c) && !isReassigningSomething) {
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
                    } im.IfEnd(c);
                } imui.End(c);
            } imui.End(c);
        } imui.End(c);
    } imui.End(c);

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
            const { key } = ctx.keyPressState;
            
            if (key === "Escape") {
                if (editor.isRenamingSlotIdx !== -1) {
                    editor.reassigningSlotIdx = -1;
                    ctx.handled = true;
                } else if (editor.presetsUi.isRenaming) {
                    editor.presetsUi.isRenaming = false;
                    ctx.handled = true;
                }
            } else {
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
    imui.Begin(c, ROW); imui.Flex(c); imui.Align(c); {
        const ui = imKeyboard(c, ctx);
        ui.selection   = editor.selectedKeys;
        ui.config      = editor.keyboardConfig;
        ui.slotColours = editor.slotColours;
        ui.isolateSlotIdx = isolateSlot;

        if (allowSelection) {
            const mouse = imdom.getMouse();
            if (imdom.hasMousePress(c) && mouse.leftMouseButton) {
                editor.selectedKeys.clear();
            }
            for (const key of ui.keysPressed) {
                editor.selectedKeys.add(key.index);
            }
        }
    } imui.End(c);
}

function imKeyboardConfigEditorPresetsList(c: ImCache, ctx: GlobalContext, editor: KeyboardConfigEditorState) {
    const ui = editor.presetsUi;

    imLine(c, LINE_VERTICAL, 1);

    imui.Begin(c, COL); imui.Size(c, 30, PERCENT, 0, NA); imui.ScrollOverflow(c); {
        const keyboardPresets = ctx.repo.tables.keyboardPresets;
        im.For(c); for (const preset of keyboardPresets.allItemsAsync.val) {
            const selected = preset.id === editor.keyboardConfig.id;

            imui.Begin(c, BLOCK); imHoverable(c, selected); {
                if (imdom.hasMousePress(c)) {
                    // selection is set asyncronously after it's actually loaded, and that is ok

                    loadKeyboardConfig(ctx.repo, preset, (config, err) => {
                        if (!config || err) return DONE;

                        editor.keyboardConfig = config;
                        ui.isRenaming = false;
                        onEdited(editor);

                        return DONE;
                    });
                }

                if (im.If(c) && selected && ui.isRenaming) {
                    const ev = imTextInputOneLine(c, preset.name, undefined, true);
                    if (ev) {
                        if (ev.newName !== undefined) {
                            editor.keyboardConfig.name = ev.newName;
                            onEdited(editor);
                        }
                        if (ev.submit || ev.cancel) {
                            ui.isRenaming = false;
                        }
                        ctx.handled = true;
                    } 
                } else {
                    im.IfElse(c);

                    imdom.Str(c, preset.name);
                } im.IfEnd(c);
            } imui.End(c);
        } im.ForEnd(c);
    } imui.End(c);

    if (!ctx.handled) {
        if (ctx.keyPressState?.key === "Escape") {
            if (editor.presetsUi.isRenaming) {
                editor.presetsUi.isRenaming = false;
                ctx.handled = true;
            }
        }
    }
}
