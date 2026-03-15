import { im, ImCache, imdom } from "src/utils/im-js";
import { imui, ROW } from "src/utils/im-js/im-ui";


export function imVerticalText(c: ImCache) {
    imui.Begin(c, ROW); {
        if (im.isFirstishRender(c)) {
            imdom.setStyle(c, "writingMode", "sideways-lr");
            imdom.setStyle(c, "textOrientation", "mixed");
        }
    } // imui.End
}

