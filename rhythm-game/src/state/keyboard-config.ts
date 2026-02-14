import { EffectRackPreset } from "./data-repository.ts";
import { KEYBOARD_LAYOUT_FLAT } from "./keyboard-state.ts";

export type KeyboardConfig = {
    synthSlots: (EffectRackPreset | null)[];
    keymaps: number[];
};

export function newKeyboardConfig(): KeyboardConfig {
    return {
        synthSlots: [null],
        keymaps: KEYBOARD_LAYOUT_FLAT.split("").map(() => 0),
    };
}
