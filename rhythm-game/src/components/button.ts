import { BLOCK, DisplayType, imLayout, imLayoutEnd } from "src/components/core/layout";
import { newCssBuilder } from "src/utils/cssb";
import { ImCache, imMemo, isFirstishRender } from "src/utils/im-core";
import { elHasMousePress, elSetClass, imStr } from "src/utils/im-dom";
import { cssVars } from "./core/stylesheets";

const cssb = newCssBuilder();

const cnButton = (() => {
    const transiton = `0.05s linear`;
    return cssb.cn(`button`, [
        ` { cursor: pointer; user-select: none; background-color: ${cssVars.bg}; color: ${cssVars.fg}; transition: background-color ${transiton}, color ${transiton}; padding: 3px 10px; border: 2px solid ${cssVars.fg}; border-radius: 5px;  }`,
        `.toggled { background-color: ${cssVars.fg}; color: ${cssVars.bg}; }`,
        `:hover { background-color: ${cssVars.bg2}; color: ${cssVars.fg}; }`,
        `.toggled:hover { background-color: ${cssVars.fg2}; color: ${cssVars.bg}; }`,
        `:active { background-color: ${cssVars.mg}; color: ${cssVars.fg}; }`,
        `.toggled:active { background-color: ${cssVars.mg}; color: ${cssVars.fg}; }`,
    ]);
})();

export function imButton(c: ImCache, toggled = false) {
    if (isFirstishRender(c)) elSetClass(c, cnButton);
    if (imMemo(c, toggled))  elSetClass(c, "toggled", toggled);
}

export function imButtonIsClicked(
    c: ImCache, 
    text: string,
    toggled: boolean = false,
    type: DisplayType = BLOCK
): boolean {
    let result = false;

    imLayout(c, type); imButton(c, toggled); {
        imStr(c, text);
        result = elHasMousePress(c);
    } imLayoutEnd(c);

    return result;
}
