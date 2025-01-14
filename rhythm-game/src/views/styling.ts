// Using css was a mistake. Most styling should be available in javascript for the code to know about and use...
import { newColorFromHex } from "src/utils/colour";
import { Insertable, newStyleGenerator } from "src/utils/dom-utils";


export function initStyles(root: Insertable) {
    const sg = newStyleGenerator(root.el);

    const colours = {
        bg: newColorFromHex("#FFF"),
        bg2: newColorFromHex("#CCC"),
        mg: newColorFromHex("#888"),
        fg2: newColorFromHex("#333"),
        fg: newColorFromHex("#000"),
        playback: newColorFromHex("#00F"),
        error: newColorFromHex("#F00"),
    };

    const colourVars = {
        bg: sg.cssVar("bg", () => "" + colours.bg),
        bg2: sg.cssVar("bg2", () => "" + colours.bg2),
        mg: sg.cssVar("mg", () => "" + colours.mg),
        fg2: sg.cssVar("fg2", () => "" + colours.fg2),
        fg: sg.cssVar("fg", () => "" + colours.fg),
        playback: sg.cssVar("playback", () => "" + colours.playback),
        error: sg.cssVar("error", () => "" + colours.error),
    }

    const sizeVars = {
        mediumText: sg.cssVar("medium", () => "4rem"),
        normalText: sg.cssVar("normal", () => "2rem"),
        smallText: sg.cssVar("small", () => "1rem"),
    };

    sg.updateVars();

    sg.s(`
body {
    font-family: monospace;
    font-size: ${sizeVars.normalText};
    color: ${colours.fg};
    background: ${colourVars.bg};
    font-size: 1em;
}

textarea {
    all: unset;
    font-family: monospace;
    white-space: pre-wrap;
    padding: 5px;
}

textarea:focus {
    background-color: ${colourVars.bg2};
}

input {
    all: unset;
    font-family: monospace;
    white-space: pre-wrap;
}

input:focus {
    background-color: ${colourVars.bg2};
}
    `);

    const cnStyle = {
        b: sg.cn("b", [ ` { font-weight: bold; } `]),

        mediumFont: sg.cn("medium-font", [ ` { font-size: ${sizeVars.mediumText}; }` ]),
        normalFont: sg.cn("normal-font", [ ` { font-size: ${sizeVars.normalText}; }` ]),
        smallFont: sg.cn("small-font", [ ` { font-size: ${sizeVars.smallText}; }` ]),

        textMg: sg.cn("text-mg", [ ` { color: ${colourVars.mg}; }`]),
        inverted: sg.cn("inverted", [ ` { color: ${colourVars.bg} ; background: ${colourVars.fg}; }` ]), 

        border1Solid: sg.cn("border-1-solid", [`{ border: 1px solid ${colourVars.fg}; }`]),
    };

    const cnLayout = {
        row: sg.cn("row", [` { display: flex; flex-direction: row; }`]),
        col: sg.cn("col", [` { display: flex; flex-direction: column; }`]),
        flexWrap: sg.cn("flex-wrap", [` { display: flex; flex-flow: wrap; }`]),

        /** The min-width and min-height here is the secret sauce. Now the flex containers won't keep overflowing lmao */
        flex1: sg.cn("flex-1", [` { flex: 1; min - width: 0; min - height: 0; }`]),
        alignItemsCenter: sg.cn("align-items-center", [` { align-items: center; }`]),
        justifyContentCenter: sg.cn("justify-content-center", [` { justify-content: center; }`]),
        justifyContentStart: sg.cn("justify-content-start", [` { justify-content: start; }`]),
        justifyContentEnd: sg.cn("justify-content-end", [` { justify-content: end; }`]),
        alignItemsEnd: sg.cn("align-items-end", [` { align-items: flex-end; }`]),
        alignItemsStart: sg.cn("align-items-start", [` { align-items: flex-start; }`]),
        alignItemsStretch: sg.cn("align-items-stretch", [` { align-items: stretch; }`]),

        /** positioning */
        fixed: sg.cn("fixed", [` { position: fixed; }`]),
        sticky: sg.cn("sticky", [` { position: sticky; }`]),
        absolute: sg.cn("absolute", [` { position: absolute; }`]),
        relative: sg.cn("relative", [` { position: relative; }`]),
        absoluteFill: sg.cn("absolute-fill", [` { position: absolute; top: 0; right: 0; left: 0; bottom: 0; width: 100%; height: 100%; }`]),
        borderBox: sg.cn("border-box", [` { box-sizing: border-box; }`]),

        /** displays */

        inlineBlock: sg.cn("inline-block", [` { display: inline-block; }`]),
        inline: sg.cn("inline", [` { display: inline; }`]),
        flex: sg.cn("flex", [` { display: flex; }`]),
        pointerEventsNone: sg.cn("pointer-events-none", [` { pointer-events: none; }`]),
        pointerEventsAll: sg.cn("pointer-events-all", [` { pointer-events: all; }`]),

        /** we have React.Fragment at home */
        contents: sg.cn("contents", [` { display: contents; }`]),

        /** text and text layouting */

        textAlignCenter: sg.cn("text-align-center", [` { text-align: center; }`]),
        textAlignRight: sg.cn("text-align-right", [` { text-align: right; }`]),
        textAlignLeft: sg.cn("text-align-left", [` { text-align: left; }`]),
        pre: sg.cn("pre", [` { white-space: pre; }`]),
        preWrap: sg.cn("pre-wrap", [` { white-space: pre-wrap; }`]),
        noWrap: sg.cn("nowrap", [` { white-space: nowrap; }`]),
        handleLongWords: sg.cn("handle-long-words", [` { overflow-wrap: anywhere; word-break: normal; }`]),
        strikethrough: sg.cn("strikethrough", [` { text-decoration: line-through; text-decoration-color: ${colours.fg} }`]),

        /** common spacings */

        gap5: sg.cn("gap-5", [` { gap: 5px; }`]),
        w100: sg.cn("w-100", [` { width: 100%; }`]),
        h100: sg.cn("h-100", [` { height: 100%; }`]),

        /** overflow management */

        overflowXAuto: sg.cn("overflow-x-auto", [` { overflow-x: auto; }`]),
        overflowYAuto: sg.cn("overflow-y-auto", [` { overflow-y: auto; }`]),
        overflowHidden: sg.cn("overflow-hidden", [` { overflow: hidden; }`]),

        /** hover utils */

        hoverParent: sg.cn("hover-parent", [
            ` .hover-target { display: none !important; }`,
            ` .hover-target-inverse { display: inherit !important; }`,
            `:hover .hover-target { display: inherit !important; }`,
            `:hover .hover-target-inverse { display: none !important; }`,
        ]),
    };

    return {
        colours,
        colourVars,
        sizeVars,
        cnStyle,
        cnLayout,
    };
}
