// NOTE: this file will be imported dynamically and registered as a module in the
// web audio API to later be used by an audio worklet node. Don't put random shit in here,
// put it in dsp-loop-interface.ts instead.
// It seems like it's OK to import types though.

import { BASE_NOTE, getSampleIdx } from "src/state/keyboard-state";
import { filterInPlace } from "src/utils/array-utils";
import { assert } from "src/utils/assert";
import { clamp, derivative, inverseLerp, lerp, max, min, moveTowards } from "src/utils/math-utils";
import { C_0, getNoteFrequency, getNoteLetter, NOTE_LETTERS, TWELVTH_ROOT_OF_TWO } from "src/utils/music-theory-utils";
import { getNextRng, newRandomNumberGenerator, RandomNumberGenerator, setRngSeed } from "src/utils/random";
import { newFunctionUrl } from "src/utils/web-workers";
import {
    computeSample,
    DspSynthInstruction,
    IDX_FREQUENCY,
    IDX_MAX,
    IDX_OUTPUT,
    IDX_TIME,
    IDX_USER,
    INSTR_ADD,
    INSTR_DIVIDE,
    INSTR_ELIF,
    INSTR_END,
    INSTR_IF,
    INSTR_MULTIPLY,
    INSTR_MULTIPLY_DT,
    INSTR_NUM_INSTRUCTIONS,
    INSTR_SIN,
    INSTR_SQUARE,
    INSTR_SUBTRACT,
    newDspInstruction,
    newSampleContext,
    SampleContext
} from "./dsp-loop-instruction-set";
import { ScheduledKeyPress } from "./dsp-loop-interface";

type DspSynthParameters = {
    // Hopefully a pseudo assembly language will give us more flexibility
    // and possibilities.
    instructions: DspSynthInstruction[];
}


export type PianoSynthWave = {
    frequencyOffset: number;
    frequencyMultiplierPow2: number;
    falloff: number;
    falloffStart: number;
    amplitude: number;
    enabled: boolean;
};;

export function newPianoSynthWave(): PianoSynthWave {
    return {
        frequencyOffset: 0,
        frequencyMultiplierPow2: 0,
        falloff: 0.01,
        falloffStart: 1,
        amplitude: 1,
        enabled: true,
    };
}

export const DEFAULT_PIANO_SYNTH_WAVE = newPianoSynthWave();

export type DSPPlaySettings = {
    attack: number;
    attackVolume: number;
    decay: number;
    sustain: number;
    sustainVolume: number;
    isUserDriven: boolean;
    parameters: DspSynthParameters;
}

export function newDspPlaySettings(): DSPPlaySettings {
    const REG = true;
    const VAL = false;

    const attack = IDX_USER;
    const attackRate = IDX_USER + 1;
    const sustain = IDX_USER + 2;
    const attackToSustainRate = IDX_USER + 3;
    const releaseRate = IDX_USER + 4;
    const usrBase = IDX_USER + 5;

    const instructions: DspSynthInstruction[] = [
        // sample = sin(f * t);
        newDspInstruction(INSTR_SIN, IDX_FREQUENCY, REG, IDX_TIME, REG, usrBase),

        /**
         *  if d0 < attack:
         *      attackRate *dt signal -> r0
         *      d0 + r0 -> d0
         *      1 -> d1
         *      d0 -> r1
         *  else if d1 > sustain:
         *      attackToSustainRate * signal -> r0
         *      movetowards d1 sustain r0 -> d1
         *      sustain -> d2
         *      d1 -> r1
         *  else if d2 > 0:
         *      1 - signal -> r0
         *      releaseRate * r0 -> r0
         *      movetowards d2 0 r0 -> d2
         *      d2 -> r1
         *  end
         *  
         *  sin f * t -> r2
         *  r2 * r1 -> r0
         */

        newDspInstruction(INSTR_IF, usrBase, REG, 0, VAL, IDX_OUTPUT),
    ];

    return {
        attack: 0.05,
        decay: 3,
        attackVolume: 0.2,
        sustainVolume: 0.05,
        sustain: 0.5,
        isUserDriven: false,
        parameters: { instructions: instructions },
    };
}

