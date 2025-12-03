// An effect-rack based sound system that passes data via registers.
// All `number` are actually registers! This is where I'm hoping the non-linearity and interestingnesss
// can come from. The assembly-style thing is way harder to do anything in IMO.

// NOTE: these dependencies and their dependencies need to be manually injected into the DSP loop, so 
// try to keep them small.
import { assert, unreachable } from "src/utils/assert";
import { moveTowards } from "src/utils/math-utils";
import { sawtooth, sin, square, triangle } from "src/utils/turn-based-waves";
import { IDX_OUTPUT } from "./dsp-loop-instruction-set";

export const EFFECT_RACK_ITEM__OSCILLATOR = 0;
export const EFFECT_RACK_ITEM__ENVELOPE = 1;
export const EFFECT_RACK_ITEM__MATHS = 2;

export type EffectRackItemType
    = typeof EFFECT_RACK_ITEM__OSCILLATOR
    | typeof EFFECT_RACK_ITEM__ENVELOPE
    | typeof EFFECT_RACK_ITEM__MATHS;

type EffectRackItemTypeBase = {
    type: number;

    // All items have an output register
    dst:           RegisterIdx; 
};

export type EffectRackItem 
    = EffectRackOscillator
    | EffectRackEnvelope
    | EffectRackMathsItem;

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
    while (reg.bindingIdx >= e.registersTemplate.length) {
        e.registersTemplate.push(0);
    }
    return e.registersTemplate[reg.bindingIdx];
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
    // state:
    t: RegisterIdx;

    // UI values:

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

export function newEffectRackOscillator(): EffectRackOscillator {
    return {
        type: EFFECT_RACK_ITEM__OSCILLATOR,
        wave: newOscillatorWave(),
        dst: asRegisterIdx(0),
    };
}

export function newOscillatorWave(): OscillatorWave {
    return {
        t: asRegisterIdx(0),

        amplitude:   asRegisterIdx(1),
        phase:       asRegisterIdx(0),
        frequency:   asRegisterIdx(REG_IDX_KEY_FREQUENCY),
        sin:         asRegisterIdx(0),
        square:      asRegisterIdx(0),
        triangle:    asRegisterIdx(0),
        saw:         asRegisterIdx(0),

        amplitudeUI: newRegisterValueMetadata("amplitude", 1, 0, 1, REG_IDX_OUTPUT),
        phaseUI:     newRegisterValueMetadata("phase", 0, 0, 1),
        frequencyUI: newRegisterValueMetadata("frequency", 0, 0, 20_000, REG_IDX_KEY_FREQUENCY),
        sinUI:       newRegisterValueMetadata("sin", 1, -1, 1),
        squareUI:    newRegisterValueMetadata("square", 0, -1, 1),
        triangleUI:  newRegisterValueMetadata("triangle", 0, -1, 1),
        sawUI:       newRegisterValueMetadata("saw", 0, -1, 1),
    };
}

