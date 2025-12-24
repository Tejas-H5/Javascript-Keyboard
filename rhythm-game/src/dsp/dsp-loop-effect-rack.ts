// An effect-rack based sound system that passes data via registers.
// All `number` are actually registers! This is where I'm hoping the non-linearity and interestingnesss
// can come from. The assembly-style thing is way harder to do anything in IMO.

// NOTE: these dependencies and their dependencies need to be manually injected into the DSP loop, so 
// try to keep them small.
import { arrayAt } from "src/utils/array-utils";
import { assert, mustGetDefined, unreachable } from "src/utils/assert";
import { moveTowards } from "src/utils/math-utils";
import { asArray, asNumber, asObject, asString, deserializeObject, extractKey, extractKeyDefined, serializeToJSON } from "src/utils/serialization-utils";
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
    // TODO: should these really be serializable??
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
    _max: number; _min: number; _name: string;
};

export function getRegisterIdxForUIValue(e: EffectRack, reg: RegisterIdxUiMetadata) {
    if (reg.bindingIdx === -1) return reg.value;

    const binding = e.bindings[reg.bindingIdx]; assert(!!binding);
    // now, this method will never fail
    while (reg.bindingIdx >= e._registersTemplate.values.length) {
        allocateRegisterIdx(e, 0);
    }
    return e._registersTemplate.values[reg.bindingIdx];
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
        _min: min, 
        _max: max,
        _name: name,
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
    return "?";
}

export type EffectRackOscillator = {
    type: typeof EFFECT_RACK_ITEM__OSCILLATOR;

    // state:
    _t: RegisterIdx;

    // UI values:

    _phase:     RegisterIdx;
    _amplitude: RegisterIdx;
    _frequency: RegisterIdx; 

    // It occurs to me that I cannot animate this ... yet ...
    waveType:    EffectRackOscillatorWaveType;

    phaseUI:     RegisterIdxUiMetadata;
    amplitudeUI: RegisterIdxUiMetadata;
    frequencyUI: RegisterIdxUiMetadata;
};

