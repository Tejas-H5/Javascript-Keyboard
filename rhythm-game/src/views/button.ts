import { imui, cssVars } from "imcf/im-ui";

import { im, ImCache, imdom, el, ev, } from "imcf";


export function imHoverable(c: ImCache, selected: boolean) {
    if (im.IsFirstRender(c)) imdom.setStyle(c, "transition", "background-color .1s ease, width .1s ease");
    // NOTE: looks ass to also put this transition on the text colour

    const mouse = imdom.getMouse();

    const hasHover = imdom.hasMouseOver(c);
    if (hasHover) {
        selected ||= mouse.leftMouseButton || mouse.rightMouseButton || mouse.middleMouseButton;
    }

    if (im.Memo(c, hasHover)) {
        imdom.setStyle(c, "cursor", hasHover ? "pointer" : "");
    }

    imui.Bg(c, (hasHover || selected) ? (selected ? cssVars.mg : cssVars.bg2) : "");
    imui.Fg(c, (hasHover || selected) ? (selected ? cssVars.bg : "") : "");
}
