import { im, ImCache, imdom, el, ev, } from "imcf";
import { cssVars, DisplayType, imui, INLINE, ROW } from "imcf/im-ui";

const cssb = imui.newCssBuilder();

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
    if (im.IsFirstRender(c)) {
        imdom.setClass(c, cnButton);
    }

    if (im.Memo(c, flags)) {
        const toggled = !!(flags & BUTTON_TOGGLED);
        const hidden = !!(flags & BUTTON_HIDDEN);
        imdom.setClass(c, "toggled", toggled);
        imdom.setClass(c, "hidden", hidden);
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

    imui.Begin(c, type); imButton(c, flags); imui.Align(c); imui.NoWrap(c); {
        if (im.Memo(c, compact)) {
            imdom.setClass(c, "compact", compact);
        }

        imui.Begin(c, INLINE); {
            if (im.IsFirstRender(c)) {
                imdom.setClass(c, "inner");
            }

            imdom.Str(c, text);

            if (!(flags & BUTTON_HIDDEN)) {
                result = imdom.hasMousePress(c);
            }
        } // imui.End(c);
    } // imui.End(c);

    return result;
}

export function imButtonEnd(c: ImCache) {
    {
        {
        } imui.End(c);
    } imui.End(c);
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