export function newEffectRackOscillator(): EffectRackOscillator {
    return {
        type: EFFECT_RACK_ITEM__OSCILLATOR,

        _t: asRegisterIdx(0),

        _amplitude:   asRegisterIdx(1),
        _phase:       asRegisterIdx(0),
        _frequency:   asRegisterIdx(REG_IDX_KEY_FREQUENCY),

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
    _stage: RegisterIdx;
    _value: RegisterIdx;

    // UI

    _signal:  RegisterIdx; // Used to know when to pump the envelope
    _attack:  RegisterIdx; // time from 0 -> 1
    _decay:   RegisterIdx; // time from 1 -> sustain
    _sustain: RegisterIdx; // sustain amplitude
    _release: RegisterIdx; // time from sustain -> 0

    signalUI:     RegisterIdxUiMetadata;
    attackUI:     RegisterIdxUiMetadata;
    decayUI:      RegisterIdxUiMetadata;
    sustainUI:    RegisterIdxUiMetadata;
    releaseUI:    RegisterIdxUiMetadata;

    // extra inputs
    toModulate:  RegisterIdx; // This is the signal we're supposed to modulate. Always some register.
};

export function newEffectRackEnvelope(): EffectRackEnvelope {
    return {
        type: EFFECT_RACK_ITEM__ENVELOPE,

        _stage: asRegisterIdx(0),
        _value: asRegisterIdx(0),

        _signal:  asRegisterIdx(0),
        _attack:  asRegisterIdx(0),
        _decay:   asRegisterIdx(0),
        _sustain: asRegisterIdx(0),
        _release: asRegisterIdx(0),

        toModulate: asRegisterIdx(REG_IDX_OUTPUT),

        signalUI:  newRegisterValueMetadata("signal", 0, 0, 1, REG_IDX_KEY_SIGNAL),
        attackUI:  newRegisterValueMetadata("attack", 0.02, 0, 0.5),
        decayUI:   newRegisterValueMetadata("decay", 0.1, 0, 4),
        sustainUI: newRegisterValueMetadata("sustain", 0.2, 0, 1),
        releaseUI: newRegisterValueMetadata("release", 0.2, 0, 1),
    };
}

export type EffectRackMaths = {
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
    _value: RegisterIdx;
    valueUI: RegisterIdxUiMetadata;
};

export function newEffectRackMathsItemCoefficient(): EffectRackMathsItemTermCoefficient {
    return {
        _value: asRegisterIdx(0),
        // NOTE: UI will need to set this dynamically
        valueUI: newRegisterValueMetadata("", 1, -1_000_000, 1_000_000),
    };
}

export function newEffectRackMaths(): EffectRackMaths  {
    return {
        type: EFFECT_RACK_ITEM__MATHS,
        terms: [],
    };
}

export type EffectRackSwitch = {
    type: typeof EFFECT_RACK_ITEM__SWITCH;
    conditions: EffectRackSwitchCondition[];

    _default: RegisterIdx;
    defaultUi: RegisterIdxUiMetadata;
}

export function newEffectRackSwitch(): EffectRackSwitch {
    return {
        type: EFFECT_RACK_ITEM__SWITCH,
        conditions: [
            newEffectRackSwitchCondition(),
        ],
        _default: asRegisterIdx(0),
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
    _a: RegisterIdx;
    aUi: RegisterIdxUiMetadata;

    operator: EffectRackSwitchOperator;

    _b: RegisterIdx;
    bUi: RegisterIdxUiMetadata;

    _val: RegisterIdx;
    valUi: RegisterIdxUiMetadata;
};

export function newEffectRackSwitchCondition(): EffectRackSwitchCondition {
    return {
        _a: asRegisterIdx(0),
        aUi:   newRegisterValueMetadata("a", 0),

        operator: SWITCH_OP_LT,

        valUi: newRegisterValueMetadata("then", 0),
        _val: asRegisterIdx(0),

        _b: asRegisterIdx(0),
        bUi:   newRegisterValueMetadata("b", 0),
    };
}

export type EffectRackItem = {
    // All items have an output register
    dst: RegisterIdx; 
    value: EffectRackItemValue;

    enabled: boolean;
}

type EffectRackItemValue
    = EffectRackOscillator
    | EffectRackEnvelope
    | EffectRackMaths
    | EffectRackSwitch;

export type EffectRack = {
    effects:   EffectRackItem[];
    bindings:  RegisterBinding[]; // Can also be indexed with  RegisterIdx (I think)

    // Gets cloned as needed - the same effect rack can be reused with several keys,
    // each of which will have it's own registers array.
    _registersTemplate: EffectRackRegisters; 

    _debugEffectIdx: number;

    // We use this to automagically re-clone the registers from the template array.
    _version: number;
    _lastEffectTypes: EffectRackItemValue["type"][];
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
        _version: 0,
        _lastEffectTypes: [],

        effects: [],
        // Needs to always be one output binding
        bindings: [
            newEffectRackBinding("Result", true, true),
            newEffectRackBinding("Key frequency", true, false),
            newEffectRackBinding("Signal", true, false),
            newEffectRackBinding("Raw signal", true, false),
        ],
        _debugEffectIdx: -1,
        _registersTemplate: newEffectRackRegisters(),
    };
}

/** Prevent the user from deleting these - nothing works if they do */
export const EFFECT_RACK_MINIMUM_SIZE = newEffectRack().bindings.length;
export const REG_IDX_NONE = asRegisterIdx(-1);
export const REG_IDX_OUTPUT = asRegisterIdx(0);
export const REG_IDX_KEY_FREQUENCY = asRegisterIdx(1);
export const REG_IDX_KEY_SIGNAL = asRegisterIdx(2);
// NOTE: right now, the 'raw' signal is identical to the regular signal.
// If I ever want to have a variable signal between 0 and 1 somehow, that is where SIGNAL_RAW will still be 0 or 1. 
// I suppose in that case it is technically not the raw signal then xD. This name must have been influenced Unity's Input.GetAxisRaw method., I may change it later.
export const REG_IDX_KEY_SIGNAL_RAW = asRegisterIdx(3);

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
export function allocateRegisterIdx(
    e: EffectRack,
    initialValue: number,
    isDynamicState = false
): RegisterIdx {
    const idx = e._registersTemplate.values.length;
    e._registersTemplate.values.push(initialValue);
    e._registersTemplate.isPersistedBetweenFrames.push(isDynamicState);
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
    e._version++;

    // Need output binding. If it was not present, all other indices in the effect rack are off by 1
    assert(e.bindings.length > 0);

    // First 0-n registers are for the bindings. bindingIdx is also a register idx.
    e._registersTemplate.values.length = 0;
    e._registersTemplate.isPersistedBetweenFrames.length = 0;
    for (let i = 0; i < e.bindings.length; i++) {
        e.bindings[i]._used = false;
        allocateRegisterIdx(e, 0);
    }

    if (e._debugEffectIdx < -1) e._debugEffectIdx = -1;
    if (e._debugEffectIdx >= e.effects.length) e._debugEffectIdx = -1;

    for (let i = 0; i < e.effects.length; i++) {
        const effect = e.effects[i].value;
        switch (effect.type) {
            case EFFECT_RACK_ITEM__OSCILLATOR: {
                const wave = effect;
                wave._t = allocateRegisterIdx(e, 0, true);

                wave._phase     = allocateRegisterIdxIfNeeded(e, wave.phaseUI);
                wave._amplitude = allocateRegisterIdxIfNeeded(e, wave.amplitudeUI);
                wave._frequency = allocateRegisterIdxIfNeeded(e, wave.frequencyUI);
            } break;
            case EFFECT_RACK_ITEM__ENVELOPE: {
                const envelope = effect;

                envelope._stage = allocateRegisterIdx(e, 0, true);
                envelope._value = allocateRegisterIdx(e, 0, true);

                envelope._signal  = allocateRegisterIdxIfNeeded(e, envelope.signalUI);
                envelope._attack  = allocateRegisterIdxIfNeeded(e, envelope.attackUI);
                envelope._decay   = allocateRegisterIdxIfNeeded(e, envelope.decayUI);
                envelope._sustain = allocateRegisterIdxIfNeeded(e, envelope.sustainUI);
                envelope._release = allocateRegisterIdxIfNeeded(e, envelope.releaseUI);
            } break;
            case EFFECT_RACK_ITEM__MATHS: {
                const maths = effect;

                for (let i = 0; i < maths.terms.length; i++) {
                    const term = maths.terms[i];
                    for (let i = 0; i < term.coefficients.length; i++) {
                        const c = term.coefficients[i];
                        c._value = allocateRegisterIdxIfNeeded(e, c.valueUI);
                    }
                }
            } break;
            case EFFECT_RACK_ITEM__SWITCH: {
                const switchEffect = effect;

                for (let i = 0; i < switchEffect.conditions.length; i++) {
                    const cond = switchEffect.conditions[i];

                    cond._a = allocateRegisterIdxIfNeeded(e, cond.aUi);
                    cond._b = allocateRegisterIdxIfNeeded(e, cond.bUi);
                    cond._val = allocateRegisterIdxIfNeeded(e, cond.valUi);
                }

                switchEffect._default = allocateRegisterIdxIfNeeded(e, switchEffect.defaultUi);
            } break;
            default: unreachable(effect);
        }
    }
}

export type EffectRackRegisters = {
    values: number[];
    // Dynamic state persists between recompilation. It's assumed that UI can't control this state.
    isPersistedBetweenFrames: boolean[];
    version: number;
};

// An effect rack is stateless. All it's state lives in one of these.
export function newEffectRackRegisters(): EffectRackRegisters {
    // TODO: enforce just a single effect rack at a time.
    // Currently not needed, as there is just one effect rack in the entire program.
    return {
        values: [],
        isPersistedBetweenFrames: [],
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
    dynamic: boolean, // Set to false for determinism (cringe)
): number {
    const re = registers.values;

    if (e._version !== registers.version) {
        registers.version = e._version;

        let shapeChanged = false;
        e._lastEffectTypes.length = e.effects.length;
        for (let i = 0; i < e.effects.length; i++) {
            const type = e.effects[i].value.type;
            if (type !== e._lastEffectTypes[i]) {
                shapeChanged = true;
                e._lastEffectTypes[i] = type;
            }
        }
        if (re.length !== e._registersTemplate.values.length) {
            shapeChanged = true;
            re.length = e._registersTemplate.values.length;
        }

        if (shapeChanged || dynamic === false) {
            // full copy
            for (let i = 0; i < e._registersTemplate.values.length; i++) {
                re[i] = e._registersTemplate.values[i];
            }
        } else {
            // only copy the parts not persisted between frames.
            for (let i = 0; i < e._registersTemplate.values.length; i++) {
                // could prob store these in two separate buffers, but I couldnt be botherd for now.
                if (e._registersTemplate.isPersistedBetweenFrames[i] === true) continue;
                re[i] = e._registersTemplate.values[i];
            }
        }
    }

    re[REG_IDX_KEY_FREQUENCY]  = keyFreqeuency;
    re[REG_IDX_KEY_SIGNAL]     = signal;
    re[REG_IDX_KEY_SIGNAL_RAW] = signal > 0.0000001 ? 1 : 0;

    for (let effectIdx = 0; effectIdx < e.effects.length; effectIdx++) {
        const effect = e.effects[effectIdx];
        if (!effect.enabled) continue;

        const effectValue = effect.value;

        let value = 0;

        switch (effectValue.type) {
            case EFFECT_RACK_ITEM__OSCILLATOR: {
                const wave = effectValue;

                const a = r(re, wave._amplitude);
                if (Math.abs(a) > 0) {
                    const t = r(re, wave._t);
                    const t2 = t + r(re, wave._phase);

                    switch (wave.waveType) {
                        case OSC_WAVE__SIN:      value += sin(t2);      break;
                        case OSC_WAVE__SQUARE:   value += square(t2);   break;
                        case OSC_WAVE__TRIANGLE: value += triangle(t2); break;
                        case OSC_WAVE__SAWTOOTH: value += sawtooth(t2); break;
                        case OSC_WAVE__SAWTOOTH2: value -= sawtooth(t2); break;
                    }

                    w(re, wave._t, t + dt * r(re, wave._frequency));
                    value *= a;
                }
            } break;
            case EFFECT_RACK_ITEM__ENVELOPE: {
                const envelope = effectValue;

                value = r(re, envelope._value);
                let stage = r(re, envelope._stage);

                // TODO: handle signal between 0 and 1 when we envetually get there. Right now signal can only ever be 0 or 1
                // so it's not that important.

                const signal = r(re, envelope._signal);
                if (signal > 0) {
                    if (stage === 0) {
                        value += dt * (1 / r(re, envelope._attack));
                        if (value > 1) {
                            value = 1;
                            stage = 1;
                        }
                    } else if (stage === 1) {
                        const sustainLevel = r(re, envelope._sustain);
                        const amountToDrop = 1 - sustainLevel;
                        value -= dt * (1 / r(re, envelope._decay)) * amountToDrop;
                        if (value < sustainLevel) {
                            value = sustainLevel;
                            stage = 2;
                        }
                    } else {
                        // This code probably should never hti. 
                        // May as well just track the sustain level

                        const sustainLevel = r(re, envelope._sustain);
                        const decaySpeed = 1 / r(re, envelope._decay);

                        value = moveTowards(value, sustainLevel, decaySpeed);
                    }
                } else if (value > 0) {
                    value -= dt * (1 / r(re, envelope._release))
                    if (value < 0) {
                        value = 0;
                    }
                    // We want the attack to work instantly after a release and press.
                    stage = 0;
                }

                w(re, envelope._value, value);
                w(re, envelope._stage, stage);

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
                        termValue *= r(re, c._value);
                    }

                    value += termValue;
                }

            } break;
            case EFFECT_RACK_ITEM__SWITCH: {
                const switchEffect = effectValue;

                let broke = false;
                for (let i = 0; i < switchEffect.conditions.length; i++) {
                    const cond = switchEffect.conditions[i];

                    const a = r(re, cond._a);
                    const b = r(re, cond._b);

                    let result;
                    if (cond.operator === SWITCH_OP_LT) {
                        result = a < b;
                    } else {
                        result = a > b;
                    }

                    if (result) {
                        value = r(re, cond._val);
                        broke = true;
                        break;
                    }
                }
                if (!broke) {
                    value = r(re, switchEffect._default);
                }
            } break;
            default: unreachable(effectValue);
        }

        w(re, effect.dst, value);

        if (e._debugEffectIdx === effectIdx) {
            break;
        }
    }

    return re[REG_IDX_OUTPUT];
}


