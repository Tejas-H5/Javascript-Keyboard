import { im, ImCache, imdom } from "src/utils/im-js";
import { BLOCK, cssVars, imui, NA, PERCENT, PX } from "src/utils/im-js/im-ui";

const cssb = imui.newCssBuilder();
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

    imui.Begin(c, BLOCK); 
    imui.Size(c, !isH ? widthPx : 100, !isH ? heightUnit : PERCENT,
               isH ? widthPx : 100,  isH ? heightUnit : PERCENT); 
    imui.Bg(c, isOpaque ? cssVars.fg : ""); imui.Opacity(c, opacity); {
        if (im.isFirstishRender(c)) {
            imdom.setClass(c, cnLine);
        }
    } imui.End(c);
}

export function imHLineDivider(c: ImCache) {
    imui.Begin(c, BLOCK); imui.Size(c, 0, NA, 10, PX); imui.End(c);
}

