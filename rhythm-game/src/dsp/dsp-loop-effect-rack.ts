// An effect-rack based sound system that passes data via registers.
// All `number` are actually registers! This is where I'm hoping the non-linearity and interestingnesss
// can come from. The assembly-style thing is way harder to do anything in IMO.

// NOTE: these dependencies and their dependencies need to be manually injected into the DSP loop, so 
// try to keep them small.
import { filterInPlace, resizeValuePool } from "src/utils/array-utils";
import { assert, unreachable } from "src/utils/assert";
import { moveTowards } from "src/utils/math-utils";
import { asArray, asBooleanOrUndefined, asEnum, asIs, asNumber, asNumberOrUndefined, asObject, serializeToJSON, unmarshalObject } from "src/utils/serialization-utils";
import { deepEquals } from "src/utils/testing";
import { cos, sawtooth, sin, square, triangle } from "src/utils/turn-based-waves";

// TODO: _VALUE__
export const EFFECT_RACK_ITEM__OSCILLATOR = 0;
export const EFFECT_RACK_ITEM__ENVELOPE = 1;
export const EFFECT_RACK_ITEM__MATHS = 2;
export const EFFECT_RACK_ITEM__SWITCH = 3;
export const EFFECT_RACK_ITEM__NOISE = 4;
export const EFFECT_RACK_ITEM__DELAY = 5;
export const EFFECT_RACK_ITEM__BIQUAD_FILTER = 6;  // TODO: consider removing
export const EFFECT_RACK_ITEM__SINC_FILTER = 7; 

// Delay effect uses a crap tonne of memmory, so we're limiting how long it can be.
// While simple, it is suprisingly OP - you can use it to double waveforms repeatedly.
export const EFFECT_RACK_DELAY_MAX_DURATION = 1;
export const EFFECT_RACK_ITEM__CONVOLUTION_FILTER_MAX_KERNEL_LENGTH = 1024; 

// export const EFFECT_RACK_DSP_INSTRUCTION_SET; this would be quite funny wouldnt it.

// Don't forget to update unmarshallEffectRack! TODO: make typescript remind us
export type EffectRackItemType
    = typeof EFFECT_RACK_ITEM__OSCILLATOR
    | typeof EFFECT_RACK_ITEM__ENVELOPE
    | typeof EFFECT_RACK_ITEM__MATHS
    | typeof EFFECT_RACK_ITEM__SWITCH
    | typeof EFFECT_RACK_ITEM__NOISE
    | typeof EFFECT_RACK_ITEM__DELAY
    | typeof EFFECT_RACK_ITEM__BIQUAD_FILTER
    | typeof EFFECT_RACK_ITEM__SINC_FILTER
    ;

// If we're using a RegisterIndex without reading from or writing to a register, then we're using it wrong.
// -1 -> No register assigned.
export type RegisterIdx = number & { __RegisterIdx: void } ;
export type BufferIdx   = number & { __BufferIdx: void } ;

// The id of an effect. Not stable - when deleted, ids get remapped
// such that they're always between 0..<effects.lengt (TODO: implement)
// However, when moved around, ids stay the same. 
// Allows using arrays isntead of hashmaps to store adjacent state.
export type EffectId = number & { __EffectId: void } ;

export function asRegisterIdx(val: number) {
    return val as RegisterIdx;
}

export function registerIdxAsNumber(val: RegisterIdx) {
    return val as number;
}

// No longer creatable by the user. These are basically just RTTI for our bindings now.
export type RegisterBinding = {
    name: string;
};

export type ValueRef = {
    value?: number;           // Raw value
    regIdx?: RegisterIdx;     // Builtin variable
    effectId?: EffectId;      // Output of another effect. Gets translated to a register index anyway, but intent 
};

export type RegisterIdxUi = {
    // ui can read/write to this.
    valueRef: ValueRef;

    _regIdx: RegisterIdx;

    // These are more like recommendations that UI can use to make itself more useable.
    // The UI could also choose to ignore these values.
    _defaultValue: number; _max: number; _min: number; _name: string;
};

