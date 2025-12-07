// An effect-rack based sound system that passes data via registers.
// All `number` are actually registers! This is where I'm hoping the non-linearity and interestingnesss
// can come from. The assembly-style thing is way harder to do anything in IMO.

// NOTE: these dependencies and their dependencies need to be manually injected into the DSP loop, so 
// try to keep them small.
import { assert, unreachable } from "src/utils/assert";
import { moveTowards } from "src/utils/math-utils";
import { sawtooth, sin, square, triangle } from "src/utils/turn-based-waves";

// TODO: _VALUE__
export const EFFECT_RACK_ITEM__OSCILLATOR = 0;
export const EFFECT_RACK_ITEM__ENVELOPE = 1;
export const EFFECT_RACK_ITEM__MATHS = 2;
export const EFFECT_RACK_ITEM__SWITCH = 3;

// export const EFFECT_RACK_DSP_INSTRUCTION_SET; this would be quite funny wouldnt it.

export type EffectRackItemType
    = typeof EFFECT_RACK_ITEM__OSCILLATOR
    | typeof EFFECT_RACK_ITEM__ENVELOPE
    | typeof EFFECT_RACK_ITEM__MATHS
    | typeof EFFECT_RACK_ITEM__SWITCH
    ;

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

export const  OSC_WAVE__SIN       = 0;
export const  OSC_WAVE__SQUARE    = 1;
export const  OSC_WAVE__SAWTOOTH  = 2;
export const  OSC_WAVE__TRIANGLE  = 3;
export const  OSC_WAVE__SAWTOOTH2 = 4;

export type EffectRackOscillatorWaveType
    = typeof OSC_WAVE__SIN
    | typeof OSC_WAVE__SQUARE
    | typeof OSC_WAVE__SAWTOOTH
    | typeof OSC_WAVE__TRIANGLE
    | typeof OSC_WAVE__SAWTOOTH2
    ;

export function getEffectRackOscillatorWaveTypeName(e: EffectRackOscillatorWaveType) {
    switch (e) {
        case OSC_WAVE__SIN: return "sin";
        case OSC_WAVE__SQUARE: return "square";
        case OSC_WAVE__SAWTOOTH: return "sawtooth";
        case OSC_WAVE__TRIANGLE: return "triangle";
        case OSC_WAVE__SAWTOOTH2: return "-sawtooth";
    }
    return "???";
}

export type EffectRackOscillator = {
    type: typeof EFFECT_RACK_ITEM__OSCILLATOR;

    // state:
    t: RegisterIdx;

    // UI values:

    phase:       RegisterIdx;
    amplitude:   RegisterIdx;
    frequency:   RegisterIdx; 

    // It occurs to me that I cannot animate this ... yet ...
    waveType:    EffectRackOscillatorWaveType;

    phaseUI:     RegisterIdxUiMetadata;
    amplitudeUI: RegisterIdxUiMetadata;
    frequencyUI: RegisterIdxUiMetadata;
};

export function newEffectRackOscillator(): EffectRackOscillator {
    return {
        type: EFFECT_RACK_ITEM__OSCILLATOR,

        t: asRegisterIdx(0),

        amplitude:   asRegisterIdx(1),
        phase:       asRegisterIdx(0),
        frequency:   asRegisterIdx(REG_IDX_KEY_FREQUENCY),
        waveType:    OSC_WAVE__SIN,

        amplitudeUI: newRegisterValueMetadata("amplitude", 1, 0, 1),
        phaseUI:     newRegisterValueMetadata("phase", 0, 0, 1),
        frequencyUI: newRegisterValueMetadata("frequency", 0, 0, 20_000, REG_IDX_KEY_FREQUENCY),
    };
}

