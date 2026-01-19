// t is in 'revolutions' or 'turns' instead of instead of radians. 0 - 1 is 1 full turn of the circle.
// It's only useful for DSP related things though.

export function sin(t: number) {
    return Math.sin(t * Math.PI * 2);
}

export function cos(t: number) {
    return Math.cos(t * Math.PI * 2);
}

export function sawtooth(t: number) {
    return 2 * (t % 1) - 1;
}

export function triangle(t: number) {
    if (t < 0) t = -t;
    t %= 1;
    let result;
    if (t > 0.5) {
        result = 2 - 2 * t;
    } else {
        result = 2 * t;
    }

    return 2 * (result - 0.5);
}

export function square(t: number) {
    t = (t * 2) % 2;
    return t > 1 ? -1 : 1;
}

export function step(t: number) {
    return Math.floor(t) % 2;
}

export function absMin(a: number, b: number) {
    if (Math.abs(a) > Math.abs(b)) {
        return b;
    }
    return a;
}

export function absMax(a: number, b: number) {
    if (Math.abs(a) < Math.abs(b)) {
        return b;
    }
    return a;
}
