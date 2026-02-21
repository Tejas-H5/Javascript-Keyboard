import { debugFlags } from "src/debug-flags.ts";
import {compileEffectRack, deserializeEffectRack, EffectRack, newEffectRack, newEffectRackBiquadFilter, newEffectRackDelay, newEffectRackEnvelope, newEffectRackItem, newEffectRackMaths, newEffectRackMathsItemCoefficient, newEffectRackMathsItemTerm, newEffectRackNoise, newEffectRackOscillator, newEffectRackSwitch, serializeEffectRack} from "./effect-rack.ts";
import { utf16ByteLength } from "src/utils/utf8.ts";

export const KEYBOARD_LAYOUT: string[] = [
    "1234567890-=",
    "qwertyuiop[]",
    "asdfghjkl;'↵",
    "zxcvbnm,./",
];

export const KEYBOARD_LAYOUT_FLAT = KEYBOARD_LAYOUT.join("");

export type KeyboardConfig = {
    id:         number;
    name:       string;
    synthSlots: EffectRackPreset[];
    keymaps:    number[];
};

export function newKeyboardConfig(): KeyboardConfig {
    return {
        id: -1,
        name: "Unnamed",
        synthSlots: [
            effectRackToPreset(getDefaultSineWaveEffectRack())
        ], 
        keymaps: KEYBOARD_LAYOUT_FLAT.split("").map(() => 0),
    };
}

export function keyboardConfigDeleteSlot(config: KeyboardConfig, slotIdx: number) {
    config.synthSlots.splice(slotIdx, 1);

    // Move references to synth 0
    for (let i = 0; i < config.keymaps.length; i++) {
        if (config.keymaps[i] === slotIdx) {
            config.keymaps[i] = 0;
        }
    }

    // consumers should just handle 0 slots gracefully
}

export type EffectRackPreset = {
    id:         number;
    name:       string;
    serialized: string; // Using string instead of an object makes it copyable by design.
};

export function effectRackToPreset(effectRack: EffectRack): EffectRackPreset {
    return {
        id: 0,
        name: effectRack.name ?? "Unnamed",
        serialized: serializeEffectRack(effectRack),
    };
}

export function effectRackPresetToMetadata(effectRack: EffectRackPreset): EffectRackPresetMetadata {
    return {
        id:   effectRack.id,
        name: effectRack.name,
        serializedBytes: utf16ByteLength(effectRack.serialized)
    };
}

export type EffectRackPresetMetadata = {
    id: number;
    name: string;
    serializedBytes: number;
};

export function presetToEffectRack(preset: EffectRackPreset): EffectRack {
    const rack = deserializeEffectRack(preset.serialized);

    rack.id   = preset.id;
    rack.name = preset.name;

    return rack;
}



export function getDefaultSineWaveEffectRack(): EffectRack {
    const rack = newEffectRack();

    rack.name = "Default sine wave";

    // Good default
    const env = newEffectRackEnvelope();
    const envItem = newEffectRackItem(env);
    rack.effects.push(envItem);

    const osc = newEffectRackOscillator();
    const oscItem = newEffectRackItem(osc);
    rack.effects.push(oscItem);

    // compile to allocate register Ids
    compileEffectRack(rack);

    osc.amplitudeUI.valueRef = { regOutputId: env.valueOut.id };
    rack.output.valueRef     = { regOutputId: osc.waveOut.id };

    // Rest are for testing purposes
    if (
        debugFlags.testSoundLab &&
        debugFlags.testSoundLabAllEffectRackEffects
    ) {
        const maths = newEffectRackMaths();
        rack.effects.push(newEffectRackItem(maths));
        rack.effects.push(newEffectRackItem(newEffectRackBiquadFilter()));

        {
            const term = newEffectRackMathsItemTerm();
            maths.terms.push(term);
            term.coefficients.push(newEffectRackMathsItemCoefficient());
            term.coefficients.push(newEffectRackMathsItemCoefficient());
        }
        {
            const term = newEffectRackMathsItemTerm();
            maths.terms.push(term);
            term.coefficients.push(newEffectRackMathsItemCoefficient());
            term.coefficients.push(newEffectRackMathsItemCoefficient());
        }

        rack.effects.push(newEffectRackItem(newEffectRackSwitch()));
        rack.effects.push(newEffectRackItem(newEffectRackNoise()));
        rack.effects.push(newEffectRackItem(newEffectRackDelay()));
    }

    compileEffectRack(rack);
    return rack;
}
