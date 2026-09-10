import { cssVars, imui, PERCENT, ROW } from "imcf/im-ui";
import { getCurrentPlaySettings, updatePlaySettings } from "dsp/dsp-loop-interface";
import { im, ImCache, imdom } from "imcf";
import { GlobalContext, setViewChartSelect } from "./app";
import { imSvgContext } from "components/svg-context";
import { createKeyboardConfigPreset, loadAllEffectRackPresets, loadAllKeyboardConfigPresets, loadKeyboardConfig, saveKeyboardConfig } from "state/data-repository";
import { KeyboardConfig, newKeyboardConfig } from "state/keyboard-config";
import { arrayAt } from "utils/array-utils";
import { assert } from "utils/assert";
import { imEffectRackEditor, newEffectRackEditorState } from "./sound-lab-effect-rack-editor";
import { imKeyboardConfigEditor, newKeyboardConfigEditorState } from "./sound-lab-keyboard-editor";
import { DONE } from "utils/async-utils";

function log(...messages: any[]) {
    console.log("[sound lab]", ...messages);
}

export const LAB_EDITING_EFFECT_RACK = 0;
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
    let lab = im.State(c, newSoundLabState);

    if (im.Memo(c, 0) === im.MEMO_FIRST_RENDER) {
        loadAllEffectRackPresets(ctx.repo, () => DONE);
        loadAllKeyboardConfigPresets(ctx.repo, (presets) => {
            if (presets.length === 0) {
                // we need to create and load the default preset
                const defaultConfig = newKeyboardConfig();
                return createKeyboardConfigPreset(ctx.repo, defaultConfig, (config) => {
                    lab.keyboardConfig = config.data;
                    return DONE;
                });
            }

            return loadKeyboardConfig(ctx.repo, presets[0], (config) => {
                if (config) {
                    lab.keyboardConfig = config;
                }
                return DONE;
            });
        });
    }

    if (im.If(c) && !lab.keyboardConfig) {
        imdom.Str(c, "Loading....");
    } else {
        im.IfElse(c);
        imSoundLabInternal(c, ctx, lab);
    } im.IfEnd(c);
}

export function imSoundLabInternal(c: ImCache, ctx: GlobalContext, lab: SoundLabState) {
    const keyboard = lab.keyboardConfig; assert(!!keyboard);
    const slotIdx = lab.editingSlotIdx;

    const keyboardChanged = im.Memo(c, keyboard);
    const slotIdxChanged = im.Memo(c, slotIdx);
    const isEditingSynth = slotIdx >= 0 && !!arrayAt(keyboard.synthSlots, slotIdx);

    if (keyboardChanged || slotIdxChanged) {
        if (!isEditingSynth) {
            const settings = getCurrentPlaySettings();
            settings.parameters.keyboardConfig = keyboard;
            updatePlaySettings();
        }
    }

    let effectRackEditor = im.Get(c, newEffectRackEditorState);
    if (im.isSetRequired(c) || slotIdxChanged) {
        const preset = arrayAt(keyboard.synthSlots, slotIdx);
        effectRackEditor = im.Set(c, preset ? newEffectRackEditorState(preset) : undefined);
    }

    let keyboardConfigEditor = im.Get(c, newKeyboardConfigEditorState);
    if (!keyboardConfigEditor) {
        keyboardConfigEditor = im.Set(c, newKeyboardConfigEditorState(keyboard));
    }

    imui.Begin(c, ROW); imui.Size(c, 100, PERCENT, 100, PERCENT); imui.Bg(c, cssVars.bg); imui.NoSelect(c); {
        const svgCtx = imSvgContext(c);
        if (effectRackEditor) effectRackEditor.svgCtx = svgCtx;
        imdom.RootExistingBegin(c, svgCtx.root); {
            if (im.IsFirstRender(c)) {
                // Dont want to be able to touch the SVG actually.
                // It's just for the wires visual.
                imdom.setStyle(c, "pointerEvents", "none");
            }
        } imdom.RootExistingEnd(c, svgCtx.root);

        if (im.If(c) && effectRackEditor) {
            const ev = imEffectRackEditor(c, ctx, lab, effectRackEditor, keyboardConfigEditor);
            if (ev) {
                if (ev.updatedPreset) {
                    assert(lab.editingSlotIdx < keyboard.synthSlots.length);
                    keyboard.synthSlots[lab.editingSlotIdx] = ev.updatedPreset;
                    autosaveKeyboardDebounced(lab, ctx);
                }
            }
        } else {
            im.IfElse(c)
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
        } im.IfEnd(c);

        if (effectRackEditor) effectRackEditor.svgCtx = null;

    } imui.End(c);

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

