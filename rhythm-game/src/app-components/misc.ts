import { imLayoutBegin, ROW } from "src/components/core/layout.ts";
import { im, ImCache, imdom, el, ev, } from "src/utils/im-js";


export function imVerticalText(c: ImCache) {
    imLayoutBegin(c, ROW); {
        if (im.isFirstishRender(c)) {
            imdom.setStyle(c, "writingMode", "sideways-lr");
            imdom.setStyle(c, "textOrientation", "mixed");
        }
    } // imLayoutEnd
}

