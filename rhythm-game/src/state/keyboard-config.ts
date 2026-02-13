import { EffectRackPreset } from "./data-repository";
import { KEYBOARD_LAYOUT_FLAT } from "./keyboard-state";

export type KeyboardConfig = {
    synths: (EffectRackPreset | null)[];
    keymaps: number[];
};

export function newKeyboardConfig(): KeyboardConfig {
    return {
        synths: [null],
        keymaps: KEYBOARD_LAYOUT_FLAT.split("").map(() => 0),
    };
}
