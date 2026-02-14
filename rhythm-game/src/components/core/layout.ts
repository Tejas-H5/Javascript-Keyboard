import { newCssBuilder } from "src/utils/cssb.ts";
import { ImCache, imGet, imMemo, imSet, inlineTypeId, isFirstishRender } from "src/utils/im-core.ts";
import { EL_DIV, elSetClass, elSetStyle, imElBegin, imElEnd } from "src/utils/im-dom.ts";
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
    let size = imGet(c, imSize);
    if (size === undefined) {
        size = imSet(c, { width: 0, wType: NA, height: 0, hType: NA });
    }

    // TODO: Cross browser testing. Seems a bit sus here

    if (size.width !== width || size.wType !== wType) {
        size.width = width;
        size.wType = wType;
        const sizeCss = getSize(width, wType);
        elSetStyle(c, "width",    sizeCss); 
        elSetStyle(c, "minWidth", sizeCss);
        elSetStyle(c, "maxWidth", sizeCss);
    }

    if (size.height !== height || size.hType !== hType) {
        size.height = height;
        size.hType = hType;
        const sizeCss = getSize(height, hType);
        elSetStyle(c, "height",    sizeCss); 
        elSetStyle(c, "minHeight", sizeCss);
        elSetStyle(c, "maxHeight", sizeCss);
    }

    return size;
}

export function imOpacity(c: ImCache, val: number) {
    let lastVal = imGet(c, inlineTypeId(imOpacity));
    if (lastVal !== val) {
        imSet(c, val);
        elSetStyle(c, "opacity", "" + val);
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
    let val = imGet(c, newPaddingState);
    if (val === undefined) val = imSet(c, newPaddingState());

    if (val.left !== left || val.leftType !== leftType) {
        val.left = left; val.leftType = leftType;
        elSetStyle(c, "paddingLeft", getSize(left, leftType));
    }

    if (val.right !== right || val.rightType !== rightType) {
        val.right = right; val.rightType = rightType;
        elSetStyle(c, "paddingRight", getSize(right, rightType));
    }

    if (val.top !== top || val.topType !== topType) {
        val.top = top; val.topType = topType;
        elSetStyle(c, "paddingTop", getSize(top, topType));
    }

    if (val.bottom !== bottom || val.bottomType !== bottomType) {
        val.bottom = bottom; val.bottomType = bottomType;
        elSetStyle(c, "paddingBottom", getSize(bottom, bottomType));
    }
}

export function imRelative(c: ImCache) {
    if (isFirstishRender(c)) {
        elSetClass(c, cn.relative);
    }
}

export function imBg(c: ImCache, colour: string) {
    if (imMemo(c, colour)) {
        elSetStyle(c, "backgroundColor", colour);
    }
}

export function imFg(c: ImCache, colour: string) {
    if (imMemo(c, colour)) {
        elSetStyle(c, "color", colour);
    }
}

export function imFontSize(c: ImCache, size: number, units: SizeUnits) {
    const sizeChanged = imMemo(c, size);
    const unitsChanged = imMemo(c, units);
    if (sizeChanged || unitsChanged) {
        elSetStyle(c, "fontSize", getSize(size, units));
    }
}

export type DisplayTypeInstance = number & { __displayType: void; };

/**
 * Whitespace " " can permeate 'through' display: block DOM nodes, so it's useful for text.
 * ```ts
 * imLayout(c, BLOCK); { 
 *      imLayout(c, INLINE); {
 *          if (isFirstishRender(c)) elSetStyle(c, "fontWeight", "bold");
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
        if (isFirstishRender(c)) elSetStyle(c, "flex", "1");
    } imLayoutEnd(c);
}

export function imLayoutBegin(c: ImCache, type: DisplayType) {
    return imLayoutBeginInternal(c, type).root;
}

export function imLayoutBeginInternal(c: ImCache, type: DisplayType) {
    const root = imElBegin(c, EL_DIV);

    const last = imGet(c, inlineTypeId(imLayoutBegin), -1);
    if (last !== type) {
        imSet(c, type);

        switch(last) {
            case BLOCK:        /* Do nothing - this is the default style */ break;
            case INLINE_BLOCK: elSetClass(c, cn.inlineBlock, false);        break;
            case INLINE:       elSetClass(c, cn.inline, false);             break;
            case ROW:          elSetClass(c, cn.row, false);                break;
            case ROW_REVERSE:  elSetClass(c, cn.rowReverse, false);         break;
            case COL:          elSetClass(c, cn.col, false);                break;
            case COL_REVERSE:  elSetClass(c, cn.colReverse, false);         break;
            case TABLE:        elSetClass(c, cn.table, false);              break;
            case TABLE_ROW:    elSetClass(c, cn.tableRow, false);           break;
            case TABLE_CELL:   elSetClass(c, cn.tableCell, false);          break;
        }

        switch(type) {
            case BLOCK:        /* Do nothing - this is the default style */ break;
            case INLINE_BLOCK: elSetClass(c, cn.inlineBlock, true);         break;
            case INLINE:       elSetClass(c, cn.inline, true);              break;
            case ROW:          elSetClass(c, cn.row, true);                 break;
            case ROW_REVERSE:  elSetClass(c, cn.rowReverse, true);          break;
            case COL:          elSetClass(c, cn.col, true);                 break;
            case COL_REVERSE:  elSetClass(c, cn.colReverse, true);          break;
            case TABLE:        elSetClass(c, cn.table, true);               break;
            case TABLE_ROW:    elSetClass(c, cn.tableRow, true);            break;
            case TABLE_CELL:   elSetClass(c, cn.tableCell, true);           break;
        }
    }

    return root;
}

