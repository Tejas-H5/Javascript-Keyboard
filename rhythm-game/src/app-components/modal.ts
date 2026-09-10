import { ImCache } from "imcf";
import { COL, imui, PX } from "imcf/im-ui";

export function imModalBegin(c: ImCache, zIndex = 100) {
    imui.Begin(c, COL); imui.Fixed(c, 0, PX, 0, PX, 0, PX, 0, PX); imui.ZIndex(c, zIndex); {
        imui.Begin(c, COL); imui.Align(c); imui.Justify(c); imui.Absolute(c, 0, PX, 0, PX, 0, PX, 0, PX); imui.Bg(c, `rgba(0, 0, 0, 0.3)`); {
        } // imui.End(c);
    } // imui.End(c);
}

export function imModalEnd(c: ImCache) {
    imui.End(c);
    imui.End(c);
}
