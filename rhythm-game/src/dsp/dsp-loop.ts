// NOTE: this file will be imported dynamically and registered as a module in the
// web audio API to later be used by an audio worklet node. Don't put random shit in here,
// put it in dsp-loop-interface.ts instead.
// It seems like it's OK to import types though.

import { filterInPlace } from "src/utils/array-utils";
import { assert } from "src/utils/assert";
import { lerp, max } from "src/utils/math-utils";
import { getNoteFrequency } from "src/utils/music-theory-utils";
import { getNextRng, newRandomNumberGenerator, RandomNumberGenerator, setRngSeed } from "src/utils/random";
import { ScheduledKeyPress, ScheduledKeyPresses } from "./dsp-loop-interface";
import { newEffectRack, newEffectRackRegisters, EffectRackRegisters, computeEffectRackIteration, EffectRack, compileEffectRack }  from "../state/effect-rack";

type DspSynthParameters = {
    rack: EffectRack;
}

export type DSPPlaySettings = {
    isUserDriven: boolean;
    parameters: DspSynthParameters;

    // NOTE: these might become deprecated after we have a fully programmable DSP
    // TODO: Delete these once our programmable DSP is good enough
    attack: number;
    attackVolume: number;
    decay: number;
    sustain: number;
    sustainVolume: number;

}

export function newDspPlaySettings(): DSPPlaySettings {
    return {
        attack: 0.05,
        decay: 3,
        attackVolume: 0.2,
        sustainVolume: 0.05,
        sustain: 0.5,
        isUserDriven: false,
        parameters: {
            rack: newEffectRack(),
        },
    };
}

