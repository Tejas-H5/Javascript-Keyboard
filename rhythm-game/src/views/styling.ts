import { INTER_FONT_CSS } from "src/fonts/fonts";
import { cssVars, imui } from "src/utils/im-js/im-ui";


export const cssVarsApp = imui.getCssVarsDict({
    ...cssVars,
    playback:  "var(--playback)",
    bpmMarker: "var(--bpmMarker)",
    error:     "var(--error)",
    calm:      "var(--calm)",
    danger:    "var(--danger)",
    unhit:     "var(--unhit)",
    lowHit:    "var(--lowHit)",
    mediumHit: "var(--unhit)",
    fullyHit:  "var(--fullyHit)",

    highlight:  "var(--highlight)",
});

const cssb = imui.newCssBuilder();

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

const mainTheme = Object.freeze({
    ...imui.defaultTheme,
    playback:  imui.newColorFromHex("#0000FF"),
    bpmMarker: imui.newColorFromHex("#AA0000"),
    error:     imui.newColorFromHex("#FF0000"),
    calm:      imui.newColorFromHex("#00AAFF"),
    danger:    imui.newColorFromHex("#FF0000"),
    unhit:     imui.newColorFromHex("#FF0000"),
    lowHit:    imui.newColorFromHex("#FF9100"),
    mediumHit: imui.newColorFromHex("#FFCC00"),
    fullyHit:  imui.newColorFromHex("#00FF00"),

    highlight: imui.newColorFromHex("#FFAAFF"),
} as const);

type AppTheme = typeof mainTheme;

let currentTheme: AppTheme = mainTheme;

export function getCurrentTheme(): Readonly<AppTheme> {
    return currentTheme;
}

// Eventually, we may have more themes!
export function updateTheme() {
    currentTheme = mainTheme
    imui.setCurrentTheme(currentTheme);
}

updateTheme();
