import { CssColor, newColorFromHex } from "src/utils/colour";
import { newCssBuilder, setCssVars } from "src/utils/cssb";

export type ComponentsCoreTheme = {
    bg:  CssColor;
    bg2: CssColor;
    mg:  CssColor;
    fg2: CssColor;
    fg:  CssColor;
    mediumText: string;
    normalText: string;
    smallText:  string;
};

export const cssVars: Record<keyof ComponentsCoreTheme, string> = {
    bg: "var(--bg)",
    bg2: "var(--bg2)",
    mg: "var(--mg)",
    fg2: "var(--fg2)",
    fg: "var(--fg)",
    mediumText: "var(--mediumText)",
    normalText: "var(--normalText)",
    smallText: "var(--smallText)",
};

export function setComponentsCoreTheme(theme: ComponentsCoreTheme) {
    setCssVars(theme);
}

export const defaultCoreTheme = Object.freeze({
    bg: newColorFromHex("#FFF"),
    bg2: newColorFromHex("#CCC"),
    mg: newColorFromHex("#888"),
    fg2: newColorFromHex("#333"),
    fg: newColorFromHex("#000"),
    mediumText: "4rem",
    normalText: "1.5rem",
    smallText: "1rem",
});

export type Theme = typeof defaultCoreTheme;
setComponentsCoreTheme(defaultCoreTheme);

let currentTheme: Theme = defaultCoreTheme;

export function getCurrentTheme(): Readonly<Theme> {
    return currentTheme;
}

const cssb = newCssBuilder();

const cnHoverParent = cssb.newClassName("hoverParent");
const cnHoverTarget = cssb.newClassName("hoverTarget");
const cnHoverTargetInverse = cssb.newClassName("hoverTargetInverse");

cssb.s(`
.${cnHoverParent} .${cnHoverTarget} { display: none !important; }
.${cnHoverParent} .${cnHoverTargetInverse} { display: inherit !important; }
.${cnHoverParent}:hover .${cnHoverTarget}  { display: inherit !important; }
.${cnHoverParent}:hover .${cnHoverTargetInverse}  { display: none !important; }
`);


