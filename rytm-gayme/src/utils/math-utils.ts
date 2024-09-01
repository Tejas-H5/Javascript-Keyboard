
export function max(a: number, b: number) {
    return a > b ? a : b;
}

export function moveTowards(a: number, b: number, maxDelta: number) {
    if (Math.abs(a - b) < maxDelta) return b;

    if (a > b) {
        return a - maxDelta;
    }

    return a + maxDelta;
}

export function lerp(a: number, b: number, t: number) {
    return a + (b - a) * t;
}

export function clamp(val: number, min: number, max: number) {
    if (val < min) return min;
    if (val > max) return max;
    return val;
}
