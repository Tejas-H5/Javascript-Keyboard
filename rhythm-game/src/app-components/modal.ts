import {
    COL,
    imAbsolute,
    imAlign,
    imBg,
    imFixed,
    imJustify,
    imLayoutBegin,
    imLayoutEnd,
    imZIndex,
    PX,
    ROW
} from "src/components/core/layout";
import {
    ImCache
} from "src/utils/im-core";

export function imModalBegin(c: ImCache, zIndex = 100) {
    imLayoutBegin(c, COL); imFixed(c, 0, PX, 0, PX, 0, PX, 0, PX); imZIndex(c, zIndex); {
        imLayoutBegin(c, COL); imAlign(c); imJustify(c); imAbsolute(c, 0, PX, 0, PX, 0, PX, 0, PX); imBg(c, `rgba(0, 0, 0, 0.3)`); {
        } // imLayoutEnd(c);
    } // imLayoutEnd(c);
}

export function imModalEnd(c: ImCache) {
    imLayoutEnd(c);
    imLayoutEnd(c);
}
