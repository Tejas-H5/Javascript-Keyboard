// An effect-rack based sound system that passes data via registers.
// All `number` are actually registers! This is where I'm hoping the non-linearity and interestingnesss
// can come from. The assembly-style thing is way harder to do anything in IMO.

// NOTE: these dependencies and their dependencies need to be manually injected into the DSP loop, so 
// try to keep them small.
import { assert, unreachable } from "src/utils/assert";
import { moveTowards } from "src/utils/math-utils";
import { sawtooth, sin, square, triangle } from "src/utils/turn-based-waves";

export const EFFECT_RACK_ITEM__OSCILLATOR = 0;
export const EFFECT_RACK_ITEM__ENVELOPE = 1;

export type EffectRackItemType
    = typeof EFFECT_RACK_ITEM__OSCILLATOR
    | typeof EFFECT_RACK_ITEM__ENVELOPE;

type EffectRackItemTypeBase = {
    type: number;

    // All items have an output register
    dst:           RegisterIdx; 
};

export type EffectRackItem 
    = EffectRackOscillator
    | EffectRackEnvelope;

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
    r: boolean; w: boolean;

    // Populated after a compile step.
    // Cleaning up unused bindings is a hard problem with the current setup. 
    // I need to rebind various bindingIdx to something else - possibly do 2 passes with our compilation code. 
    // For now, let's leave it unsolved - it is ok that some bindings are unused.
    _used: boolean;
};

export type RegisterIdxUiMetadata = {
    // UI can read/write to this
    value: number; 

    // JSON serialization - can't use a reference here.
    // Also, can index into registers if not -1 to get the real value.
    bindingIdx: RegisterIdx; 

    // These are more like recommendations that UI can use to make itself more useable.
    // The UI could also choose to ignore these values.
    max: number; min: number; name: string;
};

export function getRegisterIdxForUIValue(e: EffectRack, reg: RegisterIdxUiMetadata) {
    if (reg.bindingIdx === -1) return reg.value;

    const binding = e.bindings[reg.bindingIdx]; assert(!!binding);
    while (reg.bindingIdx >= e.registers.length) {
        e.registers.push(0);
    }
    return e.registers[reg.bindingIdx];
}

export function newRegisterValueMetadata(
    name: string,
    val: number,
    min = -1_000_000,
    max = 1_000_000,
    regIdx: RegisterIdx = REG_IDX_NONE
): RegisterIdxUiMetadata {
    return {
        value: val,
        min, 
        max,
        name,
        bindingIdx: regIdx,
    };
}

export type OscillatorWave = {
    t: number;

    phase:       RegisterIdx;
    amplitude:   RegisterIdx;
    // Want this to be the key frequency. But also be bindable somehow. But also be controlable by value. 
    // Not sure. Maybe we need some more default stuffs.
    frequency:   RegisterIdx; 
    sin:         RegisterIdx;
    square:      RegisterIdx;
    triangle:    RegisterIdx;
    saw:         RegisterIdx;

    phaseUI:     RegisterIdxUiMetadata;
    amplitudeUI: RegisterIdxUiMetadata;
    frequencyUI: RegisterIdxUiMetadata;
    sinUI:       RegisterIdxUiMetadata;
    squareUI:    RegisterIdxUiMetadata;
    triangleUI:  RegisterIdxUiMetadata;
    sawUI:       RegisterIdxUiMetadata;
};

export type EffectRackOscillator = EffectRackItemTypeBase & {
    type: typeof EFFECT_RACK_ITEM__OSCILLATOR;
    // Still not decided on if we only want one of these or multiple on an oscillator.
    wave: OscillatorWave;
};

export function newOscillator(): EffectRackOscillator {
    return {
        type: EFFECT_RACK_ITEM__OSCILLATOR,
        wave: newOscillatorWave(),
        dst: asRegisterIdx(0),
    };
}

export function newOscillatorWave(): OscillatorWave {
    return {
        t: 0,

        amplitude:   asRegisterIdx(1),
        amplitudeUI: newRegisterValueMetadata("amplitude", 1, 0, 1, REG_IDX_OUTPUT),

        phase:       asRegisterIdx(0),
        phaseUI:     newRegisterValueMetadata("phase", 0, 0, 1),

        frequency:   asRegisterIdx(REG_IDX_KEY_FREQUENCY),
        frequencyUI: newRegisterValueMetadata("frequency", 0, 0, 20_000, REG_IDX_KEY_FREQUENCY),

        sin:         asRegisterIdx(0),
        sinUI:       newRegisterValueMetadata("sin", 1, -1, 1),

        square:      asRegisterIdx(0),
        squareUI:    newRegisterValueMetadata("square", 0, -1, 1),

        triangle:    asRegisterIdx(0),
        triangleUI:  newRegisterValueMetadata("triangle", 0, -1, 1),

        saw:         asRegisterIdx(0),
        sawUI:       newRegisterValueMetadata("saw", 0, -1, 1),
    };
}

