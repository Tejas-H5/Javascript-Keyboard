import { newCssBuilder } from "src/utils/cssb.ts";
import { ImCache, isFirstishRender } from "src/utils/im-core.ts";
import { BLOCK, EM, imAlign, imBg, imLayoutBegin, imLayoutEnd, imSize, INLINE, INLINE_BLOCK, PERCENT, ROW } from "./core/layout.ts";
import { elHasMousePress, elSetClass, elSetStyle } from "src/utils/im-dom.ts";
import { cssVars } from "./core/stylesheets.ts";

const cssb = newCssBuilder();

const cnCheckboxButton = cssb.cn("checkboxButton", []);

const root = cssb.cn("root", [
    // Doing the border radius only on hover was an accident, but it turns out to be a pretty nice interaction
    `:hover .${cnCheckboxButton} { outline: 1px solid currentColor; border-radius: 3px; }`,
]);

const cnL = {
    checkboxButton: cnCheckboxButton,
    solidBorderSmRounded: cssb.cn("solidBorderSmRounded", [` { border: 1px solid currentColor; border-radius: 3px; }`]),
};

// TODO: replace label for `children` static parameter.
// NOTE: the main reason why we would want to inject the label as a child here is so that we may click on the 
// label to trigger the checkbox as well, just because it can be easier to do so.
export function imCheckbox(c: ImCache, checked: boolean): { checked: boolean } | null {
    // NOTE: we don't do `value = imCheckbox(c, value);` here - 
    // This encourages the use of `imMemo(c, value)` to respond to changes, which is wrong.
    // `value` may depend on other state - if it changes, you actually have no way of knowing
    // if it was this checkbox that did it or the other state changin when you use imMemo. 
    // So instead, an event is returned.
    let result = null;

    // I didn't think a checkbox could be broken down any further ...
    imCheckboxBegin(c); {
        if (elHasMousePress(c)) {
            result = { checked: !checked }
        }
        imCheckboxCheckBegin(c, checked);
        imCheckboxCheckEnd(c);
    } imCheckboxEnd(c);

    return result;
}

export function imCheckboxBegin(c: ImCache) {
    imLayoutBegin(c, INLINE_BLOCK); imAlign(c); {
        if (isFirstishRender(c)) {
            elSetClass(c, root);
            elSetStyle(c, "cursor", "pointer");
        }
    } // imLayoutEnd
}

export function imCheckboxEnd(c: ImCache) {
    // imLayout
    {
    } imLayoutEnd(c);
}

export function imCheckboxCheckBegin(c: ImCache, checked: boolean) {
    imLayoutBegin(c, BLOCK); imSize(c, 0.65, EM, 0.65, EM); {
        if (isFirstishRender(c)) {
            elSetClass(c, cnL.solidBorderSmRounded);
            elSetStyle(c, "padding", "4px");
        }

        imLayoutBegin(c, BLOCK); imSize(c, 100, PERCENT, 100, PERCENT);
        imBg(c, checked ? cssVars.fg : ""); {
            if (isFirstishRender(c)) {
                elSetClass(c, cnL.checkboxButton);
            }
        } // imLayoutEnd(c);
    } // imLayoutEnd(c);
}

export function imCheckboxCheckEnd(c: ImCache) {
    // imLayout
    {
        // imLayout
        {

        } imLayoutEnd(c);
    } imLayoutEnd(c);
}

