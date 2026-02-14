import { imLayoutBegin, ROW } from "src/components/core/layout.ts";
import { ImCache, isFirstishRender } from "src/utils/im-core.ts";
import { elSetStyle } from "src/utils/im-dom.ts";

export function imVerticalText(c: ImCache) {
    imLayoutBegin(c, ROW); {
        if (isFirstishRender(c)) {
            elSetStyle(c, "writingMode", "sideways-lr");
            elSetStyle(c, "textOrientation", "mixed");
        }
    } // imLayoutEnd
}