export type PlayingOscillator = {
    state: {
        _lastNoteIndex: number;
        _frequency: number;
        _effectRackRegisters: EffectRackRegisters;

        prevSignal: number;
        time: number;
        pressedTime: number;
        releasedTime: number;
        volume: number;
        manuallyPressed: boolean;
        value: number;
        lastValue: number;
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

    scheduleKeys?:    ScheduledKeyPresses | null;
    newPlaybackTime?: number;

    scheduleKeysVolume?:               number;
    scheduleKeysSpeed?:                number;
};


export type DspInfo = {
    // [keyId, signal strength, owner]
    currentlyPlaying: [keyId: number, signal: number, owner: number][];
    scheduledPlaybackTime: number; // the current time of the dsp, as last updated
    stoppedId: number;
    isPaused: boolean;
    sampleRate: number;
}

export const OSC_GAIN_AWAKE_THRESHOLD = 0.00001;

export function sampleSamples(samples: number[], sampleDuration: number, time: number) {
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

    const { inputs, state } = osc;

    if (state._lastNoteIndex !== inputs.noteId) {
        state._lastNoteIndex = inputs.noteId;
        state._frequency = getNoteFrequency(inputs.noteId);
    }

    const startedPressing = state.time === 0;

    const dt = 1 / sampleRate;
    if (inputs.signal || Math.abs(state.value) > OSC_GAIN_AWAKE_THRESHOLD) {
        state.time += dt;
    }

    const f = state._frequency;
    let sampleValue = 0;

    // TODO: fix how we're using the gain here
    // the gain is indicative of how much the key is 'pressed down', not the actual attack/decay envelope.
    sampleValue = computeEffectRackIteration(
        parameters.rack,
        osc.state._effectRackRegisters,
        f,
        osc.inputs.signal,
        sampleRate,
        startedPressing,
    );

    state.lastValue = state.value;
    state.value = sampleValue;
}


export function updateSample(osc: PlayingSampleFile, allSamples: Record<string, number[]>) {
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

export function getMessageForMainThread(s: DspState, signals = true) {
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
    payload.isPaused              = s.trackPlayback.isPaused;
    payload.stoppedId             = s.trackPlayback.scheduleKeys === undefined ? s.trackPlayback.playingId : 0;

    return payload;
}

export function getSampleFileValue(oscs: PlayingSampleFile) {
    const { state } = oscs;

    if (state.sampleIdx >= state.sampleArray.length) {
        return 0;
    }

    return state.sampleArray[state.sampleIdx];
}


export function newDspState(sampleRate: number): DspState {
    const s: DspState = {
        rng: newRandomNumberGenerator(),
        sampleRate: sampleRate,
        playSettings: newDspPlaySettings(),
        playingOscillators: [],
        trackPlayback: {
            // set this to non-zero to send a message back to the UI after all samples in the current loop are processed
            playingId: 0,
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
    rng: RandomNumberGenerator;
    sampleRate: number;
    playSettings: DSPPlaySettings;
    playingOscillators: [number, PlayingOscillator][];
    trackPlayback: {
        shouldSendUiUpdateSignals: boolean;
        playingId: number;
        scheduleKeys?: ScheduledKeyPresses;
        scheduledKeysVolume: number;
        scheduledKeysSpeed: number;
        scheduedKeysCurrentlyPlaying: ScheduledKeyPress[];
        scheduledPlaybackTime: number; // in milliseconds
        scheduledPlaybackCurrentIdx: number;
        isPaused: boolean;
    };
    randomSamples: number[]
};

export function getPlayingOscillator(s: DspState, id: number): PlayingOscillator | undefined {
    for (let i = 0; i < s.playingOscillators.length; i++) {
        if (s.playingOscillators[i][0] === id) {
            return s.playingOscillators[i][1];
        }
    }
    return undefined;
}

// Runs a whole lot, so it needs to be highly optimized
export function processSample(s: DspState, idx: number) {
    let sample = 0;
    let count = 0;
    const sampleRate = s.sampleRate;

    const trackPlayback = s.trackPlayback;
    const currentlyPlaying = trackPlayback.scheduedKeysCurrentlyPlaying;

    // update automated scheduled inputs, if applicable
    if (
        trackPlayback.scheduleKeys &&
        trackPlayback.scheduledPlaybackCurrentIdx <= trackPlayback.scheduleKeys.keys.length
    ) {

        // keep track of where we're currently at with the playback
        const dt = (1000 / sampleRate) * trackPlayback.scheduledKeysSpeed;
        const nextScheduledPlaybackTime = trackPlayback.scheduledPlaybackTime + dt;

        if (s.playSettings.isUserDriven) {
            // Pause scheduled playback if we've reached a note that isn't currently being played by the player

            let allUserNotes = true;
            for (let i = trackPlayback.scheduledPlaybackCurrentIdx; i < trackPlayback.scheduleKeys.keys.length; i++) {
                const nextItem = trackPlayback.scheduleKeys.keys[i];
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
            trackPlayback.scheduledPlaybackCurrentIdx < trackPlayback.scheduleKeys.keys.length
            && trackPlayback.scheduleKeys.keys[trackPlayback.scheduledPlaybackCurrentIdx].time < trackPlayback.scheduledPlaybackTime
        ) {
            if (safetyCounter++ >= 1000) {
                throw new Error("safety counter was hit!");
            }

            const nextItem = trackPlayback.scheduleKeys.keys[trackPlayback.scheduledPlaybackCurrentIdx];
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

        // stop playback once we've reached the last note or the scheduled end time, and
        // have finished playing all other notes
        const playedAllScheduledKeys = trackPlayback.scheduledPlaybackCurrentIdx >= trackPlayback.scheduleKeys.keys.length;
        if (playedAllScheduledKeys) {
            const playedForScheduledDuration = trackPlayback.scheduledPlaybackTime > trackPlayback.scheduleKeys.timeEnd;
            if (playedForScheduledDuration) {
                const playedAllKeys = trackPlayback.scheduedKeysCurrentlyPlaying.length === 0;
                if (playedAllKeys) {
                    console.log(
                        "stopped playing",
                        trackPlayback.scheduledPlaybackCurrentIdx,
                        trackPlayback.scheduledPlaybackTime,
                        trackPlayback.scheduleKeys.timeEnd,
                    );
                    stopPlayingScheduledKeys(s);
                }
            }
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
            _effectRackRegisters: newEffectRackRegisters(),
            prevSignal: 0,
            time: 0,
            releasedTime: 0,
            pressedTime: 0,
            volume: 0,
            manuallyPressed: false,
            value: 0,
            lastValue: 0,
        },
        inputs: { noteId: 0, signal: 0 },
    };
}

export function getOrCreatePlayingOscillator(s: DspState, id: number): PlayingOscillator {
    const osc = getPlayingOscillator(s, id);
    if (osc) {
        return osc;
    }

    // TODO: consider pooling?
    // TODO: yes we should, now that each oscilator retains far more state than before. 
    // or even just caching by key id.
    const newOsc = newPlayingOscilator();
    s.playingOscillators.push([id, newOsc]);
    newOsc.state.time = 0;
    // Keep every single oscilator in-phase to avoid interference artifacts
    if (s.playingOscillators.length > 0) {
        newOsc.state.time = s.playingOscillators[0][1].state.time;
    }

    return newOsc;
}

export function stopPlayingScheduledKeys(s: DspState) {
    const trackPlayback = s.trackPlayback;

    for (const currentlyPlaying of trackPlayback.scheduedKeysCurrentlyPlaying) {
        const osc = getOrCreatePlayingOscillator(s, currentlyPlaying.keyId);
        osc.inputs.signal = 0;
    }
    trackPlayback.scheduedKeysCurrentlyPlaying.length = 0;

    trackPlayback.scheduleKeys = undefined;
    trackPlayback.scheduledPlaybackTime = -1;
    trackPlayback.scheduledPlaybackCurrentIdx = -1;
    trackPlayback.isPaused = true;
    trackPlayback.shouldSendUiUpdateSignals = true;
}

export function dspProcess(s: DspState, outputs: (Float32Array[][]) | (number[][][])) {
    const output = outputs[0];

    const defaultOscilatorVolume = 0.4;

    // run oscillators
    for (let i = 0; i < output[0].length; i++) {
        output[0][i] = processSample(s, i) * defaultOscilatorVolume;
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
                Math.abs(osc[1].state.value) > OSC_GAIN_AWAKE_THRESHOLD ||
                Math.abs(osc[1].state.value - osc[1].state.lastValue) > OSC_GAIN_AWAKE_THRESHOLD;
        });
    }

    return true;
}

export function dspReceiveMessage(s: DspState, e: DspLoopMessage) {
    assert(e !== 1337);

    if (e.playSettings) {
        const rack = s.playSettings.parameters.rack;

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

        if (s.playSettings.parameters.rack !== rack) {
            compileEffectRack(s.playSettings.parameters.rack);
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
        if (e.scheduleKeys !== null && e.scheduleKeys.keys.length > 0) {
            console.log("new scheduled keys: ", e.scheduleKeys);
            trackPlayback.scheduleKeys = e.scheduleKeys;
            trackPlayback.playingId = e.scheduleKeys.playingId;
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
export function giveUserOwnership(n: PlayingOscillator | PlayingSampleFile) {
    n.state.manuallyPressed = true;
    n.state.volume = 1;
}

