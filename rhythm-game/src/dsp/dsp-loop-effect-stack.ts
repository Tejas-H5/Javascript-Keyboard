// An effect-rack based sound system that passes data via registers.
// All `number` are actually registers! This is where I'm hoping the non-linearity and interestingnesss
// can come from. The assembly-style thing is way harder to do anything in IMO.

import { filterInPlace } from "src/utils/array-utils";
import { assert, unreachable } from "src/utils/assert";
import { sawtooth, sin, square, triangle } from "src/utils/turn-based-waves";

export const EFFECT_RACK_ITEM__OSCILLATOR = 0;

export type EffectRAckItemType
    = typeof EFFECT_RACK_ITEM__OSCILLATOR;

type EffectRackItemTypeBase = { type: number; };

export type EffectRackItem 
    = Oscillator;

// If we're using a RegisterIndex without reading from or writing to a register, then we're using it wrong.
// -1 -> No register assigned.
export type RegisterIdx = number & { __RegisterIdx: void } ;

export function asRegisterIdx(val: number) {
    return val as RegisterIdx;
}
export function registerIdxAsNumber(val: RegisterIdx) {
    return val as number;
}

export type RegisterBinding = {
    name: string;

    // Cleaning up unused bindings is a hard problem with the current setup. 
    // I need to rebind various bindingIdx to something else - possibly do 2 passes with our compilation code. 
    // For now, let's leave it unsolved - it is ok that some bindings are unused.
    used: boolean;
};

export type RegisterIdxForUI = {
    value: number;

    // JSON serialization - can't use a reference here.
    // Also, can index into registers if not -1 to get the real value.
    bindingIdx: RegisterIdx; 
};

export function getRegisterIdxForUIValue(e: EffectRack, reg: RegisterIdxForUI) {
    if (reg.bindingIdx === -1) return reg.value;

    const binding = e.bindings[reg.bindingIdx]; assert(!!binding);
    while (reg.bindingIdx >= e.registers.length) {
        e.registers.push(0);
    }
    return e.registers[reg.bindingIdx];
}

export function newRegisterIdxForUI(val: number): RegisterIdxForUI {
    return {
        value: val,
        bindingIdx: asRegisterIdx(-1),
    };
}

export type OscillatorWave = {
    t: number;

    phase:       RegisterIdx;
    amplitude:   RegisterIdx;
    frequency:   RegisterIdx;
    sin:         RegisterIdx;
    square:      RegisterIdx;
    triangle:    RegisterIdx;
    saw:         RegisterIdx;

    phaseUI:     RegisterIdxForUI;
    amplitudeUI: RegisterIdxForUI;
    frequencyUI: RegisterIdxForUI;
    sinUI:       RegisterIdxForUI;
    squareUI:    RegisterIdxForUI;
    triangleUI:  RegisterIdxForUI;
    sawUI:       RegisterIdxForUI;
};

export type Oscillator = EffectRackItemTypeBase & {
    type: typeof EFFECT_RACK_ITEM__OSCILLATOR;
    waves: OscillatorWave[];

    amplitude: RegisterIdx;
    dst: RegisterIdx;

    amplitudeUI: RegisterIdxForUI;
    dstUI: RegisterIdxForUI;
};

export function newOscillator(): Oscillator {
    return {
        type: EFFECT_RACK_ITEM__OSCILLATOR,
        waves: [],

        amplitude: asRegisterIdx(0),
        dst: asRegisterIdx(0),

        amplitudeUI: newRegisterIdxForUI(0),
        dstUI:       newRegisterIdxForUI(0),
    };
}

export function newOscillatorWave(): OscillatorWave {
    return {
        t: 0,

        phase:       asRegisterIdx(0),
        phaseUI:     newRegisterIdxForUI(0),

        amplitude:   asRegisterIdx(0),
        amplitudeUI: newRegisterIdxForUI(0),

        frequency:   asRegisterIdx(0),
        frequencyUI: newRegisterIdxForUI(0),

        sin:         asRegisterIdx(0),
        sinUI:       newRegisterIdxForUI(0),

        square:      asRegisterIdx(0),
        squareUI:    newRegisterIdxForUI(0),

        triangle:    asRegisterIdx(0),
        triangleUI:  newRegisterIdxForUI(0),

        saw:         asRegisterIdx(0),
        sawUI:       newRegisterIdxForUI(0),
    };
}

