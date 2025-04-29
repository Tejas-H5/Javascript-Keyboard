// NOTE: this file will be imported dynamically and registered as a module in the
// web audio API to later be used by an audio worklet node. Don't put random shit in here,
// put it in dsp-loop-interface.ts instead.
// It seems like it's OK to import types though.

import { newFunctionUrl } from "src/utils/web-workers";
import { ScheduledKeyPress } from "./dsp-loop-interface";
import { max, moveTowards } from "src/utils/math-utils";
import { C_0, getNoteFrequency, TWELVTH_ROOT_OF_TWO } from "src/utils/music-theory-utils";
import { filterInPlace } from "src/utils/array-utils";
import { assert } from "src/utils/assert";

export type DSPPlaySettings = {
    attack: number;
    decay: number;
    sustain: number;
    sustainVolume: number;
    isUserDriven: boolean;
}

type PlayingOscillator = {
    state: {
        _lastNoteIndex: number;
        _frequency: number;
        prevSignal: number;
        awakeTime: number;
        phase: number;
        gain: number;
        volume: number;
        manuallyPressed: boolean;
    };
    inputs: {
        noteIndex: number;
        signal: number;
    },
};

type PlayingSampleFile = {
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
    playSettings?: Partial<DSPPlaySettings>;
    setOscilatorSignal?: [number, PlayingOscillator["inputs"]];
    clearAllOscilatorSignals?: true;
    playSample?: [number, PlayingSampleFile["inputs"]];
    scheduleKeys?: ScheduledKeyPress[] | null;
    scheduleKeysVolume?: number;
    // This samples record is so massive that my editor lags way too hard when I edit that file. So I
    // put it in a different file, and just inject it on startup, since it's JSON serialzable
    setAllSamples?: Record<string, number[]>;
};


export type DspInfo = {
    // [keyId, signal strength, owner]
    currentlyPlaying: [keyId: number, signal: number, owner: number][];
    scheduledPlaybackTime: number;
    isPaused: boolean;
}

const OSC_GAIN_AWAKE_THRESHOLD = 0.001;

