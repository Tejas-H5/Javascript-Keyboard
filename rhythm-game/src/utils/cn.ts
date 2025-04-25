import { CssColor } from "./colour";

export function newStyleElement(): HTMLStyleElement {
    return document.createElement("style") as HTMLStyleElement;
}

const stylesStringBuilder: string[] = [];
const allClassNames = new Set<string>();

// collect every single style that was created till this point,
// and append it as a style node.
export function initCnStyles(stylesRoot?: HTMLElement) {
    // NOTE: right now, you probably dont want to use document.body as your styles root, if that is also your app root.
    if (!stylesRoot) {
        stylesRoot = document.head;
    }

    const sb = stylesStringBuilder;
    if (sb.length > 0) {
        const text = sb.join("");
        stylesStringBuilder.length = 0;

        const styleNode = newStyleElement();
        styleNode.setAttribute("type", "text/css");
        styleNode.textContent = "\n\n" + text + "\n\n";
        stylesRoot.append(styleNode);
    }
}

/**
 * A util allowing components to register styles that they need to an inline stylesheet.
 * All styles in the entire bundle are string-built and appended in a `<style />` node as soon as
 * dom-utils is initialized. See {@link initializeDomUtils}
 *
 * The object approach allows us to add a prefix to all the class names we make.
 */
export function newCssBuilder(prefix: string = "") {
    const builder = stylesStringBuilder;
    return {
        /** Appends a CSS style to the builder. The prefix is not used. */
        s(string: string) {
            builder.push(string);
        },
        /** Returns `prefix + className`. Throws if it somehow clashes with an existing class someone else made. */
        newClassName(className: string) {
            let name = prefix + className;
            if (allClassNames.has(name)) {
                throw new Error("We've already made a class with this name: " + name + " - consider adding a prefix");
            }
            allClassNames.add(name);
            return name;
        },
        // makes a new class, it's variants, and returns the class name
        cn(className: string, styles: string[] | string): string {
            const name = this.newClassName(className);

            for (let style of styles) {
                const finalStyle = `.${name}${style}`;
                builder.push(finalStyle + "\n");
            }

            return name;
        },
    };
}


const sb = newCssBuilder("");

sb.s(`
.catastrophic---error > * { display: none !important; }
.catastrophic---error::before {
    content: var(--error-text);
    text-align: center;
}
.debug { border: 1px solid red; }
`);

const cnHoverParent = sb.newClassName("hoverParent");
const cnHoverTarget = sb.newClassName("hoverTarget");
const cnHoverTargetInverse = sb.newClassName("hoverTargetInverse");

sb.s(`
.${cnHoverParent} .${cnHoverTarget} { display: none !important; }
.${cnHoverParent} .${cnHoverTargetInverse} { display: inherit !important; }
.${cnHoverParent}:hover .${cnHoverTarget}  { display: inherit !important; }
.${cnHoverParent}:hover .${cnHoverTargetInverse}  { display: none !important; }
`);

