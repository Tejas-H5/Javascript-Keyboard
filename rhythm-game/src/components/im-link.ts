import { ImCache, imMemo } from "src/utils/im-core";
import { EL_A, elSetAttr, imElBegin, imElEnd, imStr } from "src/utils/im-dom";

export function imLink(c: ImCache, url: string, text: string = url) {
    imElBegin(c, EL_A); {
        if (imMemo(c, url)) {
            elSetAttr(c, "rel", "nofollow noopener noreferrer external");
            elSetAttr(c, "target", "_blank");
            elSetAttr(c, "href", url);
        }

        imStr(c, text);
    } imElEnd(c, EL_A);
}