// TODO: can make this more complex as needed
export type EffectRackEnvelope = {
    type: typeof EFFECT_RACK_ITEM__ENVELOPE;

    // STATE. Also needs to be stored in registers, so that
    // it can be per-key
    stage: RegisterIdx;
    value: RegisterIdx;

    // UI

    signal:  RegisterIdx; // Used to know when to pump the envelope

    attack:  RegisterIdx; // time from 0 -> 1
    decay:   RegisterIdx; // time from 1 -> sustain
    sustain: RegisterIdx; // sustain amplitude
    release: RegisterIdx; // time from sustain -> 0

    toModulate:  RegisterIdx; // This is the signal we're supposed to modulate. Always some register.

    signalUI:     RegisterIdxUiMetadata;
    attackUI:     RegisterIdxUiMetadata;
    decayUI:      RegisterIdxUiMetadata;
    sustainUI:    RegisterIdxUiMetadata;
    releaseUI:    RegisterIdxUiMetadata;
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

        toModulate: asRegisterIdx(REG_IDX_OUTPUT),

        signalUI:  newRegisterValueMetadata("signal", 0, 0, 1, REG_IDX_KEY_SIGNAL),
        attackUI:  newRegisterValueMetadata("attack", 0.02, 0, 0.5),
        decayUI:   newRegisterValueMetadata("decay", 0.1, 0, 4),
        sustainUI: newRegisterValueMetadata("sustain", 0.2, 0, 1),
        releaseUI: newRegisterValueMetadata("release", 0.2, 0, 1),
    };
}

export type EffectRackMathsItem = {
    type: typeof EFFECT_RACK_ITEM__MATHS;
    terms: EffectRackMathsItemTerm[];
};

export type EffectRackMathsItemTerm = {
    // Bro put his designer hat on.
    coefficients: EffectRackMathsItemTermCoefficient[];
};

export function newEffectRackMathsItemTerm(): EffectRackMathsItemTerm {
    return { 
        // NOTE: UI will need to set this dynamically
        coefficients: [newEffectRackMathsItemCoefficient()], 
    };
}

export type EffectRackMathsItemTermCoefficient = {
    value: RegisterIdx;
    valueUI: RegisterIdxUiMetadata;
};

export function newEffectRackMathsItemCoefficient(): EffectRackMathsItemTermCoefficient {
    return {
        value: asRegisterIdx(0),
        // NOTE: UI will need to set this dynamically
        valueUI: newRegisterValueMetadata("", 1, -1_000_000, 1_000_000),
    };
}

export function newEffectRackMathsItem(): EffectRackMathsItem  {
    return {
        type: EFFECT_RACK_ITEM__MATHS,
        terms: [],
    };
}

export type EffectRackSwitch = {
    type: typeof EFFECT_RACK_ITEM__SWITCH;
    conditions: EffectRackSwitchCondition[];

    default: RegisterIdx;
    defaultUi: RegisterIdxUiMetadata;
}

export function newEffectRackSwitch(): EffectRackSwitch {
    return {
        type: EFFECT_RACK_ITEM__SWITCH,
        conditions: [
            newEffectRackSwitchCondition(),
        ],
        default: asRegisterIdx(0),
        defaultUi: newRegisterValueMetadata("default", 0, -1_000_000, 1_000_000, REG_IDX_OUTPUT),
    };
}

export const SWITCH_OP_LT = 1;
export const SWITCH_OP_GT = 2;

export type EffectRackSwitchOperator
    = typeof SWITCH_OP_LT
    | typeof SWITCH_OP_GT
    ;

export type EffectRackSwitchCondition = {
    a: RegisterIdx;
    b: RegisterIdx;
    operator: EffectRackSwitchOperator;

    val: RegisterIdx;

    aUi: RegisterIdxUiMetadata;
    bUi: RegisterIdxUiMetadata;
    valUi: RegisterIdxUiMetadata;
};

export function newEffectRackSwitchCondition(): EffectRackSwitchCondition {
    return {
        a: asRegisterIdx(0),
        b: asRegisterIdx(0),
        val: asRegisterIdx(0),

        operator: SWITCH_OP_LT,

        aUi:   newRegisterValueMetadata("a", 0),
        bUi:   newRegisterValueMetadata("b", 0),
        valUi: newRegisterValueMetadata("then", 0),
    };
}

export type EffectRackItem = {
    // All items have an output register
    dst: RegisterIdx; 

    enabled: boolean;

    value: EffectRackItemValue;
}

type EffectRackItemValue
    = EffectRackOscillator
    | EffectRackEnvelope
    | EffectRackMathsItem
    | EffectRackSwitch;

