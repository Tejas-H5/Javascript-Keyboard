// Using css was a mistake. Most styling should be available in javascript for the code to know about and use...

import { newCssBuilder, setCssVars } from "src/utils/cn";
import { newColorFromHex } from "src/utils/colour";

const mainTheme = Object.freeze({
    bg: newColorFromHex("#FFF"),
    bg2: newColorFromHex("#CCC"),
    mg: newColorFromHex("#888"),
    fg2: newColorFromHex("#333"),
    fg: newColorFromHex("#000"),
    playback: newColorFromHex("#00F"),
    error: newColorFromHex("#F00"),

    mediumText: "4rem",
    normalText: "2rem",
    smallText: "1rem",
});

export type Theme = typeof mainTheme;

export const cssVars: Record<keyof Theme, string> = {
    bg: "var(--bg)",
    bg2: "var(--bg2)",
    mg: "var(--mg)",
    fg2: "var(--fg2)",
    fg: "var(--fg)",
    playback: "var(--playback)",
    error: "var(--error)",
    mediumText: "var(--mediumText)",
    normalText: "var(--normalText)",
    smallText: "var(--smallText)",
} as const;


const cssb = newCssBuilder();

cssb.s(`
body {
    font-family: monospace;
    font-size: ${cssVars.normalText};
    color: ${cssVars.fg};
    background: ${cssVars.bg};
    font-size: 1em;
}

textarea {
    all: unset;
    font-family: monospace;
    white-space: pre-wrap;
    padding: 5px;
}

textarea:focus {
    background-color: ${cssVars.bg2};
}

input {
    all: unset;
    font-family: monospace;
    white-space: pre-wrap;
}

input:focus {
    background-color: ${cssVars.bg2};
}
    `);

export const cnApp = {
    b: cssb.cn("b", [` { font-weight: bold; } `]),

    mediumFont: cssb.cn("mediumFont", [` { font-size: ${cssVars.mediumText}; }`]),
    normalFont: cssb.cn("normalFont", [` { font-size: ${cssVars.normalText}; }`]),
    smallFont: cssb.cn("smallFont", [` { font-size: ${cssVars.smallText}; }`]),

    defocusedText: cssb.cn("defocusedText", [` { color: ${cssVars.mg}; }`]),
    inverted: cssb.cn("inverted", [` { color: ${cssVars.bg} ; background: ${cssVars.fg}; }`]),

    border1Solid: cssb.cn("border1Solid", [`{ border: 1px solid ${cssVars.fg}; }`]),

    gap5: cssb.cn("gap5", [` { gap: 5px; }`]),
    gap10: cssb.cn("gap10", [` { gap: 10px; }`]),

    h1: cssb.cn("header1", [` { font-size: 64px }`]),
};

setCssVars(mainTheme);

let currentTheme: Theme = mainTheme;

export function getCurrentTheme(): Readonly<Theme> {
    return currentTheme;
}

// Eventually, we may have more themes!
export function updateTheme() {
    currentTheme = mainTheme
    setCssVars(currentTheme);
}
