// An effect-rack based sound system that passes data via registers.
// All `number` are actually registers! This is where I'm hoping the non-linearity and interestingnesss
// can come from. The assembly-style thing is way harder to do anything in IMO.

// NOTE: these dependencies and their dependencies need to be manually injected into the DSP loop, so 
// try to keep them small.
import { filterInPlace, resizeValuePool } from "src/utils/array-utils";
import { assert, unreachable } from "src/utils/assert";
import { clamp, moveTowards } from "src/utils/math-utils";
import { asArray, asBooleanOrUndefined, asEnum, asIs, asNumber, asNumberOrUndefined, asObject, asStringOrUndefined, serializeToJSON, unmarshalObject } from "src/utils/serialization-utils";
import { deepEquals } from "src/utils/testing";
import { cos, sawtooth, sin, square, triangle } from "src/utils/turn-based-waves";

// TODO: _VALUE__
export const EFFECT_RACK_ITEM__OSCILLATOR      = 0;
export const EFFECT_RACK_ITEM__ENVELOPE        = 1;
export const EFFECT_RACK_ITEM__MATHS           = 2;
export const EFFECT_RACK_ITEM__SWITCH          = 3;
export const EFFECT_RACK_ITEM__NOISE           = 4;
export const EFFECT_RACK_ITEM__DELAY           = 5;
export const EFFECT_RACK_ITEM__BIQUAD_FILTER   = 6;  // TODO: consider removing
export const EFFECT_RACK_ITEM__SINC_FILTER     = 7;  // TODO: consider removing once EFFECT_RACK_ITEM__BIQUAD_FILTER_2 is working
export const EFFECT_RACK_ITEM__REVERB_BAD      = 8;
export const EFFECT_RACK_ITEM__BIQUAD_FILTER_2 = 9;

// Delay effect uses a crap tonne of memmory, so we're limiting how long it can be.
// While simple, it is suprisingly OP - you can use it to double waveforms repeatedly.
export const EFFECT_RACK_DELAY_MAX_DURATION_SECONDS = 1;
export const EFFECT_RACK_ITEM__CONVOLUTION_FILTER_MAX_KERNEL_LENGTH = 1024; 
export const EFFECT_RACK_REVERB_MAX_DURATION_SECONDS = 1;
// These are very costly, esp. in JavaScript in a highly generic synth that won't benefit from compiler optimizations
export const EFFECT_RACK_OSC_MAX_UNISON_VOICES = 16; 

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
    | typeof EFFECT_RACK_ITEM__REVERB_BAD
    | typeof EFFECT_RACK_ITEM__BIQUAD_FILTER_2
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
    _defaultValue: number; _max: number; _min: number; 
    // NOTE: this should never be empty - otherwise the user has no way to click on the associated UI
    _name: string;
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
    _unisonOscilators: BufferIdx;

    // It occurs to me that I cannot animate this ... yet ...
    waveType:    EffectRackOscillatorWaveType;

    phaseUI:         RegisterIdxUi;
    amplitudeUI:     RegisterIdxUi;
    frequencyUI:     RegisterIdxUi;
    frequencyMultUI: RegisterIdxUi;
    offsetUI:        RegisterIdxUi;

    // TODO: remove unison from here, make a second oscilator based on the note
    unisonCountUi:  RegisterIdxUi;
    unisionWidthUi: RegisterIdxUi;
    unisonMixUi:    RegisterIdxUi;
};

export function newEffectRackOscillator(): EffectRackOscillator {
    return {
        type: EFFECT_RACK_ITEM__OSCILLATOR,

        _t: asRegisterIdx(0),
        _unisonOscilators: 0 as BufferIdx,

        waveType:    OSC_WAVE__SIN,

        // Need to fit all this horizontally, so using shorter UI names...
        amplitudeUI:     newRegisterIdxUi("amp",    { value: 0.5 }, 0, 1),
        phaseUI:         newRegisterIdxUi("phase",  { value: 0 }, 0, 1),
        frequencyUI:     newRegisterIdxUi("f",      { regIdx: REG_IDX_KEY_FREQUENCY }, 0, 20_000),
        frequencyMultUI: newRegisterIdxUi("fmult",  { value: 1 }, 0, 1_000_000),
        offsetUI:        newRegisterIdxUi("offset", { value: 0 }, -2, 2), 

        unisonCountUi:  newRegisterIdxUi("voices", { value: 1 }, 0, EFFECT_RACK_OSC_MAX_UNISON_VOICES),
        unisionWidthUi: newRegisterIdxUi("detune", { value: 1 }, 0, 50000),
        unisonMixUi:    newRegisterIdxUi("mix", { value: 0.5 }, 0, 1),
    };
}