export function imPre(c: ImCache) {
    if (isFirstishRender(c)) {
        elSetClass(c, cn.pre);
    }
}

export function imNoWrap(c: ImCache) {
    if (isFirstishRender(c)) {
        elSetClass(c, cn.noWrap);
    }
}

export function imLayoutEnd(c: ImCache) {
    imElEnd(c, EL_DIV);
}

export function imFlex(c: ImCache, ratio = 1) {
    if (imMemo(c, ratio)) {
        elSetStyle(c, "flex", "" + ratio);
        // required to make flex work the way I had thought it already worked
        elSetStyle(c, "minWidth", "0");
        elSetStyle(c, "minHeight", "0");
    }
}

export function imFlexWrap(c: ImCache) {
    if (isFirstishRender(c)) {
        elSetStyle(c, "flexWrap", "wrap");
    }
}

export function imGap(c: ImCache, val = 0, units: SizeUnits) {
    const valChanged = imMemo(c, val);
    const unitsChanged = imMemo(c, units);
    if (valChanged || unitsChanged) {
        elSetStyle(c, "gap", getSize(val, units));
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
    if (imMemo(c, alignment)) {
        elSetStyle(c, "alignItems", getAlignment(alignment));
    }
}

export function imJustify(c: ImCache, alignment = CENTER) {
    if (imMemo(c, alignment)) {
        elSetStyle(c, "justifyContent", getAlignment(alignment));
    }
}

export function imScrollOverflow(c: ImCache, vScroll = true, hScroll = false) {
    if (imMemo(c, vScroll)) {
        elSetClass(c, cn.overflowYAuto, vScroll);
    }

    if (imMemo(c, hScroll)) {
        elSetClass(c, cn.overflowXAuto, hScroll);
    }
}


export function imFixed(
    c: ImCache,
    top: number, topType: SizeUnits,
    right: number, rightType: SizeUnits,
    bottom: number, bottomType: SizeUnits,
    left: number, leftType: SizeUnits,
) {
    if (isFirstishRender(c)) {
        elSetClass(c, cn.fixed);
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
    if (isFirstishRender(c)) {
        elSetClass(c, cn.fixed);
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
    let val = imGet(c, newPaddingState);
    if (val === undefined) val = imSet(c, newPaddingState());

    if (val.left !== left || val.leftType !== leftType) {
        val.left = left; val.leftType = leftType;
        elSetStyle(c, "left", getSize(left, leftType));
    }

    if (val.right !== right || val.rightType !== rightType) {
        val.right = right; val.rightType = rightType;
        elSetStyle(c, "right", getSize(right, rightType));
    }

    if (val.top !== top || val.topType !== topType) {
        val.top = top; val.topType = topType;
        elSetStyle(c, "top", getSize(top, topType));
    }

    if (val.bottom !== bottom || val.bottomType !== bottomType) {
        val.bottom = bottom; val.bottomType = bottomType;
        elSetStyle(c, "bottom", getSize(bottom, bottomType));
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
    if (isFirstishRender(c)) {
        elSetClass(c, cn.absolute);
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
    if (isFirstishRender(c)) {
        elSetClass(c, cn.absolute);
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

    if (imMemo(c, noScroll)) {
        if (noScroll) {
            elSetStyle(c, "overflow", "hidden");
            elSetClass(c, cn.overflowYAuto, false);
        } else {
            elSetClass(c, cn.overflowYAuto, true);
        }
    }

    return root;
}

export function imOverflowContainerEnd(c: ImCache) {
    imLayoutEnd(c);
}

export function imAspectRatio(c: ImCache, w: number, h: number) {
    if (isFirstishRender(c)) {
        elSetStyle(c, "width", "auto");
        elSetStyle(c, "height", "auto");
    }

    const ar = w / h;
    if (imMemo(c, ar)) {
        elSetStyle(c, "aspectRatio", w + " / " + h);
    }
}

export function imZIndex(c: ImCache, z: number) {
    if (imMemo(c, z)) {
        elSetStyle(c, "zIndex", "" + z);
    }
}
