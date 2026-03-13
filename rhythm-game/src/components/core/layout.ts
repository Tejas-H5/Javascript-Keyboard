import { newCssBuilder } from "src/utils/cssb.ts";
import { im, ImCache, imdom, el, ev, DomAppender, elsvg, } from "src/utils/im-js";

import { cn, cssVars } from "./stylesheets.ts";

const cssb = newCssBuilder();

// It occurs to me that I can actually just make my own fully custom layout system that significantly minimizes
// number of DOM nodes required to get things done.

export type SizeUnitInstance = number & { __sizeUnit: void; };

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
    return units === NA ? "" : num + getUnits(units);
}

type SizeState = {
    width: number, wType: SizeUnits,
    height: number, hType: SizeUnits, 
};

export function imSize(
    c: ImCache,
    width: number, wType: SizeUnits,
    height: number, hType: SizeUnits, 
): SizeState {
    let size = im.Get(c, imSize);
    if (size === undefined) {
        size = im.Set(c, { width: 0, wType: NA, height: 0, hType: NA });
    }

    // TODO: Cross browser testing. Seems a bit sus here

    if (size.width !== width || size.wType !== wType) {
        size.width = width;
        size.wType = wType;
        const sizeCss = getSize(width, wType);
        imdom.setStyle(c, "width",    sizeCss); 
        imdom.setStyle(c, "minWidth", sizeCss);
        imdom.setStyle(c, "maxWidth", sizeCss);
    }

    if (size.height !== height || size.hType !== hType) {
        size.height = height;
        size.hType = hType;
        const sizeCss = getSize(height, hType);
        imdom.setStyle(c, "height",    sizeCss); 
        imdom.setStyle(c, "minHeight", sizeCss);
        imdom.setStyle(c, "maxHeight", sizeCss);
    }

    return size;
}

export function imOpacity(c: ImCache, val: number) {
    let lastVal = im.GetInline(c, imOpacity);
    if (lastVal !== val) {
        im.Set(c, val);
        imdom.setStyle(c, "opacity", "" + val);
    }
}

type PaddingState = {
    left: number,   leftType: SizeUnits,
    right: number,  rightType: SizeUnits, 
    top: number,    topType: SizeUnits,
    bottom: number, bottomType: SizeUnits, 
};

function newPaddingState(): PaddingState {
    return {
        left: 0, leftType: NA,
        right: 0, rightType: NA,
        top: 0, topType: NA,
        bottom: 0, bottomType: NA,
    }
}

export function imPadding(
    c: ImCache,
    top: number,    topType: SizeUnits,
    right: number,  rightType: SizeUnits, 
    bottom: number, bottomType: SizeUnits, 
    left: number,   leftType: SizeUnits,
) {
    imPaddingRL(c, right, rightType, left, leftType);
    imPaddingTB(c, top, topType, bottom, bottomType);
}

export function imPaddingTB(
    c: ImCache,
    top: number,    topType: SizeUnits,
    bottom: number, bottomType: SizeUnits, 
) {
    if (im.Memo(c, top) | im.Memo(c, topType)) {
        imdom.setStyle(c, "paddingTop", getSize(top, topType));
    }

    if (im.Memo(c, bottom) | im.Memo(c, bottomType)) {
        imdom.setStyle(c, "paddingBottom", getSize(bottom, bottomType));
    }
}

export function imPaddingRL(
    c: ImCache,
    right: number,  rightType: SizeUnits, 
    left: number,   leftType: SizeUnits,
) {
    if (im.Memo(c, right) | im.Memo(c, rightType)) {
        imdom.setStyle(c, "paddingRight", getSize(left, leftType));
    }

    if (im.Memo(c, left) | im.Memo(c, leftType)) {
        imdom.setStyle(c, "paddingLeft", getSize(left, leftType));
    }
}

export function imRelative(c: ImCache) {
    if (im.isFirstishRender(c)) {
        imdom.setClass(c, cn.relative);
    }
}

export function imBg(c: ImCache, colour: string) {
    if (im.Memo(c, colour)) {
        imdom.setStyle(c, "backgroundColor", colour);
    }
}

