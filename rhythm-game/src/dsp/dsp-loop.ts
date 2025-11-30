// NOTE: this file will be imported dynamically and registered as a module in the
// web audio API to later be used by an audio worklet node. Don't put random shit in here,
// put it in dsp-loop-interface.ts instead.
// It seems like it's OK to import types though.

import { BASE_NOTE, getSampleIdx } from "src/state/keyboard-state";
import { arrayAt, filterInPlace } from "src/utils/array-utils";
import { assert } from "src/utils/assert";
import { clamp, derivative, inverseLerp, lerp, max, min, moveTowards } from "src/utils/math-utils";
import { C_0, getNoteFrequency, getNoteLetter, NOTE_LETTERS, TWELVTH_ROOT_OF_TWO } from "src/utils/music-theory-utils";
import { getNextRng, newRandomNumberGenerator, RandomNumberGenerator, setRngSeed } from "src/utils/random";
import { newFunctionUrl } from "src/utils/web-workers";
import {
    compileInstructions,
    computeSample,
    WaveProgramInstructionItem,
    IDX_WANTED_FREQUENCY,
    IDX_COUNT,
    IDX_OUTPUT,
    IDX_USER,
    INSTR_ADD,
    INSTR_DIVIDE,
    INSTR_JUMP_IF_NZ,
    INSTR_MULTIPLY,
    INSTR_NUM_INSTRUCTIONS,
    INSTR_SIN,
    INSTR_SQUARE,
    INSTR_SUBTRACT,
    newDspInstruction,
    newSampleContext,
    SampleContext,
    INSTR_LT,
    INSTR_LTE,
    INSTR_GT,
    INSTR_GTE,
    INSTR_EQ,
    INSTR_NEQ,
    INSTR_JUMP_IF_Z,
    IDX_SIGNAL,
    IDX_JMP_RESULT,
    compileToInstructionsInternal,
    pushInstruction,
    updateSampleContext,
    IDX_DT,
    INSTR_MULTIPLY_DT,
    INSTR_ADD_DT,
    INSTR_RECIPR_DT,
    INSTR_ADD_RECIPR_DT
} from "./dsp-loop-instruction-set";
import { ScheduledKeyPress } from "./dsp-loop-interface";
import { absMax, absMin, sawtooth, sin, square, step, triangle } from "src/utils/turn-based-waves";
import { asRegisterIdx, compileEffectsRack, computeEffectsRackIteration, EFFECT_RACK_ITEM__ENVELOPE, EFFECT_RACK_ITEM__OSCILLATOR, EFFECT_RACK_MINIMUM_SIZE, EffectRack, getRegisterIdxForUIValue, newEffectRack, newEffectRackBinding, newEnvelope, newOscillator, newOscillatorWave, newRegisterValueMetadata, REG_IDX_KEY_FREQUENCY, REG_IDX_KEY_SIGNAL, REG_IDX_NONE, REG_IDX_OUTPUT, registerIdxAsNumber } from "./dsp-loop-effect-rack";

type DspSynthParameters = {
    instructions: number[];
    rack: EffectRack;
}

export type DSPPlaySettings = {
    isUserDriven: boolean;
    parameters: DspSynthParameters;

    // NOTE: these might become deprecated after we have a fully programmable DSP
    attack: number;
    attackVolume: number;
    decay: number;
    sustain: number;
    sustainVolume: number;

}

export function newDspPlaySettings(): DSPPlaySettings {
    const settings: DSPPlaySettings = {
        attack: 0.05,
        decay: 3,
        attackVolume: 0.2,
        sustainVolume: 0.05,
        sustain: 0.5,
        isUserDriven: false,
        parameters: {
            instructions: [],
            rack: newEffectRack(),
        },
    }

    compileDefaultInstructions(settings.parameters.instructions);

    return settings;
}

