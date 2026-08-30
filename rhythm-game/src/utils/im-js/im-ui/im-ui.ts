// imui v0.00.3

import { im, ImCache } from '../im-core';
import { imdom, el } from '../im-dom';


///////////////////////////
// CSS Builder

function newStyleElement(): HTMLStyleElement {
    return document.createElement("style") as HTMLStyleElement;
}

const stylesStringBuilder: string[] = [];
const allClassNames = new Set<string>();

// collect every single style that was created till this point, and append it as a style node.
function initCssbStyles(stylesRoot?: HTMLElement) {
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
function newCssBuilder(prefix: string = "") {
    const builder = stylesStringBuilder;
    return {
        /** Appends a CSS style to the builder. The prefix is not used. */
        s(string: string) {
            builder.push(string);
        },
        /** 
         * Returns `prefix + className`.
         * If this classname exists, we'll give you `prefix + classname + {incrementing number}`.
         */
        newClassName(className: string) {
            let name = prefix + className ;
            let baseName = name;
            let count = 2;
            while (allClassNames.has(name)) {
                // Should basically never happen. Would be interesting to see if it ever does, so I am logging it
                console.warn("conflicting class name " + name + ", generating another one");
                name = baseName + count;
                count++;
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

function isColourLike(val: object): val is CssColor {
    return "r" in val && "g" in val && "b" in val && "a" in val && "toString" in val;
}


///////////////////////////
// Theme management system

export type CssVarValue = string | CssColor | object;
export type Theme = Record<string, CssVarValue>;
export type CssVarDict<T extends Theme> = { [K in keyof T & string]: `var(--${K})` };

const defaultTheme = {
    bg:         newColorFromHex("#FFF"),
    bg2:        newColorFromHex("#CCC"),
    mg:         newColorFromHex("#888"),
    fg2:        newColorFromHex("#333"),
    fg:         newColorFromHex("#000"),
    fg025a:     newColorFromHex("#00000040"),
    fg05a:      newColorFromHex("#00000080"),
    mediumText: "4rem",
    normalText: "1.5rem",
    smallText:  "1rem",
} satisfies Theme;

/**
 * Use this to make your own css variable dictionary. 
 * That dictionary can be used refer to a CSS variable 
 * via dot notation, which will be aided by LSP autocomplete.
 *
 * ```ts
 *
 * const appTheme = {
 *      ...defaultTheme,
 *      // custom vars go here
 * };
 *
 * const cssVarsApp = getCssVarsDict({
 *      ...appTheme,
 * });
 *
 * setCssVars(cssVarsApp);
 *
 * ```
 */
function getCssVarsDict<T extends Theme>(theme: T): CssVarDict<T> {
    return Object.fromEntries(
        Object.keys(theme)
        .map((k: keyof T) =>  typeof k === "string" ? [k, `var(--${k})`] : null)
        .filter(k => !!k)
    );
}

// The css var dictionary for this UI library. Components in this library can reliably depend on this.
export const cssVars = getCssVarsDict(defaultTheme);

let currentTheme: Theme = defaultTheme;
function getCurrentTheme(): Readonly<Theme> {
    return currentTheme;
}

/** 
 * Use this to manage which app theme is 'current'.
 * Anything that isn't a string, number or colour-like object is ignored.
 * For now, you'll need to manually make sure your themes have parity with one another.
 */
function setCurrentTheme(theme: Theme, cssRoot?: HTMLElement) {
    if (!cssRoot) {
        cssRoot = document.querySelector(":root") as HTMLElement;
    }

    currentTheme = theme;

    for (const k in theme) {
        const val = theme[k];
        if (typeof val === "string" || isColourLike(val)) {
            setCssVar(cssRoot, k, val);
        }
    }
}

function setCssVar(cssRoot: HTMLElement, varName: string, value: string | CssColor) {
    const fullVarName = `--${varName}`;
    cssRoot.style.setProperty(fullVarName, "" + value);
}


///////////////////////////
// Initialization

/**
 * Run this once _after_ all styles have been registered.
 */
function initImUi() {
    initCssbStyles();
    setCurrentTheme(defaultTheme);
}

///////////////////////////
// Common layout patterns

const cssb = newCssBuilder();

// It occurs to me that I can actually just make my own fully custom layout system that significantly minimizes
// number of DOM nodes required to get things done.

export type SizeUnitInstance = number & { __sizeUnit: void; };

// Fairly common, so exporting as root level
export const PX = 10001 as SizeUnitInstance;
export const EM = 20001 as SizeUnitInstance;
export const PERCENT = 30001 as SizeUnitInstance;
export const REM = 40001 as SizeUnitInstance;
export const CH = 50001 as SizeUnitInstance;
export const NA = 60001 as SizeUnitInstance; // Not applicable. Nahh. 

export type SizeUnits = typeof PX |
    typeof EM |
    typeof PERCENT |
    typeof REM |
    typeof CH |
    typeof NA;

function getUnits(num: SizeUnits) {
    switch(num) {
        case PX:      return "px";
        case EM:      return "em";
        case PERCENT: return "%";
        case REM:     return "rem";
        case CH:      return "ch";
        default:      return "px";
    }
}

function getSize(num: number, units: SizeUnits) {
    return units === NA ? ("") : (num + getUnits(units));
}

function imSize(
    c: ImCache,
    width: number, wType: SizeUnits,
    height: number, hType: SizeUnits, 
) {
    // TODO: Cross browser testing. Seems a bit sus here

    if (im.Memo(c, width) | im.Memo(c, wType)) {
        const sizeCss = getSize(width, wType);
        imdom.setStyle(c, "width",    sizeCss); 
        imdom.setStyle(c, "minWidth", sizeCss);
        imdom.setStyle(c, "maxWidth", sizeCss);
    }

    if (im.Memo(c, height) | im.Memo(c, hType)) {
        const sizeCss = getSize(height, hType);
        imdom.setStyle(c, "height",    sizeCss); 
        imdom.setStyle(c, "minHeight", sizeCss);
        imdom.setStyle(c, "maxHeight", sizeCss);
    }
}

function imOpacity(c: ImCache, val: number) {
    if (im.Memo(c, val)) imdom.setStyle(c, "opacity", "" + val);
}

function imRelative(c: ImCache) {
    if (im.isFirstishRender(c)) imdom.setStyle(c, "position", "relative");
    if (im.isFirstishRender(c)) {
        // The vast majority of the time, we DONT want random scrollbars everywhere inside our absolute positioning containers.
        imdom.setStyle(c, "overflow", "hidden");
    }
}

function imBg(c: ImCache, colour: string) {
    if (im.Memo(c, colour)) imdom.setStyle(c, "backgroundColor", colour);
}

function imDebugOutline(c: ImCache, colour: string) {
    if (im.Memo(c, colour)) imdom.setStyle(c, "outline", "1px solid " + colour);
}

function imFg(c: ImCache, colour: string) {
    if (im.Memo(c, colour)) imdom.setStyle(c, "color", colour);
}

function imFontSize(c: ImCache, size: number, units: SizeUnits) {
    if (im.Memo(c, size) | im.Memo(c, units)) imdom.setStyle(c, "fontSize", getSize(size, units));
}

function imFontSizeCss(c: ImCache, style: string) {
    if (im.Memo(c, style)) imdom.setStyle(c, "fontSize", style);
}

export type DisplayTypeInstance = number & { __displayType: void; };

/**
 * Whitespace " " can permeate 'through' display: block DOM nodes, so it's useful for text.
 * ```ts
 * imLayout(c, BLOCK); { 
 *      imLayout(c, INLINE); {
 *          if (im.isFirstishRender(c)) imdom.setStyle(c, "fontWeight", "bold");
 *          imStr(c, "Hello, "); // imLayout(c, ROW) would ignore this whitespace.
 *      } imLayoutEnd(c);
 *      imStr(c, "World"); 
 *  } imLayoutEnd(c);
 */
export const BLOCK = 1 as DisplayTypeInstance;
export const INLINE_BLOCK = 2 as DisplayTypeInstance;
export const INLINE = 3 as DisplayTypeInstance;
export const ROW = 4 as DisplayTypeInstance;
export const ROW_REVERSE = 5 as DisplayTypeInstance;
export const COL = 6 as DisplayTypeInstance;
export const COL_REVERSE = 7 as DisplayTypeInstance;
export const TABLE = 8 as DisplayTypeInstance;
export const TABLE_ROW = 9 as DisplayTypeInstance;
export const TABLE_CELL = 10 as DisplayTypeInstance;
export const INLINE_ROW = 11 as DisplayTypeInstance;
export const INLINE_COL = 12 as DisplayTypeInstance;

export type DisplayType 
    = typeof BLOCK 
    | typeof INLINE_BLOCK 
    | typeof ROW 
    | typeof ROW_REVERSE 
    | typeof COL 
    | typeof COL_REVERSE 
    | typeof TABLE 
    | typeof TABLE_ROW  
    | typeof TABLE_CELL
    | typeof INLINE_ROW
    | typeof INLINE_COL;

/**
 * A dummy element with flex: 1. Super useful for flexbox.
 */
function imFlex1(c: ImCache) {
    imLayoutBegin(c, BLOCK); {
        if (im.isFirstishRender(c)) imdom.setStyle(c, "flex", "1");
    } imLayoutEnd(c);
}


const cnInlineBlock = cssb.cn("inlineBlock", [` { display: inline-block; }`]);
const cnInline      = cssb.cn("inline",      [` { display: inline; }`]);
const cnRow         = cssb.cn("row",         [` { display: flex; flex-direction: row; }`]);
const cnInlineRow   = cssb.cn("inline-row",  [` { display: inline-flex; flex-direction: row; }`]);
const cnRowReverse  = cssb.cn("row-reverse", [` { display: flex; flex-direction: row-reverse; }`]);
const cnCol         = cssb.cn("col",         [` { display: flex; flex-direction: column; }`]);
const cnInlineCol   = cssb.cn("inline-col",  [` { display: inline-flex; flex-direction: column; }`]);
const cnColReverse  = cssb.cn("col-reverse", [` { display: flex; flex-direction: column-reverse; }`]);

function imLayoutBeginInternal(c: ImCache, type: DisplayType) {
    const root = imdom.ElBegin(c, el.DIV);
    imLayout(c, type);
    return root;
}

function imLayout(c: ImCache, type: DisplayType) {
    const last = im.GetInline(c, imLayoutBegin, -1);
    if (last !== type) {
        im.Set(c, type);

        switch(last) {
            case BLOCK:        /* Do nothing - this is the default style */ break;
            case INLINE_BLOCK: imdom.setClass(c, cnInlineBlock, false);        break;
            case INLINE:       imdom.setClass(c, cnInline, false);             break;
            case ROW:          imdom.setClass(c, cnRow, false);                break;
            case ROW_REVERSE:  imdom.setClass(c, cnRowReverse, false);         break;
            case COL:          imdom.setClass(c, cnCol, false);                break;
            case COL_REVERSE:  imdom.setClass(c, cnColReverse, false);         break;
            case INLINE_ROW:   imdom.setClass(c, cnInlineRow, false);          break;
            case INLINE_COL:   imdom.setClass(c, cnInlineCol, false);          break;
        }

        switch(type) {
            case BLOCK:        /* Do nothing - this is the default style */ break;
            case INLINE_BLOCK: imdom.setClass(c, cnInlineBlock, true);         break;
            case INLINE:       imdom.setClass(c, cnInline, true);              break;
            case ROW:          imdom.setClass(c, cnRow, true);                 break;
            case ROW_REVERSE:  imdom.setClass(c, cnRowReverse, true);          break;
            case COL:          imdom.setClass(c, cnCol, true);                 break;
            case COL_REVERSE:  imdom.setClass(c, cnColReverse, true);          break;
            case INLINE_ROW:   imdom.setClass(c, cnInlineRow, true);           break;
            case INLINE_COL:   imdom.setClass(c, cnInlineCol, true);           break;
        }
    }
}

function imLayoutBegin(c: ImCache, type: DisplayType) {
    return imLayoutBeginInternal(c, type).root;
}

function imLayoutEnd(c: ImCache) {
    imdom.ElEnd(c, el.DIV);
}

function imPre(c: ImCache) {
    if (im.isFirstishRender(c)) imdom.setStyle(c, "whiteSpace", "pre");
}

function imPreWrap(c: ImCache) {
    if (im.isFirstishRender(c)) imdom.setStyle(c, "whiteSpace", "pre-wrap");
}

function imNoWrap(c: ImCache) {
    if (im.isFirstishRender(c)) imdom.setStyle(c, "whiteSpace", "nowrap");
}

function imNoSelect(c: ImCache) {
    if (im.isFirstishRender(c)) imdom.setStyle(c, "userSelect", "none");
}

function imFlex(c: ImCache, ratio = 1) {
    if (im.Memo(c, ratio)) {
        imdom.setStyle(c, "flex", "" + ratio);
        // required to make flex work the way I had thought it already worked
        imdom.setStyle(c, "minWidth", "0");
        imdom.setStyle(c, "minHeight", "0");
    }
}

function imFlexWrap(c: ImCache) {
    if (im.isFirstishRender(c)) imdom.setStyle(c, "flexWrap", "wrap");
}

function imGap(c: ImCache, val = 0, units: SizeUnits) {
    const valChanged = im.Memo(c, val);
    const unitsChanged = im.Memo(c, units);
    if (valChanged || unitsChanged) {
        imdom.setStyle(c, "gap", getSize(val, units));
    }
}

export type Alignment = number & { readonly __Alignment: unique symbol; };

// Add more as needed
export const NONE    = 0 as Alignment;
export const CENTER  = 1 as Alignment;
export const LEFT    = 2 as Alignment;
export const RIGHT   = 3 as Alignment;
export const START   = 2 as Alignment;
export const END     = 3 as Alignment;
export const STRETCH = 4 as Alignment;
export const SPACE_BETWEEN = 5 as Alignment;
export const SPACE_AROUND  = 6 as Alignment;
export const SPACE_EVENLY  = 7 as Alignment;

function getAlignment(alignment: Alignment) {
    switch(alignment) {
        case NONE:    return "";
        case CENTER:  return "center";
        case LEFT:    return "left";
        case RIGHT:   return "right";
        case START:   return "start";
        case END:     return "end";
        case STRETCH: return "stretch";
        case SPACE_BETWEEN: return "space-between";
        case SPACE_AROUND:  return "space-around";
        case SPACE_EVENLY:  return "space-evenly";
    }
    return "";
}

function imAlign(c: ImCache, alignment = CENTER) {
    if (im.Memo(c, alignment)) {
        imdom.setStyle(c, "alignItems", getAlignment(alignment));
    }
}

function imJustify(c: ImCache, alignment = CENTER) {
    if (im.Memo(c, alignment)) {
        imdom.setStyle(c, "justifyContent", getAlignment(alignment));
    }
}

function imScrollOverflow(c: ImCache, vScroll = true, hScroll = false) {
    if (im.Memo(c, vScroll)) imdom.setStyle(c, "overflowY", vScroll ? "auto" : "");
    if (im.Memo(c, hScroll)) imdom.setStyle(c, "overflowX", hScroll ? "auto" : "");
}

function imFixed(
    c: ImCache,
    top: number, topType: SizeUnits,
    right: number, rightType: SizeUnits,
    bottom: number, bottomType: SizeUnits,
    left: number, leftType: SizeUnits,
) {
    if (im.isFirstishRender(c)) imdom.setStyle(c, "position", "fixed");
    if (im.Memo(c, top) | im.Memo(c, topType))       imdom.setStyle(c, "top",    getSize(top, topType)); 
    if (im.Memo(c, right) | im.Memo(c, rightType))   imdom.setStyle(c, "right",  getSize(right, rightType)); 
    if (im.Memo(c, bottom) | im.Memo(c, bottomType)) imdom.setStyle(c, "bottom", getSize(bottom, bottomType)); 
    if (im.Memo(c, left) | im.Memo(c, leftType))     imdom.setStyle(c, "left",   getSize(left, leftType)); 
}

function imFixedXY(c: ImCache, x: number, xUnits: SizeUnits, y: number, yUnits: SizeUnits) {
    if (im.isFirstishRender(c)) imdom.setStyle(c, "position", "fixed");
    if (im.Memo(c, x) | im.Memo(c, xUnits)) imdom.setStyle(c, "left",  getSize(x, xUnits)); 
    if (im.Memo(c, y) | im.Memo(c, yUnits)) imdom.setStyle(c, "top", getSize(y, yUnits)); 
}

function imPaddingTB(
    c: ImCache,
    top: number,    topType: SizeUnits,
    bottom: number, bottomType: SizeUnits, 
) {
    if (im.Memo(c, top) | im.Memo(c, topType))       { imdom.setStyle(c, "paddingTop", getSize(top, topType)); }
    if (im.Memo(c, bottom) | im.Memo(c, bottomType)) { imdom.setStyle(c, "paddingBottom", getSize(bottom, bottomType)); }
}

function imPaddingRL(
    c: ImCache,
    right: number,  rightType: SizeUnits, 
    left: number,   leftType: SizeUnits,
) {
    if (im.Memo(c, right) | im.Memo(c, rightType)) { imdom.setStyle(c, "paddingRight", getSize(right, rightType)); }
    if (im.Memo(c, left) | im.Memo(c, leftType))   { imdom.setStyle(c, "paddingLeft", getSize(left, leftType)); }
}

function imPadding(
    c: ImCache,
    top: number,    topType: SizeUnits,
    right: number,  rightType: SizeUnits, 
    bottom: number, bottomType: SizeUnits, 
    left: number,   leftType: SizeUnits,
) {
    imPaddingRL(c, right, rightType, left, leftType);
    imPaddingTB(c, top, topType, bottom, bottomType);
}

/**
 * 'Trouble' acronymn. Top Right Bottom Left. This is what we have resorted to.
 * Silly order. But it's the css standard convention.
 * I would have preferred (left, top), (right, bottom). You know, (x=0, y=0) -> (x=width, y=height) in HTML coordinates. xD
 */
function imAbsolute(
    c: ImCache,
    top: number, topType: SizeUnits,
    right: number, rightType: SizeUnits, 
    bottom: number, bottomType: SizeUnits, 
    left: number, leftType: SizeUnits,
) {
    if (im.isFirstishRender(c)) imdom.setStyle(c, "position", "absolute");
    if (im.Memo(c, top) | im.Memo(c, topType))       imdom.setStyle(c, "top",    getSize(top, topType)); 
    if (im.Memo(c, right) | im.Memo(c, rightType))   imdom.setStyle(c, "right",  getSize(right, rightType)); 
    if (im.Memo(c, bottom) | im.Memo(c, bottomType)) imdom.setStyle(c, "bottom", getSize(bottom, bottomType)); 
    if (im.Memo(c, left) | im.Memo(c, leftType))     imdom.setStyle(c, "left",   getSize(left, leftType)); 
}

function imAbsoluteXY(c: ImCache, x: number, xType: SizeUnits, y: number, yType: SizeUnits) {
    if (im.isFirstishRender(c)) imdom.setStyle(c, "position", "absolute");
    if (im.Memo(c, x) | im.Memo(c, xType)) imdom.setStyle(c, "left", getSize(x, xType)); 
    if (im.Memo(c, y) | im.Memo(c, yType)) imdom.setStyle(c, "top",  getSize(y, yType)); 
}

// NOTE: should be before imSize
function imAspectRatio(c: ImCache, w: number, h: number) {
    if (im.isFirstishRender(c)) {
        imdom.setStyle(c, "width", "auto");
        imdom.setStyle(c, "height", "auto");
    }

    const ar = w / h;
    if (im.Memo(c, ar)) {
        imdom.setStyle(c, "aspectRatio", w + " / " + h);
    }
}

function imZIndex(c: ImCache, z: number) {
    if (im.Memo(c, z)) {
        imdom.setStyle(c, "zIndex", "" + z);
    }
}

function imHandleLongWords(c: ImCache) {
    if (im.isFirstishRender(c)) {
        imdom.setStyle(c, "overflowWrap", "anywhere");
        imdom.setStyle(c, "wordBreak", "normal");
    }
}

///////////////////////////
// Colours

export type CssColor = {
    r: number; g: number; b: number; a: number;
    toCssString(aOverride?: number): string;
    toString(): string;
}

function rgbaToCssString(r: number, g: number, b: number, a: number) {
    return `rgba(${Math.floor(r * 255)}, ${Math.floor(g * 255)}, ${Math.floor(b * 255)}, ${a})`;
}

function newColor(r: number, g: number, b: number, a: number): CssColor {
    return {
        r, g, b, a,
        toCssString(aOverride?: number) {
            const { r, g, b, a } = this;
            return rgbaToCssString(r, g, b, aOverride ?? a);
        },
        toString() {
            return this.toCssString();
        },
    };
}

// This one won't throw exceptions.
function newColorFromHexOrUndefined(hex: string): CssColor | undefined {
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

function newColorFromHex(hex: string): CssColor {
    const col = newColorFromHexOrUndefined(hex);
    if (!col) {
        throw new Error("invalid hex: " + hex);
    }

    return col;
}

/**
 * Taken from https://gist.github.com/mjackson/5311256
 */
function newColorFromHsv(h: number, s: number, v: number): CssColor {
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
function lerpColor(c1: CssColor, c2: CssColor, factor: number, dst: CssColor) {
    dst.r = lerp(c1.r, c2.r, factor);
    dst.g = lerp(c1.g, c2.g, factor);
    dst.b = lerp(c1.b, c2.b, factor);
    dst.a = lerp(c1.a, c2.a, factor);
}

function copyColor(c1: CssColor, dst: CssColor) {
    dst.r = c1.r;
    dst.g = c1.g;
    dst.b = c1.b;
    dst.a = c1.a;
}

///////////////////////////
// Exports

export const imui = {
    init: initImUi,     // Need to call this for the css builder and theme to work.

    // Code-first CSS 
    newCssBuilder,      // Use this to declare css classes or arbitrary css styles right next to your component

    // Theme management
    getCssVarsDict,     // Generate a css var dictionary for your own app's theme
    getCurrentTheme, setCurrentTheme,
    defaultTheme,
    setCssVar,

    // Common layout logic
    // NOTE: enum values are used so frequently, that they are exported on their own instead of via this namespace object
    LayoutBeginInternal: imLayoutBeginInternal, Layout: imLayout, Begin: imLayoutBegin, End: imLayoutEnd, LayoutBegin: imLayoutBegin, LayoutEnd: imLayoutEnd,
    Size: imSize, Padding: imPadding, PaddingRL: imPaddingRL, PaddingTB: imPaddingTB,
    Gap: imGap, AspectRatio: imAspectRatio,
    Flex: imFlex, FlexWrap: imFlexWrap, 
    Pre: imPre, PreWrap: imPreWrap, NoWrap: imNoWrap, HandleLongWords: imHandleLongWords,
    NoSelect: imNoSelect,
    Align: imAlign, Justify: imJustify,
    Relative: imRelative, Fixed: imFixed, FixedXY: imFixedXY, Absolute: imAbsolute, AbsoluteXY: imAbsoluteXY,
    ScrollOverflow: imScrollOverflow,
    ZIndex: imZIndex,

    // Styling logic
    Opacity: imOpacity, Bg: imBg, Fg: imFg, FontSize: imFontSize,  FontSizeCss: imFontSizeCss,
    DebugOutline: imDebugOutline,
    
    // Common space reserving component
    Flex1: imFlex1,
    
    // Colours
    newColor, newColorFromHexOrUndefined, newColorFromHex, newColorFromHsv, lerpColor, copyColor, rgbaToCssString
};
