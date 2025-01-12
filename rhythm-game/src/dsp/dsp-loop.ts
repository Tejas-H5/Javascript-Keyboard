// NOTE: this file will be imported dynamically and registered as a module in the
// web audio API to later be used by an audio worklet node. Don't put random shit in here,
// put it in dsp-loop-interface.ts instead.
// It seems like it's OK to import types though.

import { ScheduledKeyPress } from "./dsp-loop-interface";

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
    currentlyPlaying: [number, number, number][];
    scheduledPlaybackTime: number;
    isPaused: boolean;
}

export function registerDspLoopClass() {
    const OSC_GAIN_AWAKE_THRESHOLD = 0.001;

    // We're using a hack to stringify this containing function so that we can dynamically instantiate it as a URL.
    // This means it can't have any dependencies on imports.
    // ---- COPY-PASTE ----
    
    function filterInPlace<T>(arr: T[], predicate: (v: T, i: number) => boolean) {
        for (let i = 0; i < arr.length; i++) {
            if (!predicate(arr[i], i)) {
                arr.splice(i, 1);
                i--;
            }
        }
    }

    function max(a: number, b: number): number {
        return a > b ? a : b;
    }

    function moveTowards(a: number, b: number, maxDelta: number) {
        if (Math.abs(a - b) < maxDelta) return b;

        if (a > b) {
            return a - maxDelta;
        }

        return a + maxDelta;
    }

    const C_0 = 16.35;;
    const TWELVTH_ROOT_OF_TWO = 1.0594631;
    function getNoteFrequency(index: number) {
        return C_0 * Math.pow(TWELVTH_ROOT_OF_TWO, index);
    }

    // ---- END COPY-PASTE ----
    
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
        state.phase %= 3.0;

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

    function updateSample(osc: PlayingSampleFile, dspLoop: DSPLoop) {
        const { inputs, state } = osc;

        if (inputs.sample !== state.prevSampleFile) {
            state.prevSampleFile = inputs.sample;
            state.sampleArray = dspLoop.getSampleArray(inputs.sample);
            state.sampleIdx = 0;
        }

        if (state.sampleIdx < state.sampleArray.length) {
            state.sampleIdx += 1;
        }
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

    class DSPLoop extends AudioWorkletProcessor {
        inputObject = {
            deltaTime: 1 / sampleRate,  // time elapsed between two samples
            frequency: 0,               // the current oscillator's frequency
        };
        playSettings: DSPPlaySettings = {
            attack: 50,
            decay: 10,
            sustain: 1,
            sustainVolume: 1,
            isUserDriven: false,
        };
        playingOscillators: [number, PlayingOscillator][] = [];
        playingSamples: [number, PlayingSampleFile][] = [];
        trackPlayback: {
            shouldSendUiUpdateSignals: boolean;
            scheduleKeys?: ScheduledKeyPress[];
            scheduledKeysVolume: number;
            scheduedKeysCurrentlyPlaying: ScheduledKeyPress[];
            scheduledPlaybackTime: number;
            scheduledPlaybackCurrentIdx: number;
            isPaused: boolean;
        } = {
                // set this to true to send a message back to the UI after all samples in the current loop are processed
                shouldSendUiUpdateSignals: false,
                scheduleKeys: undefined,
                scheduledKeysVolume: 1,
                scheduedKeysCurrentlyPlaying: [],
                scheduledPlaybackTime: 0,
                scheduledPlaybackCurrentIdx: 0,
                isPaused: false,
            };
        allSamples: Record<string, number[]> = {};


        constructor() {
            super();
            this.port.onmessage = (e) => {
                this.onMessage(e.data);
            };
        }

        getSampleArray(sample: string) {
            return this.allSamples[sample];
        }

        setSchedueldPlaybackPaused(paused: boolean) {
            if (this.trackPlayback.isPaused === paused) {
                return;
            }

            this.trackPlayback.isPaused = paused;
            this.trackPlayback.shouldSendUiUpdateSignals = true;
        }

        // Runs a whole lot, so it needs to be highly optimized
        processSample() {
            let sample = 0;
            let count = 0;

            const trackPlayback = this.trackPlayback;
            const currentlyPlaying = trackPlayback.scheduedKeysCurrentlyPlaying;

            // update automated scheduled inputs, if applicable
            if (
                trackPlayback.scheduleKeys &&
                trackPlayback.scheduledPlaybackCurrentIdx <= trackPlayback.scheduleKeys.length
            ) {

                // keep track of where we're currently at with the playback
                const dt = 1000 / sampleRate;
                const nextScheduledPlaybackTime = trackPlayback.scheduledPlaybackTime + dt;

                if (this.playSettings.isUserDriven) {
                    // Pause scheduled playback if we've reached a note that isn't currently being played by the player

                    let allUserNotes = true;
                    for (let i = trackPlayback.scheduledPlaybackCurrentIdx; i < trackPlayback.scheduleKeys.length; i++) {
                        const nextItem = trackPlayback.scheduleKeys[i];
                        if (nextItem.time > nextScheduledPlaybackTime) {
                            // dont care abt things we've scheduled that aren't here yet..
                            break;
                        }

                        const thing = this.getPlayingSample(nextItem.keyId) || this.getPlayingOscillator(nextItem.keyId);
                        if (!thing || !thing.state.manuallyPressed) {
                            allUserNotes = false;
                            break;
                        }
                    }

                    this.setSchedueldPlaybackPaused(!allUserNotes);
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
                        const osc = this.getOrCreatePlayingOscillator(nextItem.keyId);
                        osc.inputs = {
                            noteIndex: nextItem.noteIndex,
                            signal: 1,
                        };
                        osc.state.awakeTime = 0;
                        osc.state.volume = max(this.trackPlayback.scheduledKeysVolume, osc.state.volume);
                    }

                    if (nextItem.sample) {
                        const osc = this.getOrCreatePlayingSample(nextItem.keyId);
                        osc.inputs = {
                            sample: nextItem.sample,
                        };
                        osc.state.sampleIdx = 0;
                        osc.state.volume = max(this.trackPlayback.scheduledKeysVolume, osc.state.volume);
                    }

                    trackPlayback.shouldSendUiUpdateSignals = true;
                }

                // stop playback once we've reached the last note, and
                // have finished playing all other notes
                if (
                    trackPlayback.scheduledPlaybackCurrentIdx >= trackPlayback.scheduleKeys.length &&
                    trackPlayback.scheduedKeysCurrentlyPlaying.length === 0
                ) {
                    this.stopPlayingScheduledKeys();
                }
            }

            // stop playing keys that are no longer playing
            {
                for (let i = 0; i < currentlyPlaying.length; i++) {
                    const scheduled = currentlyPlaying[i];
                    if (scheduled.timeEnd < trackPlayback.scheduledPlaybackTime) {
                        const osc = this.getOrCreatePlayingOscillator(scheduled.keyId);
                        osc.inputs.signal = 0;
                        currentlyPlaying[i] = currentlyPlaying[currentlyPlaying.length - 1];
                        currentlyPlaying.pop();
                        i--;
                    }
                }
            }

            // update oscilators
            {
                for (let i = 0; i < this.playingOscillators.length; i++) {
                    const osc = this.playingOscillators[i][1];

                    updateOscillator(osc, this.playSettings);

                    sample += getOscillatorValue(osc) * osc.state.volume;
                    count += 1;
                }
            }

            // update samples
            {
                for (let i = 0; i < this.playingSamples.length; i++) {
                    const sampleFile = this.playingSamples[i][1];

                    updateSample(sampleFile, this);

                    sample += getSampleFileValue(sampleFile) * sampleFile.state.volume;
                    count += 1;
                }
            }

            return sample;
        }

        process(
            _inputs: Float32Array[][],
            outputs: Float32Array[][],
            _parameters: Record<string, Float32Array>
        ) {
            const output = outputs[0];

            // run oscillators
            for (let i = 0; i < output[0].length; i++) {
                output[0][i] = this.processSample();
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
                let lastCount = this.playingOscillators.length;
                filterInPlace(this.playingOscillators, (osc) => {
                    return osc[1].inputs.signal > 0.001 ||
                        osc[1].state.gain > 0.001;
                });

                lastCount = this.playingSamples.length;
                filterInPlace(this.playingSamples, (osc) => {
                    return osc[1].state.sampleIdx !== osc[1].state.sampleArray.length;
                });
            }

            // if we pressed keys, we should send a message about this back to the main thread,
            // so that the UI will update accordingly. It's not so important for when we release things though.
            if (this.trackPlayback.shouldSendUiUpdateSignals) {
                this.trackPlayback.shouldSendUiUpdateSignals = false;
                this.sendCurrentPlayingMessageBack(
                    this.trackPlayback.shouldSendUiUpdateSignals,
                );
            }

            return true;
        }

        releaseAllOscillators() {
            for (const osc of this.playingOscillators) {
                osc[1].inputs.signal = 0;
            }
        }

        getPlayingSample(id: number): PlayingSampleFile | undefined {
            const idx = this.playingSamples.findIndex(o => o[0] === id);
            if (idx !== -1) {
                return this.playingSamples[idx][1];
            }

            return undefined;
        }


        getOrCreatePlayingSample(id: number): PlayingSampleFile {
            const sample = this.getPlayingSample(id);
            if (sample) {
                return sample;
            }

            const newSample: PlayingSampleFile = {
                state: { sampleIdx: 0, prevSampleFile: "", sampleArray: [], volume: 0, manuallyPressed: false },
                inputs: { sample: "" }
            };
            this.playingSamples.push([id, newSample]);
            return newSample;
        }


        getPlayingOscillator(id: number): PlayingOscillator | undefined {
            const idx = this.playingOscillators.findIndex(o => o[0] === id);
            if (idx !== -1) {
                return this.playingOscillators[idx][1];
            }

            return undefined;
        }

        getOrCreatePlayingOscillator(id: number): PlayingOscillator {
            const osc = this.getPlayingOscillator(id);
            if (osc) {
                return osc;
            }

            const newOsc: PlayingOscillator = {
                state: { _lastNoteIndex: -1, _frequency: 0, prevSignal: 0, awakeTime: 0, phase: 0, gain: 0, volume: 0, manuallyPressed: false },
                inputs: { noteIndex: 0, signal: 0 },
            };
            this.playingOscillators.push([id, newOsc]);
            return newOsc;
        }

        // This is expensive, so don't call too often
        sendCurrentPlayingMessageBack(signals = true) {
            const payload: Partial<DspInfo> = {};

            if (signals) {
                // this is the only way for the main thread to know this info :sad:
                const currentPlaybackSignals: [number, number, number][] = [];
                for (const [key, osc] of this.playingOscillators) {
                    currentPlaybackSignals.push([
                        key, 
                        max(osc.inputs.signal, osc.state.gain),
                        osc.state.manuallyPressed ? 0 : 1
                    ]);
                }
                for (const [key, osc] of this.playingSamples) {
                    currentPlaybackSignals.push([
                        key, 
                        1 - (osc.state.sampleIdx / osc.state.sampleArray.length),
                        osc.state.manuallyPressed ? 0 : 1
                    ]);
                }

                payload.currentlyPlaying = currentPlaybackSignals;
            }

            payload.scheduledPlaybackTime = this.trackPlayback.scheduledPlaybackTime;

            payload.isPaused = this.trackPlayback.isPaused;

            this.port.postMessage(payload);
        }

        stopPlayingScheduledKeys() {
            const trackPlayback = this.trackPlayback;

            for (const currentlyPlaying of trackPlayback.scheduedKeysCurrentlyPlaying) {
                const osc = this.getOrCreatePlayingOscillator(currentlyPlaying.keyId);
                osc.inputs.signal = 0;
            }
            trackPlayback.scheduedKeysCurrentlyPlaying.length = 0;

            trackPlayback.scheduleKeys = undefined;
            trackPlayback.scheduledPlaybackTime = -1;
            trackPlayback.scheduledPlaybackCurrentIdx = -1;
        }

        // If a particular note or sample was scheduled, we can give a user ownership of that note as soon as they 
        // send a signal to it manually
        giveUserOwnership(n: PlayingOscillator | PlayingSampleFile) {
            n.state.manuallyPressed = true;
            n.state.volume = 1;
        }

        onMessage(e: DspLoopMessage) {
            if (e === 1337) {
                this.sendCurrentPlayingMessageBack();
                return;
            }

            if (e.playSettings) {
                for (const k in e.playSettings) {
                    if (!(k in this.playSettings)) {
                        continue;
                    }

                    // @ts-ignore trust me bro
                    const val = e.playSettings[k];
                    if (val !== undefined) {
                        // @ts-ignore trust me bro
                        this.playSettings[k] = val;
                    }
                }
            }

            if (e.setOscilatorSignal) {
                const [id, inputs] = e.setOscilatorSignal;
                const osc = this.getOrCreatePlayingOscillator(id);

                osc.inputs = inputs;
                osc.state.awakeTime = 0;

                this.giveUserOwnership(osc);
            }

            if (e.clearAllOscilatorSignals) {
                for (const [, osc] of this.playingOscillators) {
                    osc.inputs.signal = 0;
                }
            }

            if (e.playSample) {
                const [id, inputs] = e.playSample;
                const osc = this.getOrCreatePlayingSample(id);

                osc.inputs = inputs;
                osc.state.sampleIdx = 0;

                this.giveUserOwnership(osc);
            }

            if (e.scheduleKeys !== undefined) {
                const trackPlayback = this.trackPlayback;
                this.stopPlayingScheduledKeys();
                if (e.scheduleKeys !== null && e.scheduleKeys.length > 0) {
                    trackPlayback.scheduleKeys = e.scheduleKeys;
                    trackPlayback.isPaused = false;
                    trackPlayback.scheduledPlaybackTime = 0;
                    trackPlayback.scheduledPlaybackCurrentIdx = 0;
                }
            }

            if (e.scheduleKeysVolume !== undefined) {
                this.trackPlayback.scheduledKeysVolume = e.scheduleKeysVolume;
            }

            if (e.setAllSamples) {
                this.allSamples = e.setAllSamples;
            }
        }
    }

    registerProcessor("dsp-loop", DSPLoop);
}
