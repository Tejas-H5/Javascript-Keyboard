const OSC_GAIN_AWAKE_THRESHOLD = 0.001;
const OSC_T_SYNTH = 0;
const OSC_T_FILE = 1;

function max(a, b) {
    return a > b ? a : b;
}

function moveTowards(a, b, maxDelta) {
    if (Math.abs(a - b) < maxDelta) return b;

    if (a > b) {
        return a - maxDelta;
    }

    return a + maxDelta;
}

function lerp(a, b, t) {
    return a + (b - a) * t;
}

function clamp(val, min, max) {
    if (val < min) return min;
    if (val > max) return max;
    return val;
}

class DSPLoop extends AudioWorkletProcessor {
    constructor() {
        super();

        this.port.onmessage = this.onMessage;
        this.inputObject = {
            deltaTime: 1 / sampleRate,  // time elapsed between two samples
            frequency: 0,               // the current oscillator's frequency
        }
        this.attack = 50
        this.decay = 10
        this.sustain = 1
        this.sustainVolume = 1
        this.oscillators = [{
            awakeTime: 0,
            signal: 0,
            phase: 0,
            gain: 0,
            frequency: 441,
        }]
        this.playingOscillatorsContinuousCount = 0;

        this.port.messageDispatch = {
            setAttack: ({ value }) => this.attack = value,
            setDecay: ({ value }) => this.decay = value,
            setSustainVolume: ({ value }) => this.sustainVolume = value,
            setSustainTime: ({ value }) => this.sustain = value,
            setSignal: ({ oscillatorIndex, value }) => {
                this.oscillators[oscillatorIndex].prevSignal = this.oscillators[oscillatorIndex].signal;
                this.oscillators[oscillatorIndex].signal = value;
                this.oscillators[oscillatorIndex].awakeTime = 0;
            },
            setOscillators: ({ value }) => {
                this.oscillators = value;
                console.log("oscillators set");
            }
        }
    }

    updateOscillatorSynth(osc) {
        // frequency rotations per second
        osc.phase += osc.frequency / sampleRate;
        osc.phase %= 3.0;

        if (osc.signal || osc.gain > OSC_GAIN_AWAKE_THRESHOLD) {
            osc.awakeTime += 1 / sampleRate;
        }

        if (osc.signal) {
            if (osc.awakeTime <= this.attack) {
                osc.gain = moveTowards(osc.gain, 1, (1 / this.attack) / sampleRate);
            } else {
                osc.gain = moveTowards(osc.gain, this.sustainVolume, (1 / this.sustain) / sampleRate);
            }
        } else {
            osc.gain = moveTowards(osc.gain, 0, (1 / this.decay) / sampleRate);
        }
    }

    updateOscillatorFile(osc) {
        if (!osc.prevSignal && osc.signal) {
            osc.sample = 0;
        }
        osc.prevSignal = osc.signal;

        if (osc.sample < osc.samples.length) {
            osc.sample += 1;
        }
    }

    updateOscillator(osc) {
        if (osc.t === OSC_T_SYNTH) {
            this.updateOscillatorSynth(osc);
        } else if (osc.t === OSC_T_FILE) {
            this.updateOscillatorFile(osc);
        }
    }

    getOscillatorValueSynth(osc) {
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

    getOscillatorValueFile(osc) {
        if (osc.sample >= osc.samples.length) {
            return 0;
        }
        
        return osc.samples[osc.sample];
    }

    getOscillatorValue(osc) {
        if (osc.t === OSC_T_SYNTH) {
            return this.getOscillatorValueSynth(osc);
        } else if (osc.t === OSC_T_FILE) {
            return this.getOscillatorValueFile(osc);
        }

        return 0;
    }

    checkOscillatorAwakeSynth(osc) {
        const hasGain = osc.gain > OSC_GAIN_AWAKE_THRESHOLD;
        const hasSignal = osc.signal;

        if (!hasGain && hasSignal) {
            // reset the phase to avoid discontinuities
            osc.phase = 0;
        }

        return hasGain || hasSignal;
    }

    checkOscillatorAwakeFile(osc) {
        const hasSignal = osc.signal;
        const hasGain = osc.sample != 0;
        if (!hasGain && hasSignal) {
            // reset the phase to avoid discontinuities
            osc.sample = 0;
        }

        return hasGain || hasSignal;
    }

    checkOscillatorAwake(osc) {
        if (osc.t === OSC_T_SYNTH) {
            return this.checkOscillatorAwakeSynth(osc);
        } else if (osc.t === OSC_T_FILE) {
            return this.checkOscillatorAwakeFile(osc);
        }
    }

    processSample() {
        let sample = 0;
        let count = 0;
        for (let i = 0; i < this.oscillators.length; i++) {
            const osc = this.oscillators[i];

            if (!this.checkOscillatorAwake(osc)) continue;

            this.updateOscillator(osc);

            sample += this.getOscillatorValue(osc);
            count += 1;
        }

        // This number must not suddenly change, else our signal will have a discontinuity.
        // This discontinuity can be heard as a 'click' sound and is super hard to debug.
        // Another synth project of mine still has this bug. I didn't find it till now lmao
        this.playingOscillatorsContinuousCount = moveTowards(this.playingOscillatorsContinuousCount, count, 1000 / sampleRate)

        return sample / max(1, this.playingOscillatorsContinuousCount);
        // return 0.1 * sample;
    }

    process(inputs, outputs, parameters) {
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

    onMessage(e) {
        this.messageDispatch[e.data.type](e.data.args);
    }
}

registerProcessor("dsp-loop", DSPLoop);