// TODO: can make this more complex as needed
export type EffectRackEnvelope = {
    type: typeof EFFECT_RACK_ITEM__ENVELOPE;

    // STATE. Also needs to be stored in registers, so that
    // it can be per-key
    _stage: RegisterIdx;
    _value: RegisterIdx;
    _valueWhenReleased: RegisterIdx;

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
        _valueWhenReleased: asRegisterIdx(0),

        // This is the signal we modulate
        toModulateUI: newRegisterIdxUi("signal", { value: 1 }),

        // This is what people call the 'gate' of the envelope. ____-----______ 
        signalUI:  newRegisterIdxUi("gate",  { regIdx: REG_IDX_KEY_SIGNAL }, 0, 1),
        attackUI:  newRegisterIdxUi("attack",  { value: 0.02 } , 0, 0.5),
        decayUI:   newRegisterIdxUi("decay",   { value: 0.02 } , 0, 4),
        sustainUI: newRegisterIdxUi("sustain", { value: 0.2 } , 0, 1),
        releaseUI: newRegisterIdxUi("release", { value: 0.2 } , 0, 10),
    };
}

export type EffectRackMaths = {
    type: typeof EFFECT_RACK_ITEM__MATHS;
    terms: EffectRackMathsItemTerm[];
};

export type EffectRackMathsItemTerm = {
    coefficients: EffectRackMathsItemTermCoefficient[];
    coefficientsDivide: EffectRackMathsItemTermCoefficient[];
};