export function imFg(c: ImCache, colour: string) {
    if (im.Memo(c, colour)) {
        imdom.setStyle(c, "color", colour);
    }
}

export function imFontSize(c: ImCache, size: number, units: SizeUnits) {
    const sizeChanged = im.Memo(c, size);
    const unitsChanged = im.Memo(c, units);
    if (sizeChanged || unitsChanged) {
        imdom.setStyle(c, "fontSize", getSize(size, units));
    }
}

export type DisplayTypeInstance = number & { __displayType: void; };

/**
 * Whitespace " " can permeate 'through' display: block DOM nodes, so it's useful for text.
 * ```ts
 * imLayout(c, BLOCK); { 
 *      imLayout(c, INLINE); {
 *          if (im.isFirstishRender(c)) imdom.setStyle(c, "fontWeight", "bold");
 *          imdom.Str(c, "Hello, "); // imLayout(c, ROW) would ignore this whitespace.
 *      } imLayoutEnd(c);
 *      imdom.Str(c, "World"); 
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

export type DisplayType 
    = typeof BLOCK 
    | typeof INLINE_BLOCK 
    | typeof ROW 
    | typeof ROW_REVERSE 
    | typeof COL 
    | typeof COL_REVERSE 
    | typeof TABLE 
    | typeof TABLE_ROW  
    | typeof TABLE_CELL;

/**
 * A dummy element with flex: 1. Super useful for flexbox.
 */
export function imFlex1(c: ImCache) {
    imLayoutBegin(c, BLOCK); {
        if (im.isFirstishRender(c)) imdom.setStyle(c, "flex", "1");
    } imLayoutEnd(c);
}

export function imLayoutBegin(c: ImCache, type: DisplayType) {
    return imLayoutBeginInternal(c, type).root;
}

export function imLayoutBeginInternal(c: ImCache, type: DisplayType) {
    const root = imdom.ElBegin(c, el.DIV);

    const last = im.GetInline(c, imLayoutBegin, -1);
    if (last !== type) {
        im.Set(c, type);

        switch(last) {
            case BLOCK:        /* Do nothing - this is the default style */ break;
            case INLINE_BLOCK: imdom.setClass(c, cn.inlineBlock, false);        break;
            case INLINE:       imdom.setClass(c, cn.inline, false);             break;
            case ROW:          imdom.setClass(c, cn.row, false);                break;
            case ROW_REVERSE:  imdom.setClass(c, cn.rowReverse, false);         break;
            case COL:          imdom.setClass(c, cn.col, false);                break;
            case COL_REVERSE:  imdom.setClass(c, cn.colReverse, false);         break;
            case TABLE:        imdom.setClass(c, cn.table, false);              break;
            case TABLE_ROW:    imdom.setClass(c, cn.tableRow, false);           break;
            case TABLE_CELL:   imdom.setClass(c, cn.tableCell, false);          break;
        }

        switch(type) {
            case BLOCK:        /* Do nothing - this is the default style */ break;
            case INLINE_BLOCK: imdom.setClass(c, cn.inlineBlock, true);         break;
            case INLINE:       imdom.setClass(c, cn.inline, true);              break;
            case ROW:          imdom.setClass(c, cn.row, true);                 break;
            case ROW_REVERSE:  imdom.setClass(c, cn.rowReverse, true);          break;
            case COL:          imdom.setClass(c, cn.col, true);                 break;
            case COL_REVERSE:  imdom.setClass(c, cn.colReverse, true);          break;
            case TABLE:        imdom.setClass(c, cn.table, true);               break;
            case TABLE_ROW:    imdom.setClass(c, cn.tableRow, true);            break;
            case TABLE_CELL:   imdom.setClass(c, cn.tableCell, true);           break;
        }
    }

    return root;
}

export function imPre(c: ImCache) {
    if (im.isFirstishRender(c)) {
        imdom.setClass(c, cn.pre);
    }
}

export function imNoWrap(c: ImCache) {
    if (im.isFirstishRender(c)) {
        imdom.setClass(c, cn.noWrap);
    }
}

export function imLayoutEnd(c: ImCache) {
    imdom.ElEnd(c, el.DIV);
}

