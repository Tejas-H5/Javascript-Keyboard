import { BLOCK, imLayout, imLayoutEnd, imSize, NA, PERCENT, PX } from "src/components/core/layout";
import { newCssBuilder } from "src/utils/cssb";
import { ImCache, imMemo, isFirstishRender } from "src/utils/im-core";
import { elSetClass, elSetStyle } from "src/utils/im-dom";
import { cssVars } from "./core/stylesheets";

const cssb = newCssBuilder();
const cnHLine = cssb.cn("hline", [
    ` { transition: opacity 0.1s linear, height 0.1s linear; }`
]);

export const LINE_HORIZONTAL = 1;
export const LINE_VERTICAL = 2;

// Not beating the left-pad alegations ...

export function imLine(
    c: ImCache,
    type: typeof LINE_HORIZONTAL | typeof LINE_VERTICAL,
    widthPx: number = 2,
    visible = true
) {
    let height = visible ? widthPx : 0;
    let heightUnit = PX;
    const isH = type === LINE_HORIZONTAL;

    imLayout(c, BLOCK); imSize(c,
        !isH ? height : 100, !isH ? heightUnit : PERCENT,
         isH ? height : 100,  isH ? heightUnit : PERCENT,
    ); {
        if (isFirstishRender(c)) {
            elSetStyle(c, "backgroundColor", cssVars.fg);
            elSetClass(c, cnHLine);
        }

        if (imMemo(c, visible)) {
            elSetStyle(c, "opacity", "" + (visible ? 1 : 0));
        }
    } imLayoutEnd(c);
}

export function imHLineDivider(c: ImCache) {
    imLayout(c, BLOCK); imSize(c, 0, NA, 10, PX); imLayoutEnd(c);
}