export function getDefaultInstructions() {
    const angle = IDX_USER + 1;
    const temp = IDX_USER;
    const instructions: WaveProgramInstructionItem[] = [
        { instructionEnabled: true, instruction: newDspInstruction(IDX_WANTED_FREQUENCY, true, INSTR_MULTIPLY_DT, IDX_SIGNAL, true, temp) },
        { instructionEnabled: true, instruction: newDspInstruction(angle, true, INSTR_ADD, temp, true, angle) },
        { instructionEnabled: true, instruction: newDspInstruction(IDX_SIGNAL, true, INSTR_SIN, angle, true, IDX_OUTPUT) },
    ];
    return instructions;
}

export function copyInstruction(instr: WaveProgramInstructionItem): WaveProgramInstructionItem {
    return JSON.parse(JSON.stringify(instr));
}

export function compileDefaultInstructions(dst: number[]) {
    dst.length = 0;
    const instructions = getDefaultInstructions();
    compileInstructions(instructions, dst);
}

export type PlayingOscillator = {
    state: {
        _lastNoteIndex: number;
        _frequency: number;
        _sampleContext: SampleContext;

        prevSignal: number;
        time: number;
        pressedTime: number;
        releasedTime: number;
        volume: number;
        manuallyPressed: boolean;
        value: number;

        idx1: number;
        acc1: number;
        acc2: number;
        acc3: number;
    };
    inputs: {
        noteId: number;
        signal: number;
    },
};

// NOTE: we don't currently play samples
export type PlayingSampleFile = {
    state: {
        prevSampleFile: string;
        sampleArray: number[];
        sampleIdx: number;
        volume: number;
        manuallyPressed: boolean;
    };
    inputs: {
        // we don't want to transmit the massive array of samples across the wire every single time.
        sample: string;
    }
};

export type DspLoopMessage = 1337 | {
    playSettings?:                     Partial<DSPPlaySettings>;
    setOscilatorSignal?:               [number, PlayingOscillator["inputs"]];
    clearAllOscilatorSignals?:         true;

    scheduleKeys?:    ScheduledKeyPress[] | null;
    newPlaybackTime?: number;

    scheduleKeysVolume?:               number;
    scheduleKeysSpeed?:                number;
};


export type DspInfo = {
    // [keyId, signal strength, owner]
    currentlyPlaying: [keyId: number, signal: number, owner: number][];
    scheduledPlaybackTime: number;
    isPaused: boolean;
    sampleRate: number;
}

const OSC_GAIN_AWAKE_THRESHOLD = 0.00001;

function sampleSamples(samples: number[], sampleDuration: number, time: number) {
    let idxFloating = ((time / sampleDuration) * samples.length) % (samples.length - 1);

    const low = Math.floor(idxFloating);
    const hi = low + 1;
    assert(hi < samples.length);

    return lerp(samples[low], samples[hi], idxFloating % 1);
}

