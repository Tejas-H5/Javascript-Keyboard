export function min(a: number, b: number): number {
    return a < b ? a : b;
}

export function max(a: number, b: number): number {
    return a > b ? a : b;
}

export function moveTowards(a: number, b: number, maxDelta: number) {
    if (a < b) {
        a += maxDelta;
        if (a > b) a = b;
    } else if (a > b) {
        a -= maxDelta;
        if (a < b) a = b;
    }

    return a;
}

export function lerp(a: number, b: number, t: number) {
    return a + (b - a) * t;
}

export function lerp01(a: number, b: number, t: number) {
    return a + (b - a) * clamp(t, 0, 1);
}

export function inverseLerp(value: number, start: number, end: number) {
    if (start === end) {
        return value;
    }

    return (value - start) / (end - start);
}

// This order might be easier to remember?
export function inverseLerp2(start: number, value: number, end: number) {
    if (start === end) {
        return value;
    }

    return (value - start) / (end - start);
}

export function clamp(val: number, min: number, max: number) {
    if (val < min) return min;
    if (val > max) return max;
    return val;
}

export function gridsnapRound(val: number, gridsize: number): number {
    return Math.round(val / gridsize) * gridsize;
}

export function sqrMag(x: number, y: number): number {
    return x * x + y * y;
}

export function mag(x: number, y: number): number {
    return sqrMag(x, y) ** 0.5;
}

/////////////////////
// NOTE: the utils below are specific to this game.

export function within(a: number, b: number, tolerance: number) {
    return Math.abs(a - b) < tolerance;
}

export function lessThan(a: number, b: number, tolerance: number) {
    return a < b - tolerance;
}

export function greaterThan(a: number, b: number, tolerance: number) {
    return a > b + tolerance;
}

export function lessThanOrEqualTo(a: number, b: number, tolerance: number) {
    return a < b + tolerance;
}

export function greaterThanOrEqualTo(a: number, b: number, tolerance: number) {
    return a > b - tolerance;
}

export function normalizeNegativeOneOneF32(output: Float32Array) {
    let maxSample = 0;
    for (let i = 0; i < output.length; i++) {
        maxSample = max(maxSample, Math.abs(output[i]));
    }

    for (let i = 0; i < output.length; i++) {
        output[i] = output[i] / maxSample;
    }
}

export function arrayMax(output: number[] | Float32Array) {
    let maxSample = output[0];
    for (let i = 1; i < output.length; i++) {
        maxSample = max(maxSample, output[i]);
    }

    return maxSample;
}

export function arrayMin(output: number[] | Float32Array) {
    let minSample = output[0];
    for (let i = 1; i < output.length; i++) {
        minSample = min(minSample, output[i]);
    }

    return minSample;
}

export function derivative(src: number[] | Float32Array, dst: number[] | Float32Array) {
    for (let i = 1; i < dst.length; i++) {
        dst[i] = src[i] - src[i - 1];
    }
    dst[0] = dst[1];
}

// Use this to compute the actual angle delta. 
// If the angles are more than 2 rotations apart, this won't work.
export function deltaAngle(to: number, from: number) {
    const tau = 2 * Math.PI;
    let delta = to - from;
    const absDelta = Math.abs(delta);
    if (Math.abs(delta + tau) < absDelta) {
        delta = delta + tau;
    } else if (Math.abs(delta - tau) < absDelta) {
        delta = delta - tau;
    }
    return delta;
}