// Common styles used in this design system
export const cn = Object.freeze({
    allUnset: cssb.cn("allUnset", [` { all: unset; }`]),

    row: cssb.cn("row", [` { display: flex; flex-direction: row; }`]),
    rowReverse: cssb.cn("row-reverse", [` { display: flex; flex-direction: row-reverse; }`]),
    col: cssb.cn("col", [` { display: flex; flex-direction: column; }`]),
    colReverse: cssb.cn("col-reverse", [` { display: flex; flex-direction: column-reverse; }`]),
    flexWrap: cssb.cn("flexWrap", [` { display: flex; flex-flow: wrap; }`]),

    /** The min-width and min-height here is the secret sauce. Now the flex containers won't keep overflowing lmao */
    flex1: cssb.cn("flex1", [` { flex: 1; min-width: 0; min-height: 0; }`]),

    alignItemsCenter: cssb.cn("alignItemsCenter", [` { align-items: center; }`]),
    justifyContentLeft: cssb.cn("justifyContentLeft", [` { justify-content: left; }`]),
    justifyContentRight: cssb.cn("justifyContentRight", [` { justify-content: right; }`]),
    justifyContentCenter: cssb.cn("justifyContentCenter", [` { justify-content: center; }`]),
    justifyContentStart: cssb.cn("justifyContentStart", [` { justify-content: start; }`]),
    justifyContentEnd: cssb.cn("justifyContentEnd", [` { justify-content: end; }`]),
    alignItemsEnd: cssb.cn("alignItemsEnd", [` { align-items: flex-end; }`]),
    alignItemsStart: cssb.cn("alignItemsStart", [` { align-items: flex-start; }`]),
    alignItemsStretch: cssb.cn("alignItemsStretch", [` { align-items: stretch; }`]),

    /** positioning */

    fixed: cssb.cn("fixed", [` { position: fixed; }`]),
    sticky: cssb.cn("sticky", [` { position: sticky; }`]),
    absolute: cssb.cn("absolute", [` { position: absolute; }`]),
    relative: cssb.cn("relative", [` { position: relative; }`]),
    absoluteFill: cssb.cn("absoluteFill", [` { position: absolute; top: 0; right: 0; left: 0; bottom: 0; width: 100%; height: 100%; }`]),
    borderBox: cssb.cn("borderBox", [` { box-sizing: border-box; }`]),

    /** displays */
    inlineBlock: cssb.cn("inlineBlock", [` { display: inline-block; }`]),
    inline: cssb.cn("inline", [` { display: inline; }`]),
    flex: cssb.cn("flex", [` { display: flex; }`]),
    pointerEventsNone: cssb.cn("pointerEventsNone", [` { pointer-events: none; }`]),
    pointerEventsAll: cssb.cn("pointerEventsAll", [` { pointer-events: all; }`]),
    userSelectNone: cssb.cn("userSelectNone", [` { user-select: none; }`]),

    table: cssb.cn("table", [` { display: table; }`]),
    tableRow: cssb.cn("tableRow", [` { display: table-row; }`]),
    tableCell: cssb.cn("tableCell", [` { display: table-cell; }`]),

    /** we have React.Fragment at home. Kinda useless now, since our components can just render multiple things under another thing. */
    contents: cssb.cn("contents", [` { display: contents; }`]),

    /** common spacings */

    w100: cssb.cn("w100", [` { width: 100%; }`]),
    mw100: cssb.cn("mw100", [` { max-width: 100%; }`]),
    h100: cssb.cn("h100", [` { height: 100%; }`]),
    mh100: cssb.cn("mh100", [` { max-height: 100%; }`]),
    
    wFitContent: cssb.cn("wFitContent", [` { width: fit-content; }`]),
    hFitContent: cssb.cn("hFitContent", [` { height: fit-content; }`]),

    /** overflow management */

    overflowXAuto: cssb.cn("overflowXAuto", [` { overflow-x: auto; }`]),
    overflowYAuto: cssb.cn("overflowYAuto", [` { overflow-y: auto; }`]),
    overflowAuto: cssb.cn("overflowAuto", [` { overflow: auto; }`]),
    overflowHidden: cssb.cn("overflowHidden", [` { overflow: hidden; }`]),

    /** hover utils */
    hoverParent: cnHoverParent,
    hoverTarget: cnHoverTarget,
    hoverTargetInverse: cnHoverTargetInverse,

    /** debug utils */
    debug1pxSolidRed: cssb.cn("debug1pxSolidRed", [` { border: 1px solid red; }`]),

    /** Colours */
    inverted: cssb.cn("inverted", [` { color: ${cssVars.bg} ; background: ${cssVars.fg}; }`]),
    bg2: cssb.cn("bg2", [` { background-color: ${cssVars.bg2}; }`]),
    bg: cssb.cn("bg", [` { background-color: ${cssVars.bg}; }`]),

    /** Text and text layouting */

    textAlignCenter: cssb.cn("textAlignCenter", [` { text-align: center; }`]),
    textAlignRight: cssb.cn("textAlignRight", [` { text-align: right; }`]),
    textAlignLeft: cssb.cn("textAlignLeft", [` { text-align: left; }`]),
    pre: cssb.cn("pre", [` { white-space: pre; }`]),
    preWrap: cssb.cn("preWrap", [` { white-space: pre-wrap; }`]),
    noWrap: cssb.cn("noWrap", [` { white-space: nowrap; }`]),
    handleLongWords: cssb.cn("handleLongWords", [` { overflow-wrap: anywhere; word-break: normal; }`]),
    strikethrough: cssb.cn("strikethrough", [` { text-decoration: line-through; text-decoration-color: currentColor; }`]),
    // This looks horribe though
    // truncated: cssb.cn("truncated", [` { text-overflow: ellipsis; white-space: nowrap; overflow: hidden; }`]),
    truncated: cssb.cn("truncated", [` { white-space: nowrap; overflow: hidden; }`]),

    mediumFont: cssb.cn("mediumFont", [` { font-size: ${cssVars.mediumText}; }`]),
    normalFont: cssb.cn("normalFont", [` { font-size: ${cssVars.normalText}; }`]),
    smallFont: cssb.cn("smallFont", [` { font-size: ${cssVars.smallText}; }`]),

});