// TODO: can make this more complex as needed
export type EffectRackEnvelope = EffectRackItemTypeBase & {
    type: typeof EFFECT_RACK_ITEM__ENVELOPE;

    stage: number;
    value: number;

    signal:  RegisterIdx; // Used to know when to pump the envelope
    attack:  RegisterIdx; // time from 0 -> 1
    decay:   RegisterIdx; // time from 1 -> sustain
    sustain: RegisterIdx; // sustain amplitude
    release: RegisterIdx; // time from sustain -> 0

    signalUI:  RegisterIdxUiMetadata;
    attackUI:  RegisterIdxUiMetadata;
    decayUI:   RegisterIdxUiMetadata;
    sustainUI: RegisterIdxUiMetadata;
    releaseUI: RegisterIdxUiMetadata;
};

export function newEnvelope(): EffectRackEnvelope {
    return {
        type: EFFECT_RACK_ITEM__ENVELOPE,

        stage: 0,
        value: 0,

        signal:  asRegisterIdx(0),
        attack:  asRegisterIdx(0),
        decay:   asRegisterIdx(0),
        sustain: asRegisterIdx(0),
        release: asRegisterIdx(0),

        signalUI:  newRegisterValueMetadata("signal", 0, 0, 1, REG_IDX_KEY_SIGNAL),
        attackUI:  newRegisterValueMetadata("attack", 0.05, 0, 1),
        decayUI:   newRegisterValueMetadata("decay", 1, 0, 4),
        sustainUI: newRegisterValueMetadata("sustain", 0.6, 0, 1),
        releaseUI: newRegisterValueMetadata("release", 1, 0, 50),

        dst: asRegisterIdx(0),
    };
}

export type EffectRack = {
    effects:   EffectRackItem[];
    bindings:  RegisterBinding[]; // Can also be indexed with  RegisterIdx (I think)
    registers: number[]; 
};

export function newEffectRackBinding(name: string, r: boolean, w: boolean): RegisterBinding {
    return {
        name: name,
        r, w,
        _used: false,
    };
}

export function newEffectRack(): EffectRack {
    return {
        effects: [],
        // Needs to always be one output binding
        bindings: [
            newEffectRackBinding("Result", true, true),
            newEffectRackBinding("Key frequency", true, false),
            newEffectRackBinding("Signal", true, false),
        ],
        registers: [
            0,
            0,
            0
        ],
    };
}

/** Prevent the user from deleting these - nothing works if they do */
export const EFFECT_RACK_MINIMUM_SIZE = newEffectRack().bindings.length;
export const REG_IDX_NONE = asRegisterIdx(-1);
export const REG_IDX_OUTPUT = asRegisterIdx(0);
export const REG_IDX_KEY_FREQUENCY = asRegisterIdx(1);
export const REG_IDX_KEY_SIGNAL = asRegisterIdx(2);

// Read a value out of a register
function r(e: EffectRack, idx: RegisterIdx) {
    assert(idx >= 0 && idx < e.registers.length);
    return e.registers[idx];
}

// Write to a register
function w(e: EffectRack, idx: RegisterIdx, val: number) {
    assert(idx >= 0 && idx < e.registers.length);
    e.registers[idx] =  val;
}

function allocateRegisterIdxIfNeeded(e: EffectRack, regUi: RegisterIdxUiMetadata): RegisterIdx {
    if (regUi.bindingIdx === -1) {
        // Only constant values need a register allocated to them.
        // the other values already have them.
        
        const idx = e.registers.length;
        e.registers.push(regUi.value);
        return asRegisterIdx(idx);
    }

    const binding = e.bindings[regUi.bindingIdx]; assert(!!binding);
    if (!binding._used) {
        binding._used = true;
    }

    return regUi.bindingIdx;
}

/**
 * Resets all effects, and allocates the register indices based on bindings and constants. 
 */