export type PlayingOscillator = {
    state: {
        _lastNoteIndex: number;
        _frequency: number;
        _sampleContext: SampleContext;

        prevSignal: number;
        time: number;
        pressedTime: number;
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
    if (inputs.signal || state.value > OSC_GAIN_AWAKE_THRESHOLD) {
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
        if (inputs.signal) {
            if (tPressed <= attack) {
                targetGain = attackVolume; rate = attack;
            } else {
                targetGain = sustainVolume; rate = sustain;
            }
        } else {
            targetGain = 0.0;
            rate = Math.max(decay, 0.0000001); // should never ever be 0. ever
        }

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

        sampleValue += computeSample(state._sampleContext, parameters.instructions, f, t, dt);

        // sampleValue = x;
        // sampleTotal = m;
    }

    state.value = sampleValue;
}


/**

// Funnni
{
        const t = state.time;
        const f = state._frequency;

        let val = 0;
        let total = 0;

        let n = 10;
        for (let i = 1; i <= n; i++) {

            let m = 1 

            const f2 = f * (1+ i) / (1 + t);

            let x = m * sin(t * f2)

            // x *= sign;
            // sign = -sign;

            val += x;
            total += m;
        }

        state.value = val * state.gain / total;
    }

// computer noises
    {
        const t = state.time;
        const f = state._frequency;

        let val = 0;
        let total = 0;

        let n = 10;
        for (let i = 1; i <= n; i++) {

            let m = 1 

            const f2 = Math.pow(f, i);

            let x = m * sin(t * f2)

            // x *= sign;
            // sign = -sign;

            val += x;
            total += m;
        }

        state.value = val * state.gain / total;
    }

*/

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

function sin(t: number) {
    return Math.sin(t * Math.PI * 2);
}

function absMin(a: number, b: number) {
    if (Math.abs(a) > Math.abs(b)) {
        return b;
    }
    return a;
}

function absMax(a: number, b: number) {
    if (Math.abs(a) < Math.abs(b)) {
        return b;
    }
    return a;
}

function sawtooth(t: number) {
    return 2 * (t % 1) - 1;
}

function triangle(t: number) {
    if (t < 0) t = -t;
    t %= 1;
    let result;
    if (t > 0.5) {
        result = 2 - 2 * t;
    } else {
        result = 2 * t;
    }

    return 2 * (result - 0.5);
}

function square(t: number) {
    t = t % 2;
    return t > 1 ? 1 : -1;
}

function step(t: number) {
    return Math.floor(t) % 2;
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
                osc[1].state.value > OSC_GAIN_AWAKE_THRESHOLD;
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

    lastUrl = newFunctionUrl([
        newPianoSynthWave,
        newDspInstruction,
        { value: INSTR_SIN, name: "INSTR_SIN" },
        { value: INSTR_SQUARE, name: "INSTR_SQUARE" },
        { value: INSTR_ADD, name: "INSTR_ADD" },
        { value: INSTR_SUBTRACT, name: "INSTR_SUBTRACT" },
        { value: INSTR_MULTIPLY, name: "INSTR_MULTIPLY" },
        { value: INSTR_MULTIPLY_DT, name: "INSTR_MULTIPLY_DT" },
        { value: INSTR_DIVIDE, name: "INSTR_DIVIDE" },
        { value: INSTR_IF, name: "INSTR_IF" },
        { value: INSTR_ELIF, name: "INSTR_ELIF" },
        { value: INSTR_END, name: "INSTR_END" },
        { value: INSTR_NUM_INSTRUCTIONS, name: "INSTR_NUM_INSTRUCTIONS" },
        { value: IDX_OUTPUT, name: "IDX_OUTPUT" },
        { value: IDX_FREQUENCY, name: "IDX_FREQUENCY" },
        { value: IDX_TIME, name: "IDX_TIME" },
        { value: IDX_USER, name: "IDX_USER" },
        { value: IDX_MAX, name: "IDX_MAX" },
        computeSample,
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
    ], [
    ], function register() {

        class DSPLoop extends AudioWorkletProcessor {
            s: DspState = newDspState(sampleRate);

            constructor() {
                super();
                this.s.sampleRate = sampleRate;
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

        registerProcessor("dsp-loop", DSPLoop);
    }, {
        includeEsBuildPolyfills: true
    });

    return lastUrl;
}