function normalize(output: Float32Array) {
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

function updateOscillator(osc: PlayingOscillator, s: DSPPlaySettings) {
    const {
        attack,
        decay,
        sustain,
        sustainVolume
    } = s;

    const { inputs, state } = osc;

    if (state._lastNoteIndex !== inputs.noteIndex) {
        state._lastNoteIndex = inputs.noteIndex;
        state._frequency = getNoteFrequency(inputs.noteIndex);
    }

    // frequency rotations per second
    state.phase += state._frequency / sampleRate;
    state.phase %= 1.0;

    if (inputs.signal || state.gain > OSC_GAIN_AWAKE_THRESHOLD) {
        state.awakeTime += 1 / sampleRate;
    }

    if (inputs.signal) {
        if (state.awakeTime <= attack) {
            state.gain = moveTowards(state.gain, 1, (1 / attack) / sampleRate);
        } else {
            state.gain = moveTowards(state.gain, sustainVolume, (1 / sustain) / sampleRate);
        }
    } else {
        state.gain = moveTowards(state.gain, 0, (1 / decay) / sampleRate);
    }
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
    const payload: Partial<DspInfo> = {};

    if (signals) {
        // this is the only way for the main thread to know this info :sad:
        const currentPlaybackSignals: [number, number, number][] = [];
        for (const [key, osc] of s.playingOscillators) {
            currentPlaybackSignals.push([
                key,
                max(osc.inputs.signal, osc.state.gain),
                osc.state.manuallyPressed ? 0 : 1
            ]);
        }
        for (const [key, osc] of s.playingSamples) {
            currentPlaybackSignals.push([
                key,
                1 - (osc.state.sampleIdx / osc.state.sampleArray.length),
                osc.state.manuallyPressed ? 0 : 1
            ]);
        }

        payload.currentlyPlaying = currentPlaybackSignals;
    }

    payload.scheduledPlaybackTime = s.trackPlayback.scheduledPlaybackTime;

    payload.isPaused = s.trackPlayback.isPaused;

    return payload;
}

function getOscillatorValue(osc: PlayingOscillator) {
    const { state } = osc;
    // this is supposed to sound like a piano.         

    // main harmonic
    let s0 = Math.sin(state.phase * Math.PI * 2.0);

    // side harmonics
    let sm2 = Math.sin(state.phase * Math.PI * 2.0 / 3);
    let sm1 = Math.sin(state.phase * Math.PI * 2.0 / 2);
    let s1 = Math.sin(state.phase * Math.PI * 2.0 * 2);
    let s2 = Math.sin(state.phase * Math.PI * 2.0 * 3);

    // The numbers seem small, but they make a pretty big difference actually.
    // TODO: can be a function of osc.frequency
    let m2 = 0.02;
    let m1 = 0.05;
    let m0 = 1;

    return state.gain * (
        s0 * m0 +
        s1 * m1 +
        s2 * m2
    ) / (m2 + m2 + m1 + m1 + m0);
}

function getSampleFileValue(oscs: PlayingSampleFile) {
    const { state } = oscs;

    if (state.sampleIdx >= state.sampleArray.length) {
        return 0;
    }

    return state.sampleArray[state.sampleIdx];
}


function newDspState(): DspState {
    return {
        inputObject: {
            deltaTime: 1 / sampleRate,  // time elapsed between two samples
            frequency: 0,               // the current oscillator's frequency
        },
        playSettings: {
            attack: 50,
            decay: 10,
            sustain: 1,
            sustainVolume: 1,
            isUserDriven: false,
        },
        playingOscillators: [],
        playingSamples: [],
        trackPlayback: {
            // set this to true to send a message back to the UI after all samples in the current loop are processed
            shouldSendUiUpdateSignals: false,
            scheduleKeys: undefined,
            scheduledKeysVolume: 1,
            scheduedKeysCurrentlyPlaying: [],
            scheduledPlaybackTime: 0,
            scheduledPlaybackCurrentIdx: 0,
            isPaused: false,
        },
        allSamples: {},
    }
}


type DspState = {
    inputObject: {
        deltaTime: number; // time elapsed between two samples
        frequency: number; // the current oscillator's frequency
    };
    playSettings: DSPPlaySettings,
    playingOscillators: [number, PlayingOscillator][];
    playingSamples: [number, PlayingSampleFile][];
    trackPlayback: {
        shouldSendUiUpdateSignals: boolean;
        scheduleKeys?: ScheduledKeyPress[];
        scheduledKeysVolume: number;
        scheduedKeysCurrentlyPlaying: ScheduledKeyPress[];
        scheduledPlaybackTime: number;
        scheduledPlaybackCurrentIdx: number;
        isPaused: boolean;
    };
    allSamples: Record<string, number[]>;
};

function getPlayingOscillator(s: DspState, id: number): PlayingOscillator | undefined {
    for (let i = 0; i < s.playingOscillators.length; i++) {
        if (s.playingOscillators[i][0] === id) {
            return s.playingOscillators[i][1];
        }
    }
    return undefined;
}

function getPlayingSample(s: DspState, id: number) {
    for (let i = 0; i < s.playingSamples.length; i++) {
        if (s.playingSamples[i][0] === id) {
            return s.playingSamples[i][1];
        }
    }
    return undefined;
}


// Runs a whole lot, so it needs to be highly optimized
function processSample(s: DspState) {
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
        const dt = 1000 / sampleRate;
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

                const sample = getPlayingSample(s, nextItem.keyId);
                const osc = getPlayingOscillator(s, nextItem.keyId);

                if (!sample && !osc) {
                    allUserNotes = false;
                } else if (sample) {
                    if (!sample.state.manuallyPressed) {
                        allUserNotes = false;
                    }
                } else if (osc) {
                    if (!osc.state.manuallyPressed) {
                        allUserNotes = false;
                    } else if (osc.inputs.signal < OSC_GAIN_AWAKE_THRESHOLD) {
                        // s oscilator was released, so not really user input anymore
                        allUserNotes = false;
                    }
                }

                if (!allUserNotes) {
                    break;
                }
            }

            // setSchedueldPlaybackPaused
            {
                let wantedPausedState = !allUserNotes;
                if (s.trackPlayback.isPaused !== wantedPausedState) {
                }

                s.trackPlayback.isPaused = wantedPausedState;
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

            if (nextItem.noteIndex) {
                const osc = getOrCreatePlayingOscillator(s, nextItem.keyId);
                osc.inputs = {
                    noteIndex: nextItem.noteIndex,
                    signal: 1,
                };
                osc.state.awakeTime = 0;
                osc.state.volume = max(s.trackPlayback.scheduledKeysVolume, osc.state.volume);
            }

            if (nextItem.sample) {
                const osc = getOrCreatePlayingSample(s, nextItem.keyId);
                osc.inputs = {
                    sample: nextItem.sample,
                };
                osc.state.sampleIdx = 0;
                osc.state.volume = max(s.trackPlayback.scheduledKeysVolume, osc.state.volume);
            }

            trackPlayback.shouldSendUiUpdateSignals = true;
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
                osc.inputs.signal = 0;
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

            updateOscillator(osc, s.playSettings);

            sample += getOscillatorValue(osc) * osc.state.volume;
            count += 1;
        }
    }

    // update samples
    {
        for (let i = 0; i < s.playingSamples.length; i++) {
            const sampleFile = s.playingSamples[i][1];

            updateSample(sampleFile, s.allSamples);

            sample += getSampleFileValue(sampleFile) * sampleFile.state.volume;
            count += 1;
        }
    }

    return sample;
}