export function updateOscillator(
    osc: PlayingOscillator,
    s: DspState,
    randomSamples: number[]
) {
    const sampleRate = s.sampleRate;
    const parameters = s.playSettings.parameters;
    const { attack, attackVolume, decay, sustain, sustainVolume } = s.playSettings;

    const { inputs, state } = osc;

    if (state._lastNoteIndex !== inputs.noteId) {
        state._lastNoteIndex = inputs.noteId;
        state._frequency = getNoteFrequency(inputs.noteId);
    }

    const dt = 1 / sampleRate;
    if (inputs.signal || Math.abs(state.value) > OSC_GAIN_AWAKE_THRESHOLD) {
        state.time += dt;
    }

    if (rng === null) {
        rng = newRandomNumberGenerator();
        setRngSeed(rng, 0);
    }

    // GOAT website: https://www.dspforaudioprogramming.com
    // Simplified my oscillator code so much damn.
    // And now I know more than just sine wave. Very epic.

    const t = state.time;
    const f = state._frequency;
    let idx1 = state.idx1;
    let sampleValue = 0;

    // TODO: fix how we're using the gain here
    // the gain is indicative of how much the key is 'pressed down', not the actual attack/decay envelope.

    let targetGain = 0;
    let rate = Math.max(decay, 0.0000001); // should never ever be 0. ever

    const tPressed = state.time - state.pressedTime;

    const sampleIdx = getSampleIdx(inputs.noteId);
    if (sampleIdx !== -1) {
        // Play a procedurally generated drum

        sampleValue += square(0.5 * f * t);

        // Drum gain curve. whtaver.
        let attack = 0.01;
        if (inputs.signal) {
            if (tPressed <= attack) {
                targetGain = attackVolume; 
                rate = attack;
            } else {
                const tReleased = tPressed - attack;
                targetGain = (1 - tReleased); 
                targetGain **= 20;
                targetGain *= attackVolume;
                rate = 0.0001;
            }
        } else {
            targetGain = 0; 
            rate = 2;
        }
    } else {
        // Update the oscillator

        // Oscillator gain curve. attack/decay/sustain
        // if (inputs.signal) {
        //     if (tPressed <= attack) {
        //         targetGain = attackVolume; rate = attack;
        //     } else {
        //         targetGain = sustainVolume; rate = sustain;
        //     }
        // } else {
        //     targetGain = 0.0;
        //     rate = Math.max(decay, 0.0000001); // should never ever be 0. ever
        // }

        // let maxRange = max(parameters.low, parameters.hi);
        // for (let i = -parameters.low; i <= parameters.hi; i += parameters.increment) {
        //     let f2 = f;
        //     if (i < 0) {
        //         f2 = -f / i;
        //     } else if (i > 0) {
        //         f2 = f * i;
        //     }
        //
        //     val = sin(f2 * t); 
        //     amp = maxRange - Math.abs(i);
        //     m += amp; x += val * amp;
        // }


        // val = sin(f * (t + 0.001 * noise)); amp = 1;
        // m += amp; x += val * amp;
        //
        // val = sin(f * t / 3); amp = 0.3;
        // m += amp; x += val * amp;
        //
        // val = sin(f * t * 2); amp = 0.2;
        // m += amp; x += val * amp;
        //
        // val = sin(f * t * 3); amp = 0.1;
        // m += amp; x += val * amp;
        //
        // val = sin(f * t * 4); amp = 0.02;
        // m += amp; x += val * amp;

        // updateSampleContext(state._sampleContext, f, osc.inputs.signal, 1 / sampleRate);
        // sampleValue += computeSample(state._sampleContext, parameters.instructions);
        // computeSample

        // sampleValue = x;
        // sampleTotal = m;
    }

    state.value = sampleValue;
}


function updateSample(osc: PlayingSampleFile, allSamples: Record<string, number[]>) {
    const { inputs, state } = osc;

    if (inputs.sample !== state.prevSampleFile) {
        state.prevSampleFile = inputs.sample;
        state.sampleArray = allSamples[inputs.sample];
        state.sampleIdx = 0;
    }

    if (state.sampleIdx < state.sampleArray.length) {
        state.sampleIdx += 1;
    }
}

function getMessageForMainThread(s: DspState, signals = true) {
    const payload: Partial<DspInfo> = { sampleRate: s.sampleRate };

    if (signals) {
        // this is the only way for the main thread to know this info :sad:
        const currentPlaybackSignals: [number, number, number][] = [];
        for (const [key, osc] of s.playingOscillators) {
            currentPlaybackSignals.push([
                key,
                max(osc.inputs.signal, osc.state.value),
                osc.state.manuallyPressed ? 0 : 1
            ]);
        }

        payload.currentlyPlaying = currentPlaybackSignals;
    }

    payload.scheduledPlaybackTime = s.trackPlayback.scheduledPlaybackTime;

    payload.isPaused = s.trackPlayback.isPaused;

    return payload;
}

let rng: RandomNumberGenerator | null = null;

