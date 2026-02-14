import { imButtonIsClicked } from "src/components/button";
import {
    COL,
    imAlign,
    imBg,
    imFlex,
    imFlex1,
    imFlexWrap,
    imGap,
    imJustify,
    imLayoutBegin,
    imLayoutEnd,
    imSize,
    PERCENT,
    PX,
    ROW
} from "src/components/core/layout";
import { cn, cssVars } from "src/components/core/stylesheets";
import { imLine, LINE_HORIZONTAL, LINE_VERTICAL } from "src/components/im-line";
import { getCurrentPlaySettings } from "src/dsp/dsp-loop-interface";
import {
    ImCache,
    imGet,
    imIf,
    imIfElse,
    imIfEnd,
    imMemo,
    imSet,
    imState,
    imSwitch,
    imSwitchEnd,
    isFirstishRender
} from "src/utils/im-core";
import { elSetClass, elSetStyle, imDomRootExistingBegin, imDomRootExistingEnd, imStr, imSvgContext } from "src/utils/im-dom";
import { GlobalContext } from "./app";
import { imKeyboard } from "./keyboard";
import { imEffectRackList, selectPreset, startRenamingPreset } from "./sound-lab-effect-rack-list";

import { editorImport, EffectRackEditorState, imEffectRackActualWaveform, imEffectRackEditor, imEffectRackEditorWaveformPreview, imHeading, newEffectRackEditorState } from "./sound-lab-effect-rack-editor";
import { debugFlags } from "src/debug-flags";
import { imKeyboardConfigEditor, newKeyboardConfigEditorState } from "./sound-lab-keyboard-editor";
import { newKeyboardConfig } from "src/state/keyboard-config";
import { createEffectRackPreset, DEFAULT_GROUP_NAME, deleteEffectRackPreset, effectRackToPreset, getLoadedPreset, loadAllEffectRackPresets, updateEffectRackPreset } from "src/state/data-repository";
import { DONE, done } from "src/utils/async-utils";
import { serializeEffectRack } from "src/state/effect-rack";

export const LAB_EDITING_EFFECT_RACK     = 0;
export const LAB_EDITING_KEYBOARD_CONFIG = 1;

type SoundLabState = {
    currentlyEditing: typeof LAB_EDITING_EFFECT_RACK | typeof LAB_EDITING_KEYBOARD_CONFIG;
    rightPanel: {
        presets: boolean;
    },
};

function newSoundLabState(): SoundLabState {
    return {
        currentlyEditing: debugFlags.testSoundLabEditingKeyboardConfig ? LAB_EDITING_KEYBOARD_CONFIG : LAB_EDITING_EFFECT_RACK,
        rightPanel: {
            presets: false,
        },
    };
}

export function imSoundLab(c: ImCache, ctx: GlobalContext) {
    if (imMemo(c, true)) {
        loadAllEffectRackPresets(ctx.repo, done);
    }

    const settings = getCurrentPlaySettings();

    const lab = imState(c, newSoundLabState);

    let effectRackEditor = imGet(c, newEffectRackEditorState);
    if (!effectRackEditor) {
        const rack = settings.parameters.rack;
        effectRackEditor = imSet(c, newEffectRackEditorState(rack));
    }
    if (imMemo(c, effectRackEditor.ui.touchedAnyWidgetCounter)) {
        // Specifically when we're tweaking values, we probably want 
        // to see the preview waveform and not the list of presets.
        lab.rightPanel.presets = false;
    }

    // NOTE: still in development
    let keyboardConfigEditor = imGet(c, newKeyboardConfigEditorState);
    if (!keyboardConfigEditor) {
        keyboardConfigEditor = imSet(c, newKeyboardConfigEditorState(newKeyboardConfig()));
    }

    imLayoutBegin(c, ROW); imSize(c, 100, PERCENT, 100, PERCENT); imBg(c, cssVars.bg); {
        if (isFirstishRender(c)) {
            // Should be the default for web apps tbh. Only on documents, would you ever want to select the text ...
            elSetClass(c, cn.userSelectNone);
        }

        const svgCtx  = imSvgContext(c);
        effectRackEditor.svgCtx = svgCtx;
        imDomRootExistingBegin(c, svgCtx.root); {
            if (isFirstishRender(c)) {
                // Dont want to be able to touch the SVG actually.
                // It's just for the wires visual.
                elSetStyle(c, "pointerEvents", "none");
            }
        } imDomRootExistingEnd(c, svgCtx.root);

        imLayoutBegin(c, COL); imFlex(c, 4); {
            imSwitch(c, lab.currentlyEditing); switch(lab.currentlyEditing) {
                case LAB_EDITING_EFFECT_RACK:     imEffectRackEditor(c, ctx, effectRackEditor);         break;
                case LAB_EDITING_KEYBOARD_CONFIG: imKeyboardConfigEditor(c, ctx, keyboardConfigEditor); break;
                default: imStr(c, "??"); break;
            } imSwitchEnd(c);
        } imLayoutEnd(c);

        imLine(c, LINE_VERTICAL);

        imLayoutBegin(c, COL); imFlex(c, 2); {
            imSoundLabRightPanel(c, ctx, effectRackEditor, lab);
        } imLayoutEnd(c);

        effectRackEditor.svgCtx = null;
    } imLayoutEnd(c);
}

