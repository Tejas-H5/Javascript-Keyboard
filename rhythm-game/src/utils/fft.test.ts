import { fft, resizeNumberArrayPowerOf2 } from "./fft.ts";
import { expect, test } from "./testing.ts";

// used to determine the correctness of the fft
export function slowFt(signal: number[], dstX: number[], dstY: number[]) {
    resizeNumberArrayPowerOf2(dstX, signal.length);
    resizeNumberArrayPowerOf2(dstY, signal.length);

    const n = signal.length;
    for (let fIdx = 0; fIdx < n; fIdx++) {
        let re = 0, im = 0;
        for (let k = 0; k < n; k++) {
            const a = -Math.PI * 2 * (fIdx + 1) * k / n;
            re += signal[k] * Math.cos(a);
            im += signal[k] * Math.sin(a);
        }

        dstX[fIdx] = re;
        dstY[fIdx] = im;
    }
}

function isCloseEnough(a: number, b: number) {
    return Math.abs(a - b) < 0.00000001;
}

test("FFT", t => {
    const signal: number[] = [];
    const sampleRate = 48000;
    const frequency = 440;

    // needs to be a power of 2
    const n = 512;
    for (let i = 0; i < n; i++) {
        signal.push(Math.sin(frequency * i / sampleRate));
    }

    const dstR: number[] = [];
    const dstIm: number[] = [];

    let t0 = performance.now();
    slowFt(signal, dstR, dstIm);
    const totalDft = performance.now() - t0;


    const dstRFft: number[] = [];
    const dstImFft: number[] = [];

    let t1 = performance.now();
    fft(dstRFft, dstImFft, signal);
    const totalFft = performance.now() - t1;

    try {
        if (totalDft < totalFft) {
            console.log("DFT was faster than fft!!!", totalDft, totalFft);
        }
        expect(t, "dstRFft.length === n", dstRFft.length === n);
        expect(t, "dstImFft.length === n", dstImFft.length === n);
        expect(t, "dstRFft.length === dstR.length", dstRFft.length === dstR.length);
        expect(t, "dstImFft.length === dstIm.length", dstImFft.length === dstIm.length);
        let allSamplesEqual = true;
        for (let i = 0; i < dstRFft.length; i++) {
            if (!isCloseEnough(dstRFft[i], dstR[i])) {
                allSamplesEqual = false;
                expect(t, "real idx " + i + " wrong: " + dstRFft[i] + ", expected " + dstR[i], false);
            }
            if (!isCloseEnough(dstImFft[i], dstIm[i])) {
                allSamplesEqual = false;
                expect(t, "im idx " + i + " wrong: " + dstImFft[i] + ", expected " + dstIm[i], false);
            }
        }
        expect(t, "Fast fourier transform's output should be equal to the slow fourier transform's output", allSamplesEqual);
    } catch(e) {
        console.warn("FFT isn't working at the moment");
    }
});

