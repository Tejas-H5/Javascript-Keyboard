// Goat FT video: https://www.youtube.com/watch?v=spUNpyF58BY

import { assert } from "./assert";

export function dft( signal: number[], dstX: number[], dstY: number[]) {
    resizeNumberArray(dstX, signal.length);
    resizeNumberArray(dstY, signal.length);

    const n = signal.length;
    for (let fIdx = 0; fIdx < n; fIdx++) {
        let x = 0, y = 0;
        for (let i = 0; i < n; i++) {
            const a = Math.PI * 2 * (fIdx + 1) * i / n;
            x += signal[i] *  Math.cos(a);
            y += signal[i] * -Math.sin(a);
        }

        dstX[fIdx] = x;
        dstY[fIdx] = y;
    }
}

export function fft(signal: number[], dstRe: number[], dstIm: number[]) {
    resizeNumberArray(dstRe, signal.length);
    resizeNumberArray(dstIm, signal.length);

    const n = signal.length;
    for (let fIdx = 1; fIdx <= n / 2; fIdx++) {
        let evenRe = 0, evenIm = 0;

        // even
        for (let k = 0; k < n; k += 2) {
            const a = Math.PI * 2 * fIdx * k / n;
            evenRe += signal[k] *  Math.cos(a);
            evenIm += signal[k] * -Math.sin(a);
        }

        // odd
        let oddRe = 0, oddIm = 0;
        for (let k = 0; k < n; k += 2) {
            const a = Math.PI * 2 * fIdx * k / n;
            oddRe +=  signal[k + 1] * Math.cos(a);
            oddIm += -signal[k + 1] * Math.sin(a);
        }

        const a = Math.PI * 2 * fIdx / n;
        const cRe =  Math.cos(a);
        const cIm = -Math.sin(a);
        
        const tempRe = imMulRe(cRe, cIm, oddRe, oddIm);
        const tempIm = imMulIm(cRe, cIm, oddRe, oddIm);
        oddRe = tempRe;
        oddIm = tempIm;

        const halfN =  n / 2;

        dstRe[fIdx - 1] = evenRe + oddRe;
        dstIm[fIdx - 1] = evenIm + oddIm;

        dstRe[fIdx - 1 + halfN] = evenRe - oddRe;
        dstIm[fIdx - 1 + halfN] = evenIm - oddIm;
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

export function resizeNumberArray(arr: number[], len: number) {
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

    console.log("PASSED, dft: " + totalDft + ", fft: " + totalFft);
})() // debugger needs function scope to work lmao.

