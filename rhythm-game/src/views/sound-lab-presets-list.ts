import { imTextInputOneLine } from "src/app-components/text-input-one-line";
import { imButtonIsClicked } from "src/components/button";
import {
    BLOCK,
    COL,
    imAlign,
    imBg,
    imFg,
    imFlex,
    imFlex1,
    imFlexWrap,
    imGap,
    imLayoutBegin,
    imLayoutEnd,
    imScrollOverflow,
    PX,
    ROW
} from "src/components/core/layout";
import { cn, cssVars } from "src/components/core/stylesheets";
import {
    serializeEffectRack
} from "src/dsp/dsp-loop-effect-rack";
import {
    createEffectRackPreset,
    DEFAULT_GROUP_NAME,
    deleteEffectRackPreset,
    EffectRackPreset,
    effectRackToPreset,
    getLoadedPreset,
    loadAllEffectRackPresets,
    updateEffectRackPreset
} from "src/state/data-repository";
import { assert } from "src/utils/assert";
import { DONE, done } from "src/utils/async-utils";
import {
    ImCache,
    imFor,
    imForEnd,
    imIf,
    imIfElse,
    imIfEnd,
    imKeyedBegin,
    imKeyedEnd,
    imMemo,
    isFirstishRender
} from "src/utils/im-core";
import { elHasMousePress, elSetClass, elSetStyle, imStr } from "src/utils/im-dom";
import { utf16ByteLength } from "src/utils/utf8";
import { GlobalContext } from "./app";
import { editorImport, EffectRackEditorState, imHeading } from "./sound-lab-effect-rack-editor";


export type PresetsListState = {
    selectedId: number;
    renaming: boolean;

    error: string;
    newName: string;
    openGroup: string;
};

export function presetsListState(): PresetsListState {
    return {
        selectedId: 0,
        renaming: false,
        error: "",
        newName: "",
        openGroup: "",
    };
}


export function startRenamingPreset(ctx: GlobalContext, s: PresetsListState, preset: EffectRackPreset) {
    assert(preset.id !== 0);
    s.selectedId = preset.id;
    s.renaming = true;
    s.newName = preset.name;
}

export function stopRenaming(ctx: GlobalContext, s: PresetsListState) {
    s.renaming = false;
}

export function selectPreset(s: PresetsListState, id: number) {
    s.selectedId = id;
    s.renaming = false;
}

export function imPresetsList(
    c: ImCache,
    ctx: GlobalContext,
    s: PresetsListState,
    editor: EffectRackEditorState
) {
    if (imMemo(c, true)) {
        loadAllEffectRackPresets(ctx.repo, done);
    }

    const loading = ctx.repo.effectRackPresets.loading;

    // UI could be better but for now I don't care too much.
    imLayoutBegin(c, COL); imFlex(c); {
        imLayoutBegin(c, ROW); imGap(c, 5, PX); imFlexWrap(c); {
            imHeading(c, "Presets");

            imFlex1(c);

            let selectedPreset = getLoadedPreset(ctx.repo, s.selectedId);

            if (imButtonIsClicked(c, "Update preset", false, !!selectedPreset) && selectedPreset) {
                selectedPreset.serialized = serializeEffectRack(editor.effectRack);
                updateEffectRackPreset(ctx.repo, selectedPreset, done);
            }

            if (imButtonIsClicked(c, "Rename", false, !!selectedPreset) && selectedPreset) {
                startRenamingPreset(ctx, s, selectedPreset);
            }

            if (imButtonIsClicked(c, "Delete", false, !!selectedPreset) && selectedPreset) {
                deleteEffectRackPreset(ctx.repo, selectedPreset, done);
                selectPreset(s, 0);
            }

            if (imButtonIsClicked(c, "Create new preset")) {
                const preset = effectRackToPreset(editor.effectRack);
                createEffectRackPreset(ctx.repo, preset, () => {
                    s.openGroup = DEFAULT_GROUP_NAME;
                    startRenamingPreset(ctx, s, preset)
                    return DONE;
                });
            }
        } imLayoutEnd(c);

        if (imIf(c) && loading) {
            imLayoutBegin(c, COL); imFlex(c, 2); {
                imStr(c, "Loading...");
            } imLayoutEnd(c);
        } else {
            imIfElse(c);

            if (imIf(c) && s.error) {
                imLayoutBegin(c, BLOCK); imFg(c, "red"); {
                    imStr(c, s.error);
                } imLayoutEnd(c);
            } imIfEnd(c);

            imLayoutBegin(c, COL); imFlex(c); imScrollOverflow(c); {
                imFor(c); for (const [groupName, group] of ctx.repo.effectRackPresets.groups) {
                    const open = s.openGroup === groupName;
                    
                    imKeyedBegin(c, groupName); {
                        imLayoutBegin(c, BLOCK); {
                            imLayoutBegin(c, ROW); imAlign(c); {

                                if (imButtonIsClicked(c, open ? "v" : ">")) {
                                    if (open) {
                                        s.openGroup = "";
                                    } else {
                                        s.openGroup = groupName;
                                    }
                                }

                                imLayoutBegin(c, ROW); imFlex(c); {
                                    imStr(c, groupName);
                                } imLayoutEnd(c);
                            } imLayoutEnd(c);

                            if (imIf(c) && open) {
                                imPresetsArray(c, ctx, s, editor, group);
                            } imIfEnd(c);
                        } imLayoutEnd(c);
                    } imKeyedEnd(c);
                } imForEnd(c);
            } imLayoutEnd(c);
        } imIfEnd(c);
    } imLayoutEnd(c);
}


function imPresetsArray(
    c: ImCache,
    ctx: GlobalContext,
    s: PresetsListState,
    editor: EffectRackEditorState,
    presets: EffectRackPreset[]
) {

    imFor(c); for (const preset of presets) {
        const selected = preset.id === s.selectedId;

        imKeyedBegin(c, preset); {
            imLayoutBegin(c, BLOCK); imBg(c, selected ? cssVars.bg2 : ""); {
                if (isFirstishRender(c)) {
                    elSetStyle(c, "cursor", "pointer");
                    elSetClass(c, "hoverable");
                    elSetClass(c, cn.userSelectNone);
                }

                if (elHasMousePress(c)) {
                    if (s.selectedId === preset.id) {
                        selectPreset(s, 0);
                    } else {
                        try {
                            selectPreset(s, preset.id);
                            editorImport(editor, preset.serialized);
                            s.error = "";
                        } catch (err) {
                            s.error = "" + err;
                        }
                    }
                }

                if (imIf(c) && selected && s.renaming) {
                    const ev = imTextInputOneLine(c, s.newName, "Enter preset name");
                    if (ev) {
                        if (ev.newName) {
                            s.newName = ev.newName;
                            ctx.handled = true;
                        }

                        if (ev.submit) {
                            preset.name = s.newName;
                            stopRenaming(ctx, s);

                            updateEffectRackPreset(ctx.repo, preset, done);

                            ctx.handled = true;
                        }

                        if (ev.cancel) {
                            stopRenaming(ctx, s);
                            editor.ui.modal = 0;
                            ctx.handled = true;
                        }
                    }
                } else {
                    imIfElse(c);

                    imLayoutBegin(c, ROW); {
                        imStr(c, preset.name);

                        imFlex1(c);

                        imStr(c, utf16ByteLength(preset.serialized)); imStr(c, "b");
                    } imLayoutEnd(c);
                } imIfEnd(c);
            } imLayoutEnd(c);

        } imKeyedEnd(c);
    } imForEnd(c);
}