function getSampleFileValue(oscs: PlayingSampleFile) {
    const { state } = oscs;

    if (state.sampleIdx >= state.sampleArray.length) {
        return 0;
    }

    return state.sampleArray[state.sampleIdx];
}


export function newDspState(sampleRate: number): DspState {
    const s: DspState = {
        sampleRate: 1,
        playSettings: newDspPlaySettings(),
        playingOscillators: [],
        trackPlayback: {
            // set this to true to send a message back to the UI after all samples in the current loop are processed
            shouldSendUiUpdateSignals: false,
            scheduleKeys: undefined,
            scheduledKeysVolume: 1,
            scheduledKeysSpeed: 1,
            scheduedKeysCurrentlyPlaying: [],
            scheduledPlaybackTime: 0,
            scheduledPlaybackCurrentIdx: 0,
            isPaused: false,
        },
        randomSamples: []
    }

    // We want this array to be deterministic
    const rng = newRandomNumberGenerator();
    setRngSeed(rng, 2);
    let n = 44800;
    for (let i = 0; i <= n; i++) {
        s.randomSamples.push(-1 + 2 * getNextRng(rng));
        // let t = i / n;
        // s.randomSamples.push(sin(t));
    }

    return s;
}


export type DspState = {
    sampleRate: number;
    playSettings: DSPPlaySettings,
    playingOscillators: [number, PlayingOscillator][];
    trackPlayback: {
        shouldSendUiUpdateSignals: boolean;
        scheduleKeys?: ScheduledKeyPress[];
        scheduledKeysVolume: number;
        scheduledKeysSpeed: number;
        scheduedKeysCurrentlyPlaying: ScheduledKeyPress[];
        scheduledPlaybackTime: number;
        scheduledPlaybackCurrentIdx: number;
        isPaused: boolean;
    };
    randomSamples: number[]
};

function getPlayingOscillator(s: DspState, id: number): PlayingOscillator | undefined {
    for (let i = 0; i < s.playingOscillators.length; i++) {
        if (s.playingOscillators[i][0] === id) {
            return s.playingOscillators[i][1];
        }
    }
    return undefined;
}

