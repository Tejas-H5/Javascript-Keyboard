import { imBg, imFg } from "src/components/core/layout";
import { cssVars } from "src/components/core/stylesheets";
import { im, ImCache, imdom, el, ev, } from "src/utils/im-js";


export function imHoverable(c: ImCache, selected: boolean) {
    if (im.isFirstishRender(c)) imdom.setStyle(c, "transition", "background-color .1s ease, width .1s ease");
    // NOTE: looks ass to also put this transition on the text colour

    const mouse = imdom.getMouse();

    const hasHover = imdom.hasMouseOver(c);
    if (hasHover) {
        selected ||= mouse.leftMouseButton || mouse.rightMouseButton || mouse.middleMouseButton;
    }

    if (im.Memo(c, hasHover)) {
        imdom.setStyle(c, "cursor", hasHover ? "pointer" : "");
    }

    imBg(c, (hasHover || selected) ? (selected ? cssVars.mg : cssVars.bg2) : "");
    imFg(c, (hasHover || selected) ? (selected ? cssVars.bg : "") : "");
}
