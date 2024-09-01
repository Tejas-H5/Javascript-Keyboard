import { getSampleArray } from "./samples";
import { filterInPlace } from "./utils/array-utils";
import { max, moveTowards } from "./utils/math-utils";

const OSC_GAIN_AWAKE_THRESHOLD = 0.001;

type PlayingOscillator = {
    state: {
        prevSignal: number;
        awakeTime: number;
        phase: number;
        gain: number;
    };
    inputs: {
        frequency: number;
        signal: number;
    },
};

type PlayingSampleFile = {
    state: {
        prevSampleFile: string;
        sampleArray: number[];
        sampleIdx: number;
    };
    inputs: {
        // we don't want to transmit the massive array of samples across the wire every single time.
        sample: string;
    }
};


export type DspLoopMessage = 1337 | {
    playSettings?: Partial<DSPPlaySettings>;
    setOscilatorSignal?: [number, PlayingOscillator["inputs"]];
    playSample?: [number, PlayingSampleFile["inputs"]];
};


export type DspInfo = {
    currentlyPlaying: [number, number][];
}

// local machine btw 💀💀💀
export type DspLoopEventNotification = {
    currentlyPlaying?: DspInfo["currentlyPlaying"];
}

function updateOscillator(osc: PlayingOscillator, s: DSPPlaySettings) {
    const {
        attack,
        decay,
        sustain,
        sustainVolume
    } = s;

    const { inputs, state } = osc;

    // frequency rotations per second
    state.phase += inputs.frequency / sampleRate;
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

function updateSample(osc: PlayingSampleFile) {
    const { inputs, state } = osc;

    if (inputs.sample !== state.prevSampleFile) {
        state.prevSampleFile = inputs.sample;
        state.sampleArray = getSampleArray(inputs.sample);
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

    // TODO: can be a function of osc.frequency
    let m2 = 0.02;
    let m1 = 0.05;
    let m0 = 1;

    return state.gain * (
        sm2 * m2 +
        sm1 * m1 +
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


export type DSPPlaySettings = {
    attack: number;
    decay: number;
    sustain: number;
    sustainVolume: number;
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
    };
    playingOscillators: [number, PlayingOscillator][] = [];
    playingSamples: [number, PlayingSampleFile][] = [];
    playingOscillatorsContinuousCount = 0;

    constructor() {
        super();
        this.port.onmessage = (e) => {
            this.onMessage(e.data);
        };    
    }

    // Runs a whole lot, so it needs to be highly optimized
    processSample() {
        let sample = 0;
        let count = 0;

        // update oscilators
        {
            for (let i = 0; i < this.playingOscillators.length; i++) {
                const osc = this.playingOscillators[i][1];

                updateOscillator(osc, this.playSettings);

                sample += getOscillatorValue(osc);
                count += 1;
            }
        }

        // update samples
        {
            for (let i = 0; i < this.playingSamples.length; i++) {
                const sampleFile = this.playingSamples[i][1];

                updateSample(sampleFile);

                sample += getSampleFileValue(sampleFile);
                count += 1;
            }
        }

        // This number must not suddenly change, else our signal will have a discontinuity.
        // This discontinuity can be heard as a 'click' sound and is super hard to debug.
        // Another synth project of mine still has this bug. I didn't find it till now lmao
        this.playingOscillatorsContinuousCount = moveTowards(this.playingOscillatorsContinuousCount, count, 1000 / sampleRate)
        return 5 * sample / max(1, this.playingOscillatorsContinuousCount);
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

            lastCount == this.playingSamples.length;
            filterInPlace(this.playingSamples, (osc) => {
                return osc[1].state.sampleIdx !== osc[1].state.sampleArray.length;
            });
        }

        return true;
    }

    getPlayingSample(id: number): PlayingSampleFile {
        const idx = this.playingSamples.findIndex(o => o[0] === id);
        if (idx !== -1) {
            return this.playingSamples[idx][1];
        }

        const newSample: PlayingSampleFile = {
            state: { sampleIdx: 0, prevSampleFile: "", sampleArray: [] },
            inputs: { sample: "" }
        };
        this.playingSamples.push([id, newSample]);
        return newSample;
    }


    getPlayingOscillator(id: number): PlayingOscillator {
        const idx = this.playingOscillators.findIndex(o => o[0] === id);
        if (idx !== -1) {
            return this.playingOscillators[idx][1];
        }

        const newOsc: PlayingOscillator = {
            state: { prevSignal: 0, awakeTime: 0, phase: 0, gain: 0, },
            inputs: { frequency: 0, signal: 0, },
        };
        this.playingOscillators.push([id, newOsc]);
        return newOsc;
    }

    sendMessageBack(data: DspLoopEventNotification) {
        this.port.postMessage(data);
    }


    onMessage(e: DspLoopMessage) {
        if (e === 1337) {
            // this is the only way for the main thread to know this info :sad:
            const currentPlaybackSignals: [number, number][] = [];
            for (const [key, osc] of this.playingOscillators) {
                currentPlaybackSignals.push([key, max(osc.inputs.signal, osc.state.gain)]);
            }
            for (const [key, osc] of this.playingSamples) {
                currentPlaybackSignals.push([key, 1 - (osc.state.sampleIdx / osc.state.sampleArray.length)]);
            }

            this.sendMessageBack({ currentlyPlaying: currentPlaybackSignals });

            return;
        }

        if (e.playSettings) {
            for (const k in e.playSettings) {
                if (!(k in this.playSettings)) {
                    continue;
                }

                // @ts-ignore trust me bro
                const val = e.playSettings[k];
                if (val) {
                    // @ts-ignore trust me bro
                    this.playSettings[k] = val;
                }
            }
        }
        if (e.setOscilatorSignal) {
            const [ id, inputs ] = e.setOscilatorSignal;
            const osc = this.getPlayingOscillator(id);
            osc.inputs = inputs;
        }
        if (e.playSample) {
            const [ id, inputs ] = e.playSample;
            const osc = this.getPlayingSample(id);
            osc.inputs = inputs;
            osc.state.sampleIdx = 0;
        }
    }
}

registerProcessor("dsp-loop", DSPLoop);