// Runs a whole lot, so it needs to be highly optimized
function processSample(s: DspState, idx: number) {
    let sample = 0;
    let count = 0;
    const sampleRate = s.sampleRate;

    const trackPlayback = s.trackPlayback;
    const currentlyPlaying = trackPlayback.scheduedKeysCurrentlyPlaying;

    // update automated scheduled inputs, if applicable
    if (
        trackPlayback.scheduleKeys &&
        trackPlayback.scheduledPlaybackCurrentIdx <= trackPlayback.scheduleKeys.length
    ) {

        // keep track of where we're currently at with the playback
        const dt = (1000 / sampleRate) * trackPlayback.scheduledKeysSpeed;
        const nextScheduledPlaybackTime = trackPlayback.scheduledPlaybackTime + dt;

        if (s.playSettings.isUserDriven) {
            // Pause scheduled playback if we've reached a note that isn't currently being played by the player

            let allUserNotes = true;
            for (let i = trackPlayback.scheduledPlaybackCurrentIdx; i < trackPlayback.scheduleKeys.length; i++) {
                const nextItem = trackPlayback.scheduleKeys[i];
                if (nextScheduledPlaybackTime < nextItem.time) {
                    // dont care abt things we've scheduled that aren't here yet..
                    break;
                }
                if (nextScheduledPlaybackTime >= nextItem.timeEnd) {
                    // ignore things we've already played. 
                    // This codepath hits when we change the time we're playing
                    continue;
                }

                const osc = getPlayingOscillator(s, nextItem.keyId);

                if (
                    !osc ||
                    osc.inputs.signal < OSC_GAIN_AWAKE_THRESHOLD
                ) {
                    // This oscilator is not playing
                    allUserNotes = false;
                    break;
                } 

                if (!osc.state.manuallyPressed) {
                    // This oscillator wasn't scheduled by the user
                    allUserNotes = false;
                    break;
                } 
            }

            // Pause playback as required
            {
                s.trackPlayback.isPaused = !allUserNotes;
                s.trackPlayback.shouldSendUiUpdateSignals = true;
            }
        }

        if (!trackPlayback.isPaused) {
            trackPlayback.scheduledPlaybackTime = nextScheduledPlaybackTime;
        }

        let safetyCounter = 0;
        while (
            !trackPlayback.isPaused &&
            trackPlayback.scheduledPlaybackCurrentIdx < trackPlayback.scheduleKeys.length
            && trackPlayback.scheduleKeys[trackPlayback.scheduledPlaybackCurrentIdx].time < trackPlayback.scheduledPlaybackTime
        ) {
            if (safetyCounter++ >= 1000) {
                throw new Error("safety counter was hit!");
            }

            const nextItem = trackPlayback.scheduleKeys[trackPlayback.scheduledPlaybackCurrentIdx];
            trackPlayback.scheduledPlaybackCurrentIdx++;

            currentlyPlaying.push(nextItem);

            if (!s.playSettings.isUserDriven) {
                // Only play scheduled keys if user-driven playback has been disabled.
                // maybe in the future, we'll want some keys to be user driven and others
                // to be automated. 

                const osc = getOrCreatePlayingOscillator(s, nextItem.keyId);
                if (osc.inputs.noteId !== nextItem.noteId || osc.inputs.signal !== 1) {
                    osc.inputs.noteId = nextItem.noteId;
                    osc.inputs.signal = 1;
                    osc.state.pressedTime = osc.state.time;
                }
                osc.state.volume = max(s.trackPlayback.scheduledKeysVolume, osc.state.volume);

                trackPlayback.shouldSendUiUpdateSignals = true;
            }
        }

        // stop playback once we've reached the last note, and
        // have finished playing all other notes
        if (
            trackPlayback.scheduledPlaybackCurrentIdx >= trackPlayback.scheduleKeys.length &&
            trackPlayback.scheduedKeysCurrentlyPlaying.length === 0
        ) {
            stopPlayingScheduledKeys(s);
        }
    }

    // stop playing keys that are no longer playing
    {
        for (let i = 0; i < currentlyPlaying.length; i++) {
            const scheduled = currentlyPlaying[i];
            if (scheduled.timeEnd < trackPlayback.scheduledPlaybackTime) {
                const osc = getOrCreatePlayingOscillator(s, scheduled.keyId);

                if (!s.playSettings.isUserDriven) {
                    // Only automate the release of keys a user has actually pressed. 
                    osc.inputs.signal = 0;
                }

                currentlyPlaying[i] = currentlyPlaying[currentlyPlaying.length - 1];
                currentlyPlaying.pop();
                i--;
            }
        }
    }

    // update oscilators
    {
        for (let i = 0; i < s.playingOscillators.length; i++) {
            const osc = s.playingOscillators[i][1];

            updateOscillator(osc, s, s.randomSamples);

            sample += osc.state.value * osc.state.volume;
            count += 1;
        }
    }

    return sample;
}

export function newPlayingOscilator(): PlayingOscillator {
    return {
        state: {
            _lastNoteIndex: -1,
            _frequency: 0,
            _sampleContext: newSampleContext(),
            prevSignal: 0,
            time: 0,
            releasedTime: 0,
            pressedTime: 0,
            volume: 0,
            manuallyPressed: false,
            value: 0,
            idx1: 0,
            acc1: 0,
            acc2: 0,
            acc3: 0,
        },
        inputs: { noteId: 0, signal: 0 },
    };
}