export function newRegisterIdxUi(
    name: string,
    bindingRef: ValueRef,
    min = -1_000_000,
    max = 1_000_000,
): RegisterIdxUi {
    return {
        valueRef: { ...bindingRef, },
        _regIdx: asRegisterIdx(0),
        _defaultValue: bindingRef.value ?? 0,
        _min: min, 
        _max: max,
        _name: name,
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

    // It occurs to me that I cannot animate this ... yet ...
    waveType:    EffectRackOscillatorWaveType;

    phaseUI:         RegisterIdxUi;
    amplitudeUI:     RegisterIdxUi;
    frequencyUI:     RegisterIdxUi;
    frequencyMultUI: RegisterIdxUi;
    offsetUI:        RegisterIdxUi;
};

export function newEffectRackOscillator(): EffectRackOscillator {
    return {
        type: EFFECT_RACK_ITEM__OSCILLATOR,

        _t: asRegisterIdx(0),

        waveType:    OSC_WAVE__SIN,

        // Need to fit all this horizontally, so using shorter UI names...
        amplitudeUI:     newRegisterIdxUi("amp",   { value: 1 }, 0, 1),
        phaseUI:         newRegisterIdxUi("phase",    { value: 0 }, 0, 1),
        frequencyUI:     newRegisterIdxUi("f",     { regIdx: REG_IDX_KEY_FREQUENCY }, 0, 20_000),
        frequencyMultUI: newRegisterIdxUi("fmult", { value: 1 }, 0, 1_000_000),
        offsetUI:        newRegisterIdxUi("offset",    { value: 0 }, -2, 2), 
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

    signalUI:     RegisterIdxUi; // Used to know when to pump the envelope
    attackUI:     RegisterIdxUi; // time from 0 -> 1
    decayUI:      RegisterIdxUi; // time from 1 -> sustain
    sustainUI:    RegisterIdxUi; // sustain amplitude
    releaseUI:    RegisterIdxUi; // time from sustain -> 0

    // extra inputs
    toModulateUI: RegisterIdxUi;
};

export function newEffectRackEnvelope(): EffectRackEnvelope {
    return {
        type: EFFECT_RACK_ITEM__ENVELOPE,

        _stage: asRegisterIdx(0),
        _value: asRegisterIdx(0),

        toModulateUI: newRegisterIdxUi("to modulate", { value: 0 }),

        signalUI:  newRegisterIdxUi("signal",  { regIdx: REG_IDX_KEY_SIGNAL }, 0, 1),
        attackUI:  newRegisterIdxUi("attack",  { value: 0.02 } , 0, 0.5),
        decayUI:   newRegisterIdxUi("decay",   { value: 0.1 } , 0, 4),
        sustainUI: newRegisterIdxUi("sustain", { value: 0.2 } , 0, 1),
        releaseUI: newRegisterIdxUi("release", { value: 0.2 } , 0, 10),
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
    valueUI: RegisterIdxUi;
};

export function newEffectRackMathsItemCoefficient(): EffectRackMathsItemTermCoefficient {
    return {
        // NOTE: UI will need to set this dynamically
        valueUI: newRegisterIdxUi("", { value: 1 }, -1_000_000, 1_000_000),
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

    defaultUi: RegisterIdxUi;
}

export function newEffectRackSwitch(): EffectRackSwitch {
    return {
        type: EFFECT_RACK_ITEM__SWITCH,
        conditions: [
            newEffectRackSwitchCondition(),
        ],
        defaultUi: newRegisterIdxUi("default", { value: 0, }, -1_000_000, 1_000_000),
    };
}

export type EffectRackNoise = {
    type: typeof EFFECT_RACK_ITEM__NOISE;
    amplitudeUi: RegisterIdxUi;
}

export function newEffectRackNoise(): EffectRackNoise {
    return {
        type: EFFECT_RACK_ITEM__NOISE,
        amplitudeUi: newRegisterIdxUi("amplitude", { value: 1 }, 0, 1),
    };
}

export type EffectRackDelay = {
    type: typeof EFFECT_RACK_ITEM__DELAY;

    _sampleBuffer: BufferIdx;
    _idx: RegisterIdx;

    signalUi: RegisterIdxUi;
    secondsUi: RegisterIdxUi;
}

export function newEffectRackDelay(): EffectRackDelay {
    return {
        type: EFFECT_RACK_ITEM__DELAY,

        _sampleBuffer: -1 as BufferIdx,
        _idx: asRegisterIdx(0),

        signalUi: newRegisterIdxUi("signal", { value: 0 }),
        secondsUi: newRegisterIdxUi("seconds", { value: 0.1 }, 0, 1),
    };
}

export type EffectRackBiquadFilter = {
    type: typeof EFFECT_RACK_ITEM__BIQUAD_FILTER;

    signalUi: RegisterIdxUi;

    // just a standard biquad filter (direct form 2)
    // https://www.youtube.com/watch?v=ap1qXBTKU8g
    // https://en.wikipedia.org/wiki/Digital_biquad_filter

    _z1: RegisterIdx;
    _z2: RegisterIdx;


    // TODO: figure out what these actually do
    a1Ui: RegisterIdxUi;
    a2Ui: RegisterIdxUi;

    b0Ui: RegisterIdxUi;
    b1Ui: RegisterIdxUi;
    b2Ui: RegisterIdxUi;
};

export function newEffectRackBiquadFilter(): EffectRackBiquadFilter {
    return {
        type: EFFECT_RACK_ITEM__BIQUAD_FILTER,

        _z1: asRegisterIdx(0),
        _z2: asRegisterIdx(0),

        signalUi: newRegisterIdxUi("signal", { value: 0 }, -1, 1),

        // TODO: figure out what these actually do
        a1Ui: newRegisterIdxUi("a1", { value: 0.5 }, -1, 1),
        a2Ui: newRegisterIdxUi("a2", { value: 0.5 }, -1, 1),

        b0Ui: newRegisterIdxUi("b0", { value: 1 }, -1, 1),
        b1Ui: newRegisterIdxUi("b1", { value: 0.5 }, -1, 1),
        b2Ui: newRegisterIdxUi("b2", { value: 0.5 }, -1, 1),
    };
}

//
// A better interface for the Convolve filter UI would be liek
//
// Response:  Actually, I reckon I only want to use sinc. 
//
// frequency. fc = frequency_ui / SAMPLE_RATE;
//
// Impulse response window:
//     Rectangular
//     Hamming
//     Blackman
//
// Stopband
//
// How would a high-pass and band pass filter work?
//         // delta function minus sinc function
//         let inverseSinc = x == 0 ? 1 - sinc : -1 * sinc
//
// also btw.   let sinc = x != 0 ? sin(PI * fc * x) / (PI * x) : fc
//
// We can do something similar to make a band-pass filter. In fact, the kernel 
// Let's try coding this interface. 
export type EffectRackSincFilter = {
    type: typeof EFFECT_RACK_ITEM__SINC_FILTER;

    // ring buffer.
    _kernel: BufferIdx;
    _kernelIdx: RegisterIdx;

    signalUi: RegisterIdxUi;

    // NOTE: this parameter can't handle automation very well. 
    // the behaviour can change between implementations.
    stopbandUi: RegisterIdxUi;
    cutoffFrequencyUi: RegisterIdxUi;
    cutoffFrequencyMultUi: RegisterIdxUi;

    windowType: ConvolutionSincWindowType;
    highpass: boolean;
}

export type ConvolutionSincWindowType
    = typeof CONVOLUTION_SINC_WINDOW__RECTANGLE
    | typeof CONVOLUTION_SINC_WINDOW__HAMMING
    | typeof CONVOLUTION_SINC_WINDOW__BLACKMAN

export function getConvolutionSincWindowTypeName(e: ConvolutionSincWindowType) {
    switch (e) {
        case CONVOLUTION_SINC_WINDOW__RECTANGLE: return "Rectangle";
        case CONVOLUTION_SINC_WINDOW__HAMMING:   return "Hamming";
        case CONVOLUTION_SINC_WINDOW__BLACKMAN:  return "Blackman";
    }
    return "?";
}

export const CONVOLUTION_SINC_WINDOW__RECTANGLE = 0;
export const CONVOLUTION_SINC_WINDOW__HAMMING   = 1;
export const CONVOLUTION_SINC_WINDOW__BLACKMAN  = 2;

export function newEffectRackConvolutionFilter(): EffectRackSincFilter {
    return {
        type: EFFECT_RACK_ITEM__SINC_FILTER,

        signalUi: newRegisterIdxUi("signal", { value: 0 }, -1, 1),

        windowType: CONVOLUTION_SINC_WINDOW__RECTANGLE, 
        // Automating this parameter may not be so wise...
        // Also should only be an integer...
        stopbandUi: newRegisterIdxUi(
            "stopband",
            { value: 20 },
            2, // needs to be 2 to account for the Hamming window code
            EFFECT_RACK_ITEM__CONVOLUTION_FILTER_MAX_KERNEL_LENGTH
        ),
        highpass:   false,

        cutoffFrequencyUi:     newRegisterIdxUi("f cutoff", { regIdx: REG_IDX_KEY_FREQUENCY }),
        cutoffFrequencyMultUi: newRegisterIdxUi("fmult", { value: 1 }),

        _kernel: -1 as BufferIdx,
        _kernelIdx: asRegisterIdx(0),
    };
}

export const SWITCH_OP_LT = 1;
export const SWITCH_OP_GT = 2;

export type EffectRackSwitchOperator
    = typeof SWITCH_OP_LT
    | typeof SWITCH_OP_GT
    ;

export type EffectRackSwitchCondition = {
    aUi: RegisterIdxUi;

    operator: EffectRackSwitchOperator;

    bUi: RegisterIdxUi;
    valUi: RegisterIdxUi;
};

export function newEffectRackSwitchCondition(): EffectRackSwitchCondition {
    return {
        aUi:   newRegisterIdxUi("a", { value: 0 }),

        operator: SWITCH_OP_LT,

        valUi: newRegisterIdxUi("then", { value: 0 }),

        bUi:   newRegisterIdxUi("b", { value: 0 }),
    };
}

export type EffectRackItem = {
    id: EffectId;
    _toDelete: boolean;

    // All items have an output register
    _dst: RegisterIdx; 

    value: EffectRackItemValue;
};

type EffectRackItemValue
    = EffectRackOscillator
    | EffectRackEnvelope
    | EffectRackMaths
    | EffectRackSwitch
    | EffectRackNoise
    | EffectRackDelay
    | EffectRackBiquadFilter
    | EffectRackSincFilter
    ;

export type EffectRack = {
    effects: EffectRackItem[];

    _effectIdToEffectPos: number[];

    // Gets cloned as needed - the same effect rack can be reused with several keys,
    // each of which will have it's own registers array.
    _registersTemplate: EffectRackRegisters; 

    _debugEffectPos: number;

    _lastEffectTypes: EffectRackItemValue["type"][];
};

export function newEffectRackItem(value: EffectRackItemValue): EffectRackItem {
    return {
        // -1 ids will get assigned i the compilation step. Does need to be serialized tho.
        id: -1 as EffectId,
        value: value,

        // TODO: deletion in the compile step.
        _toDelete: false,
        _dst: asRegisterIdx(0),
    };
}

export function newEffectRackBinding(name: string, r: boolean, w: boolean): RegisterBinding {
    return {
        name: name,
    };
}

export function newEffectRack(): EffectRack {
    return {
        _lastEffectTypes: [],

        effects: [],
        _effectIdToEffectPos: [],
        _debugEffectPos: -1,
        _registersTemplate: newEffectRackRegisters(),
    };
}

export const REG_IDX_NONE = asRegisterIdx(-1);
export const REG_IDX_KEY_FREQUENCY = asRegisterIdx(0);
export const REG_IDX_KEY_SIGNAL = asRegisterIdx(1);
export const REG_IDX_SAMPLE_RATE_DT = asRegisterIdx(2);
// NOTE: right now, the 'raw' signal is identical to the regular signal.
// If I ever want to have a variable signal between 0 and 1 somehow, that is where SIGNAL_RAW will still be 0 or 1. 
// I suppose in that case it is technically not the raw signal then xD. This name must have been influenced Unity's Input.GetAxisRaw method., I may change it later.
export const REG_IDX_KEY_SIGNAL_RAW = asRegisterIdx(3);
export const REG_IDX_EFFECT_BINDINGS_START = asRegisterIdx(4);

export const defaultBindings = [
    newEffectRackBinding("Key frequency", true, false),
    newEffectRackBinding("Signal", true, false),
    newEffectRackBinding("1/Sample Rate", true, false),
    newEffectRackBinding("Raw signal", true, false),
];

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
    isDynamicState: boolean,
): RegisterIdx {
    const idx = e._registersTemplate.values.length;
    e._registersTemplate.values.push(initialValue);
    e._registersTemplate.isPersistedBetweenFrames.push(isDynamicState);
    return asRegisterIdx(idx);
}

export function allocateBufferIdx(e: EffectRack, maxDurationSeconds: number, samples: number): BufferIdx {
    if (maxDurationSeconds > 2) {
        throw new Error("You may have put in #samples instead of seconds");
    }

    const idx = e._registersTemplate.buffers.length;
    e._registersTemplate.buffers.push({ val: new Float32Array(0), seconds: maxDurationSeconds, samples, });
    return idx as BufferIdx;
}

export function allocateRegisterIdxIfNeeded(
    e: EffectRack,
    regUi: RegisterIdxUi,
    remap: (EffectId | undefined)[] | undefined,
    effectPos: number,
): void {
    const v = regUi.valueRef;

    let regIdx: RegisterIdx | undefined;

    if (v.effectId !== undefined) {
        // As it turns out - it is totally valid for effect inputs to depend on outputs that came later. 
        // This is a form of 'feedback' that appears to be a very common technique in the DSP world: https://www.youtube.com/watch?v=BgL5w0ckX-k&list=PL7w4cOVVxL6FB_mmJ77C6fdV8G6L4zDut
        // if (vEffectIdPos >= effectPos) {
        //     // don't depend on effects that are set after this one.
        //     v.effectId = undefined;
        // }

        if (remap && v.effectId !== undefined) {
            v.effectId = remap[v.effectId];
        }

        if (v.effectId === undefined) {
            v.value = regUi._defaultValue;
        }
    }

    const atLeastOnePopulated = v.effectId !== undefined || v.value !== undefined || v.regIdx !== undefined;
    if (!atLeastOnePopulated) {
        v.value = regUi._defaultValue;
    }

    if (v.value !== undefined) {
        regIdx = allocateRegisterIdx(e, v.value, false);
    } else if (v.regIdx !== undefined) {
        if (v.regIdx >= 0 && v.regIdx < defaultBindings.length) {
            regIdx = v.regIdx;
        } else {
            console.warn("Invalid regIdx, falling back to a value", v.regIdx);
            regIdx = allocateRegisterIdx(e, 0, false);
        }
    } else if (v.effectId !== undefined) {
        const effectPos = e._effectIdToEffectPos[v.effectId];
        regIdx = asRegisterIdx(REG_IDX_EFFECT_BINDINGS_START + effectPos);
    } 

    if (regIdx === undefined) {
        throw new Error("We couldn't allocate this register!");
    }

    regUi._regIdx = regIdx;
}

/**
 * Resets all effects, and allocates the register indices based on bindings and constants. 
 */
export function compileEffectRack(e: EffectRack) {
    // generate new ids as needed. also generate effectId->effectPos lookup
    {
        resizeValuePool(e._effectIdToEffectPos, e.effects.length, 0);
        for (let effectPos = 0; effectPos < e.effects.length; effectPos++) {
            const effect = e.effects[effectPos];

            if (effect.id === -1) {
                // needs a new id
                // btw. the effect rack array can't be that long. because if it were, the dsp loop wouldn't be able to run it right now xD
                let foundId = false;
                for (let id = 0; id < e.effects.length; id++) {
                    let taken = false;
                    for (const effect of e.effects) {
                        if (effect.id === id) {
                            taken = true;
                            break
                        }
                    }
                    if (taken) continue;

                    effect.id = id as EffectId;
                    foundId = true;
                    break;
                }
                assert(foundId);
            }

            assert(effect.id >= 0 && effect.id < e.effects.length);
            e._effectIdToEffectPos[effect.id] = effectPos;
        }

        const allIds: boolean[] = Array(e.effects.length).fill(false);
        for (const effect of e.effects) {
            allIds[effect.id] = true;
        }
        for (const val of allIds) {
            assert(val);
        }
    }

    // delete effects that need deletion.
    // they'll get remapped later.
    // All this effort to keep the ids between 0..<effects.length, so that we never need to use Map. xd
    let remap: (EffectId | undefined)[] | undefined;
    {
        let anyNeedDeletion = false;
        for (const effect of e.effects) {
            if (effect._toDelete) {
                anyNeedDeletion = true;
                break
            }
        }

        if (anyNeedDeletion) {
            remap = [];
            resizeValuePool(remap, e.effects.length, 0 as EffectId);
            let i2 = 0 as EffectId;
            for (let i = 0; i < e.effects.length; i++) {
                const effect = e.effects[i];
                if (!effect._toDelete) {
                    remap[effect.id] = i2;
                    effect.id = i2;
                    i2++;
                } else {
                    remap[effect.id] = undefined;
                }
            }

            filterInPlace(e.effects, e => !e._toDelete);
        }
    }

    // First registers are for builtin buindings
    e._registersTemplate.values.length = 0;
    e._registersTemplate.buffers.length = 0;
    e._registersTemplate.isPersistedBetweenFrames.length = 0;
    assert(defaultBindings.length === REG_IDX_EFFECT_BINDINGS_START);
    for (let i = 0; i < defaultBindings.length; i++) {
        allocateRegisterIdx(e, 0, false);
    }
    // Next bindings are for effect outputs. 
    for (let i = 0; i < e.effects.length; i++) {
        const effect = e.effects[i];
        effect._dst = allocateRegisterIdx(
            e,
            0,
            // they can persist between frames!
            true
        );
    }

    // ensure _debugEffectIdx is correct
    if (e._debugEffectPos < -1) e._debugEffectPos = -1;
    if (e._debugEffectPos >= e.effects.length) e._debugEffectPos = -1;

    // Walk the effects, allocate registers for all constants and bindings as needed
    for (let effectPos = 0; effectPos < e.effects.length; effectPos++) {
        const effectValue = e.effects[effectPos].value;

        // NOTE: effect._dst already allocated above
        // NOTE: you'll need multicursor to have success editing stuff here

        switch (effectValue.type) {
            case EFFECT_RACK_ITEM__OSCILLATOR: {
                const wave = effectValue;
                wave._t = allocateRegisterIdx(e, 0, true);


                allocateRegisterIdxIfNeeded(e, wave.phaseUI, remap, effectPos);
                allocateRegisterIdxIfNeeded(e, wave.amplitudeUI, remap, effectPos);
                allocateRegisterIdxIfNeeded(e, wave.frequencyUI, remap, effectPos);
                allocateRegisterIdxIfNeeded(e, wave.frequencyMultUI, remap, effectPos);
                allocateRegisterIdxIfNeeded(e, wave.offsetUI, remap, effectPos);
            } break;
            case EFFECT_RACK_ITEM__ENVELOPE: {
                const envelope = effectValue;

                envelope._stage = allocateRegisterIdx(e, 0, true);
                envelope._value = allocateRegisterIdx(e, 0, true);

                allocateRegisterIdxIfNeeded(e, envelope.toModulateUI, remap, effectPos);

                allocateRegisterIdxIfNeeded(e, envelope.signalUI, remap, effectPos);
                allocateRegisterIdxIfNeeded(e, envelope.attackUI, remap, effectPos);
                allocateRegisterIdxIfNeeded(e, envelope.decayUI, remap, effectPos);
                allocateRegisterIdxIfNeeded(e, envelope.sustainUI, remap, effectPos);
                allocateRegisterIdxIfNeeded(e, envelope.releaseUI, remap, effectPos);
            } break;
            case EFFECT_RACK_ITEM__MATHS: {
                const maths = effectValue;

                for (let i = 0; i < maths.terms.length; i++) {
                    const term = maths.terms[i];
                    for (let i = 0; i < term.coefficients.length; i++) {
                        const c = term.coefficients[i];
                        allocateRegisterIdxIfNeeded(e, c.valueUI, remap, effectPos);
                    }
                }
            } break;
            case EFFECT_RACK_ITEM__SWITCH: {
                const switchEffect = effectValue;

                for (let i = 0; i < switchEffect.conditions.length; i++) {
                    const cond = switchEffect.conditions[i];

                    allocateRegisterIdxIfNeeded(e, cond.aUi, remap, effectPos);
                    allocateRegisterIdxIfNeeded(e, cond.bUi, remap, effectPos);
                    allocateRegisterIdxIfNeeded(e, cond.valUi, remap, effectPos);
                }

                allocateRegisterIdxIfNeeded(e, switchEffect.defaultUi, remap, effectPos);
            } break;
            case EFFECT_RACK_ITEM__NOISE: {
                const noise = effectValue;

                allocateRegisterIdxIfNeeded(e, noise.amplitudeUi, remap, effectPos);
            } break;
            case EFFECT_RACK_ITEM__DELAY: {
                const delay = effectValue;

                delay._idx = allocateRegisterIdx(e, 0, true);
                delay._sampleBuffer = allocateBufferIdx(e, 1, 0);

                allocateRegisterIdxIfNeeded(e, delay.signalUi, remap, effectPos);
                allocateRegisterIdxIfNeeded(e, delay.secondsUi, remap, effectPos);
            } break;
            case EFFECT_RACK_ITEM__BIQUAD_FILTER: {
                const filter = effectValue;

                filter._z1 = allocateRegisterIdx(e, 0, true);
                filter._z2 = allocateRegisterIdx(e, 0, true);

                allocateRegisterIdxIfNeeded(e, filter.signalUi, remap, effectPos);

                allocateRegisterIdxIfNeeded(e, filter.a1Ui, remap, effectPos);
                allocateRegisterIdxIfNeeded(e, filter.a2Ui, remap, effectPos);
                allocateRegisterIdxIfNeeded(e, filter.b0Ui, remap, effectPos);
                allocateRegisterIdxIfNeeded(e, filter.b1Ui, remap, effectPos);
                allocateRegisterIdxIfNeeded(e, filter.b2Ui, remap, effectPos);
            } break;
            case EFFECT_RACK_ITEM__SINC_FILTER: {
                const conv = effectValue;

                conv._kernel    = allocateBufferIdx(e, 0, EFFECT_RACK_ITEM__CONVOLUTION_FILTER_MAX_KERNEL_LENGTH); 
                conv._kernelIdx = allocateRegisterIdx(e, 0, true);

                allocateRegisterIdxIfNeeded(e, conv.signalUi, remap, effectPos);
                allocateRegisterIdxIfNeeded(e, conv.stopbandUi, remap, effectPos);
                allocateRegisterIdxIfNeeded(e, conv.cutoffFrequencyUi, remap, effectPos);
                allocateRegisterIdxIfNeeded(e, conv.cutoffFrequencyMultUi, remap, effectPos);
            } break;
            default: unreachable(effectValue);
        }
    }
}

export type EffectRackRegisters = {
    values: number[];
    isPersistedBetweenFrames: boolean[];

    buffers: { val: Float32Array; seconds: number; samples: number; }[];
    sampleRate: number;
    // Dynamic state persists between recompilation. It's assumed that UI can't control this state.
};

// An effect rack is stateless. All it's state lives in one of these.
export function newEffectRackRegisters(): EffectRackRegisters {
    // TODO: enforce just a single effect rack at a time.
    // Currently not needed, as there is just one effect rack in the entire program.
    return {
        values: [],
        buffers: [],
        isPersistedBetweenFrames: [],
        sampleRate: 0,
    };
}

export function copyEffectRackItem(item: EffectRackItem, disconnectObject = false): EffectRackItem {
    const jsonObj = JSON.parse(serializeToJSON(item));
    const val = unmarshalEffectRackItem(jsonObj, disconnectObject);
    val.id = -1 as EffectId;
    return val;
}

export function updateRegisters(
    e: EffectRack,
    registers: EffectRackRegisters,
    sampleRate: number,
    startedPressing: boolean,
) {
    const re = registers.values;
    const buff = registers.buffers;
    
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

    let invalidateBuffersAsWell = false;
    if (shapeChanged || startedPressing) {
        // full copy
        for (let i = 0; i < e._registersTemplate.values.length; i++) {
            re[i] = e._registersTemplate.values[i];
        }

        invalidateBuffersAsWell = true;
    } else {
        // only copy the parts not persisted between frames.
        for (let i = 0; i < e._registersTemplate.values.length; i++) {
            // could prob store these in two separate buffers, but I couldnt be botherd for now.
            if (e._registersTemplate.isPersistedBetweenFrames[i] === true) continue;
            re[i] = e._registersTemplate.values[i];
        }
    }

    let sampleRateChanged = sampleRate !== registers.sampleRate;
    if (sampleRateChanged || invalidateBuffersAsWell) {
        registers.sampleRate = sampleRate;

        let reallocated = false;

        for (let i = 0; i < e._registersTemplate.buffers.length; i++) {
            const template = e._registersTemplate.buffers[i];

            assert(i <= registers.buffers.length);
            if (i === registers.buffers.length) {
                const wantedLength = Math.floor(sampleRate * template.seconds) + template.samples;
                registers.buffers.push({
                    seconds: template.seconds,
                    samples: template.samples,
                    val: new Float32Array(wantedLength),
                });

                reallocated = true;
            } else {
                const buff = registers.buffers[i];
                const wantedLength = Math.floor(sampleRate * buff.seconds) + buff.samples;
                if (buff.val.length !== wantedLength) {
                    buff.val = new Float32Array();
                    reallocated = true;
                }
            }
        }

        if (reallocated) {
            console.log("reallocated buffers");
        }
    }

}


// GOAT website: https://www.dspforaudioprogramming.com
// Simplified my oscillator code so much damn.
// And now I know more than just sine wave. Very epic.
// NOTE: the current effects rack is no longer capable of 
// generating the triangle wave from hundreds of tiny sine waves.
// Not sure if I care though.
// NOTE: Another goat source: https://www.soundonsound.com/techniques/whats-sound
// Our effects rack is heavily influenced by this.
// NOTE: if you want any hope understanding any of the filters,
// you'll need to understand the significance of the 'Impulse signal'.
// The best explanation I've seen so far is https://youtu.be/vsj7wUaTYdY ("Impulse Signal and its Response" - Akash Murthy).
// Once you see this, you may be able to more-easily understand the other articles, as was the case with myself
export function computeEffectRackIteration(
    e: EffectRack,
    registers: EffectRackRegisters,
    keyFreqeuency: number,
    signal: number,
    sampleRate: number, // I assume it won't change too often.
    startedPressing: boolean,
): number {
    const re = registers.values;
    const buff = registers.buffers;

    updateRegisters(e, registers, sampleRate, startedPressing);

    re[REG_IDX_KEY_FREQUENCY]  = keyFreqeuency;
    re[REG_IDX_KEY_SIGNAL]     = signal;
    re[REG_IDX_SAMPLE_RATE_DT] = 1 / sampleRate;
    re[REG_IDX_KEY_SIGNAL_RAW] = signal > 0.0000001 ? 1 : 0;

    let lastEffect = e.effects.length - 1;
    if (e._debugEffectPos !== -1) {
        lastEffect = e._debugEffectPos;
    }

    const dt = 1 / sampleRate;
 
    for (let effectIdx = 0; effectIdx <= lastEffect; effectIdx++) {
        const effect = e.effects[effectIdx];
        const effectValue = effect.value;

        let value = 0;

        switch (effectValue.type) {
            case EFFECT_RACK_ITEM__OSCILLATOR: {
                const wave = effectValue;

                const a = r(re, wave.amplitudeUI._regIdx);
                if (Math.abs(a) > 0) {
                    const t = r(re, wave._t);
                    const t2 = t + r(re, wave.phaseUI._regIdx);

                    switch (wave.waveType) {
                        case OSC_WAVE__SIN:      value += sin(t2);      break;
                        case OSC_WAVE__SQUARE:   value += square(t2);   break;
                        case OSC_WAVE__TRIANGLE: value += triangle(t2); break;
                        case OSC_WAVE__SAWTOOTH: value += sawtooth(t2); break;
                        case OSC_WAVE__SAWTOOTH2: value -= sawtooth(t2); break;
                    }

                    w(
                        re,
                        wave._t,
                        t + dt * r(re, wave.frequencyUI._regIdx) * r(re, wave.frequencyMultUI._regIdx)
                    );
                    value *= a;
                    value += r(re, wave.offsetUI._regIdx);
                }
            } break;
            case EFFECT_RACK_ITEM__ENVELOPE: {
                const envelope = effectValue;

                const signal = r(re, envelope.signalUI._regIdx);

                value = r(re, envelope._value);
                let stage = r(re, envelope._stage);

                let velocity = 0;
                let targetValue = 0;
                switch(stage) {
                    case 0: { // attack -> decay
                    } break;
                    case 1: { // decay -> sustain
                    } break;
                    case 2: { // sustain -> release
                        velocity = 0;
                        targetValue = 0;
                    } break;
                }

                // TODO: handle signal between 0 and 1 when we envetually get there. Right now signal can only ever be 0 or 1
                // so it's not that important. Also not clear what the correct approach is.
                // Does velocity slow down? does the amlitude decrease? not sure.
                if (signal > 0) {
                    if (stage === 0) {
                        velocity = 1 / r(re, envelope.attackUI._regIdx);
                        targetValue = 1;
                    } else {
                        const sustainLevel = r(re, envelope.sustainUI._regIdx)
                        const amountToDrop = 1 - sustainLevel;
                        velocity = amountToDrop / r(re, envelope.decayUI._regIdx);
                        targetValue = sustainLevel;
                    }
                } else if (value > 0) {
                    const amountToDrop = r(re, envelope.sustainUI._regIdx) - 0;
                    velocity = amountToDrop / r(re, envelope.decayUI._regIdx);
                    targetValue = 0;
                }

                // NOTE: we can smooth the velocit here if we wanted to.

                if (signal > 0) {
                    if (stage === 0) {
                        value += dt * velocity;
                        if (value > 1) {
                            value = 1;
                            stage = 1;
                        }
                    } else {
                        value = moveTowards(value, targetValue, dt * velocity);
                    }
                } else if (value > 0) {
                    value -= dt * velocity;
                    if (value < 0) {
                        value = 0;
                    }
                    // We want the attack to work instantly after a release and press.
                    stage = 0;
                }

                w(re, envelope._value, value);
                w(re, envelope._stage, stage);

                const target = r(re, envelope.toModulateUI._regIdx);
                value *= target;
            } break;
            case EFFECT_RACK_ITEM__MATHS: {
                const maths = effectValue;

                for (let i = 0; i < maths.terms.length; i++) {
                    const term = maths.terms[i];

                    let termValue = 1;
                    for (let i = 0; i < term.coefficients.length; i++) {
                        const c = term.coefficients[i];
                        termValue *= r(re, c.valueUI._regIdx);
                    }

                    value += termValue;
                }

            } break;
            case EFFECT_RACK_ITEM__SWITCH: {
                const switchEffect = effectValue;

                let broke = false;
                for (let i = 0; i < switchEffect.conditions.length; i++) {
                    const cond = switchEffect.conditions[i];

                    const a = r(re, cond.aUi._regIdx);
                    const b = r(re, cond.bUi._regIdx);

                    let result;
                    if (cond.operator === SWITCH_OP_LT) {
                        result = a < b;
                    } else {
                        result = a > b;
                    }

                    if (result) {
                        value = r(re, cond.valUi._regIdx);
                        broke = true;
                        break;
                    }
                }
                if (!broke) {
                    value = r(re, switchEffect.defaultUi._regIdx);
                }
            } break;
            case EFFECT_RACK_ITEM__NOISE: {
                const noise = effectValue;

                value = r(re, noise.amplitudeUi._regIdx)
                if (Math.abs(value) > 0) {
                    value = 2 * Math.random() - 1;
                }
            } break;
            case EFFECT_RACK_ITEM__DELAY: {
                const delay = effectValue;

                if (delay._sampleBuffer !== null) {
                    const signal  = r(re, delay.signalUi._regIdx);
                    const seconds = r(re, delay.secondsUi._regIdx);

                    let idx = r(re, delay._idx);

                    const sampleBuffer = buff[delay._sampleBuffer].val;

                    let realLength = Math.ceil(seconds * sampleRate);
                    if (realLength > sampleBuffer.length) {
                        realLength = sampleBuffer.length; 
                    }

                    if (realLength === 0) {
                        value = signal;
                    } else {
                        if (idx >= sampleBuffer.length) {
                            // Shouldn't happen, but dont want to take any chances...
                            idx = sampleBuffer.length - 1;
                        }
                        // value we wrote several thousand samples ago. lets grab it before writing to it.
                        value = sampleBuffer[idx];
                        sampleBuffer[idx] = signal;
                        idx = (idx + 1) % realLength;
                    }

                    w(re, delay._idx, idx);
                }
            } break;
            case EFFECT_RACK_ITEM__BIQUAD_FILTER: {
                const filter = effectValue;

                // https://en.wikipedia.org/wiki/Digital_biquad_filter
                // (direct form 2)

                const signal = r(re, filter.signalUi._regIdx);

                const a1 = r(re, filter.a1Ui._regIdx);
                const a2 = r(re, filter.a2Ui._regIdx);
                const b0 = r(re, filter.b0Ui._regIdx);
                const b1 = r(re, filter.b1Ui._regIdx);
                const b2 = r(re, filter.b2Ui._regIdx);

                let z1 = r(re, filter._z1);
                let z2 = r(re, filter._z2);

                const wn = signal - a1 * z1 - a2 * z2;
                value = b0 * wn + b1 * z1 + b2 * z2;

                z2 = z1;
                z1 = wn;

                w(re, filter._z1, z1);
                w(re, filter._z2, z2);
            } break;
            case EFFECT_RACK_ITEM__SINC_FILTER: {
                // > putting a signal through an LTI filter is an equivalent operation 
                //   to convolving the signal with the filter's impulse response
                // https://www.dspforaudioprogramming.com

                const conv = effectValue;

                const signal = r(re, conv.signalUi._regIdx);

                let idx = r(re, conv._kernelIdx);
                const signalPrev = buff[conv._kernel];
                signalPrev.val[idx] = signal;

                // fc => cutoff frequency as a fraction of the sample rate
                const f = r(re, conv.cutoffFrequencyUi._regIdx);
                const fmult = r(re, conv.cutoffFrequencyMultUi._regIdx);
                const fc = f * fmult / sampleRate;

                let stopband = r(re, conv.stopbandUi._regIdx);
                stopband = Math.round(stopband);
                if (stopband <= 0) stopband = 1;
                if (stopband >= signalPrev.val.length) {
                    // For performance reasons. TODO: bring it down further tbh
                    stopband = signalPrev.val.length;
                }

                const windowType = conv.windowType;
                const isHighpass = conv.highpass;

                for (let i = 0 ; i < stopband; i++) {
                    // since idx is decrementing, we seek ahead to get the previous sample
                    const signalPrevVal = signalPrev.val[(idx + i) % stopband];

                    let sinc = i === 0 ? fc : sin(fc * i / 2) / (i * Math.PI);
                    if (isHighpass === true) {
                        sinc = i === 0 ? 1 - sinc : -sinc;
                    }

                    switch(windowType) {
                        case CONVOLUTION_SINC_WINDOW__RECTANGLE: {
                            // Our job here is done
                        } break;
                        case CONVOLUTION_SINC_WINDOW__HAMMING: {
                            const hamming = 0.54 - 0.46 * cos(i / (stopband - 1));
                            sinc *= hamming;
                        } break;
                        case CONVOLUTION_SINC_WINDOW__BLACKMAN: {
                            const blackman = 0.42 - 0.5 * cos(i / stopband) + 0.08 * cos(i / stopband);
                            sinc *= blackman;
                        } break;
                    }

                    value += signalPrevVal * sinc;
                }

                idx -= 1;
                if (idx < 0) {
                    idx = stopband - 1;
                }
                w(re, conv._kernelIdx, idx);
            } break;
            default: unreachable(effectValue);
        }

        w(re, effect._dst, value);
    }

    return re[REG_IDX_EFFECT_BINDINGS_START + lastEffect];
}

// Prob not needed for undo buffer, but should be useful for import/export. 
export function serializeEffectRack(effectRack: EffectRack): string {
    compileEffectRack(effectRack);
    return serializeToJSON(effectRack);
}

export function deserializeEffectRack(json: string): EffectRack {
    const jsonObject = JSON.parse(json);
    return unmarshallEffectRack(jsonObject);
}

// Literally serializing the fields 1 by 1. The shit I do for hidden classes. literal astrology. Im a believer, however.
function unmarshallEffectRack(jsonObj: unknown) {
    return unmarshalObject(jsonObj, newEffectRack(), {
        effects: u => asArray(u).map(u => unmarshalEffectRackItem(u)),
    });
}

function unmarshalEffectRackItem(u: unknown, disconnectObject = false): EffectRackItem {
    const regUiUnmarshaller = disconnectObject ? unmarshalRegisterIdxUiDisconnect: unmarshalRegisterIdxUi;

    const oItem = asObject(u);
    const o = asObject(oItem["value"]);
    const type = asEnum<EffectRackItemType>(o["type"], [
        EFFECT_RACK_ITEM__OSCILLATOR,
        EFFECT_RACK_ITEM__ENVELOPE,
        EFFECT_RACK_ITEM__MATHS,
        EFFECT_RACK_ITEM__SWITCH,
        EFFECT_RACK_ITEM__NOISE,
        EFFECT_RACK_ITEM__DELAY,
        EFFECT_RACK_ITEM__BIQUAD_FILTER,
        EFFECT_RACK_ITEM__SINC_FILTER,
    ]);

    let value: EffectRackItemValue | undefined;
    switch (type) {
        case EFFECT_RACK_ITEM__OSCILLATOR: {
            value = unmarshalObject(o, newEffectRackOscillator(), {
                type: asIs,

                waveType: u => asEnum<EffectRackOscillatorWaveType>(u, [
                    OSC_WAVE__SIN,
                    OSC_WAVE__SQUARE,
                    OSC_WAVE__SAWTOOTH,
                    OSC_WAVE__TRIANGLE,
                    OSC_WAVE__SAWTOOTH2
                ]),

                amplitudeUI: regUiUnmarshaller,
                phaseUI: regUiUnmarshaller,
                frequencyUI: regUiUnmarshaller,
                frequencyMultUI: regUiUnmarshaller,
                offsetUI: regUiUnmarshaller,
            });
        } break;
        case EFFECT_RACK_ITEM__ENVELOPE: {
            value = unmarshalObject(o, newEffectRackEnvelope(), {
                type: asIs,

                signalUI: regUiUnmarshaller,
                attackUI: regUiUnmarshaller,
                decayUI: regUiUnmarshaller,
                sustainUI: regUiUnmarshaller,
                releaseUI: regUiUnmarshaller,
                toModulateUI: regUiUnmarshaller,
            });
        } break;
        case EFFECT_RACK_ITEM__MATHS: {
            value = unmarshalObject(o, newEffectRackMaths(), {
                type: asIs,

                terms: u => asArray(u).map(u => unmarshalObject(u, newEffectRackMathsItemTerm(), {
                    coefficients: u => asArray(u).map(u => unmarshalObject(u, newEffectRackMathsItemCoefficient(), {
                        valueUI: regUiUnmarshaller,
                    })),
                })),
            });

        } break;
        case EFFECT_RACK_ITEM__SWITCH: {
            value = unmarshalObject(o, newEffectRackSwitch(), {
                type: asIs,
                conditions: u => asArray(u).map(u => unmarshalObject(u, newEffectRackSwitchCondition(), {
                    operator: u => asEnum(u, [SWITCH_OP_LT, SWITCH_OP_GT]),
                    aUi: regUiUnmarshaller,
                    valUi: regUiUnmarshaller,
                    bUi: regUiUnmarshaller,
                })),
                defaultUi: regUiUnmarshaller,
            });

        } break;
        case EFFECT_RACK_ITEM__NOISE: {
            value = unmarshalObject(o, newEffectRackNoise(), {
                type: asIs,
                amplitudeUi: regUiUnmarshaller,
            });
        } break;
        case EFFECT_RACK_ITEM__DELAY: {
            value = unmarshalObject(o, newEffectRackDelay(), {
                type: asIs,

                signalUi: regUiUnmarshaller,
                secondsUi: regUiUnmarshaller,
            });
        } break;
        case EFFECT_RACK_ITEM__BIQUAD_FILTER: {
            value = unmarshalObject(o, newEffectRackBiquadFilter(), {
                type: asIs,

                signalUi: regUiUnmarshaller,

                // TODO: figure out what these actually do
                a1Ui: regUiUnmarshaller,
                a2Ui: regUiUnmarshaller,
                b0Ui: regUiUnmarshaller,
                b1Ui: regUiUnmarshaller,
                b2Ui: regUiUnmarshaller,
            });
        } break;
        case EFFECT_RACK_ITEM__SINC_FILTER: {
            value = unmarshalObject(o, newEffectRackConvolutionFilter(), {
                type: asIs,

                windowType: u => asEnum<ConvolutionSincWindowType>(u, [
                    CONVOLUTION_SINC_WINDOW__RECTANGLE,
                    CONVOLUTION_SINC_WINDOW__HAMMING,
                    CONVOLUTION_SINC_WINDOW__BLACKMAN,
                ]),

                highpass: (u, def) => asBooleanOrUndefined(u) ?? def,

                signalUi: regUiUnmarshaller,
                stopbandUi: regUiUnmarshaller,
                cutoffFrequencyUi: regUiUnmarshaller,
                cutoffFrequencyMultUi: regUiUnmarshaller,
            });
        } break;
        default: unreachable(type);
    }

    return unmarshalObject(oItem, newEffectRackItem(value), {
        value: asIs,
        id: u => asNumber(u) as EffectId,
    });
}

assert(deepEquals(
    newEffectRack(), 
    deserializeEffectRack(serializeEffectRack(newEffectRack()))
).mismatches.length === 0);

function unmarshalRegisterIdxUi(arg: unknown, defaultVal: RegisterIdxUi) {
    return unmarshalObject(arg, defaultVal, {
        valueRef: (u, valueRef) => unmarshalObject<ValueRef>(u, valueRef, {
            value: u => asNumberOrUndefined(u),
            regIdx: u => asNumberOrUndefined(u) as RegisterIdx,
            effectId: u => asNumberOrUndefined(u) as EffectId,
        }),
    });
}

function unmarshalRegisterIdxUiDisconnect(arg: unknown, defaultVal: RegisterIdxUi) {
    return unmarshalObject(arg, defaultVal, {
        valueRef: (u, valueRef) => unmarshalObject<ValueRef>(u, valueRef, {
            value: u => asNumberOrUndefined(u),
            regIdx: u => asNumberOrUndefined(u) as RegisterIdx,
            effectId: u => undefined, 
        }),
    });
}
