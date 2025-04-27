// NOTE: you only get 32 of these. use them wisely.

import { cn } from "src/utils/cn";
import { imBeginDiv, imMemo, imRef, imState, setClass, setStyle } from "src/utils/im-dom-utils";
import { cnApp } from "./styling";

// (while JS numbers are 64 bit, bit ops are all 32 bits)
export const ROW = 1 << 1;
export const COL = 1 << 2;
export const FLEX1 = 1 << 3;
export const GAP5 = 1 << 4;
export const ALIGN_CENTER = 1 << 7;
export const ALIGN_STRETCH = 1 << 8;
export const JUSTIFY_CENTER = 1 << 9;
export const RELATIVE = 1 << 10;
export const ABSOLUTE = 1 << 11;
export const H1 = 1 << 12;
export const H2 = 1 << 13;
export const H3 = 1 << 14;
export const FIXED = 1 << 15;
export const TRANSPARENT = 1 << 16;
export const OVERFLOW_HIDDEN = 1 << 17;
export const JUSTIFY_START = 1 << 18;
export const JUSTIFY_END = 1 << 19;
export const BOLD = 1 << 20;
export const GAP10 = 1 << 21;
export const INLINE_BLOCK = 1 << 22;

export function setStyleFlags(flags: number) {
    setClass(cn.row, (flags & ROW));
    setClass(cn.col, (flags & COL));
    setClass(cn.flex1, (flags & FLEX1));
    setClass(cnApp.gap5, (flags & GAP5));
    setClass(cn.alignItemsCenter, (flags & ALIGN_CENTER));
    setClass(cn.alignItemsStretch, (flags & ALIGN_STRETCH));
    setClass(cn.justifyContentCenter, (flags & JUSTIFY_CENTER));
    setClass(cn.absolute, (flags & ABSOLUTE));
    setClass(cn.relative, (flags & RELATIVE));
    setClass(cnApp.h1, (flags & H1));
    // TODO: H2, H3
    const fixed = (flags & FIXED);
    setClass(cn.fixed, fixed);
    setStyle("top", fixed ? "0" : "");
    setStyle("left", fixed ? "0" : "");
    setStyle("bottom", fixed ? "0" : "");
    setStyle("right", fixed ? "0" : "");
    setClass(cn.overflowHidden, (flags & OVERFLOW_HIDDEN));
    setClass(cn.justifyContentStart, (flags & JUSTIFY_START));
    setClass(cn.justifyContentEnd, (flags & JUSTIFY_END));
    setClass(cnApp.b, (flags & BOLD));
    setClass(cnApp.gap10, (flags & GAP10));
    setClass(cn.inlineBlock, (flags & INLINE_BLOCK));
}


export function imBeginLayout(flags: number = 0) {
    const root = imBeginDiv(); {
        if (imMemo(flags)) {
            setStyleFlags(flags);
        }
    };

    return root;
}

export const PX = 10001;
export const EM = 20001;
export const PERCENT = 30001;
export const NOT_SET = 40001;

export type SizeUnits = typeof PX |
    typeof EM |
    typeof PERCENT |
    typeof NOT_SET;

function getUnits(num: SizeUnits) {
    switch(num) {
        case EM: return "em";
        case PERCENT: return "%";
        default: return "px";
    }
}

function getSize(num: number, units: SizeUnits) {
    return units === NOT_SET ? "" : num + getUnits(units);
}

export function imBeginSpace(
    width: number, wType: SizeUnits,
    height: number, hType: SizeUnits, 
    flags = 0,
) {
    const valRef = imRef<{ width: number; height: number; wType: number; hType: number; }>();
    if (valRef.val === null) {
        valRef.val = { width: 0, height: 0, wType: 0, hType: 0 };
    }
    const val = valRef.val;

    imBeginLayout(flags); {
        if (val.width !== width || val.wType !== wType) {
            val.width = width;
            val.wType = wType;
            setStyle("width", getSize(width, wType));
        }

        if (val.height !== height || val.hType !== hType) {
            val.height = height;
            val.hType = hType;
            setStyle("height", getSize(height, hType));
        }
    } // user specified end
}


function newImBeginPaddingState() {
    return {
        paddingTop: 0, paddingTopType: 0,
        paddingLeft: 0, paddingLeftType: 0,
        paddingBottom: 0, paddingBottomType: 0,
        paddingRight: 0, paddingRightType: 0,
    }
}
export function imBeginPadding(
    paddingTop: number, paddingTopType: SizeUnits,
    paddingLeft: number, paddingLeftType: SizeUnits,
    paddingBottom: number, paddingBottomType: SizeUnits,
    paddingRight: number, paddingRightType: SizeUnits,
    flags = 0,
) {
    const s = imState(newImBeginPaddingState);

    imBeginLayout(flags); {
        if (s.paddingTop !== paddingTop || s.paddingTopType !== paddingTopType) {
            s.paddingTop = paddingTop; s.paddingTopType = paddingTopType;
            setStyle("paddingTop", getSize(paddingTop, paddingTopType));
        }

        if (s.paddingLeft !== paddingLeft || s.paddingLeftType !== paddingLeftType) {
            s.paddingLeft = paddingLeft; s.paddingLeftType = paddingLeftType;
            setStyle("paddingLeft", getSize(paddingLeft, paddingLeftType));
        }

        if (s.paddingBottom !== paddingBottom || s.paddingBottomType !== paddingBottomType) {
            s.paddingBottom = paddingBottom; s.paddingBottomType = paddingBottomType;
            setStyle("paddingBottom", getSize(paddingBottom, paddingBottomType));
        }

        if (s.paddingRight !== paddingRight || s.paddingRightType !== paddingRightType) {
            s.paddingRight = paddingRight; s.paddingRightType = paddingRightType;
            setStyle("paddingRight", getSize(paddingRight, paddingRightType));
        }
    } // user specified end
}


function newImBeginAbsoluteState() {
    return {
        top: 0, topType: 0,
        left: 0, leftType: 0,
        bottom: 0, bottomType: 0,
        right: 0, rightType: 0,
    }
}
export function imBeginAbsolute(
    top: number, topType: SizeUnits,
    left: number, leftType: SizeUnits,
    bottom: number, bottomType: SizeUnits,
    right: number, rightType: SizeUnits,
    flags = 0,
) {
    const s = imState(newImBeginAbsoluteState);

    imBeginLayout(ABSOLUTE | flags); {
        if (s.top !== top || s.topType !== topType) {
            s.top = top; s.topType = topType;
            setStyle("top", getSize(top, topType));
        }

        if (s.left !== left || s.leftType !== leftType) {
            s.left = left; s.leftType = leftType;
            setStyle("left", getSize(left, leftType));
        }

        if (s.bottom !== bottom || s.bottomType !== bottomType) {
            s.bottom = bottom; s.bottomType = bottomType;
            setStyle("bottom", getSize(bottom, bottomType));
        }

        if (s.right !== right || s.rightType !== rightType) {
            s.right = right; s.rightType = rightType;
            setStyle("right", getSize(right, rightType));
        }
    } // user specified end
}
