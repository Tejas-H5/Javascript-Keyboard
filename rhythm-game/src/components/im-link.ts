import { im, ImCache, imdom, el, ev, } from "src/utils/im-js";


export function imLink(c: ImCache, url: string, text: string = url) {
    imdom.ElBegin(c, el.A); {
        if (im.Memo(c, url)) {
            imdom.setAttr(c, "rel", "nofollow noopener noreferrer external");
            imdom.setAttr(c, "target", "_blank");
            imdom.setAttr(c, "href", url);
        }

        imdom.Str(c, text);
    } imdom.ElEnd(c, el.A);
}
