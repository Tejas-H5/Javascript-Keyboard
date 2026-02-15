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
    imMemo,
    imSet,
    imSetRequired,
    isFirstishRender
} from "src/utils/im-core";
import { elSetClass, elSetStyle, imDomRootExistingBegin, imDomRootExistingEnd, imStr, imSvgContext } from "src/utils/im-dom";
import { GlobalContext, setViewChartSelect } from "./app";

import { loadAllEffectRackPresets } from "src/state/data-repository";
import { KeyboardConfig } from "src/state/keyboard-config";
import { arrayAt } from "src/utils/array-utils";
import { assert } from "src/utils/assert";
import { done } from "src/utils/async-utils";
import { imEffectRackEditor, newEffectRackEditorState } from "./sound-lab-effect-rack-editor";
import { imKeyboardConfigEditor, newKeyboardConfigEditorState } from "./sound-lab-keyboard-editor";

export const LAB_EDITING_EFFECT_RACK     = 0;
export const LAB_EDITING_KEYBOARD_CONFIG = 1;

export type SoundLabEditingRef = {
    // Always editing a keyboard.
    keyboardConfig: KeyboardConfig;
    editingSlotIdx: number;
}

export type SoundLabState = {
    currentlyEditing: SoundLabEditingRef;
};

function newSoundLabState(editing: SoundLabEditingRef): SoundLabState {
    return {
        currentlyEditing: editing,
    };
}

export function imSoundLab(c: ImCache, ctx: GlobalContext) {
    if (imMemo(c, true)) {
        loadAllEffectRackPresets(ctx.repo, done);
    }

    let lab = imGet(c, newSoundLabState);
    if (!lab) {
        const settings = getCurrentPlaySettings();
        lab = imSet(c, newSoundLabState({ 
            keyboardConfig: settings.parameters.keyboardConfig,
            editingSlotIdx: -1,
        }));
    }

    const editingSlotIdx = lab.currentlyEditing.editingSlotIdx;
    const editingSlotIdxChanged = imMemo(c, editingSlotIdx);

    let effectRackEditor = imGet(c, newEffectRackEditorState);
    if (imSetRequired(c) || editingSlotIdxChanged) {
        const preset = arrayAt(lab.currentlyEditing.keyboardConfig.synthSlots, lab.currentlyEditing.editingSlotIdx);
        effectRackEditor = imSet(c, preset ? newEffectRackEditorState(preset) : undefined);
    }

    // NOTE: still in development

    const keyboardConfig = lab.currentlyEditing.keyboardConfig;
    const keyboardConfigChanged = imMemo(c, keyboardConfig);

    let keyboardConfigEditor = imGet(c, newKeyboardConfigEditorState);
    if (!keyboardConfigEditor || keyboardConfigChanged) {
        keyboardConfigEditor = imSet(c, newKeyboardConfigEditorState(keyboardConfig));
    }

    const isEditingSynthSlot = arrayAt(lab.currentlyEditing.keyboardConfig.synthSlots, lab.currentlyEditing.editingSlotIdx);
    if (imMemo(c, keyboardConfigEditor.version) | imMemo(c, isEditingSynthSlot)) {
        if (!isEditingSynthSlot) {
            const settings = getCurrentPlaySettings();
            settings.parameters.keyboardConfig = lab.currentlyEditing.keyboardConfig;
            updatePlaySettings();
        }

        console.log("Got updated keyboard");
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
                    assert(lab.currentlyEditing.editingSlotIdx < lab.currentlyEditing.keyboardConfig.synthSlots.length);
                    lab.currentlyEditing.keyboardConfig.synthSlots[lab.currentlyEditing.editingSlotIdx] = ev.updatedPreset;
                }
            }
        } else if (imIfElse(c)) {
            const ev = imKeyboardConfigEditor(c, ctx, keyboardConfigEditor);
            if (ev) {
                if (ev.editSlot) {
                    assert(ev.editSlot.slotIdx < lab.currentlyEditing.keyboardConfig.synthSlots.length);
                    lab.currentlyEditing.editingSlotIdx = ev.editSlot.slotIdx;
                }
            }
        } else {
            imIfElse(c);
            imStr(c, "???");
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
                if (isEditingSynthSlot) {
                    lab.currentlyEditing.editingSlotIdx = -1;
                    ctx.handled = true;
                } else {
                    setViewChartSelect(ctx);
                    ctx.handled = true;
                }
            }
        }
    }
}

