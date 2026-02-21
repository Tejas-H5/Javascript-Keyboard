import {
    imBg,
    imLayoutBegin,
    imLayoutEnd,
    imSize,
    PERCENT,
    ROW
} from "src/components/core/layout";
import { cn, cssVars } from "src/components/core/stylesheets";
import { getCurrentPlaySettings, updatePlaySettings } from "src/dsp/dsp-loop-interface";
import {
    ImCache,
    imEndIf,
    imGet,
    imIf,
    imIfElse,
    imIfEnd,
    imMemo,
    imSet,
    imSetRequired,
    imState,
    isFirstishRender,
    MEMO_FIRST_RENDER
} from "src/utils/im-core";
import { elSetClass, elSetStyle, imDomRootExistingBegin, imDomRootExistingEnd, imStr, imSvgContext } from "src/utils/im-dom";
import { GlobalContext, setViewChartSelect } from "./app";

import { createKeyboardConfigPreset, loadAllEffectRackPresets, loadAllKeyboardConfigPresets, loadKeyboardConfig, saveKeyboardConfig } from "src/state/data-repository";
import { KeyboardConfig, newKeyboardConfig } from "src/state/keyboard-config";
import { arrayAt } from "src/utils/array-utils";
import { assert } from "src/utils/assert";
import { DONE, done } from "src/utils/async-utils";
import { imEffectRackEditor, newEffectRackEditorState } from "./sound-lab-effect-rack-editor";
import { imKeyboardConfigEditor, newKeyboardConfigEditorState } from "./sound-lab-keyboard-editor";

function log(...messages: any[]) {
	console.log("[sound lab]", ...messages);
}

export const LAB_EDITING_EFFECT_RACK     = 0;
export const LAB_EDITING_KEYBOARD_CONFIG = 1;

export type SoundLabState = {
    keyboardConfig: KeyboardConfig | null;
    editingSlotIdx: number;
    autosaveKeyboardTimeout: number;
};

function newSoundLabState(): SoundLabState {
    return {
        keyboardConfig: null,
        editingSlotIdx: -1,
        autosaveKeyboardTimeout: 0,
    };
}

export function imSoundLab(c: ImCache, ctx: GlobalContext) {
    let lab = imState(c, newSoundLabState);

    if (imMemo(c, 0) === MEMO_FIRST_RENDER) {
        loadAllEffectRackPresets(ctx.repo, done);
        loadAllKeyboardConfigPresets(ctx.repo, (presets, err) => {
            if (!presets || err) return DONE;
            if (presets.length === 0) {
                // we need to create and load the default preset
                const defaultConfig = newKeyboardConfig();
                return createKeyboardConfigPreset(ctx.repo, defaultConfig, (config, err) => {
                    if (!config || err) return DONE;
                    
                    lab.keyboardConfig = config.data;
                    return DONE;
                });
            }

            return loadKeyboardConfig(ctx.repo, presets[0], (config, err) => {
                if (!config || err) return DONE;

                lab.keyboardConfig = config;
                return DONE;
            });
        });
    }

    if (imIf(c) && !lab.keyboardConfig) {
        imStr(c, "Loading....");
    } else {
        imIfElse(c);
        imSoundLabInternal(c, ctx, lab);
    } imIfEnd(c);
}

export function imSoundLabInternal(c: ImCache, ctx: GlobalContext, lab: SoundLabState) {
    const keyboard = lab.keyboardConfig; assert(!!keyboard);
    const slotIdx  = lab.editingSlotIdx;

    const keyboardChanged = imMemo(c, keyboard);
    const slotIdxChanged  = imMemo(c, slotIdx);
    const isEditingSynth = slotIdx >= 0 && !!arrayAt(keyboard.synthSlots, slotIdx);

    if (keyboardChanged || slotIdxChanged) {
        if (!isEditingSynth) {
            const settings = getCurrentPlaySettings();
            settings.parameters.keyboardConfig = keyboard;
            updatePlaySettings();
        }
    }

    let effectRackEditor = imGet(c, newEffectRackEditorState);
    if (imSetRequired(c) || slotIdxChanged) {
        const preset = arrayAt(keyboard.synthSlots, slotIdx);
        effectRackEditor = imSet(c, preset ? newEffectRackEditorState(preset) : undefined);
    }

    let keyboardConfigEditor = imGet(c, newKeyboardConfigEditorState);
    if (!keyboardConfigEditor) {
        keyboardConfigEditor = imSet(c, newKeyboardConfigEditorState(keyboard));
    }

    imLayoutBegin(c, ROW); imSize(c, 100, PERCENT, 100, PERCENT); imBg(c, cssVars.bg); {
        if (isFirstishRender(c)) {
            // Should be the default for web apps tbh. Only on documents, would you ever want to select the text ...
            elSetClass(c, cn.userSelectNone);
        }

        const svgCtx = imSvgContext(c);
        if (effectRackEditor) effectRackEditor.svgCtx = svgCtx;
        imDomRootExistingBegin(c, svgCtx.root); {
            if (isFirstishRender(c)) {
                // Dont want to be able to touch the SVG actually.
                // It's just for the wires visual.
                elSetStyle(c, "pointerEvents", "none");
            }
        } imDomRootExistingEnd(c, svgCtx.root);

        if (imIf(c) && effectRackEditor) {
            const ev = imEffectRackEditor(c, ctx, lab, effectRackEditor, keyboardConfigEditor);
            if (ev) {
                if (ev.updatedPreset) {
                    assert(lab.editingSlotIdx < keyboard.synthSlots.length);
                    keyboard.synthSlots[lab.editingSlotIdx] = ev.updatedPreset;
                    autosaveKeyboardDebounced(lab, ctx);
                }
            }
        } else {
            imIfElse(c)
            const ev = imKeyboardConfigEditor(c, ctx, keyboardConfigEditor);
            if (ev) {
                if (ev.editSlot) {
                    assert(ev.editSlot.slotIdx < keyboard.synthSlots.length);
                    lab.editingSlotIdx = ev.editSlot.slotIdx;
                }
                if (ev.updatedKeyboard) {
                    lab.keyboardConfig = ev.updatedKeyboard;
                    autosaveKeyboardDebounced(lab, ctx);
                }
            }
        } imEndIf(c);

        if (effectRackEditor) effectRackEditor.svgCtx = null;

    } imLayoutEnd(c);

    if (!ctx.handled) {
        if (ctx.blurredState) {
        }

        if (ctx.keyReleaseState) {
        }

        if (ctx.keyPressState) {
            const { key } = ctx.keyPressState;
            if (key === "Escape") {
                if (isEditingSynth) {
                    lab.editingSlotIdx = -1;
                    ctx.handled = true;
                } else {
                    setViewChartSelect(ctx);
                    ctx.handled = true;
                }
            }
        }
    }
}


function autosaveKeyboardDebounced(lab: SoundLabState, ctx: GlobalContext) {
    const keyboard = lab.keyboardConfig; assert(!!keyboard);

    const AUTOSAVE_DEBOUNCE = 500;
    clearTimeout(lab.autosaveKeyboardTimeout);
    const toAutosave = keyboard;
    if (toAutosave.id > 0) {
        lab.autosaveKeyboardTimeout = setTimeout(() => {
            saveKeyboardConfig(ctx.repo, toAutosave, () => {
                log("Autosaved keyboard");
                return DONE;
            });
        }, AUTOSAVE_DEBOUNCE);
    }
}

