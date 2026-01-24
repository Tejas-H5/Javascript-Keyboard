import { DisplayType, imAlign, imLayoutBegin, imLayoutEnd, imNoWrap, INLINE, ROW } from "src/components/core/layout";
import { newCssBuilder } from "src/utils/cssb";
import { ImCache, imMemo, isFirstishRender } from "src/utils/im-core";
import { elHasMousePress, elSetClass, imStr } from "src/utils/im-dom";
import { cssVars } from "./core/stylesheets";

const cssb = newCssBuilder();

const cnButton = (() => {
    const transiton = `0.05s linear`;
    return cssb.cn(`button`, [
        ` { 
    padding: 5px 0px; 
    display: flex; align-items: center; justify-content: center;
}`,
    `.hidden { opacity: 0; }`,
        ` .inner { 
    cursor: pointer;
    user-select: none;
    color: ${cssVars.fg};
}`,
    `.hidden .inner { cursor: default; }`,
    `.compact { 
    padding-top: 0; padding-bottom: 0;
}`,
        ` > .inner { 
    padding: 0.25rem; 
    min-width: 1.5rem;
    display: flex; align-items: center; justify-content: center;
    background-color: ${cssVars.bg2}; transition: background-color ${transiton}, color ${transiton}; 
}`,
        `.toggled > .inner        { background-color: ${cssVars.fg};  color: ${cssVars.bg}; }`,
        ` > .inner:hover          { background-color: ${cssVars.bg2}; color: ${cssVars.fg}; }`,
        `.toggled > .inner:hover  { background-color: ${cssVars.fg2}; color: ${cssVars.bg}; }`,
        ` > .inner:active         { background-color: ${cssVars.mg};  color: ${cssVars.fg}; }`,
        `.toggled > .inner:active  { background-color: ${cssVars.mg};  color: ${cssVars.fg}; }`,
    ]);
})();

export const BUTTON_TOGGLED = 1 << 0;
export const BUTTON_HIDDEN = 1 << 1;

export function imButton(c: ImCache, flags = 0) {
    if (isFirstishRender(c)) {
        elSetClass(c, cnButton);
    }

    if (imMemo(c, flags)) {
        const toggled = !!(flags & BUTTON_TOGGLED);
        const hidden = !!(flags & BUTTON_HIDDEN);
        elSetClass(c, "toggled", toggled);
        elSetClass(c, "hidden", hidden);
    }
}

export function imButtonBegin(
    c: ImCache, 
    text: string,
    flags: number = 0,
    type: DisplayType = ROW,
    compact: boolean = false,
): boolean {
    let result = false;

    imLayoutBegin(c, type); imButton(c, flags); imAlign(c); imNoWrap(c); {
        if (imMemo(c, compact)) {
            elSetClass(c, "compact", compact);
        }

        imLayoutBegin(c, INLINE); {
            if (isFirstishRender(c)) {
                elSetClass(c, "inner");
            }

            imStr(c, text);

            if (!(flags & BUTTON_HIDDEN)) {
                result = elHasMousePress(c);
            }
        } // imLayoutEnd(c);
    } // imLayoutEnd(c);

    return result;
}

export function imButtonEnd(c: ImCache) {
    {
        {
        } imLayoutEnd(c);
    } imLayoutEnd(c);
}

export function imButtonIsClicked(
    c: ImCache, 
    text: string,
    toggled: boolean = false,
    // Rather than conditionally rendering a button, it is sometimes better to 
    // set it's visibility instead. This way, our buttons aren't constantly moving about all over the place.
    visible: boolean = true,
): boolean {
    let flags = 0;
    if (toggled) flags = flags | BUTTON_TOGGLED;
    if (!visible) flags = flags | BUTTON_HIDDEN;
    const result = imButtonBegin(c, text, flags);
    imButtonEnd(c);

    return result;
}
