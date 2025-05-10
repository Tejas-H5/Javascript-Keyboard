// Goat FT video: https://www.youtube.com/watch?v=spUNpyF58BY
// FFT: https://en.wikipedia.org/wiki/Cooley%E2%80%93Tukey_FFT_algorithm

import { newTimelineItemMeasure } from "src/state/sequencer-chart";
import { assert } from "./assert";

// An internal function we use to determine the correctness of the fft
function dft( signal: number[], dstX: number[], dstY: number[]) {
    resizeNumberArray(dstX, signal.length);
    resizeNumberArray(dstY, signal.length);

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

type Imaginary = {
    re: number;
    im: number;
};

function newIm(): Imaginary {
    return { re: 0, im: 0 };
}


export function fft(signal: number[], dstFreqRe: number[], dstFreqIm: number[]) {
    // TODO: assert length is pow of 2
    
    resizeNumberArray(dstFreqRe, signal.length);
    resizeNumberArray(dstFreqIm, signal.length);

    fftInternal(
        signal, 0, dstFreqRe.length, 1,
        dstFreqRe, dstFreqIm, 0,
    );

    dstFreqRe.reverse();
    dstFreqIm.reverse();
    for (let i = 0; i < dstFreqRe.length; i++) {
        dstFreqIm[i] = -dstFreqIm[i];
    }
}

// Source https://en.wikipedia.org/wiki/Cooley%E2%80%93Tukey_FFT_algorithm
// This is just the pseudocode. I struggled to figure out the recurrence myself, but
// in the process of trying, the pseudocode became understandable enough that I could just copy it.
function fftInternal(
    signal: number[], signalIdx: number, len: number, stride: number,
    dstFreqRe: number[], dstFreqIm: number[], freqStartIdx: number, 
) {
    // TODO: assert pow of 2
    // TODO: rwrite to not literally use recursion

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

        const cRe =  Math.cos(2 * Math.PI * k / len);
        const cIm = -Math.sin(2 * Math.PI * k / len);

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

export function fftOld(signal: number[], dstFreqRe: number[], dstFreqIm: number[]) {
    // TODO: assert length is pow of 2
    
    resizeNumberArray(dstFreqRe, signal.length);
    resizeNumberArray(dstFreqIm, signal.length);

    const evenResult = newIm();
    const oddResult = newIm();

    const n = signal.length;
    let fIdx = 1

    // TODO: actually get the recursion part working.
    for (let windowLen = n / 2; windowLen <= n / 2; windowLen *= 2) {
        const count = n / windowLen;

        for (; fIdx <= windowLen; fIdx++) {
            // even
            fftInternal2(signal, fIdx, n, count, 0, evenResult);
            let evenRe = evenResult.re;
            let evenIm = evenResult.im;

            // odd 
            fftInternalOdd(signal, fIdx, n, count, 1, oddResult);
            let oddRe = oddResult.re;
            let oddIm = oddResult.im;

            dstFreqRe[fIdx - 1] = evenRe + oddRe;
            dstFreqIm[fIdx - 1] = evenIm + oddIm;

            let sign = 1;
            for (let offset = windowLen; offset < n; offset += windowLen) {

                sign = -sign;

                dstFreqRe[fIdx - 1 + offset] = evenRe + sign * oddRe;
                dstFreqIm[fIdx - 1 + offset] = evenIm + sign * oddIm;
            }

            continue;
        }

        continue;
    }

}

function fftInternal2(
    signal: number[],
    fIdx: number,
    n: number,
    stride: number,
    offset: number,
    dst: Imaginary,
) {
    let re = 0, im = 0;
    for (let k = 0; k < n; k += stride) {
        const a = Math.PI * 2 * fIdx * k / n;
        re += signal[k + offset] * Math.cos(a);
        im += signal[k + offset] * -Math.sin(a);
    }

    dst.re = re;
    dst.im = im;
}

function fftInternalOdd(
    signal: number[],
    fIdx: number,
    n: number,
    stride: number,
    offset: number,
    dst: Imaginary,
) {
    fftInternal2(signal, fIdx, n, stride, offset, dst);

    const a = Math.PI * 2 * fIdx / n;
    const cRe = Math.cos(a);
    const cIm = -Math.sin(a);


    const tempRe = imMulRe(cRe, cIm, dst.re, dst.im);
    const tempIm = imMulIm(cRe, cIm, dst.re, dst.im);

    dst.re = tempRe;
    dst.im = tempIm;
}

function imMulRe(a: number, b: number, c: number, d: number): number {
    const result = (a * c) - (b * d);
    return result;
}

function imMulIm(a: number, b: number, c: number, d: number): number {
    const result = (a * d) + (b * c);
    return result;
}

export function resizeNumberArray(arr: number[], len: number) {
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


// TODO: move tests elsewhere
(() => {
    const signal: number[] = [];
    const sampleRate = 48000;
    const frequency = 440;

    // needs to be a power of 2
    const n = 4096;
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

    // if(0)
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
    console.log("PASSED");
    console.log("dft: " + totalDft + ", fft: " + totalFft);

})() // debugger needs function scope to work lmao.