function getOrCreatePlayingOscillator(s: DspState, id: number): PlayingOscillator {
    const osc = getPlayingOscillator(s, id);
    if (osc) {
        return osc;
    }

    // TODO: consider pooling?
    const newOsc = newPlayingOscilator();
    s.playingOscillators.push([id, newOsc]);
    newOsc.state.time = 0;
    // Keep every single oscilator in-phase to avoid interference artifacts
    if (s.playingOscillators.length > 0) {
        newOsc.state.time = s.playingOscillators[0][1].state.time;
    }

    return newOsc;
}

function stopPlayingScheduledKeys(s: DspState) {
    const trackPlayback = s.trackPlayback;

    for (const currentlyPlaying of trackPlayback.scheduedKeysCurrentlyPlaying) {
        const osc = getOrCreatePlayingOscillator(s, currentlyPlaying.keyId);
        osc.inputs.signal = 0;
    }
    trackPlayback.scheduedKeysCurrentlyPlaying.length = 0;

    trackPlayback.scheduleKeys = undefined;
    trackPlayback.scheduledPlaybackTime = -1;
    trackPlayback.scheduledPlaybackCurrentIdx = -1;
}

export function dspProcess(s: DspState, outputs: Float32Array[][]) {
    const output = outputs[0];

    // run oscillators
    for (let i = 0; i < output[0].length; i++) {
        output[0][i] = processSample(s, i);
    }
    // it doesn't work too good, actually :(
    // normalizeIfGreaterThanOne(output[0]);

    // copy first channel outputs to other outputs
    for (let ch = 1; ch < output.length; ch++) {
        for (let i = 0; i < output[ch].length; i++) {
            output[ch][i] = output[0][i];
        }
    }

    // clean up dead oscilators and samples
    {
        filterInPlace(s.playingOscillators, (osc) => {
            return osc[1].inputs.signal > OSC_GAIN_AWAKE_THRESHOLD ||
                Math.abs(osc[1].state.value) > OSC_GAIN_AWAKE_THRESHOLD;
        });
    }

    return true;
}

export function dspReceiveMessage(s: DspState, e: DspLoopMessage) {
    assert(e !== 1337);

    if (e.playSettings) {
        for (const k in e.playSettings) {
            if (!(k in s.playSettings)) {
                continue;
            }

            // @ts-ignore trust me bro
            const val = e.playSettings[k];
            if (val !== undefined) {
                // @ts-ignore trust me bro
                s.playSettings[k] = val;
            }
        }
    }

    if (e.setOscilatorSignal) {
        const [id, inputs] = e.setOscilatorSignal;
        const osc = getOrCreatePlayingOscillator(s, id);

        const prevSignal = osc.inputs.signal;
        osc.inputs = inputs;
        if (prevSignal === 0 && inputs.signal > 0) {
            osc.state.pressedTime = osc.state.time;
        }

        giveUserOwnership(osc);
    }

    if (e.clearAllOscilatorSignals) {
        for (const [, osc] of s.playingOscillators) {
            osc.inputs.signal = 0;
        }
    }

    const trackPlayback = s.trackPlayback;

    if (e.scheduleKeys !== undefined) {
        stopPlayingScheduledKeys(s);
        if (e.scheduleKeys !== null && e.scheduleKeys.length > 0) {
            console.log("new scheduled keys: ", e.scheduleKeys);
            trackPlayback.scheduleKeys = e.scheduleKeys;
            trackPlayback.isPaused = false;
            trackPlayback.scheduledPlaybackTime = 0;
            trackPlayback.scheduledPlaybackCurrentIdx = 0;
        }
    }

    if (e.newPlaybackTime !== undefined) {
        if (trackPlayback.scheduleKeys) {
            console.log("new playback time", e.newPlaybackTime);
            trackPlayback.scheduledPlaybackTime = e.newPlaybackTime;
            trackPlayback.scheduledPlaybackCurrentIdx = 0;
        }
    }

    if (e.scheduleKeysVolume !== undefined) {
        s.trackPlayback.scheduledKeysVolume = e.scheduleKeysVolume;
    }

    if (e.scheduleKeysSpeed !== undefined) {
        s.trackPlayback.scheduledKeysSpeed = e.scheduleKeysSpeed;
    }
}

