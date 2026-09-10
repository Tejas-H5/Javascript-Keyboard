import { im, ImCache, imdom } from "imcf";
import { imui, ROW } from "imcf/im-ui";


export function imVerticalText(c: ImCache) {
    imui.Begin(c, ROW); {
        if (im.IsFirstRender(c)) {
            imdom.setStyle(c, "writingMode", "sideways-lr");
            imdom.setStyle(c, "textOrientation", "mixed");
        }
    } // imui.End
}

