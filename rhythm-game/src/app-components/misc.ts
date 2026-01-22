import { imLayoutBegin, ROW } from "src/components/core/layout";
import { ImCache, isFirstishRender } from "src/utils/im-core";
import { elSetStyle } from "src/utils/im-dom";

export function imVerticalText(c: ImCache) {
    imLayoutBegin(c, ROW); {
        if (isFirstishRender(c)) {
            elSetStyle(c, "writingMode", "sideways-lr");
            elSetStyle(c, "textOrientation", "mixed");
        }
    } // imLayoutEnd
}

