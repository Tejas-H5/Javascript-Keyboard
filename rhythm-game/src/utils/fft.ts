import { assert } from "./assert";

// Goat FT video: https://www.youtube.com/watch?v=spUNpyF58BY
// FFT: https://en.wikipedia.org/wiki/Cooley%E2%80%93Tukey_FFT_algorithm
// This is derived from the pseudocode. I struggled to figure out the recurrence myself, but
// in the process of trying, the pseudocode became understandable enough that I could just copy it.
export function fft(dstFreqRe: number[], dstFreqIm: number[], signal: number[]) {
    resizeNumberArrayPowerOf2(dstFreqRe, signal.length);
    resizeNumberArrayPowerOf2(dstFreqIm, signal.length);

    assert(dstFreqRe.length === dstFreqIm.length);
    assert(isPowerOfTwo(dstFreqRe.length))
    assert(isPowerOfTwo(dstFreqIm.length))

    fftInternal(
        signal, 0, dstFreqRe.length, 1,
        dstFreqRe, dstFreqIm, 0,
    );

    // TODO: figure out why the output needs to be reversed xD
    dstFreqRe.reverse();
    dstFreqIm.reverse();

    // starnge. [0] === [n - 1 - 1]. so it isn't 100% symmetric? is there a one-ff error in our fft?
    // identical to our dft though.
    // for (let i = 1; i < dstFreqRe.length; i++) {
    //     if (!areClose(dstFreqRe[i-1], dstFreqRe[dstFreqRe.length - 1 - i])) {
    //         console.log("fft not symmetric:", i, "!==", dstFreqRe.length - 1 - i);
    //     }
    // }
    // console.log(dstFreqRe[dstFreqRe.length - 1]);
    // console.log(dstFreqRe[dstFreqRe.length - 1 - 1]);
}

export function fftToReal(
    rDst: number[],
    re: number[], im: number[],
) {
    assert(re.length === im.length);
    rDst.length = re.length / 2;

    for (let i = 0; i < rDst.length; i++) {
        const rVal = re[i];
        const imVal = im[i];
        const mag = Math.sqrt(rVal * rVal + imVal * imVal);
        rDst[i] = mag;
    }
}

function isPowerOfTwo(v: number) {
    return !(v & (v - 1));
}

function get(arr: number[], i: number) {
    if (i >= arr.length) return 0;
    return arr[i];
}

function fftInternal(
    signal: number[], signalIdx: number, len: number, stride: number,
    dstFreqRe: number[], dstFreqIm: number[], freqStartIdx: number, 
) {
    // TODO: write to not literally use recursion (warning: last time I tried, it was HARD! Wasn't able to do it) 
    // (two times I have tried and failed to do this now)

    const halfLen = len / 2;

    if (len === 1) {
        dstFreqRe[freqStartIdx] = get(signal, signalIdx);
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

        const a = 2 * Math.PI * k / len;
        const cRe = Math.cos(a);
        const cIm = Math.sin(a);

        const dstOddRe =  dstFreqRe[freqStartIdx + k + halfLen];
        const dstOddIm =  dstFreqIm[freqStartIdx + k + halfLen];
        const oddRe = complexMulRe(cRe, cIm, dstOddRe, dstOddIm);
        const oddIm = complexMulIm(cRe, cIm, dstOddRe, dstOddIm);

        dstFreqRe[freqStartIdx + k] = evenRe + oddRe;
        dstFreqIm[freqStartIdx + k] = evenIm + oddIm;
        dstFreqRe[freqStartIdx + k + halfLen] = evenRe - oddRe;
        dstFreqIm[freqStartIdx + k + halfLen] = evenIm - oddIm;
    }
}

function complexMulRe(a: number, b: number, c: number, d: number): number {
    const result = (a * c) - (b * d);
    return result;
}

function complexMulIm(a: number, b: number, c: number, d: number): number {
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
    while (power > 0) {
        len = len << 1;
        power--
    }

    if (len < arr.length) {
        arr.length = len;
    } else if (arr.length < len) {
        while(arr.length < len) {
            arr.push(0); 
        }
    }
}