export function newEffectRackMathsItemTerm(): EffectRackMathsItemTerm {
    return { 
        // NOTE: UI will need to set this dynamically
        coefficients: [newEffectRackMathsItemCoefficient()], 
        coefficientsDivide: [],
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

    amplitudeUi:     RegisterIdxUi;
    amplitudeMultUi: RegisterIdxUi;
    midpointUi:      RegisterIdxUi;
    anchorUi:        RegisterIdxUi;
}

export function newEffectRackNoise(): EffectRackNoise {
    return {
        type: EFFECT_RACK_ITEM__NOISE,

        amplitudeUi:     newRegisterIdxUi("amplitude", { value: 2 }, 0, 1),
        amplitudeMultUi: newRegisterIdxUi("mult", { value: 2 }),

        midpointUi:      newRegisterIdxUi("midpoint", { value: 0 }),
        anchorUi:        newRegisterIdxUi("anchor", { value: 0.5 }, 0, 1),
    };
}

export type EffectRackDelay = {
    type: typeof EFFECT_RACK_ITEM__DELAY;

    _sampleBuffer: BufferIdx;
    _idx: RegisterIdx;

    signalUi: RegisterIdxUi;
    secondsUi: RegisterIdxUi;

    originalUi: RegisterIdxUi;
    delayedUi: RegisterIdxUi;
}

export function newEffectRackDelay(): EffectRackDelay {
    return {
        type: EFFECT_RACK_ITEM__DELAY,

        _sampleBuffer: -1 as BufferIdx,
        _idx: asRegisterIdx(0),

        signalUi:   newRegisterIdxUi("signal", { value: 0 }),
        secondsUi:  newRegisterIdxUi("seconds", { value: 0.1 }, 0, 1),
        originalUi: newRegisterIdxUi("original", { value: 0.5 }, 0, 1),
        delayedUi:  newRegisterIdxUi("delayed", { value: 0.5 }, 0, 1),
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

// https://webaudio.github.io/Audio-EQ-Cookbook/audio-eq-cookbook.html#mjx-eqn%3Adirect-form-1
export type EffectRackBiquadFilter2 = {
    type: typeof EFFECT_RACK_ITEM__BIQUAD_FILTER_2;

    _x1: RegisterIdx;
    _x2: RegisterIdx;
    _y1: RegisterIdx;
    _y2: RegisterIdx;

    signalUi: RegisterIdxUi;

    // We need to know what to do with the parameters.
    filterType: Biquad2FilterType;

    // Center Frequency or Corner Frequency, or shelf midpoint frequency, depending on which filter type. The "significant frequency". "wherever it's happenin', man."
    f0: RegisterIdxUi;
    fMult: RegisterIdxUi; // easily multiply this frequency.

    // used only for peaking and shelving filters
    dbGain: RegisterIdxUi;
    
    // when used as Q: the EE kind of definition, except for peakingEQ in which A (dot) Q is the 
    // classic EE Q. That adjustment in definition was made so that a boost of N dB followed 
    // by a cut of N dB for identical Q and f0/sampleRate results in a precisely flat unity gain filter or "wire".
    //
    // when used as BW: the bandwidth in octaves (between -3 dB frequencies for BPF and notch or between midpoint 
    // (dbGain / 2) gain frequencies for peaking EQ)
    //
    // when used as S: a "shelf slope" parameter (for shelving EQ only). When S = 1, the shelf slope is as steep 
    // as it can be and remain monotonically increasing or decreasing gain with frequency. The shelf slope, in dB/octave, 
    // remains proportional to S for all other values for a fixed f0/sampleRate and dbGain.
    qOrBWOrS: RegisterIdxUi;
}

export function newEffectRackBiquadFilter2(): EffectRackBiquadFilter2 {
    return {
        type: EFFECT_RACK_ITEM__BIQUAD_FILTER_2,

        _x1: asRegisterIdx(0),
        _x2: asRegisterIdx(0),
        _y1: asRegisterIdx(0),
        _y2: asRegisterIdx(0),

        signalUi:   newRegisterIdxUi("signal", { value: 0 }),
        filterType: BIQUAD2_TYPE__LOWPASS,
        f0:         newRegisterIdxUi("f0", { regIdx: REG_IDX_KEY_FREQUENCY }),
        fMult:      newRegisterIdxUi("fmult", { value: 1 }),
        dbGain:     newRegisterIdxUi("gain", { value: 1 }),
        qOrBWOrS:   newRegisterIdxUi("bandwidth", { value: 1 }),
    };
}

export const BIQUAD2_TYPE__LOWPASS    = 0;
export const BIQUAD2_TYPE__HIGHPASS   = 1;
export const BIQUAD2_TYPE__BANDPASS_1 = 2; // constant skirt gain, peak gain = Q
export const BIQUAD2_TYPE__BANDPASS_2 = 3; // constant 0 dB peak gain
export const BIQUAD2_TYPE__NOTCH      = 4;
export const BIQUAD2_TYPE__ALLPASS    = 5;
export const BIQUAD2_TYPE__PEAKINGEQ  = 6;
export const BIQUAD2_TYPE__LOW_SHELF  = 7;
export const BIQUAD2_TYPE__HIGH_SHELF = 8;

export type Biquad2FilterType
 = typeof BIQUAD2_TYPE__LOWPASS
 | typeof BIQUAD2_TYPE__HIGHPASS
 | typeof BIQUAD2_TYPE__BANDPASS_1
 | typeof BIQUAD2_TYPE__BANDPASS_2
 | typeof BIQUAD2_TYPE__NOTCH
 | typeof BIQUAD2_TYPE__ALLPASS
 | typeof BIQUAD2_TYPE__PEAKINGEQ
 | typeof BIQUAD2_TYPE__LOW_SHELF
 | typeof BIQUAD2_TYPE__HIGH_SHELF;

export function getBiquad2FilterTypeName(type: Biquad2FilterType): string {
    switch (type) {
        case BIQUAD2_TYPE__LOWPASS:    return "Lowpass";
        case BIQUAD2_TYPE__HIGHPASS:   return "Highpass";
        case BIQUAD2_TYPE__BANDPASS_1: return "Bandpass_1";
        case BIQUAD2_TYPE__BANDPASS_2: return "Bandpass_2";
        case BIQUAD2_TYPE__NOTCH:      return "Notch";
        case BIQUAD2_TYPE__ALLPASS:    return "Allpass";
        case BIQUAD2_TYPE__PEAKINGEQ:  return "Peaking-eq"; // ??  b
        case BIQUAD2_TYPE__LOW_SHELF:  return "Low-shelf";
        case BIQUAD2_TYPE__HIGH_SHELF: return "High-shelf";
        default: return "???"
    }
}

export function biquad2IsUsingDbGain(filter: EffectRackBiquadFilter2): boolean {
    switch (filter.filterType) {
        case BIQUAD2_TYPE__PEAKINGEQ:
        case BIQUAD2_TYPE__LOW_SHELF:
        case BIQUAD2_TYPE__HIGH_SHELF:
            return true;
    }

    return false;
}

// A better interface for the Convolve filter UI would be like
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
    gainUi: RegisterIdxUi;

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
            { value: 5 },
            2, // needs to be 2 to account for the Hamming window code
            EFFECT_RACK_ITEM__CONVOLUTION_FILTER_MAX_KERNEL_LENGTH
        ),
        highpass:   false,

        cutoffFrequencyUi:     newRegisterIdxUi("f cutoff", { regIdx: REG_IDX_KEY_FREQUENCY }),
        cutoffFrequencyMultUi: newRegisterIdxUi("fmult", { value: 1 }),
        gainUi:                newRegisterIdxUi("gain", { value: 1 }),

        _kernel: -1 as BufferIdx,
        _kernelIdx: asRegisterIdx(0),
    };
}

export type EffectRackReverbBadImplementation = {
    type: typeof EFFECT_RACK_ITEM__REVERB_BAD;

    // ring buffer.
    _kernel: BufferIdx;
    _kernelIdx: RegisterIdx;

    signalUi: RegisterIdxUi;
    decayUi: RegisterIdxUi;
    densityUi: RegisterIdxUi;
}

/**
 * I'm implementing reverb like
 *
 *  echo strength
 *
 *     ^ |
 *     | | |
 *       | | |
 *       | | | |
 *       | | | | |
 *       | | | | | | .
 *
 *      -> time of echo 
 */