export function imFlex(c: ImCache, ratio = 1) {
    if (im.Memo(c, ratio)) {
        imdom.setStyle(c, "flex", "" + ratio);
        // required to make flex work the way I had thought it already worked
        imdom.setStyle(c, "minWidth", "0");
        imdom.setStyle(c, "minHeight", "0");
    }
}

export function imFlexWrap(c: ImCache) {
    if (im.isFirstishRender(c)) {
        imdom.setStyle(c, "flexWrap", "wrap");
    }
}

export function imGap(c: ImCache, val = 0, units: SizeUnits) {
    const valChanged = im.Memo(c, val);
    const unitsChanged = im.Memo(c, units);
    if (valChanged || unitsChanged) {
        imdom.setStyle(c, "gap", getSize(val, units));
    }
}

// Add more as needed
export const NONE = 0;
export const CENTER = 1;
export const LEFT = 2;
export const RIGHT = 3;
export const START = 2;
export const END = 3;
export const STRETCH = 4;
export const SPACE_BETWEEN = 5;
export const SPACE_AROUND = 6;
export const SPACE_EVENLY = 7;

function getAlignment(alignment: number) {
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

export function imAlign(c: ImCache, alignment = CENTER) {
    if (im.Memo(c, alignment)) {
        imdom.setStyle(c, "alignItems", getAlignment(alignment));
    }
}

export function imJustify(c: ImCache, alignment = CENTER) {
    if (im.Memo(c, alignment)) {
        imdom.setStyle(c, "justifyContent", getAlignment(alignment));
    }
}

export function imScrollOverflow(c: ImCache, vScroll = true, hScroll = false) {
    if (im.Memo(c, vScroll)) {
        imdom.setClass(c, cn.overflowYAuto, vScroll);
    }

    if (im.Memo(c, hScroll)) {
        imdom.setClass(c, cn.overflowXAuto, hScroll);
    }
}


export function imFixed(
    c: ImCache,
    top: number, topType: SizeUnits,
    right: number, rightType: SizeUnits,
    bottom: number, bottomType: SizeUnits,
    left: number, leftType: SizeUnits,
) {
    if (im.isFirstishRender(c)) {
        imdom.setClass(c, cn.fixed);
    }

    imOffsets(
        c,
        top, topType,
        right, rightType,
        bottom, bottomType,
        left, leftType,
    );
}

export function imFixedXY(c: ImCache, x: number, xType: SizeUnits, y: number, yUnits: SizeUnits) {
    if (im.isFirstishRender(c)) {
        imdom.setClass(c, cn.fixed);
    }

    imOffsets(
        c,
        y, yUnits,
        0, NA,
        0, NA, 
        x, xType
    );
}

function imOffsets(
    c: ImCache,
    top: number, topType: SizeUnits,
    right: number, rightType: SizeUnits,
    bottom: number, bottomType: SizeUnits,
    left: number, leftType: SizeUnits,
) {
    let val = im.Get(c, newPaddingState);
    if (val === undefined) val = im.Set(c, newPaddingState());

    if (val.left !== left || val.leftType !== leftType) {
        val.left = left; val.leftType = leftType;
        imdom.setStyle(c, "left", getSize(left, leftType));
    }

    if (val.right !== right || val.rightType !== rightType) {
        val.right = right; val.rightType = rightType;
        imdom.setStyle(c, "right", getSize(right, rightType));
    }

    if (val.top !== top || val.topType !== topType) {
        val.top = top; val.topType = topType;
        imdom.setStyle(c, "top", getSize(top, topType));
    }

    if (val.bottom !== bottom || val.bottomType !== bottomType) {
        val.bottom = bottom; val.bottomType = bottomType;
        imdom.setStyle(c, "bottom", getSize(bottom, bottomType));
    }
}


/**
 * 'Trouble' acronymn. Top Right Bottom Left. This is what we have resorted to.
 * Silly order. But it's the css standard convention.
 * I would have preferred (left, top), (right, bottom). You know, (x=0, y=0) -> (x=width, y=height) in HTML coordinates. xD
 */
export function imAbsolute(
    c: ImCache,
    top: number, topType: SizeUnits,
    right: number, rightType: SizeUnits, 
    bottom: number, bottomType: SizeUnits, 
    left: number, leftType: SizeUnits,
) {
    if (im.isFirstishRender(c)) {
        imdom.setClass(c, cn.absolute);
    }

    imOffsets(
        c,
        top, topType,
        right, rightType,
        bottom, bottomType,
        left, leftType,
    );
}

export function imAbsoluteXY(c: ImCache, x: number, xType: SizeUnits, y: number, yUnits: SizeUnits) {
    if (im.isFirstishRender(c)) {
        imdom.setClass(c, cn.absolute);
    }

    imOffsets(
        c,
        y, yUnits,
        0, NA,
        0, NA, 
        x, xType
    );
}

export function imOverflowContainer(c: ImCache, noScroll: boolean = false) {
    const root = imLayoutBegin(c, BLOCK);

    if (im.Memo(c, noScroll)) {
        if (noScroll) {
            imdom.setStyle(c, "overflow", "hidden");
            imdom.setClass(c, cn.overflowYAuto, false);
        } else {
            imdom.setClass(c, cn.overflowYAuto, true);
        }
    }

    return root;
}

export function imOverflowContainerEnd(c: ImCache) {
    imLayoutEnd(c);
}

export function imAspectRatio(c: ImCache, w: number, h: number) {
    if (im.isFirstishRender(c)) {
        imdom.setStyle(c, "width", "auto");
        imdom.setStyle(c, "height", "auto");
    }

    const ar = w / h;
    if (im.Memo(c, ar)) {
        imdom.setStyle(c, "aspectRatio", w + " / " + h);
    }
}

export function imZIndex(c: ImCache, z: number) {
    if (im.Memo(c, z)) {
        imdom.setStyle(c, "zIndex", "" + z);
    }
}


export type SvgContext = {
    root: DomAppender<SVGSVGElement>;
    svg: SVGSVGElement;
    x0: number;
    y0: number;
    width: number; 
    height: number;
    resized: boolean;
}


/**
 * An alternative to {@link el.SVG} for larger svg-based components/scenes.
 * Use this with {@link imElBeginExisting/imElEndExisting}
 *
 * For one off icons, this is probably not as ideal.
 *
 * NOTE: large svg-based scenes are very hard and cumbersone to code. 
 * This could very well be because this SvgContext isnt fully formed.
 */
export function imSvgContext(c: ImCache, zIndex = 1000000): SvgContext {
    const el = imdom.getElement(c);
    const elRect = el.getBoundingClientRect();

    const svgRoot = imdom.ElSvgBegin(c, elsvg.SVG); imdom.FinalizeDeferred(c); 
    imZIndex(c, zIndex);
    let ctx = im.Get(c, imSvgContext);
    if (ctx === undefined) {
        ctx = { 
            root: svgRoot,
            svg: svgRoot.root,
            x0: 0,
            y0: 0,
            width: 0,
            height: 0,
            resized: false,
        };
        im.Set(c, ctx);
    }


    {
        ctx.x0 = elRect.left;
        ctx.width = elRect.width;
        ctx.y0 = elRect.top;
        ctx.height = elRect.height;

        imFixedXY(c, ctx.x0, PX, ctx.y0, PX);
        imSize(c, ctx.width, PX, ctx.height, PX);

        const x0Changed = im.Memo(c, ctx.x0);
        const widthChanged = im.Memo(c, ctx.width);
        const y0Changed = im.Memo(c, ctx.y0);
        const heightChanged = im.Memo(c, ctx.height);

        // Allows us to render our SVGs using screen coordinates, which 
        // is usually what we want when we're drawing lines between two divs or whatever.
        if (x0Changed || widthChanged || y0Changed || heightChanged) {
            imdom.setAttr(c, "viewBox", `${ctx.x0} ${ctx.y0} ${ctx.width}, ${ctx.height}`);
        }

        // users to render their stuff here by re-pushing
    
    } imdom.ElSvgEnd(c, elsvg.SVG);


    return ctx;
}

