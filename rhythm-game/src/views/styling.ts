import { ComponentsCoreTheme, cssVars, defaultCoreTheme } from "src/components/core/stylesheets";
import { INTER_FONT_CSS } from "src/fonts/fonts";
import { CssColor, newColorFromHex } from "src/utils/colour";
import { newCssBuilder, setCssVars } from "src/utils/cssb";

type AppTheme = ComponentsCoreTheme & {
    playback:  CssColor;
    bpmMarker: CssColor;
    error:     CssColor;
    calm:      CssColor;
    danger:    CssColor;
    unhit:     CssColor;
    mediumHit: CssColor;
    fullyHit:  CssColor;
};

export const cssVarsApp: Record<keyof AppTheme, string> = {
    ...cssVars,
    playback:  "var(--playback)",
    bpmMarker: "var(--bpmMarker)",
    error:     "var(--error)",
    calm:      "var(--calm)",
    danger:    "var(--danger)",
    unhit:     "var(--unhit)",
    mediumHit: "var(--unhit)",
    fullyHit:  "var(--fullyHit)",
} as const;

const cssb = newCssBuilder();

cssb.s(`

${INTER_FONT_CSS}

body {
    font-family: MainGameFont;
    font-size: ${cssVars.normalText};
    color: ${cssVars.fg};
    background: ${cssVars.bg};
}

textarea {
    all: unset;
    font-family: MainGameFont;
    white-space: pre-wrap;
    padding: 5px;
}

textarea:focus {
    background-color: ${cssVars.bg2};
}

input {
    all: unset;
    font-family: MainGameFont;
    white-space: pre-wrap;
}

input:focus {
    background-color: ${cssVars.bg2};
}

h1, h2, h3, h4 { margin: 0; }
    `);

export const cnApp = {
    b: cssb.cn("b", [` { font-weight: bold; } `]),

    defocusedText: cssb.cn("defocusedText", [` { color: ${cssVars.mg}; }`]),
    border1Solid: cssb.cn("border1Solid", [`{ border: 1px solid ${cssVars.fg}; }`]),

    gap5:  cssb.cn("gap5",  [` { gap: 5px; }`]),
    gap10: cssb.cn("gap10", [` { gap: 10px; }`]),

    h1: cssb.cn("header1", [` { font-size: 64px }`]),
};

const mainTheme = Object.freeze<AppTheme>({
    ...defaultCoreTheme,
    playback:  newColorFromHex("#00F"),
    bpmMarker: newColorFromHex("#A00"),
    error:     newColorFromHex("#F00"),
    calm:      newColorFromHex("#00AAFF"),
    danger:    newColorFromHex("#FF0000"),
    unhit:     newColorFromHex("#FF0000"),
    mediumHit: newColorFromHex("#FFCC00"),
    fullyHit:  newColorFromHex("#00FF00"),
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