// TODO: can make this more complex as needed
export type EffectRackEnvelope = EffectRackItemTypeBase & {
    type: typeof EFFECT_RACK_ITEM__ENVELOPE;

    // STATE
    stage: RegisterIdx;
    value: RegisterIdx;

    // UI

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

export function newEffectRackEnvelope(): EffectRackEnvelope {
    return {
        type: EFFECT_RACK_ITEM__ENVELOPE,

        stage: asRegisterIdx(0),
        value: asRegisterIdx(0),

        signal:  asRegisterIdx(0),
        attack:  asRegisterIdx(0),
        decay:   asRegisterIdx(0),
        sustain: asRegisterIdx(0),
        release: asRegisterIdx(0),

        signalUI:  newRegisterValueMetadata("signal", 0, 0, 1, REG_IDX_KEY_SIGNAL),
        attackUI:  newRegisterValueMetadata("attack", 0.02, 0, 0.5),
        decayUI:   newRegisterValueMetadata("decay", 0.1, 0, 4),
        sustainUI: newRegisterValueMetadata("sustain", 0.2, 0, 1),
        releaseUI: newRegisterValueMetadata("release", 0.2, 0, 1),

        dst: asRegisterIdx(0),
    };
}

export type EffectRackMathsItem = EffectRackItemTypeBase & {
    type: typeof EFFECT_RACK_ITEM__MATHS;
    terms: EffectRackMathsItemTerm[];
};

export type EffectRackMathsItemTerm = {
    // Bro put his designer hat on.
    coefficients: EffectRackMathsItemTermCoefficient[];
    name: string;
};

export function newEffectRackMathsItemTerm(idx: number): EffectRackMathsItemTerm {
    const name = "x" + idx;
    return { 
        coefficients: [newEffectRackMathsItemCoefficient(name, 0)], 
        name: name,
    };
}

export type EffectRackMathsItemTermCoefficient = {
    value: RegisterIdx;
    valueUI: RegisterIdxUiMetadata;
};

export function newEffectRackMathsItemCoefficient(name: string, idx: number): EffectRackMathsItemTermCoefficient {
    name += "" + idx;
    return {
        value: asRegisterIdx(0),
        valueUI: newRegisterValueMetadata(name, 1, -1_000_000, 1_000_000),
    };
}

export function newEffectRackMathsItem(): EffectRackMathsItem  {
    return {
        type: EFFECT_RACK_ITEM__MATHS,
        terms: [],
        dst: asRegisterIdx(0),
    };
}

export type EffectRack = {
    effects:   EffectRackItem[];
    bindings:  RegisterBinding[]; // Can also be indexed with  RegisterIdx (I think)

    // Gets cloned as needed - the same effect rack can be reused with several keys,
    // each of which will have it's own registers array.
    registersTemplate: number[]; 

    // We use this to automagically re-clone the registers from the template array.
    version: number;
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
        version: 0,
        effects: [],
        // Needs to always be one output binding
        bindings: [
            newEffectRackBinding("Result", true, true),
            newEffectRackBinding("Key frequency", true, false),
            newEffectRackBinding("Signal", true, false),
        ],
        registersTemplate: [
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
export function r(registers: number[], idx: RegisterIdx) {
    assert(idx >= 0 && idx < registers.length);
    return registers[idx];
}

// Write to a register
export function w(registers: number[], idx: RegisterIdx, val: number) {
    assert(idx >= 0 && idx < registers.length);
    registers[idx] =  val;
}

// Only constant values and persistent state need a register allocated to them.
// the other values already have them via bindings.
// NOTE: each key on the instrument will have it's own copy of the registers.
export function allocateRegisterIdx(e: EffectRack, initialValue: number): RegisterIdx {
    const idx = e.registersTemplate.length;
    e.registersTemplate.push(initialValue);
    return asRegisterIdx(idx);
}

export function allocateRegisterIdxIfNeeded(e: EffectRack, regUi: RegisterIdxUiMetadata): RegisterIdx {
    if (regUi.bindingIdx === -1) {
        return allocateRegisterIdx(e, regUi.value);
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
export function compileEffectRack(e: EffectRack) {
    e.version++;

    // Need output binding. If it was not present, all other indices in the effect rack are off by 1
    assert(e.bindings.length > 0);

    // First 0-n registers are for the bindings. bindingIdx is also a register idx.
    e.registersTemplate.length = 0;
    for (let i = 0; i < e.bindings.length; i++) {
        e.bindings[i]._used = false;
        e.registersTemplate.push(0);
    }

    for (let i = 0; i < e.effects.length; i++) {
        const effect = e.effects[i];
        switch (effect.type) {
            case EFFECT_RACK_ITEM__OSCILLATOR: {
                const wave = effect.wave;
                wave.t = allocateRegisterIdx(e, 0);

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

                envelope.stage = allocateRegisterIdx(e, 0);
                envelope.value = allocateRegisterIdx(e, 0);

                envelope.signal  = allocateRegisterIdxIfNeeded(e, envelope.signalUI);
                envelope.attack  = allocateRegisterIdxIfNeeded(e, envelope.attackUI);
                envelope.decay   = allocateRegisterIdxIfNeeded(e, envelope.decayUI);
                envelope.sustain = allocateRegisterIdxIfNeeded(e, envelope.sustainUI);
                envelope.release = allocateRegisterIdxIfNeeded(e, envelope.releaseUI);
            } break;
            case EFFECT_RACK_ITEM__MATHS: {
                const maths = effect;

                for (let i = 0; i < maths.terms.length; i++) {
                    const term = maths.terms[i];
                    for (let i = 0; i < term.coefficients.length; i++) {
                        const c = term.coefficients[i];
                        c.value = allocateRegisterIdxIfNeeded(e, c.valueUI);
                    }
                }
            } break;
            default: unreachable(effect);
        }
    }
}

export type EffectRackRegisters = {
    values: number[];
    version: number;
};

// An effect rack is stateless. All it's state lives in one of these.
export function newEffectRackRegisters(): EffectRackRegisters {
    return {
        values: [],
        version: 0,
    };
}

export function computeEffectsRackIteration(
    e: EffectRack,
    registers: EffectRackRegisters,
    keyFreqeuency: number,
    signal: number,
    dt: number,
): number {
    const re = registers.values;

    if (e.version !== registers.version) {
        registers.version = e.version;

        re.length = e.registersTemplate.length;
        for (let i = 0; i < e.registersTemplate.length; i++) {
            re[i] = e.registersTemplate[i];
        }
    }

    re[REG_IDX_KEY_FREQUENCY] = keyFreqeuency;
    re[REG_IDX_KEY_SIGNAL]    = signal;

    for (let i = 0; i < e.effects.length; i++) {
        const effect = e.effects[i];
        let value = 0;

        switch (effect.type) {
            case EFFECT_RACK_ITEM__OSCILLATOR: {
                const wave = effect.wave;

                const a = r(re, wave.amplitude);
                if (Math.abs(a) > 0) {
                    const t = r(re, wave.t);
                    const t2 = t + r(re, wave.phase);

                    value += r(re, wave.sin     ) * sin(t2);
                    value += r(re, wave.square  ) * square(t2);
                    value += r(re, wave.triangle) * triangle(t2);
                    value += r(re, wave.saw     ) * sawtooth(t2);

                    w(re, wave.t, t + dt * r(re, wave.frequency));
                    value *= a;
                }
            } break;
            case EFFECT_RACK_ITEM__ENVELOPE: {
                const envelope = effect;

                value = r(re, envelope.value);
                let stage = r(re, envelope.stage);

                // TODO: handle signal between 0 and 1 when we envetually get there. Right now signal can only ever be 0 or 1
                // so it's not that important.

                const signal = r(re, envelope.signal);
                if (signal > 0) {
                    if (stage === 0) {
                        value += dt * (1 / r(re, envelope.attack));
                        if (value > 1) {
                            value = 1;
                            stage = 1;
                        }
                    } else if (stage === 1) {
                        const sustainLevel = r(re, envelope.sustain);
                        const amountToDrop = 1 - sustainLevel;
                        value -= dt * (1 / r(re, envelope.decay)) * amountToDrop;
                        if (value < sustainLevel) {
                            value = sustainLevel;
                            stage = 2;
                        }
                    } else {
                        // This code probably should never hti. 
                        // May as well just track the sustain level

                        const sustainLevel = r(re, envelope.sustain);
                        const decaySpeed   = 1 / r(re, envelope.decay);

                        value = moveTowards(value, sustainLevel, decaySpeed);
                    }
                } else if (value > 0) {
                    value -= dt * (1 / r(re, envelope.release))
                    if (value < 0) {
                        value = 0;
                        stage = 0;
                    }
                }

                w(re, envelope.value, value);
                w(re, envelope.stage, stage);
            } break;
            case EFFECT_RACK_ITEM__MATHS: {
                const maths = effect;

                for (let i = 0; i < maths.terms.length; i++) {
                    const term = maths.terms[i];

                    let termValue = 1;
                    for (let i = 0; i < term.coefficients.length; i++) {
                        const c = term.coefficients[i];
                        termValue *= r(re, c.value);
                    }

                    value += termValue;
                }

            } break;
            default: unreachable(effect);
        }

        w(re, effect.dst, value);
    }

    return re[IDX_OUTPUT];
}
