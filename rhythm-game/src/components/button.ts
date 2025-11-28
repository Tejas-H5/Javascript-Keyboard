import { BLOCK, DisplayType, imLayout, imLayoutEnd, INLINE } from "src/components/core/layout";
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
        ` .inner { 
    cursor: pointer;
    user-select: none;
    color: ${cssVars.fg};
}`,
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

export function imButton(c: ImCache, toggled = false) {
    if (isFirstishRender(c)) {
        elSetClass(c, cnButton);
        // elSetClass(c, "radius");
    }
    if (imMemo(c, toggled))  elSetClass(c, "toggled", toggled);
}

export function imButtonNoRadius(c: ImCache, toggled = false) {
    if (isFirstishRender(c)) {
        elSetClass(c, cnButton);
    }
    if (imMemo(c, toggled))  elSetClass(c, "toggled", toggled);
}


export function imButtonBegin(
    c: ImCache, 
    text: string,
    toggled: boolean = false,
    type: DisplayType = BLOCK,
    compact: boolean = false,
) {

    let result = false;

    imLayout(c, type); imButton(c, toggled); {
        if (imMemo(c, compact)) {
            elSetClass(c, "compact", compact);
        }

        imLayout(c, INLINE); {
            if (isFirstishRender(c)) {
                elSetClass(c, "inner");
            }

            imStr(c, text);
            result = elHasMousePress(c);
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
    toggled?: boolean,
): boolean {
    const result = imButtonBegin(c, text, toggled);
    imButtonEnd(c);

    return result;
}