// Here are some common classes that are used so often that I've just put them into dom-utils.
// Shared UI components also don't need to depend on app-specific styles if those styles just come with their UI framework.
export const cn = Object.freeze({
    allUnset: sb.cn("allUnset", [` { all: unset; }`]),

    row: sb.cn("row", [` { display: flex; flex-direction: row; }`]),
    col: sb.cn("col", [` { display: flex; flex-direction: column; }`]),
    flexWrap: sb.cn("flexWrap", [` { display: flex; flex-flow: wrap; }`]),

    /** The min-width and min-height here is the secret sauce. Now the flex containers won't keep overflowing lmao */
    flex1: sb.cn("flex1", [` { flex: 1; min-width: 0; min-height: 0; }`]),

    alignItemsCenter: sb.cn("alignItemsCenter", [` { align-items: center; }`]),
    justifyContentLeft: sb.cn("justifyContentLeft", [` { justify-content: left; }`]),
    justifyContentRight: sb.cn("justifyContentRight", [` { justify-content: right; }`]),
    justifyContentCenter: sb.cn("justifyContentCenter", [` { justify-content: center; }`]),
    justifyContentStart: sb.cn("justifyContentStart", [` { justify-content: start; }`]),
    justifyContentEnd: sb.cn("justifyContentEnd", [` { justify-content: end; }`]),
    alignItemsEnd: sb.cn("alignItemsEnd", [` { align-items: flex-end; }`]),
    alignItemsStart: sb.cn("alignItemsStart", [` { align-items: flex-start; }`]),
    alignItemsStretch: sb.cn("alignItemsStretch", [` { align-items: stretch; }`]),

    /** positioning */
    fixed: sb.cn("fixed", [` { position: fixed; }`]),
    sticky: sb.cn("sticky", [` { position: sticky; }`]),
    absolute: sb.cn("absolute", [` { position: absolute; }`]),
    relative: sb.cn("relative", [` { position: relative; }`]),
    absoluteFill: sb.cn("absoluteFill", [` { position: absolute; top: 0; right: 0; left: 0; bottom: 0; width: 100%; height: 100%; }`]),
    borderBox: sb.cn("borderBox", [` { box-sizing: border-box; }`]),

    /** displays */

    inlineBlock: sb.cn("inlineBlock", [` { display: inline-block; }`]),
    inline: sb.cn("inline", [` { display: inline; }`]),
    flex: sb.cn("flex", [` { display: flex; }`]),
    pointerEventsNone: sb.cn("pointerEventsNone", [` { pointer-events: none; }`]),
    pointerEventsAll: sb.cn("pointerEventsAll", [` { pointer-events: all; }`]),
    userSelectNone: sb.cn("userSelectNone", [` { user-select: none; }`]),

    table: sb.cn("table", [` { display: table; }`]),
    tableRow: sb.cn("tableRow", [` { display: table-row; }`]),
    tableCell: sb.cn("tableCell", [` { display: table-cell; }`]),

    /** we have React.Fragment at home */
    contents: sb.cn("contents", [` { display: contents; }`]),

    /** text and text layouting */

    textAlignCenter: sb.cn("textAlignCenter", [` { text-align: center; }`]),
    textAlignRight: sb.cn("textAlignRight", [` { text-align: right; }`]),
    textAlignLeft: sb.cn("textAlignLeft", [` { text-align: left; }`]),
    pre: sb.cn("pre", [` { white-space: pre; }`]),
    preWrap: sb.cn("preWrap", [` { white-space: pre-wrap; }`]),
    noWrap: sb.cn("noWrap", [` { white-space: nowrap; }`]),
    handleLongWords: sb.cn("handleLongWords", [` { overflow-wrap: anywhere; word-break: normal; }`]),
    strikethrough: sb.cn("strikethrough", [` { text-decoration: line-through; text-decoration-color: currentColor; }`]),

    /** common spacings */

    w100: sb.cn("w100", [` { width: 100%; }`]),
    mw100: sb.cn("mw100", [` { max-width: 100%; }`]),
    h100: sb.cn("h100", [` { height: 100%; }`]),
    mh100: sb.cn("mh100", [` { max-height: 100%; }`]),
    
    wFitContent: sb.cn("wFitContent", [` { width: fit-content; }`]),
    hFitContent: sb.cn("hFitContent", [` { height: fit-content; }`]),

    /** overflow management */

    overflowXAuto: sb.cn("overflowXAuto", [` { overflow-x: auto; }`]),
    overflowYAuto: sb.cn("overflowYAuto", [` { overflow-y: auto; }`]),
    overflowAuto: sb.cn("overflowAuto", [` { overflow: auto; }`]),
    overflowHidden: sb.cn("overflowHidden", [` { overflow: hidden; }`]),

    /** hover utils */
    hoverParent: cnHoverParent,
    hoverTarget: cnHoverTarget,
    hoverTargetInverse: cnHoverTargetInverse,

    /** debug utils */
    debug1pxSolidRed: sb.cn("debug1pxSolidRed", [` { border: 1px solid red; }`]),
});

export function setCssVars(vars: Record<string, string | CssColor>, cssRoot?: HTMLElement) {
    if (!cssRoot) {
        cssRoot = document.querySelector(":root") as HTMLElement;
    }

    for (const k in vars) {
        setCssVar(cssRoot, k, vars[k]);
    }
}

export function setCssVar(cssRoot: HTMLElement, varName: string, value: string | CssColor) {
    const fullVarName = `--${varName}`;
    cssRoot.style.setProperty(fullVarName, "" + value);
}

