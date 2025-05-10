import { assert } from "./assert";

// An internal function we use to determine the correctness of the fft
function dft( signal: number[], dstX: number[], dstY: number[]) {
    resizeNumberArrayPowerOf2(dstX, signal.length);
    resizeNumberArrayPowerOf2(dstY, signal.length);

    const n = signal.length;
    for (let fIdx = 0; fIdx < n; fIdx++) {
        let re = 0, im = 0;
        for (let k = 0; k < n; k++) {
            const a = Math.PI * 2 * (fIdx + 1) * k / n;
            re += signal[k] *  Math.cos(a);
            im += signal[k] * -Math.sin(a);
        }

        dstX[fIdx] = re;
        dstY[fIdx] = im;
    }
}

// Goat FT video: https://www.youtube.com/watch?v=spUNpyF58BY
// FFT: https://en.wikipedia.org/wiki/Cooley%E2%80%93Tukey_FFT_algorithm
// This is derived from the pseudocode. I struggled to figure out the recurrence myself, but
// in the process of trying, the pseudocode became understandable enough that I could just copy it.
export function fft(signal: number[], dstFreqRe: number[], dstFreqIm: number[]) {
    // TODO: assert length is pow of 2
    
    resizeNumberArrayPowerOf2(dstFreqRe, signal.length);
    resizeNumberArrayPowerOf2(dstFreqIm, signal.length);

    fftInternal(
        signal, 0, dstFreqRe.length, 1,
        dstFreqRe, dstFreqIm, 0,
    );

    // TODO: figure out why the output needs to be reversed xD
    dstFreqRe.reverse();
    dstFreqIm.reverse();
}

function isPowerOfTwo(v: number) {
    return !(v & (v - 1));
}

function fftInternal(
    signal: number[], signalIdx: number, len: number, stride: number,
    dstFreqRe: number[], dstFreqIm: number[], freqStartIdx: number, 
) {
    assert(dstFreqRe.length === dstFreqIm.length);
    assert(isPowerOfTwo(dstFreqRe.length))
    assert(isPowerOfTwo(dstFreqIm.length))

    // TODO: write to not literally use recursion (warning: last time I tried, it was HARD! Wasn't able to do it)

    const halfLen = len / 2;

    if (len === 1) {
        dstFreqRe[freqStartIdx] = signal[signalIdx];
        dstFreqIm[freqStartIdx] = 0;
        return;
    }

    fftInternal(
        signal, signalIdx, halfLen, 2 * stride,
        dstFreqRe, dstFreqIm, freqStartIdx,
    );
    fftInternal(
        signal, signalIdx + stride, halfLen, 2 * stride,
        dstFreqRe, dstFreqIm, freqStartIdx + halfLen,
    );

    for (let k = 0; k < halfLen; k++) {
        // combine DFTs of two halves into full DFT
        const evenRe = dstFreqRe[freqStartIdx + k];
        const evenIm = dstFreqIm[freqStartIdx + k];

        if (freqStartIdx + k >= dstFreqRe.length) {
            throw new Error("bro");
        }

        const cRe = Math.cos(2 * Math.PI * k / len);
        const cIm = Math.sin(2 * Math.PI * k / len);

        const dstOddRe =  dstFreqRe[freqStartIdx + k + halfLen];
        const dstOddIm =  dstFreqIm[freqStartIdx + k + halfLen];
        const oddRe = imMulRe(cRe, cIm, dstOddRe, dstOddIm);
        const oddIm = imMulIm(cRe, cIm, dstOddRe, dstOddIm);

        dstFreqRe[freqStartIdx + k] = evenRe + oddRe;
        dstFreqIm[freqStartIdx + k] = evenIm + oddIm;
        dstFreqRe[freqStartIdx + k + halfLen] = evenRe - oddRe;
        dstFreqIm[freqStartIdx + k + halfLen] = evenIm - oddIm;
    }
}

function imMulRe(a: number, b: number, c: number, d: number): number {
    const result = (a * c) - (b * d);
    return result;
}

function imMulIm(a: number, b: number, c: number, d: number): number {
    const result = (a * d) + (b * c);
    return result;
}

export function resizeNumberArrayPowerOf2(arr: number[], len: number) {
    let power = 0;
    while (len) {
        len = len >> 1;
        power++;
    }
    power--;
    len = 1;
    while (power) {
        len = len << 1;
        power--
    }

    if (len < arr.length) {
        arr.length = len;
    } else if (len > arr.length) {
        while(arr.length < len) arr.push(0);
    }
}

// Testing in production.
// TODO: move tests elsewhere
(() => {
    const signal: number[] = [];
    const sampleRate = 48000;
    const frequency = 440;

    // needs to be a power of 2
    const n = 512;
    // const n = 16;
    for (let i = 0; i < n; i++) {
        signal.push(Math.sin(frequency * i / sampleRate));
    }

    const dstR: number[] = [];
    const dstIm: number[] = [];

    let t0 = performance.now();
    dft(signal, dstR, dstIm,);
    const totalDft = performance.now() - t0;


    const dstRFft: number[] = [];
    const dstImFft: number[] = [];

    let t1 = performance.now();
    fft(signal, dstRFft, dstImFft);
    const totalFft = performance.now() - t1;

    try {
        if (totalDft < totalFft) {
            console.log("DFT was faster than fft!!!", totalDft, totalFft);
        }
        assert(dstRFft.length === n);
        assert(dstImFft.length === n);
        assert(dstRFft.length === dstR.length);
        assert(dstImFft.length === dstIm.length);
        for (let i = 0; i < dstRFft.length; i++) {
            if (!(Math.abs(dstRFft[i] - dstR[i]) < 0.000001)) {
                throw new Error("real idx " + i + " wrong: " + dstRFft[i] + ", expected " + dstR[i]);
            }
            if (!(Math.abs(dstImFft[i] - dstIm[i]) < 0.000001)) {
                throw new Error("im idx " + i + " wrong: " + dstImFft[i] + ", expected " + dstIm[i]);
            }
        }
    } catch(e) {
        console.warn("FFT isn't working at the moment");
    }
})() // debugger needs function scope to work lmao.