export type EffectRack = {
    effects:   EffectRackItem[];
    bindings:  RegisterBinding[]; // Can also be indexed with  RegisterIdx (I think)

    // Gets cloned as needed - the same effect rack can be reused with several keys,
    // each of which will have it's own registers array.
    registersTemplate: number[]; 

    debugEffectIdx: number;

    // We use this to automagically re-clone the registers from the template array.
    version: number;
};

export function newEffectRackItem(value: EffectRackItemValue): EffectRackItem {
    return {
        dst: asRegisterIdx(0),
        enabled: true,
        value: value,
    };
}

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
        debugEffectIdx: -1,
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
        const effect = e.effects[i].value;
        switch (effect.type) {
            case EFFECT_RACK_ITEM__OSCILLATOR: {
                const wave = effect;
                wave.t = allocateRegisterIdx(e, 0);

                wave.phase     = allocateRegisterIdxIfNeeded(e, wave.phaseUI);
                wave.amplitude = allocateRegisterIdxIfNeeded(e, wave.amplitudeUI);
                wave.frequency = allocateRegisterIdxIfNeeded(e, wave.frequencyUI);
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
            case EFFECT_RACK_ITEM__SWITCH: {
                const switchEffect = effect;

                for (let i = 0; i < switchEffect.conditions.length; i++) {
                    const cond = switchEffect.conditions[i];

                    cond.a = allocateRegisterIdxIfNeeded(e, cond.aUi);
                    cond.b = allocateRegisterIdxIfNeeded(e, cond.bUi);
                    cond.val = allocateRegisterIdxIfNeeded(e, cond.valUi);
                }

                switchEffect.default = allocateRegisterIdxIfNeeded(e, switchEffect.defaultUi);
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
    // TODO: enforce just a single effect rack at a time.
    // Currently not needed, as there is just one effect rack in the entire program.
    return {
        values: [],
        version: 0,
    };
}

export function copyEffectRackItem(item: EffectRackItem): EffectRackItem {
    return JSON.parse(JSON.stringify(item));
}

export function computeEffectRackIteration(
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

    for (let effectIdx = 0; effectIdx < e.effects.length; effectIdx++) {
        const effect = e.effects[effectIdx];
        if (!effect.enabled) continue;

        const effectValue = effect.value;

        let value = 0;

        switch (effectValue.type) {
            case EFFECT_RACK_ITEM__OSCILLATOR: {
                const wave = effectValue;

                const a = r(re, wave.amplitude);
                if (Math.abs(a) > 0) {
                    const t = r(re, wave.t);
                    const t2 = t + r(re, wave.phase);

                    switch (wave.waveType) {
                        case OSC_WAVE__SIN:      value += sin(t2);      break;
                        case OSC_WAVE__SQUARE:   value += square(t2);   break;
                        case OSC_WAVE__TRIANGLE: value += triangle(t2); break;
                        case OSC_WAVE__SAWTOOTH: value += sawtooth(t2); break;
                        case OSC_WAVE__SAWTOOTH2: value -= sawtooth(t2); break;
                    }

                    w(re, wave.t, t + dt * r(re, wave.frequency));
                    value *= a;
                }
            } break;
            case EFFECT_RACK_ITEM__ENVELOPE: {
                const envelope = effectValue;

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
                        const decaySpeed = 1 / r(re, envelope.decay);

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

                const target = r(re, envelope.toModulate);
                value *= target;
            } break;
            case EFFECT_RACK_ITEM__MATHS: {
                const maths = effectValue;

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
            case EFFECT_RACK_ITEM__SWITCH: {
                const switchEffect = effectValue;

                let broke = false;
                for (let i = 0; i < switchEffect.conditions.length; i++) {
                    const cond = switchEffect.conditions[i];

                    const a = r(re, cond.a);
                    const b = r(re, cond.b);

                    let result;
                    if (cond.operator === SWITCH_OP_LT) {
                        result = a < b;
                    } else {
                        result = a > b;
                    }

                    if (result) {
                        value = r(re, cond.val);
                        broke = true;
                        break;
                    }
                }
                if (!broke) {
                    value = r(re, switchEffect.default);
                }
            } break;
            default: unreachable(effectValue);
        }

        w(re, effect.dst, value);

        if (e.debugEffectIdx !== -1) {
            if (e.debugEffectIdx === effectIdx) {
                break;
            }
        }
    }

    return re[REG_IDX_OUTPUT];
}