function getOrCreatePlayingOscillator(s: DspState, id: number): PlayingOscillator {
    const osc = getPlayingOscillator(s, id);
    if (osc) {
        return osc;
    }

    const newOsc: PlayingOscillator = {
        state: { _lastNoteIndex: -1, _frequency: 0, prevSignal: 0, awakeTime: 0, phase: 0, gain: 0, volume: 0, manuallyPressed: false },
        inputs: { noteIndex: 0, signal: 0 },
    };
    s.playingOscillators.push([id, newOsc]);

    return newOsc;
}


function getOrCreatePlayingSample(s: DspState, id: number): PlayingSampleFile {
    const sample = getPlayingSample(s, id);
    if (sample) {
        return sample;
    }

    const newSample: PlayingSampleFile = {
        state: { sampleIdx: 0, prevSampleFile: "", sampleArray: [], volume: 0, manuallyPressed: false },
        inputs: { sample: "" }
    };
    s.playingSamples.push([id, newSample]);
    return newSample;
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

function processDsp(s: DspState, outputs: Float32Array[][]) {
    const output = outputs[0];

    // run oscillators
    for (let i = 0; i < output[0].length; i++) {
        output[0][i] = processSample(s);
    }
    // it doesn't work too good, actually :(
    // normalize(output[0]);

    // copy first channel outputs to other outputs
    for (let ch = 1; ch < output.length; ch++) {
        for (let i = 0; i < output[ch].length; i++) {
            output[ch][i] = output[0][i];
        }
    }

    // clean up dead oscilators and samples
    {
        let lastCount = s.playingOscillators.length;
        filterInPlace(s.playingOscillators, (osc) => {
            return osc[1].inputs.signal > 0.001 ||
                osc[1].state.gain > 0.001;
        });

        lastCount = s.playingSamples.length;
        filterInPlace(s.playingSamples, (osc) => {
            return osc[1].state.sampleIdx !== osc[1].state.sampleArray.length;
        });
    }

    return true;
}

function handleMessage(s: DspState, e: DspLoopMessage) {
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

        osc.inputs = inputs;
        osc.state.awakeTime = 0;

        giveUserOwnership(osc);
    }

    if (e.clearAllOscilatorSignals) {
        for (const [, osc] of s.playingOscillators) {
            osc.inputs.signal = 0;
        }
    }

    if (e.playSample) {
        const [id, inputs] = e.playSample;
        const osc = getOrCreatePlayingSample(s, id);

        osc.inputs = inputs;
        osc.state.sampleIdx = 0;

        giveUserOwnership(osc);
    }

    if (e.scheduleKeys !== undefined) {
        const trackPlayback = s.trackPlayback;
        stopPlayingScheduledKeys(s);
        if (e.scheduleKeys !== null && e.scheduleKeys.length > 0) {
            trackPlayback.scheduleKeys = e.scheduleKeys;
            trackPlayback.isPaused = false;
            trackPlayback.scheduledPlaybackTime = 0;
            trackPlayback.scheduledPlaybackCurrentIdx = 0;
        }
    }

    if (e.scheduleKeysVolume !== undefined) {
        s.trackPlayback.scheduledKeysVolume = e.scheduleKeysVolume;
    }

    if (e.setAllSamples) {
        s.allSamples = e.setAllSamples;
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
        max,
        updateOscillator,
        getNoteFrequency,
        moveTowards,
        getOscillatorValue,
        getPlayingSample,
        getPlayingOscillator,
        giveUserOwnership,
        processDsp,
        processSample,
        getOrCreatePlayingSample,
        getOrCreatePlayingOscillator,
        filterInPlace,
        newDspState,
        getMessageForMainThread,
        handleMessage,
        assert,
        stopPlayingScheduledKeys,
        { value: C_0, name: "C_0", },
        { value: TWELVTH_ROOT_OF_TWO, name: "TWELVTH_ROOT_OF_TWO",  },
        { value: OSC_GAIN_AWAKE_THRESHOLD, name: "OSC_GAIN_AWAKE_THRESHOLD",  },
    ], [
    ], function register() {
        class DSPLoop extends AudioWorkletProcessor {
            s: DspState = newDspState();

            constructor() {
                super();
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

                const result = processDsp(s, outputs);

                // if we pressed keys, we should send a message about s back to the main thread,
                // so that the UI will update accordingly. It's not so important for when we release things though.
                if (s.trackPlayback.shouldSendUiUpdateSignals) {
                    s.trackPlayback.shouldSendUiUpdateSignals = false;
                    this.sendCurrentPlayingMessageBack(s.trackPlayback.shouldSendUiUpdateSignals,);
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
                
                handleMessage(this.s, e);
            }
        }

        registerProcessor("dsp-loop", DSPLoop);
    }, {
        includeEsBuildPolyfills: true
    });

    return lastUrl;
}
