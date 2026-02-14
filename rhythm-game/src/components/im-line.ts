import { BLOCK, imBg, imLayoutBegin, imLayoutEnd, imOpacity, imSize, NA, PERCENT, PX } from "src/components/core/layout.ts";
import { newCssBuilder } from "src/utils/cssb.ts";
import { ImCache, isFirstishRender } from "src/utils/im-core.ts";
import { elSetClass } from "src/utils/im-dom.ts";
import { cssVars } from "./core/stylesheets.ts";

const cssb = newCssBuilder();
const cnLine = cssb.cn("line", [
    ` { transition: opacity 0.1s linear, height 0.1s linear; }`
]);

export const LINE_HORIZONTAL = 1;
export const LINE_HORIZONTAL_PADDING = 2;
export const LINE_VERTICAL = 3;
export const LINE_VERTICAL_PADDING = 4;

export type LineType
    =  typeof LINE_HORIZONTAL
    |  typeof LINE_VERTICAL
    |  typeof LINE_HORIZONTAL_PADDING
    |  typeof LINE_VERTICAL_PADDING;

export function imLine(
    c: ImCache,
    type: LineType,
    widthPx: number = 2,
    opacity: number = 1,
) {
    let heightUnit = PX;
    const isH = type === LINE_HORIZONTAL || type === LINE_HORIZONTAL_PADDING;
    const isOpaque = type === LINE_HORIZONTAL || type === LINE_VERTICAL;

    imLayoutBegin(c, BLOCK); 
    imSize(c, !isH ? widthPx : 100, !isH ? heightUnit : PERCENT,
               isH ? widthPx : 100,  isH ? heightUnit : PERCENT); 
    imBg(c, isOpaque ? cssVars.fg : ""); imOpacity(c, opacity); {
        if (isFirstishRender(c)) {
            elSetClass(c, cnLine);
        }
    } imLayoutEnd(c);
}

export function imHLineDivider(c: ImCache) {
    imLayoutBegin(c, BLOCK); imSize(c, 0, NA, 10, PX); imLayoutEnd(c);
}