export function compileEffectsRack(e: EffectRack) {
    // Need output binding. If it was not present, all other indices in the effect rack are off by 1
    assert(e.bindings.length > 0);

    // First 0-n registers are for the bindings. bindingIdx is also a register idx.
    e.registers.length = 0;
    for (let i = 0; i < e.bindings.length; i++) {
        e.bindings[i]._used = false;
        e.registers.push(0);
    }

    for (let i = 0; i < e.effects.length; i++) {
        const effect = e.effects[i];
        switch (effect.type) {
            case EFFECT_RACK_ITEM__OSCILLATOR: {
                const wave = effect.wave;
                wave.t = 0;

                wave.phase     = allocateRegisterIdxIfNeeded(e, wave.phaseUI);
                wave.amplitude = allocateRegisterIdxIfNeeded(e, wave.amplitudeUI);
                wave.frequency = allocateRegisterIdxIfNeeded(e, wave.frequencyUI);
                wave.sin       = allocateRegisterIdxIfNeeded(e, wave.sinUI);
                wave.square    = allocateRegisterIdxIfNeeded(e, wave.squareUI);
                wave.triangle  = allocateRegisterIdxIfNeeded(e, wave.triangleUI);
                wave.saw       = allocateRegisterIdxIfNeeded(e, wave.sawUI);
            } break;
            case EFFECT_RACK_ITEM__ENVELOPE: {
                const envelope = effect;

                envelope.stage = 0;
                envelope.value = 0;

                envelope.signal  = allocateRegisterIdxIfNeeded(e, envelope.signalUI);
                envelope.attack  = allocateRegisterIdxIfNeeded(e, envelope.attackUI);
                envelope.decay   = allocateRegisterIdxIfNeeded(e, envelope.decayUI);
                envelope.sustain = allocateRegisterIdxIfNeeded(e, envelope.sustainUI);
                envelope.release = allocateRegisterIdxIfNeeded(e, envelope.releaseUI);
            } break;
            default: unreachable(effect);
        }
    }
}

export function computeEffectsRackIteration(
    e: EffectRack,
    keyFreqeuency: number,
    signal: number,
    dt: number,
): number {
    e.registers[REG_IDX_KEY_FREQUENCY] = keyFreqeuency;
    e.registers[REG_IDX_KEY_SIGNAL]    = signal;

    for (let i = 0; i < e.effects.length; i++) {
        const effect = e.effects[i];
        let value = 0;

        switch (effect.type) {
            case EFFECT_RACK_ITEM__OSCILLATOR: {
                const wave = effect.wave;

                const a = r(e, wave.amplitude);
                if (Math.abs(a) > 0) {
                    const t2 = wave.t + r(e, wave.phase);
                    if (wave.sin !== -1     ) value += r(e, wave.sin     ) * sin(t2);
                    if (wave.square !== -1  ) value += r(e, wave.square  ) * square(t2);
                    if (wave.triangle !== -1) value += r(e, wave.triangle) * triangle(t2);
                    if (wave.saw !== -1     ) value += r(e, wave.saw     ) * sawtooth(t2);

                    wave.t += dt * r(e, wave.frequency);
                    value *= a;
                }
            } break;
            case EFFECT_RACK_ITEM__ENVELOPE: {
                const envelope = effect;

                // TODO: handle signal between 0 and 1 when we envetually get there. Right now signal can only ever be 0 or 1
                // so it's not that important.

                const signal = r(e, envelope.signal);
                if (signal > 0) {
                    if (envelope.stage === 0) {
                        envelope.value += dt * (1 / r(e, envelope.attack));
                        if (envelope.value > 1) {
                            envelope.value = 1;
                            envelope.stage = 1;
                        }
                    } else if (envelope.stage === 1) {
                        const sustainLevel = r(e, envelope.sustain);
                        const amountToDrop = 1 - sustainLevel;
                        envelope.value -= dt * (1 / r(e, envelope.decay)) * amountToDrop;
                        if (envelope.value < sustainLevel) {
                            envelope.value = sustainLevel;
                            envelope.stage = 2;
                        }
                    } else {
                        // This code probably should never hti. 
                        // May as well just track the sustain level

                        const sustainLevel = r(e, envelope.sustain);
                        const decaySpeed   = 1 / r(e, envelope.decay);

                        envelope.value = moveTowards(envelope.value, sustainLevel, decaySpeed);
                    }
                } else if (envelope.value > 0) {
                    envelope.value -= dt * (1 / r(e, envelope.release))
                    if (envelope.value < 0) {
                        envelope.value = 0;
                        envelope.stage = 0;
                    }
                }

                value = envelope.value;
            } break;
            default: unreachable(effect);
        }

        w(e, effect.dst, value);
    }

    return e.registers[0];
}
