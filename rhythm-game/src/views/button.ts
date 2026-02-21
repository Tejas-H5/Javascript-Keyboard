import { imBg, imFg } from "src/components/core/layout";
import { cssVars } from "src/components/core/stylesheets";
import { ImCache, imMemo, isFirstishRender } from "src/utils/im-core";
import { elHasMouseOver, elSetStyle, getGlobalEventSystem } from "src/utils/im-dom";

export function imHoverable(c: ImCache, selected: boolean) {
    if (isFirstishRender(c)) elSetStyle(c, "transition", "background-color .1s ease, width .1s ease");
    // NOTE: looks ass to also put this transition on the text colour

    const ev = getGlobalEventSystem();

    const hasHover = elHasMouseOver(c);
    if (hasHover) {
        selected ||= ev.mouse.leftMouseButton || ev.mouse.rightMouseButton || ev.mouse.middleMouseButton;
    }

    if (imMemo(c, hasHover)) {
        elSetStyle(c, "cursor", hasHover ? "pointer" : "");
    }

    imBg(c, (hasHover || selected) ? (selected ? cssVars.mg : cssVars.bg2) : "");
    imFg(c, (hasHover || selected) ? (selected ? cssVars.bg : "") : "");
}
