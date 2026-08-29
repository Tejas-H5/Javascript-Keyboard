import { imTextInputOneLine } from "src/app-components/text-input-one-line";
import { imButtonIsClicked } from "src/components/button";
import { BLOCK, COL, cssVars, imui, ROW } from "src/utils/im-js/im-ui";
import { loadEffectRackPreset, updateEffectRackPreset } from "src/state/data-repository";
import { EffectRackPreset, EffectRackPresetMetadata } from "src/state/keyboard-config";
import { assert } from "src/utils/assert";
import { im, ImCache, imdom } from "src/utils/im-js";
import { GlobalContext } from "./app";
import { CANCELLED, DONE } from "src/utils/async-utils";

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

    // Maybe we should cancell this sooner somehow?
    return loadEffectRackPreset(ctx.repo, preset, (val) => {
        if (s.selected !== preset) {
            return CANCELLED;
        }

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
    imui.Begin(c, COL); imui.Flex(c); {
        if (im.If(c) && loading) {
            imui.Begin(c, COL); imui.Flex(c, 2); {
                imdom.Str(c, "Loading...");
            } imui.End(c);
        } else {
            im.IfElse(c);

            if (im.If(c) && s.error) {
                imui.Begin(c, BLOCK); imui.Fg(c, "red"); {
                    imdom.Str(c, s.error);
                } imui.End(c);
            } im.IfEnd(c);

            imui.Begin(c, COL); imui.Flex(c); imui.ScrollOverflow(c); {
                im.For(c); for (const [groupName, group] of ctx.repo.effectRackPresets.groups) {
                    const open = s.openGroup === groupName;

                    im.KeyedBegin(c, groupName); {
                        imui.Begin(c, BLOCK); {
                            imui.Begin(c, ROW); imui.Align(c); {

                                if (imButtonIsClicked(c, open ? "v" : ">")) {
                                    if (open) {
                                        s.openGroup = "";
                                    } else {
                                        s.openGroup = groupName;
                                    }
                                }

                                imui.Begin(c, ROW); imui.Flex(c); {
                                    imdom.Str(c, groupName);
                                } imui.End(c);
                            } imui.End(c);

                            if (im.If(c) && open) {
                                const itemEv = imPresetsArray(c, ctx, s, group);
                                if (!result && itemEv) {
                                    result = itemEv;
                                }
                            } im.IfEnd(c);
                        } imui.End(c);
                    } im.KeyedEnd(c);
                } im.ForEnd(c);
            } imui.End(c);
        } im.IfEnd(c);
    } imui.End(c);

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
            imui.Begin(c, BLOCK); imui.Bg(c, selected ? cssVars.bg2 : ""); imui.NoSelect(c); {
                if (im.isFirstishRender(c)) {
                    imdom.setStyle(c, "cursor", "pointer");
                    imdom.setClass(c, "hoverable");
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
                            updateEffectRackPreset(ctx.repo, s.selectedLoaded, () => DONE);

                            ctx.handled = true;
                        }

                        if (ev.cancel) {
                            stopRenaming(ctx, s);
                            ctx.handled = true;
                        }
                    }
                } else {
                    im.IfElse(c);

                    imui.Begin(c, ROW); {
                        imdom.Str(c, preset.name);

                        imui.Flex1(c);

                        imdom.Str(c, preset.serializedBytes); imdom.Str(c, "b");
                    } imui.End(c);
                } im.IfEnd(c);
            } imui.End(c);

        } im.KeyedEnd(c);
    } im.ForEnd(c);

    return result;
}