// Prob not needed for undo buffer, but should be useful for import/export. 
export function serializeEffectRack(effectRack: EffectRack): string {
    return serializeToJSON(effectRack);
}

function deserializeRegisterIdxUiMetadata(dst: RegisterIdxUiMetadata, objUnknown: unknown) {
    const obj = mustGetDefined(asObject(objUnknown));
    dst.value = mustGetDefined(asNumber(extractKey<RegisterIdxUiMetadata>(obj, "value")));
    dst.bindingIdx = asRegisterIdx(mustGetDefined(asNumber(extractKey<RegisterIdxUiMetadata>(obj, "bindingIdx"))));
}

export function deserializeEffectRack(json: string): EffectRack {
    const jsonVal = JSON.parse(json);

    const result = newEffectRack();

    const obj = mustGetDefined(asObject(jsonVal));

    const bindingsArr = mustGetDefined(asArray(extractKeyDefined<EffectRack>(obj, "bindings"))); 
    result.bindings = bindingsArr.map((binding, i) => {
        const existing = arrayAt(result.bindings, i);
        const bindingObj = mustGetDefined(asObject(binding));
        const name = mustGetDefined(asString(extractKeyDefined<RegisterBinding>(bindingObj, "name")))
        const val = newEffectRackBinding(name, existing?.r ?? true, existing?.w ?? true);
        deserializeObject(val, bindingObj);
        return val;
    });

    const effectsArr = mustGetDefined(asArray<EffectRackItem>(extractKeyDefined<EffectRack>(obj, "effects"))); 
    result.effects = effectsArr.map(effect => {
        const valueObj = mustGetDefined(asObject(extractKeyDefined<EffectRackItem>(effect, "value")));
        let value: EffectRackItemValue | undefined;
        const type = mustGetDefined((valueObj as EffectRackItemValue)["type"]);
        switch (type) {
            case EFFECT_RACK_ITEM__OSCILLATOR: {
                value = newEffectRackOscillator();

                value.waveType = mustGetDefined(asNumber(extractKeyDefined<EffectRackOscillator>(valueObj, "waveType"))) as EffectRackOscillatorWaveType;
                assert(getEffectRackOscillatorWaveTypeName(value.waveType) !== "?");

                deserializeRegisterIdxUiMetadata(value.phaseUI, extractKeyDefined<EffectRackOscillator>(valueObj, "phaseUI"));
                deserializeRegisterIdxUiMetadata(value.amplitudeUI, extractKeyDefined<EffectRackOscillator>(valueObj, "amplitudeUI"));
                deserializeRegisterIdxUiMetadata(value.frequencyUI, extractKeyDefined<EffectRackOscillator>(valueObj, "frequencyUI"));
            } break;
            case EFFECT_RACK_ITEM__ENVELOPE: {
                value = newEffectRackEnvelope();

                deserializeRegisterIdxUiMetadata(value.attackUI, extractKeyDefined<EffectRackEnvelope>(valueObj, "attackUI"));
                deserializeRegisterIdxUiMetadata(value.sustainUI, extractKeyDefined<EffectRackEnvelope>(valueObj, "sustainUI"));
                deserializeRegisterIdxUiMetadata(value.decayUI, extractKeyDefined<EffectRackEnvelope>(valueObj, "decayUI"));
                deserializeRegisterIdxUiMetadata(value.releaseUI, extractKeyDefined<EffectRackEnvelope>(valueObj, "releaseUI"));
                deserializeRegisterIdxUiMetadata(value.signalUI, extractKeyDefined<EffectRackEnvelope>(valueObj, "signalUI"));

                value.toModulate = asRegisterIdx(mustGetDefined(asNumber(extractKeyDefined<EffectRackEnvelope>(valueObj, "toModulate"))));
            } break;
            case EFFECT_RACK_ITEM__MATHS: {
                value = newEffectRackMaths();
                const termsArr = mustGetDefined(asArray(extractKeyDefined<EffectRackMaths>(valueObj, "terms")));
                value.terms = termsArr.map(termUnknown => {
                    let termObj = mustGetDefined(asObject(termUnknown));
                    const term = newEffectRackMathsItemTerm();
                    const coefficientsArr = mustGetDefined(asArray(extractKeyDefined<EffectRackMathsItemTerm>(termObj, "coefficients")));

                    term.coefficients = coefficientsArr.map(coefficientUnknown => {
                        const coefficientObj = mustGetDefined(asObject(coefficientUnknown));
                        const coefficient = newEffectRackMathsItemCoefficient();
                        deserializeRegisterIdxUiMetadata(coefficient.valueUI, extractKeyDefined<EffectRackMathsItemTermCoefficient>(coefficientObj, "valueUI"));
                        deserializeObject(coefficient, coefficientObj);
                        return coefficient;
                    });

                    return term;
                });
            } break;
            case EFFECT_RACK_ITEM__SWITCH: {
                value = newEffectRackSwitch();
                const conditionsArr = mustGetDefined(asArray(extractKeyDefined<EffectRackSwitch>(valueObj, "conditions")));
                value.conditions = conditionsArr.map(uk => {
                    const valueObj = mustGetDefined(asObject(uk));
                    const value = newEffectRackSwitchCondition();
                    deserializeRegisterIdxUiMetadata(value.aUi, extractKeyDefined<EffectRackSwitchCondition>(valueObj, "aUi"));
                    deserializeRegisterIdxUiMetadata(value.bUi, extractKeyDefined<EffectRackSwitchCondition>(valueObj, "bUi"));
                    deserializeRegisterIdxUiMetadata(value.valUi, extractKeyDefined<EffectRackSwitchCondition>(valueObj, "valUi"));
                    value.operator = mustGetDefined(asNumber(extractKeyDefined<EffectRackSwitchCondition>(valueObj, "operator"))) as EffectRackSwitchOperator;
                    assert(value.operator === SWITCH_OP_GT || value.operator === SWITCH_OP_LT);
                    deserializeObject(value, obj);
                    return value;
                });
                deserializeRegisterIdxUiMetadata(value.defaultUi, extractKeyDefined<EffectRackSwitch>(valueObj, "defaultUi"));
            } break;
        }

        value = mustGetDefined(value);
        deserializeObject(value, valueObj);

        const item = newEffectRackItem(value);
        deserializeObject(item, effect);

        return item;
    });

    deserializeObject(result, obj, "effectRack");

    return result;
}
