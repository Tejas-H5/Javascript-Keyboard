export type CssColor = {
    r: number; g: number; b: number; a: number;
    toCssString(aOverride?: number): string;
    toString(): string;
}

export function newColor(r: number, g: number, b: number, a: number): CssColor {
    return {
        r, g, b, a,
        toCssString(aOverride?: number) {
            const { r, g, b, a } = this;
            return `rgba(${Math.floor(r * 255)}, ${Math.floor(g * 255)}, ${Math.floor(b * 255)}, ${aOverride ?? a})`;
        },
        toString() {
            return this.toCssString();
        },
    };
}

// This one won't throw exceptions.
export function newColorFromHexOrUndefined(hex: string): CssColor | undefined {
    if (hex.startsWith("#")) {
        hex = hex.substring(1);
    }

    if (hex.length === 3 || hex.length === 4) {
        const r = hex[0];
        const g = hex[1];
        const b = hex[2];
        const a = hex[3] as string | undefined;

        return newColor(
            parseInt("0x" + r + r) / 255,
            parseInt("0x" + g + g) / 255,
            parseInt("0x" + b + b) / 255,
            a ? parseInt("0x" + a + a) / 255 : 1,
        );
    }

    if (hex.length === 6 || hex.length === 8) {
        const r = hex.substring(0, 2);
        const g = hex.substring(2, 4);
        const b = hex.substring(4, 6);
        const a = hex.substring(6);

        return newColor( 
            parseInt("0x" + r) / 255,
            parseInt("0x" + g) / 255,
            parseInt("0x" + b)/ 255,
            a ? parseInt("0x" + a) / 255 : 1,
        );
    }

    return undefined;
}

export function newColorFromHex(hex: string): CssColor {
    const col = newColorFromHexOrUndefined(hex);
    if (!col) {
        throw new Error("invalid hex: " + hex);
    }

    return col;
}

/**
 * Taken from https://gist.github.com/mjackson/5311256
 */
export function newColorFromHsv(h: number, s: number, v: number): CssColor {
    let r = 0, g = 0, b = 0;

    if (s === 0) {
        r = g = b = v; // achromatic
        return newColor(r, g, b, 1);
    }

    function hue2rgb(p: number, q: number, t: number) {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
    }

    var q = v < 0.5 ? v * (1 + s) : v + s - v * s;
    var p = 2 * v - q;

    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);

    return newColor(r, g, b, 1);
}

function lerp(a: number, b: number, factor: number) {
    if (factor < 0) {
        return a;
    }

    if (factor > 1) {
        return b;
    }

    return a + (b - a) * factor;
}

/**
 * NOTE to self: try to use a CSS transition on the colour style before you reach for this!
 **/
export function lerpColor(c1: CssColor, c2: CssColor, factor: number, dst: CssColor) {
    dst.r = lerp(c1.r, c2.r, factor);
    dst.g = lerp(c1.g, c2.g, factor);
    dst.b = lerp(c1.b, c2.b, factor);
    dst.a = lerp(c1.a, c2.a, factor);
}
