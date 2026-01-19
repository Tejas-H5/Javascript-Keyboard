// https://stackoverflow.com/questions/521295/seeding-the-random-number-generator-in-javascript/47593316#47593316
// function sfc32(a, b, c, d) {
//   return function() {
//     a |= 0; b |= 0; c |= 0; d |= 0;
//     let t = (a + b | 0) + d | 0;
//     d = d + 1 | 0;
//     a = b ^ b >>> 9;
//     b = c + (c << 3) | 0;
//     c = (c << 21 | c >>> 11);
//     c = c + t | 0;
//     return (t >>> 0) / 4294967296;
//   }
// }

export type RandomNumberGenerator = {
    a: number;
    b: number;
    c: number;
    d: number;
};

export function newRandomNumberGenerator(seed = 0): RandomNumberGenerator {
    const val : RandomNumberGenerator = { a: 0, b: 0, c: 0, d: 0 };
    setRngSeed(val, seed);
    return val;
}

// hint: Date.now(), or something deterministic
export function setRngSeed(g: RandomNumberGenerator, num: number) {
    let { a, b, c, d } = g;

    // totally arbitrary. As long as it's deterministic, should be fine.
    // +1 stops everything becoming zero.
    a = num + 1;
    b = a << 5;
    c = b << 5;
    d = c << 5;

    g.a = a; g.b = b; g.c = c; g.d = d;
}

export function getNextRng(g: RandomNumberGenerator) {
    let { a, b, c, d } = g;

    a |= 0; b |= 0; c |= 0; d |= 0;
    let t = (a + b | 0) + d | 0;
    d = d + 1 | 0;
    a = b ^ b >>> 9;
    b = c + (c << 3) | 0;
    c = (c << 21 | c >>> 11);
    c = c + t | 0;

    g.a = a; g.b = b; g.c = c; g.d = d;

    return (t >>> 0) / 4294967296;
}

