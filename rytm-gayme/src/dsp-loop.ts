const OSC_GAIN_AWAKE_THRESHOLD = 0.001;

function max(a: number, b: number) {
    return a > b ? a : b;
}

function moveTowards(a: number, b: number, maxDelta: number) {
    if (Math.abs(a - b) < maxDelta) return b;

    if (a > b) {
        return a - maxDelta;
    }

    return a + maxDelta;
}

function lerp(a: number, b: number, t: number) {
    return a + (b - a) * t;
}

function clamp(val: number, min: number, max: number) {
    if (val < min) return min;
    if (val > max) return max;
    return val;
}

type SetValueArg = { value: number };
type SetSignalArg = { oscillatorIndex: number; value: number };

type OscillatorSynth = {
    t: 0;
    signal: number;
    prevSignal: number;
    awakeTime: number;
    phase: number;
    gain: number;
    frequency: number;
};

type OscillatorFile = {
    t: 1;
    signal: number;
    samples: number[];
    sample: number;
    prevSignal: number;
};

type Oscillator = OscillatorSynth | OscillatorFile;


type DspLoopMessage = {
    playSettings?: Partial<DSPPlaySettings>;
    oscillators?: Oscillator[];
    setSignal?: [number, number];
};

function updateOscillatorSynth(osc: OscillatorSynth, s: DSPPlaySettings) {
    const {
        attack,
        decay,
        sustain,
        sustainVolume
    } = s;
    // frequency rotations per second
    osc.phase += osc.frequency / sampleRate;
    osc.phase %= 3.0;

    if (osc.signal || osc.gain > OSC_GAIN_AWAKE_THRESHOLD) {
        osc.awakeTime += 1 / sampleRate;
    }

    if (osc.signal) {
        if (osc.awakeTime <= attack) {
            osc.gain = moveTowards(osc.gain, 1, (1 / attack) / sampleRate);
        } else {
            osc.gain = moveTowards(osc.gain, sustainVolume, (1 / sustain) / sampleRate);
        }
    } else {
        osc.gain = moveTowards(osc.gain, 0, (1 / decay) / sampleRate);
    }
}

function updateOscillatorFile(osc: OscillatorFile, _s: DSPPlaySettings) {
    if (!osc.prevSignal && osc.signal) {
        osc.sample = 0;
    }
    osc.prevSignal = osc.signal;

    if (osc.sample < osc.samples.length) {
        osc.sample += 1;
    }
}

function getOscillatorValueSynth(osc: OscillatorSynth) {
    // this is supposed to sound like a piano.         

    // main harmonic
    let s0 = Math.sin(osc.phase * Math.PI * 2.0);

    // side harmonics
    let sm2 = Math.sin(osc.phase * Math.PI * 2.0 / 3);
    let sm1 = Math.sin(osc.phase * Math.PI * 2.0 / 2);
    let s1 = Math.sin(osc.phase * Math.PI * 2.0 * 2);
    let s2 = Math.sin(osc.phase * Math.PI * 2.0 * 3);

    // TODO: can be a function of osc.frequency
    let m2 = 0.02;
    let m1 = 0.05;
    let m0 = 1;

    return osc.gain * (
        sm2 * m2 +
        sm1 * m1 +
        s0 * m0 +
        s1 * m1 +
        s2 * m2
    ) / (m2 + m2 + m1 + m1 + m0);
}

function getOscillatorValueFile(osc: OscillatorFile) {
    if (osc.sample >= osc.samples.length) {
        return 0;
    }

    return osc.samples[osc.sample];
}


function getOscillatorValue(osc: Oscillator) {
    if (osc.t === 0) {
        return getOscillatorValueSynth(osc);
    } else {
        return getOscillatorValueFile(osc);
    }
}

function updateOscillator(osc: Oscillator, s: DSPPlaySettings) {
    if (osc.t === 0) {
        updateOscillatorSynth(osc, s);
    } else {
        updateOscillatorFile(osc, s);
    }
}

function checkOscillatorAwakeSynth(osc: OscillatorSynth) {
    const hasGain = osc.gain > OSC_GAIN_AWAKE_THRESHOLD;
    const hasSignal = osc.signal;

    if (!hasGain && hasSignal) {
        // reset the phase to avoid discontinuities
        osc.phase = 0;
    }

    return hasGain || hasSignal;
}

function checkOscillatorAwakeFile(osc: OscillatorFile) {
    const hasSignal = osc.signal;
    const hasGain = osc.sample != 0;
    if (!hasGain && hasSignal) {
        // reset the phase to avoid discontinuities
        osc.sample = 0;
    }

    return hasGain || hasSignal;
}

function checkOscillatorAwake(osc: Oscillator) {
    if (osc.t === 0) {
        return checkOscillatorAwakeSynth(osc);
    } else {
        return checkOscillatorAwakeFile(osc);
    }
}



type DSPPlaySettings = {
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
    oscillators: Oscillator[] = [];
    playingOscillatorsContinuousCount = 0;

    constructor() {
        super();
        this.port.onmessage = (e) => {
            this.onMessage(e.data);
        };
    }


    processSample() {
        let sample = 0;
        let count = 0;
        for (let i = 0; i < this.oscillators.length; i++) {
            const osc = this.oscillators[i];

            if (!checkOscillatorAwake(osc)) continue;

            updateOscillator(osc, this.playSettings);

            sample += getOscillatorValue(osc);
            count += 1;
        }

        // This number must not suddenly change, else our signal will have a discontinuity.
        // This discontinuity can be heard as a 'click' sound and is super hard to debug.
        // Another synth project of mine still has this bug. I didn't find it till now lmao
        this.playingOscillatorsContinuousCount = moveTowards(this.playingOscillatorsContinuousCount, count, 1000 / sampleRate)

        return 10 * sample / max(1, this.playingOscillatorsContinuousCount);
        // return 0.1 * sample;
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

        // this.port.postMessage({ samples: output[0] });
        return true;
    }

    onMessage(e: DspLoopMessage) {
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
        if (e.oscillators) {
            this.oscillators = e.oscillators;
        }
        if (e.setSignal) {
            const [idx, val] = e.setSignal;
            const osc = this.oscillators[idx];
            osc.signal = val;
            if (osc.t === 0) {
                osc.awakeTime = 0;
            }
        }
    }
}

registerProcessor("dsp-loop", DSPLoop);