export function newEffectRackReverbBadImpl(): EffectRackReverbBadImplementation {
    return {
        type: EFFECT_RACK_ITEM__REVERB_BAD,
        signalUi: newRegisterIdxUi("signal", { value: 0 }),

        _kernel: -1 as BufferIdx,
        _kernelIdx: asRegisterIdx(0),

        decayUi: newRegisterIdxUi("decay", { value: 0.1 }, 0, EFFECT_RACK_REVERB_MAX_DURATION_SECONDS),
        densityUi: newRegisterIdxUi("density", { value: 0.1 }, 0, 1),
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
    | EffectRackReverbBadImplementation
    | EffectRackBiquadFilter2
    ;

export type EffectRack = {
    name: string;
    id: number;
    effects: EffectRackItem[];

    _effectIdToEffectPos: number[];

    // Gets cloned as needed - the same effect rack can be reused with several keys,
    // each of which will have it's own registers array.
    _registersTemplate: EffectRackRegisters; 

    _debugEffectPos: number;
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
        name: "",
        id: 0,

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
    let result = 0;
    if(idx >= 0 && idx < registers.length) {
        result = registers[idx];
    }
    return result;
}

// Write to a register
export function w(registers: number[], idx: RegisterIdx, val: number) {
    if (idx >= 0 && idx < registers.length) {
        registers[idx] =  val;
    }
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
                wave._unisonOscilators = allocateBufferIdx(e, 0, EFFECT_RACK_OSC_MAX_UNISON_VOICES * 2);

                allocateRegisterIdxIfNeeded(e, wave.phaseUI, remap, effectPos);
                allocateRegisterIdxIfNeeded(e, wave.amplitudeUI, remap, effectPos);
                allocateRegisterIdxIfNeeded(e, wave.frequencyUI, remap, effectPos);
                allocateRegisterIdxIfNeeded(e, wave.frequencyMultUI, remap, effectPos);
                allocateRegisterIdxIfNeeded(e, wave.offsetUI, remap, effectPos);

                allocateRegisterIdxIfNeeded(e, wave.unisonCountUi, remap, effectPos);
                allocateRegisterIdxIfNeeded(e, wave.unisionWidthUi, remap, effectPos);
                allocateRegisterIdxIfNeeded(e, wave.unisonMixUi, remap, effectPos);
            } break;
            case EFFECT_RACK_ITEM__ENVELOPE: {
                const envelope = effectValue;

                envelope._stage = allocateRegisterIdx(e, 0, true);
                envelope._value = allocateRegisterIdx(e, 0, true);
                envelope._valueWhenReleased = allocateRegisterIdx(e, 0, true);

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
                    for (let i = 0; i < term.coefficientsDivide.length; i++) {
                        const c = term.coefficientsDivide[i];
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
                allocateRegisterIdxIfNeeded(e, noise.amplitudeMultUi, remap, effectPos);
                allocateRegisterIdxIfNeeded(e, noise.midpointUi, remap, effectPos);
                allocateRegisterIdxIfNeeded(e, noise.anchorUi, remap, effectPos);
            } break;
            case EFFECT_RACK_ITEM__DELAY: {
                const delay = effectValue;

                delay._idx = allocateRegisterIdx(e, 0, true);
                delay._sampleBuffer = allocateBufferIdx(e, 1, 0);

                allocateRegisterIdxIfNeeded(e, delay.signalUi, remap, effectPos);
                allocateRegisterIdxIfNeeded(e, delay.secondsUi, remap, effectPos);
                allocateRegisterIdxIfNeeded(e, delay.originalUi, remap, effectPos);
                allocateRegisterIdxIfNeeded(e, delay.delayedUi, remap, effectPos);
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
                allocateRegisterIdxIfNeeded(e, conv.gainUi, remap, effectPos);
            } break;
            case EFFECT_RACK_ITEM__REVERB_BAD: {
                const reverb = effectValue;

                reverb._kernel    = allocateBufferIdx(e, EFFECT_RACK_REVERB_MAX_DURATION_SECONDS, 0); 
                reverb._kernelIdx = allocateRegisterIdx(e, 0, true);

                allocateRegisterIdxIfNeeded(e, reverb.signalUi, remap, effectPos);
                allocateRegisterIdxIfNeeded(e, reverb.decayUi, remap, effectPos);
                allocateRegisterIdxIfNeeded(e, reverb.densityUi, remap, effectPos);
            } break;
            case EFFECT_RACK_ITEM__BIQUAD_FILTER_2: {
                const filter = effectValue;

                filter._x1 = allocateRegisterIdx(e, 0, true);
                filter._x2 = allocateRegisterIdx(e, 0, true);
                filter._y1 = allocateRegisterIdx(e, 0, true);
                filter._y2 = allocateRegisterIdx(e, 0, true);

                allocateRegisterIdxIfNeeded(e, filter.signalUi, remap, effectPos);
                allocateRegisterIdxIfNeeded(e, filter.f0, remap, effectPos);
                allocateRegisterIdxIfNeeded(e, filter.fMult, remap, effectPos);
                allocateRegisterIdxIfNeeded(e, filter.dbGain, remap, effectPos);
                allocateRegisterIdxIfNeeded(e, filter.qOrBWOrS, remap, effectPos);
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

    _lastEffectTypes: EffectRackItemValue["type"][];
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
        _lastEffectTypes: [],
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
    
    let shapeChanged = false;
    registers._lastEffectTypes.length = e.effects.length;
    for (let i = 0; i < e.effects.length; i++) {
        const type = e.effects[i].value.type;
        if (type !== registers._lastEffectTypes[i]) {
            shapeChanged = true;
            registers._lastEffectTypes[i] = type;
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

export function evaluateWave(waveType: EffectRackOscillatorWaveType | number, t: number) {
    switch (waveType) {
        case OSC_WAVE__SIN:       return sin(t);
        case OSC_WAVE__SQUARE:    return square(t);
        case OSC_WAVE__TRIANGLE:  return triangle(t);
        case OSC_WAVE__SAWTOOTH:  return sawtooth(t);
        case OSC_WAVE__SAWTOOTH2: return sawtooth(t);
    }
    return 0;
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

                    const unisonOscillators = buff[wave._unisonOscilators].val;
                    if (startedPressing) {
                        for (let i = 0; i < unisonOscillators.length; i++) {
                            unisonOscillators[i] = i / unisonOscillators.length;
                        }
                    }

                    value = evaluateWave(wave.waveType, t2);

                    const unisonCount    = (r(re, wave.unisonCountUi._regIdx) - 1);
                    const unisonWidth    = r(re, wave.unisionWidthUi._regIdx);
                    const unisonMix      = r(re, wave.unisonMixUi._regIdx);
                    const totalFrequency = r(re, wave.frequencyUI._regIdx) * r(re, wave.frequencyMultUI._regIdx);

                    let unisonVoices = 0;
                    let norm = 1;
                    if (unisonCount > 0) {
                        norm = Math.log2(2 * unisonCount);
                        for (let i = 1; i <= unisonCount; i++) {
                            const angle = unisonOscillators[i];
                            unisonVoices += evaluateWave(wave.waveType, angle);

                            unisonOscillators[i] += dt * (totalFrequency - i * i * unisonWidth);
                        }
                        for (let i = 1; i <= unisonCount; i++) {
                            const angle = unisonOscillators[i + EFFECT_RACK_OSC_MAX_UNISON_VOICES];
                            unisonVoices += evaluateWave(wave.waveType, angle);

                            unisonOscillators[i + EFFECT_RACK_OSC_MAX_UNISON_VOICES] += dt * (totalFrequency + i * i * unisonWidth);
                        }
                    }
                    value = value * unisonMix + (unisonVoices / norm) * (1 - unisonMix);

                    w(re, wave._t, t + dt * totalFrequency);
                    value *= a;
                    value += r(re, wave.offsetUI._regIdx);
                }
            } break;
            // TODO: figure out why for a very short press, this envelope can perpetually be > 0. 
            // NOTE: could also be a bug in my wave previewing code.
            case EFFECT_RACK_ITEM__ENVELOPE: {
                const envelope = effectValue;

                const signal = r(re, envelope.signalUI._regIdx);

                let envValue = r(re, envelope._value);
                let stage = r(re, envelope._stage);

                let targetSample = 0;
                let targetDuration = 0;
                let targetDistance = 0;
                let targetStage = 0;

                if (signal > 0) {
                    if (stage === 0 || stage > 2) {
                        targetSample = 1;
                        targetDistance = 1;
                        targetDuration = r(re, envelope.attackUI._regIdx);
                        targetStage = 1;
                    } else {
                        targetSample = r(re, envelope.sustainUI._regIdx);
                        targetDistance = 1 - targetSample;
                        targetDuration = r(re, envelope.decayUI._regIdx);
                        targetStage = 2;
                    }
                } else {
                    const sustain = r(re, envelope.sustainUI._regIdx);

                    // set stage immediately, so we can retrigger
                    let decayToUse;
                    if (envValue > sustain) {
                        decayToUse = r(re, envelope.decayUI._regIdx);
                        if (stage !== 3) {
                            stage = 3;
                            w(re, envelope._valueWhenReleased, envValue);
                        }
                    } else {
                        decayToUse = r(re, envelope.releaseUI._regIdx);
                        if (stage !== 4) {
                            stage = 4;
                            w(re, envelope._valueWhenReleased, envValue);
                        }
                    }

                    targetSample = 0;
                    targetDistance = r(re, envelope._valueWhenReleased);
                    targetDuration = decayToUse;
                    targetStage = stage;
                }

                let speed = targetDuration === 0 ? 1000 : targetDistance * (dt / targetDuration);
                envValue = moveTowards(envValue, targetSample, speed);
                if (envValue === targetSample) {
                    stage = targetStage;
                }

                w(re, envelope._value, envValue);
                w(re, envelope._stage, stage);

                const target = r(re, envelope.toModulateUI._regIdx);
                value = envValue * target;
            } break;
            case EFFECT_RACK_ITEM__MATHS: {
                const maths = effectValue;

                for (let i = 0; i < maths.terms.length; i++) {
                    const term = maths.terms[i];

                    let termValue = 1, divideTermValue = 1;
                    for (let i = 0; i < term.coefficients.length; i++) {
                        const c = term.coefficients[i];
                        termValue *= r(re, c.valueUI._regIdx);
                    }

                    for (let i = 0; i < term.coefficientsDivide.length; i++) {
                        const c = term.coefficientsDivide[i];
                        divideTermValue *= r(re, c.valueUI._regIdx);
                    }

                    value += termValue / divideTermValue;
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

                const amplitudeIn   = r(re, noise.amplitudeUi._regIdx);
                const amplitudeMult = r(re, noise.amplitudeMultUi._regIdx);
                const amplitude     = amplitudeIn * amplitudeMult;

                if (Math.abs(amplitude) > 0) {
                    const midpoint = r(re, noise.midpointUi._regIdx);
                    const anchor   = r(re, noise.anchorUi._regIdx);
                    const low      = midpoint + amplitude * -anchor;
                    const hi       = midpoint + amplitude * (1 - anchor);
                    value = low + Math.random() * (hi - low);
                }
            } break;
            case EFFECT_RACK_ITEM__DELAY: {
                const delay = effectValue;

                if (delay._sampleBuffer !== null) {
                    const signal      = r(re, delay.signalUi._regIdx);
                    const seconds     = r(re, delay.secondsUi._regIdx);
                    const mixOriginal = r(re, delay.originalUi._regIdx);
                    const mixDelayed  = r(re, delay.delayedUi._regIdx);

                    let idx = r(re, delay._idx);

                    const sampleBuffer = buff[delay._sampleBuffer].val;

                    let realLength = Math.ceil(seconds * sampleRate);
                    if (realLength > sampleBuffer.length) {
                        realLength = sampleBuffer.length; 
                    }

                    let delayedValue;

                    if (realLength === 0) {
                        delayedValue = signal;
                    } else {
                        if (idx >= sampleBuffer.length) {
                            // Shouldn't happen, but dont want to take any chances...
                            idx = sampleBuffer.length - 1;
                        }
                        // value we wrote several thousand samples ago. lets grab it before writing to it.
                        delayedValue = sampleBuffer[idx];
                        sampleBuffer[idx] = signal;
                        idx = (idx + 1) % realLength;
                    }

                    value = delayedValue * mixDelayed + signal * mixOriginal;

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
                const gain   = r(re, conv.gainUi._regIdx);

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

                    let sinc = i === 0 ? 1 : sin(fc * i / 2) / (i * Math.PI);
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

                    value += signalPrevVal * sinc * gain;
                }

                idx -= 1;
                if (idx < 0) {
                    idx = stopband - 1;
                }
                w(re, conv._kernelIdx, idx);
            } break;
            case EFFECT_RACK_ITEM__REVERB_BAD: {
                const reverb = effectValue;

                const signal = r(re, reverb.signalUi._regIdx);

                // TODO: use density to decide the number of samples
                const density = r(re, reverb.densityUi._regIdx);
                const densitySamples = Math.round(density * sampleRate);

                let decay = r(re, reverb.decayUi._regIdx);
                if (decay > EFFECT_RACK_REVERB_MAX_DURATION_SECONDS) decay = EFFECT_RACK_REVERB_MAX_DURATION_SECONDS;
                let decaySamples = Math.floor(decay * sampleRate - 1);

                let idx = r(re, reverb._kernelIdx);
                const signalPrev = buff[reverb._kernel];
                signalPrev.val[idx] = signal;

                if (decaySamples > 0) {
                    let total = 0;
                    let numSamples = 0;
                    let counter = 0;

                    for (let i = 0; i < decaySamples; i++) {
                        counter -= 1;

                        if (counter <= 0) {
                            let val = signalPrev.val[(idx + i) % signalPrev.val.length];
                            const falloff = 1.0 - (i + 1) / decaySamples;
                            total += val * falloff;
                            numSamples += 1;

                            counter = densitySamples;
                        }
                    }

                    value = total;
                }

                idx -= 1;
                if (idx < 0) {
                    idx = decaySamples - 1;
                }
                w(re, reverb._kernelIdx, idx);

            } break;
            case EFFECT_RACK_ITEM__BIQUAD_FILTER_2: {
                const filter = effectValue;

                // https://webaudio.github.io/Audio-EQ-Cookbook/audio-eq-cookbook.html#mjx-eqn%3Adirect-form-1

                const signal   = r(re, filter.signalUi._regIdx);
                const f0In     = r(re, filter.f0._regIdx);
                const fMult    = r(re, filter.fMult._regIdx);
                const dbGain   = r(re, filter.dbGain._regIdx);
                const qOrBWOrS = r(re, filter.qOrBWOrS._regIdx);

                const f0 = f0In * fMult;

                let a0 = 0;
                let a1 = 0;
                let a2 = 0;
                let b0 = 0;
                let b1 = 0;
                let b2 = 0;

                const w0 = 2 * Math.PI * f0 / sampleRate;
                const cosw0 = Math.cos(w0);
                const sinw0 = Math.sin(w0);

                // when Q
                // const alpha = sinw0 / (2 * qOrBWOrS);
                
                // When BW
                const angle = sinw0 === 0 ? 0 : (Math.log(2) / 2) * qOrBWOrS * (w0 / sinw0);
                const alpha =  sinw0 * Math.sinh(angle);

                // When S
                // const alpha = sinw0/2 * Math.sqrt( (A + 1/A)*(1/qOrBWOrS - 1) + 2 );

                switch (filter.filterType) {
                    case BIQUAD2_TYPE__LOWPASS: {
                        b0 = (1 - cosw0) / 2;
                        b1 = (1 - cosw0);
                        b2 = (1 - cosw0) / 2;
                        a0 = 1 + alpha;
                        a1 = -2 * cosw0;
                        a2 = 1 - alpha;
                    } break;
                    case BIQUAD2_TYPE__HIGHPASS: {
                        b0 = (1 + cosw0) / 2;
                        b1 = -(1 + cosw0);
                        b2 = (1 + cosw0) / 2;
                        a0 = 1 + alpha;
                        a1 = -2 * cosw0;
                        a2 = 1 - alpha;
                    } break;
                    case BIQUAD2_TYPE__BANDPASS_1: {
                        b0 = sinw0 / 2
                        b1 = 0
                        b2 = -sinw0 / 2
                        a0 = 1 + alpha;
                        a1 = -2 * cosw0;
                        a2 = 1 - alpha;
                    } break;
                    case BIQUAD2_TYPE__BANDPASS_2: {
                        b0 = alpha
                        b1 = 0
                        b2 = -alpha
                        a0 = 1 + alpha;
                        a1 = -2 * cosw0;
                        a2 = 1 - alpha;
                    } break;
                    case BIQUAD2_TYPE__NOTCH: {
                        b0 = 1;
                        b1 = -2 * cosw0;
                        b2 = 1;
                        a0 = 1 + alpha;
                        a1 = -2 * cosw0;
                        a2 = 1 - alpha;
                    } break;
                    case BIQUAD2_TYPE__ALLPASS: {
                        b0 = 1 - alpha;
                        b1 = -2 * cosw0;
                        b2 = 1 + alpha;
                        a0 = 1 + alpha;
                        a1 = -2 * cosw0;
                        a2 = 1 - alpha;
                    } break;
                    case BIQUAD2_TYPE__PEAKINGEQ: {
                        let A = Math.pow(10, dbGain/40);

                        b0 = 1 + alpha * A;
                        b1 = -2 * cosw0;
                        b2 = 1 - alpha * A;
                        a0 = 1 + alpha / A;
                        a1 = -2 * cosw0;
                        a2 = 1 - alpha / A;
                    } break;
                    case BIQUAD2_TYPE__LOW_SHELF: {
                        let A = Math.pow(10, dbGain/40);
                        let twoSqrtAAlpha = 2 * Math.sqrt(A) * alpha;

                        b0 =    A*( (A+1) - (A-1)*cosw0 + twoSqrtAAlpha );
                        b1 =  2*A*( (A-1) - (A+1)*cosw0                   );
                        b2 =    A*( (A+1) - (A-1)*cosw0 - twoSqrtAAlpha );
                        a0 =        (A+1) + (A-1)*cosw0 + twoSqrtAAlpha;
                        a1 =   -2*( (A-1) + (A+1)*cosw0                   );
                        a2 =        (A+1) + (A-1)*cosw0 - twoSqrtAAlpha;
                    } break;
                    case BIQUAD2_TYPE__HIGH_SHELF: {
                        let A = Math.pow(10, dbGain/40);
                        let twoSqrtAAlpha = 2 * Math.sqrt(A) * alpha;

                        b0 = A * ((A + 1) + (A - 1) * cosw0 + twoSqrtAAlpha);
                        b1 = -2 * A * ((A - 1) + (A + 1) * cosw0);
                        b2 = A * ((A + 1) + (A - 1) * cosw0 - twoSqrtAAlpha);
                        a0 = (A + 1) - (A - 1) * cosw0 + twoSqrtAAlpha;
                        a1 = 2 * ((A - 1) - (A + 1) * cosw0);
                        a2 = (A + 1) - (A - 1) * cosw0 - twoSqrtAAlpha;
                    } break;
                };

                let x1 = r(re, filter._x1);
                let x2 = r(re, filter._x2);
                let y1 = r(re, filter._y1);
                let y2 = r(re, filter._y2);

                value =
                    + (b0 / a0) * signal
                    + (b1 / a0) * x1
                    + (b2 / a0) * x2
                    - (a1 / a0) * y1
                    - (a2 / a0) * y2;

                x2 = x1;
                x1 = signal;

                y2 = y1;
                y1 = value;

                if (Math.abs(w0) < 0.00001) {
                    // w0 is the zero frequency. The wave can get stuck at a particular amplitude, and
                    // causes the filter to tend towards -1 or 1. The system can then never detect
                    // that a key has been depressed. Using a derivative instead of the 0 signal also doesn't
                    // seem to work very well.
                    y1 = 0.99 * y1;
                    y2 = 0.99 * y2;
                }

                w(re, filter._x1, x1);
                w(re, filter._x2, x2);
                w(re, filter._y1, y1);
                w(re, filter._y2, y2);
            } break;
            default: unreachable(effectValue);
        }

        w(re, effect._dst, value);
    }

    let value = re[REG_IDX_EFFECT_BINDINGS_START + lastEffect];

    // Do not remove the `clamp` here under any circumstances. 
    return clamp(value, -1, 1);
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
        name:    u => asStringOrUndefined(u) ?? "",
        id:      u => asNumberOrUndefined(u) ?? 0,
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
        EFFECT_RACK_ITEM__REVERB_BAD,
        EFFECT_RACK_ITEM__BIQUAD_FILTER_2,
    ], "EffectRackItemType");

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
                ], "EffectRackOscillatorWaveType"),

                amplitudeUI:     regUiUnmarshaller,
                phaseUI:         regUiUnmarshaller,
                frequencyUI:     regUiUnmarshaller,
                frequencyMultUI: regUiUnmarshaller,
                offsetUI:        regUiUnmarshaller,

                unisionWidthUi: regUiUnmarshaller,
                unisonCountUi:  regUiUnmarshaller,
                unisonMixUi:    regUiUnmarshaller,
            });
        } break;
        case EFFECT_RACK_ITEM__ENVELOPE: {
            value = unmarshalObject(o, newEffectRackEnvelope(), {
                type: asIs,

                signalUI:     regUiUnmarshaller,
                attackUI:     regUiUnmarshaller,
                decayUI:      regUiUnmarshaller,
                sustainUI:    regUiUnmarshaller,
                releaseUI:    regUiUnmarshaller,
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
                    coefficientsDivide: u => {
                        if (!u) return [];
                        return asArray(u).map(u => unmarshalObject(u, newEffectRackMathsItemCoefficient(), {
                            valueUI: regUiUnmarshaller,
                        }))
                    },
                })),
            });

        } break;
        case EFFECT_RACK_ITEM__SWITCH: {
            value = unmarshalObject(o, newEffectRackSwitch(), {
                type: asIs,
                conditions: u => asArray(u).map(u => unmarshalObject(u, newEffectRackSwitchCondition(), {
                    operator: u => asEnum<EffectRackSwitchOperator>(u, [SWITCH_OP_LT, SWITCH_OP_GT], "EffectRackSwitchOperator"),
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
                amplitudeUi:     regUiUnmarshaller,
                amplitudeMultUi: regUiUnmarshaller,
                midpointUi:      regUiUnmarshaller,
                anchorUi:        regUiUnmarshaller,
            });
        } break;
        case EFFECT_RACK_ITEM__DELAY: {
            value = unmarshalObject(o, newEffectRackDelay(), {
                type: asIs,

                signalUi:   regUiUnmarshaller,
                secondsUi:  regUiUnmarshaller,
                originalUi: regUiUnmarshaller,
                delayedUi:  regUiUnmarshaller,
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
                ], "ConvolutionSincWindowType"),

                highpass: (u, def) => asBooleanOrUndefined(u) ?? def,

                gainUi: regUiUnmarshaller,

                signalUi: regUiUnmarshaller,
                stopbandUi: regUiUnmarshaller,
                cutoffFrequencyUi: regUiUnmarshaller,
                cutoffFrequencyMultUi: regUiUnmarshaller,
            });
        } break;
        case EFFECT_RACK_ITEM__REVERB_BAD: {
            value = unmarshalObject(o, newEffectRackReverbBadImpl(), {
                type: asIs,

                signalUi: regUiUnmarshaller,
                decayUi: regUiUnmarshaller,
                densityUi: regUiUnmarshaller,
            });
        } break;
        case EFFECT_RACK_ITEM__BIQUAD_FILTER_2: {
            value = unmarshalObject(o, newEffectRackBiquadFilter2(), {
                type: asIs,

                signalUi:   regUiUnmarshaller,

                filterType: u => asEnum<Biquad2FilterType>(u, [
                    BIQUAD2_TYPE__LOWPASS,
                    BIQUAD2_TYPE__HIGHPASS,
                    BIQUAD2_TYPE__BANDPASS_1,
                    BIQUAD2_TYPE__BANDPASS_2,
                    BIQUAD2_TYPE__NOTCH,
                    BIQUAD2_TYPE__ALLPASS,
                    BIQUAD2_TYPE__PEAKINGEQ,
                    BIQUAD2_TYPE__LOW_SHELF,
                    BIQUAD2_TYPE__HIGH_SHELF,
                ], "ConvolutionSincWindowType"),

                f0:         regUiUnmarshaller,
                fMult:      regUiUnmarshaller,
                dbGain:     regUiUnmarshaller,
                qOrBWOrS:   regUiUnmarshaller,
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
    if (!arg) {
        return defaultVal;
    }

    return unmarshalObject(arg, defaultVal, {
        valueRef: (u, valueRef) => unmarshalObject<ValueRef>(u, valueRef, {
            value:    u => asNumberOrUndefined(u),
            regIdx:   u => asNumberOrUndefined(u) as RegisterIdx,
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