function imSoundLabRightPanel(
    c: ImCache,
    ctx: GlobalContext,
    editor: EffectRackEditorState,
    lab: SoundLabState,
) {
    imLayoutBegin(c, COL); imFlex(c, 3); {
        imLine(c, LINE_HORIZONTAL, 2);

        imLayoutBegin(c, ROW); imGap(c, 5, PX); {
            if (imButtonIsClicked(c, "Wave preview", !lab.rightPanel.presets)) {
                lab.rightPanel.presets = false;
            }

            if (imButtonIsClicked(c, "Presets", lab.rightPanel.presets)) {
                lab.rightPanel.presets = true;
            }
        } imLayoutEnd(c);

        if (imIf(c) && lab.rightPanel.presets) {
            imLayoutBegin(c, COL); imFlex(c); {
                imSwitch(c, lab.currentlyEditing); switch (lab.currentlyEditing) {
                    case LAB_EDITING_EFFECT_RACK:     imHeading(c, "Effect rack presets"); break;
                    case LAB_EDITING_KEYBOARD_CONFIG: imHeading(c, "Keyboard presets");    break;
                    default: imStr(c, "??"); break;
                } imSwitchEnd(c);

                imHeading(c, "Presets");

                imLayoutBegin(c, ROW); imGap(c, 5, PX); imFlexWrap(c); {
                    imFlex1(c);

                    const presetsList = editor.presetsListState;

                    let selectedPreset = getLoadedPreset(ctx.repo, presetsList.selectedId);

                    if (imButtonIsClicked(c, "Overwrite", false, !!selectedPreset) && selectedPreset) {
                        selectedPreset.serialized = serializeEffectRack(editor.effectRack);
                        updateEffectRackPreset(ctx.repo, selectedPreset, done);
                    }

                    if (imButtonIsClicked(c, "Rename", false, !!selectedPreset) && selectedPreset) {
                        startRenamingPreset(ctx, presetsList, selectedPreset);
                    }

                    if (imButtonIsClicked(c, "Delete", false, !!selectedPreset) && selectedPreset) {
                        deleteEffectRackPreset(ctx.repo, selectedPreset, done);
                        selectPreset(presetsList, 0);
                    }

                    if (imButtonIsClicked(c, "New")) {
                        const preset = effectRackToPreset(editor.effectRack);
                        createEffectRackPreset(ctx.repo, preset, () => {
                            presetsList.openGroup = DEFAULT_GROUP_NAME;
                            startRenamingPreset(ctx, presetsList, preset)
                            return DONE;
                        });
                    }
                } imLayoutEnd(c);

                const ev = imEffectRackList(c, ctx, editor.presetsListState);
                if (ev) {
                    if (ev.selection) {
                        editorImport(editor, ev.selection.serialized);
                    }

                    if (ev.rename) {
                        const { preset, newName } = ev.rename;
                        preset.name = newName;
                        updateEffectRackPreset(ctx.repo, preset, done);
                    }
                }
            } imLayoutEnd(c);
        } else {
            imIfElse(c);

            imLayoutBegin(c, ROW); imHeading(c, "Waveform preview"); imLayoutEnd(c);

            imEffectRackEditorWaveformPreview(c, ctx, editor);

            // May seem useless rn, but I want to eventually assign different effect rack presets to 
            // different keys or key ranges, and that is when this will become handy.
            imLayoutBegin(c, ROW); imAlign(c); imJustify(c); imFlex(c, 1); {
                imKeyboard(c, ctx);
            } imLayoutEnd(c);
        } imIfEnd(c);
    } imLayoutEnd(c);

    imLine(c, LINE_HORIZONTAL);

    imLayoutBegin(c, ROW); imHeading(c, "Actual waveform"); imLayoutEnd(c);

    imLayoutBegin(c, COL); imFlex(c, 2); {
        imEffectRackActualWaveform(c, ctx, editor);
    } imLayoutEnd(c);
}