export type EffectRack = {
    effects:   EffectRackItem[];
    bindings:  RegisterBinding[]; // Can also be indexed with  RegisterIdx (I think)
    registers: number[]; 
};

export function newEffectRack(): EffectRack {
    return {
        effects: [],
        bindings: [],

        registers: [],
    };
}

// Read a value out of a register
function r(e: EffectRack, idx: RegisterIdx) {
    assert(idx >= 0 && idx < e.registers.length);
    return e.registers[idx];
}

// Write to a register
function w(e: EffectRack, idx: RegisterIdx, val: number) {
    assert(idx >= 0 && idx < e.registers.length);
    e.registers[idx] = val;
}

function allocateRegisterIdxIfNeeded(e: EffectRack, regUi: RegisterIdxForUI): RegisterIdx {
    if (regUi.bindingIdx === -1) {
        const idx = e.registers.length;
        e.registers.push(regUi.value);
        return asRegisterIdx(idx);
    }

    const binding = e.bindings[regUi.bindingIdx]; assert(!!binding);
    if (!binding.used) {
        binding.used = true;
    }

    return regUi.bindingIdx;
}

export function compileEffectsRack(e: EffectRack) {
    // First 0-n registers are for the bindings. bindingIdx is also a register idx.
    e.registers.length = 0;
    for (let i = 0; i < e.bindings.length; i++) {
        e.bindings[i].used = false;
        e.registers.push(0);
    }

    for (let i = 0; i < e.effects.length; i++) {
        const effect = e.effects[i];
        switch (effect.type) {
            case EFFECT_RACK_ITEM__OSCILLATOR: {
                effect.amplitude = allocateRegisterIdxIfNeeded(e, effect.amplitudeUI);
                effect.dst       = allocateRegisterIdxIfNeeded(e, effect.dstUI);

                for (let i = 0; i < effect.waves.length; i++) {
                    const wave = effect.waves[i];

                    wave.phase     = allocateRegisterIdxIfNeeded(e, wave.phaseUI);
                    wave.amplitude = allocateRegisterIdxIfNeeded(e, wave.amplitudeUI);
                    wave.frequency = allocateRegisterIdxIfNeeded(e, wave.frequencyUI);
                    wave.sin       = allocateRegisterIdxIfNeeded(e, wave.sinUI);
                    wave.square    = allocateRegisterIdxIfNeeded(e, wave.squareUI);
                    wave.triangle  = allocateRegisterIdxIfNeeded(e, wave.triangleUI);
                    wave.saw       = allocateRegisterIdxIfNeeded(e, wave.sawUI);
                }
            } break;
            default: unreachable(effect.type);
        }
    }
}

export function computeEffectsRackIteration(e: EffectRack, dst: number[], i: number, dt: number) {
    for (let i = 0; i < e.effects.length; i++) {
        const effect = e.effects[i];
        switch (effect.type) {
            case EFFECT_RACK_ITEM__OSCILLATOR: {
                let value = 0;

                for (let i = 0; i < effect.waves.length; i++) {
                    const wave = effect.waves[i];

                    const t2 = wave.t + r(e, wave.phase);

                    if (wave.sin !== -1)      value += r(e, wave.sin) * sin(t2);
                    if (wave.square !== -1)   value += r(e, wave.square) * square(t2);
                    if (wave.triangle !== -1) value += r(e, wave.triangle) * triangle(t2);
                    if (wave.saw !== -1)      value += r(e, wave.saw) * sawtooth(t2);

                    wave.t += dt * r(e, wave.frequency);
                }

                const a = r(e, effect.amplitude);
                w(e, effect.dst, a * value);
            } break;
            default: unreachable(effect.type);
        }
    }

    dst[i] = e.registers[0];
}
