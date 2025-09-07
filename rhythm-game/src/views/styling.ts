import { ComponentsCoreTheme, cssVars, defaultCoreTheme } from "src/components/core/stylesheets";
import { CssColor, newColorFromHex } from "src/utils/colour";
import { newCssBuilder, setCssVars } from "src/utils/cssb";

type AppTheme = ComponentsCoreTheme & {
    playback: CssColor;
    bpmMarker: CssColor;
    error:    CssColor;
};

export const cssVarsApp: Record<keyof AppTheme, string> = {
    ...cssVars,
    playback: "var(--playback)",
    bpmMarker: "var(--bpmMarker)",
    error:    "var(--error)",
} as const;

const cssb = newCssBuilder();

cssb.s(`
body {
    font-family: monospace;
    font-size: ${cssVars.normalText};
    color: ${cssVars.fg};
    background: ${cssVars.bg};
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

    defocusedText: cssb.cn("defocusedText", [` { color: ${cssVars.mg}; }`]),
    border1Solid: cssb.cn("border1Solid", [`{ border: 1px solid ${cssVars.fg}; }`]),

    gap5:  cssb.cn("gap5",  [` { gap: 5px; }`]),
    gap10: cssb.cn("gap10", [` { gap: 10px; }`]),

    h1: cssb.cn("header1", [` { font-size: 64px }`]),
};

const mainTheme = Object.freeze({
    ...defaultCoreTheme,
    playback: newColorFromHex("#00F"),
    bpmMarker: newColorFromHex("#A00"),
    error:    newColorFromHex("#F00"),
});

let currentTheme: AppTheme = mainTheme;

export function getCurrentTheme(): Readonly<AppTheme> {
    return currentTheme;
}

// Eventually, we may have more themes!
export function updateTheme() {
    currentTheme = mainTheme
    setCssVars(currentTheme);
}

updateTheme();