export function normalizeIfGreaterThanOne(output: Float32Array) {
    let maxSample = 0;
    for (let i = 0; i < output.length; i++) {
        maxSample = max(maxSample, output[i]);
    }

    if (maxSample > 1) {
        for (let i = 0; i < output.length; i++) {
            output[i] = output[i] / maxSample;
        }
    }
}


// If a particular note or sample was scheduled, we can give a user ownership of that note as soon as they 
// send a signal to it manually
function giveUserOwnership(n: PlayingOscillator | PlayingSampleFile) {
    n.state.manuallyPressed = true;
    n.state.volume = 1;
}

let lastUrl: string = "";
export function getDspLoopClassUrl(): string {
    if (lastUrl) {
        return lastUrl;
    }

    // Every single dependency must be injected here manually, so that the worker url has access to everything it needs.
    // (I want the entire web-app to be a single HTML file that can be easily saved, at any cost)

    lastUrl = newFunctionUrl([
        newDspInstruction,
        { value: INSTR_SIN, name: "INSTR_SIN" },
        { value: INSTR_SQUARE, name: "INSTR_SQUARE" },
        { value: INSTR_ADD, name: "INSTR_ADD" },
        { value: INSTR_ADD_DT, name: "INSTR_ADD_DT" },
        { value: INSTR_ADD_RECIPR_DT, name: "INSTR_ADD_RECIPR_DT" },
        { value: INSTR_SUBTRACT, name: "INSTR_SUBTRACT" },
        { value: INSTR_MULTIPLY_DT, name: "INSTR_MULTIPLY_DT" },
        { value: INSTR_DIVIDE, name: "INSTR_DIVIDE" },
        { value: INSTR_LT, name: "INSTR_LT" },
        { value: INSTR_LTE, name: "INSTR_LTE" },
        { value: INSTR_GT, name: "INSTR_GT" },
        { value: INSTR_GTE, name: "INSTR_GTE" },
        { value: INSTR_EQ, name: "INSTR_EQ" },
        { value: INSTR_NEQ, name: "INSTR_NEQ" },
        { value: INSTR_JUMP_IF_NZ, name: "INSTR_JUMP_IF_NZ" },
        { value: INSTR_JUMP_IF_Z, name: "INSTR_JUMP_IF_Z" },
        { value: INSTR_NUM_INSTRUCTIONS, name: "INSTR_NUM_INSTRUCTIONS" },
        { value: INSTR_MULTIPLY, name: "INSTR_MULTIPLY" },
        { value: INSTR_RECIPR_DT, name: "INSTR_RECIPR_DT" },
        { value: IDX_OUTPUT, name: "IDX_OUTPUT" },
        // NOTE: not sure if indices are really needed tbh.
        { value: IDX_WANTED_FREQUENCY, name: "IDX_WANTED_FREQUENCY" },
        { value: IDX_SIGNAL, name: "IDX_SIGNAL" },
        { value: IDX_DT, name: "IDX_DT" },
        { value: IDX_JMP_RESULT, name: "IDX_JMP_RESULT" },
        { value: IDX_USER, name: "IDX_USER" },
        { value: IDX_COUNT, name: "IDX_COUNT" },
        compileInstructions,
        compileDefaultInstructions,
        getDefaultInstructions,
        compileToInstructionsInternal,
        pushInstruction,
        computeSample,
        arrayAt,
        max,
        min,
        updateOscillator,
        getNoteFrequency,
        moveTowards,
        newRandomNumberGenerator,
        getNextRng,
        setRngSeed,
        step,
        sin,
        absMin,
        absMax,
        sawtooth,
        triangle,
        square,
        getPlayingOscillator,
        giveUserOwnership,
        dspProcess,
        normalizeIfGreaterThanOne,
        derivative,
        processSample,
        getOrCreatePlayingOscillator,
        newPlayingOscilator,
        filterInPlace,
        newDspState,
        newDspPlaySettings,
        newSampleContext,
        updateSampleContext,
        getMessageForMainThread,
        dspReceiveMessage,
        assert,
        stopPlayingScheduledKeys,
        updateSample,
        getSampleFileValue,
        lerp,
        inverseLerp,
        clamp,
        getNoteLetter,
        sampleSamples,
        getSampleIdx,
        { value: BASE_NOTE, name: "BASE_NOTE" },
        { value: NOTE_LETTERS, name: "NOTE_LETTERS" },
        { value: null, name: "rng", },
        { value: C_0, name: "C_0", },
        { value: TWELVTH_ROOT_OF_TWO, name: "TWELVTH_ROOT_OF_TWO",  },
        { value: OSC_GAIN_AWAKE_THRESHOLD, name: "OSC_GAIN_AWAKE_THRESHOLD",  },
        { value: EFFECT_RACK_ITEM__OSCILLATOR, name: "EFFECT_RACK_ITEM__OSCILLATOR" },
        { value: EFFECT_RACK_ITEM__ENVELOPE, name: "EFFECT_RACK_ITEM__ENVELOPE" },
        asRegisterIdx,
        registerIdxAsNumber,
        getRegisterIdxForUIValue,
        newRegisterValueMetadata,
        newOscillator,
        newOscillatorWave,
        newEnvelope,
        newEffectRackBinding,
        newEffectRack,
        { value: EFFECT_RACK_MINIMUM_SIZE, name: "EFFECT_RACK_MINIMUM_SIZE" },
        { value: REG_IDX_NONE, name: "REG_IDX_NONE" },
        { value: REG_IDX_OUTPUT, name: "REG_IDX_OUTPUT" },
        { value: REG_IDX_KEY_FREQUENCY, name: "REG_IDX_KEY_FREQUENCY" },
        { value: REG_IDX_KEY_SIGNAL, name: "REG_IDX_KEY_SIGNAL" },
        compileEffectsRack,
        computeEffectsRackIteration,
    ], [
    ], function register() {

        // @ts-expect-error sampleRate is in audio-worklet global sclop
        let _sampleRate = sampleRate;

        // @ts-expect-error - AudioWorkletProcessor
        class DSPLoop extends AudioWorkletProcessor {
            s: DspState = newDspState(_sampleRate);

            constructor() {
                super();
                this.s.sampleRate = _sampleRate;

                // @ts-expect-error this.port is valid on AudioWorkletProcessor
                this.port.onmessage = (e) => {
                    this.onMessage(e.data);
                };
            }

            process(
                _inputs: Float32Array[][],
                outputs: Float32Array[][],
                _parameters: Record<string, Float32Array>
            ) {
                const s = this.s;

                const result = dspProcess(s, outputs);

                // if we pressed keys, we should send a message about s back to the main thread,
                // so that the UI will update accordingly. It's not so important for when we release things though.
                if (s.trackPlayback.shouldSendUiUpdateSignals) {
                    s.trackPlayback.shouldSendUiUpdateSignals = false;
                    this.sendCurrentPlayingMessageBack(s.trackPlayback.shouldSendUiUpdateSignals);
                }

                return result;
            }

            // This is expensive, so don't call too often
            sendCurrentPlayingMessageBack(signals = true) {
                const payload = getMessageForMainThread(this.s, signals);
                // @ts-expect-error this.port is valid on AudioWorkletProcessor
                this.port.postMessage(payload);
            }

            onMessage(e: DspLoopMessage) {
                if (e === 1337) {
                    this.sendCurrentPlayingMessageBack();
                    return;
                }

                dspReceiveMessage(this.s, e);
            }
        }

        // @ts-expect-error registerProcessor is in audio-worklet global sclop
        registerProcessor("dsp-loop", DSPLoop);
    }, {
        includeEsBuildPolyfills: true
    });

    return lastUrl;
}
