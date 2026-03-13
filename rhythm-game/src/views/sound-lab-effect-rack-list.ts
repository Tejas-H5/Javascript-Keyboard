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
    imLayoutBegin,
    imLayoutEnd,
    imScrollOverflow,
    ROW
} from "src/components/core/layout";
import { cn, cssVars } from "src/components/core/stylesheets";
import { loadEffectRackPreset, updateEffectRackPreset } from "src/state/data-repository";
import { EffectRackPreset, EffectRackPresetMetadata } from "src/state/keyboard-config";
import { assert } from "src/utils/assert";
import { CANCELLED, done, DONE } from "src/utils/async-utils";
import { im, ImCache, imdom, el, ev, } from "src/utils/im-js";

import { GlobalContext } from "./app";


export type PresetsListState = {
    selected: EffectRackPresetMetadata | null;
    selectedLoaded: EffectRackPreset | null;
    renaming: boolean;

    error: string;
    newName: string;
    openGroup: string;
};

export function newPresetsListState(): PresetsListState {
    return {
        selected: null,
        selectedLoaded: null,
        renaming: false,
        error: "",
        newName: "",
        openGroup: "",
    };
}

export function selectEffectRackPreset(ctx: GlobalContext, s: PresetsListState, preset: EffectRackPresetMetadata | null) {
    if (s.selected === preset) return;

    s.selected       = preset;
    s.selectedLoaded = null;
    s.renaming       = false;

    if (!preset) return;

    return loadEffectRackPreset(ctx.repo, preset, (val, err) => {
        if (!val || err)           return DONE;
        if (s.selected !== preset) return CANCELLED;

        s.selectedLoaded = val;
        return DONE;
    });
}

export function startRenamingPreset(ctx: GlobalContext, s: PresetsListState, preset: EffectRackPresetMetadata) {
    assert(preset.id !== 0);
    selectEffectRackPreset(ctx, s, preset);
    s.renaming = true;
    s.newName = preset.name;
}

export function stopRenaming(ctx: GlobalContext, s: PresetsListState) {
    s.renaming = false;
}

export type PresetSelectionEvent = {
    selection?:       EffectRackPresetMetadata;
    selectionLoaded?: EffectRackPreset;
}

export function imEffectRackList(
    c: ImCache,
    ctx: GlobalContext,
    s: PresetsListState,
): PresetSelectionEvent | null {
    let result: PresetSelectionEvent | null = null;

    if (im.Memo(c, s.selectedLoaded) && s.selectedLoaded) {
        result = { selectionLoaded: s.selectedLoaded };
    }

    const loading = ctx.repo.effectRackPresets.loading;

    // UI could be better but for now I don't care too much.
    imLayoutBegin(c, COL); imFlex(c); {
        if (im.If(c) && loading) {
            imLayoutBegin(c, COL); imFlex(c, 2); {
                imdom.Str(c, "Loading...");
            } imLayoutEnd(c);
        } else {
            im.IfElse(c);

            if (im.If(c) && s.error) {
                imLayoutBegin(c, BLOCK); imFg(c, "red"); {
                    imdom.Str(c, s.error);
                } imLayoutEnd(c);
            } im.IfEnd(c);

            imLayoutBegin(c, COL); imFlex(c); imScrollOverflow(c); {
                im.For(c); for (const [groupName, group] of ctx.repo.effectRackPresets.groups) {
                    const open = s.openGroup === groupName;

                    im.KeyedBegin(c, groupName); {
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
                                    imdom.Str(c, groupName);
                                } imLayoutEnd(c);
                            } imLayoutEnd(c);

                            if (im.If(c) && open) {
                                const itemEv = imPresetsArray(c, ctx, s, group);
                                if (!result && itemEv) {
                                    result = itemEv;
                                }
                            } im.IfEnd(c);
                        } imLayoutEnd(c);
                    } im.KeyedEnd(c);
                } im.ForEnd(c);
            } imLayoutEnd(c);
        } im.IfEnd(c);
    } imLayoutEnd(c);

    return result;
}

function imPresetsArray(
    c: ImCache,
    ctx: GlobalContext,
    s: PresetsListState,
    presets: EffectRackPresetMetadata[],
): PresetSelectionEvent | null {
    let result: PresetSelectionEvent | null = null;

    im.For(c); for (const preset of presets) {
        const selected = preset === s.selected;

        im.KeyedBegin(c, preset); {
            imLayoutBegin(c, BLOCK); imBg(c, selected ? cssVars.bg2 : ""); {
                if (im.isFirstishRender(c)) {
                    imdom.setStyle(c, "cursor", "pointer");
                    imdom.setClass(c, "hoverable");
                    imdom.setClass(c, cn.userSelectNone);
                }

                if (imdom.hasMousePress(c)) {
                    if (!selected) {
                        selectEffectRackPreset(ctx, s, preset);
                    } else {
                        try {
                            selectEffectRackPreset(ctx, s, preset);
                            result = { selection: preset };
                            s.error = "";
                        } catch (err) {
                            s.error = "" + err;
                        }
                    }
                }

                if (im.If(c) && selected && s.renaming && s.selectedLoaded) {
                    const ev = imTextInputOneLine(c, s.newName, "Enter preset name");
                    if (ev) {
                        if (ev.newName) {
                            s.newName = ev.newName;
                            ctx.handled = true;
                        }

                        if (ev.submit) {
                            stopRenaming(ctx, s);

                            s.selectedLoaded.name = s.newName;
                            updateEffectRackPreset(ctx.repo, s.selectedLoaded, done);

                            ctx.handled = true;
                        }

                        if (ev.cancel) {
                            stopRenaming(ctx, s);
                            ctx.handled = true;
                        }
                    }
                } else {
                    im.IfElse(c);

                    imLayoutBegin(c, ROW); {
                        imdom.Str(c, preset.name);

                        imFlex1(c);

                        imdom.Str(c, preset.serializedBytes); imdom.Str(c, "b");
                    } imLayoutEnd(c);
                } im.IfEnd(c);
            } imLayoutEnd(c);

        } im.KeyedEnd(c);
    } im.ForEnd(c);

    return result;
}

