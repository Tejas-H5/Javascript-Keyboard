import { newCssBuilder } from "src/utils/cssb";
import { ImCache, isFirstishRender } from "src/utils/im-core";
import { BLOCK, EM, imAlign, imBg, imLayout, imLayoutEnd, imSize, PERCENT, ROW } from "./core/layout";
import { elHasMousePress, elSetClass, elSetStyle } from "src/utils/im-dom";
import { cssVars } from "./core/stylesheets";

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
export function imCheckbox(c: ImCache, checked: boolean): boolean {
    let result = checked;

    // I didn't think a checkbox could be broken down any further ...
    imCheckboxBegin(c); {
        if (elHasMousePress(c)) {
            result = !result;
        }
        imCheckboxCheckBegin(c, checked);
        imCheckboxCheckEnd(c);
    } imCheckboxEnd(c);

    return result;
}

export function imCheckboxBegin(c: ImCache) {
    imLayout(c, ROW); imAlign(c); {
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
    imLayout(c, BLOCK); imSize(c, 0.65, EM, 0.65, EM); {
        if (isFirstishRender(c)) {
            elSetClass(c, cnL.solidBorderSmRounded);
            elSetStyle(c, "padding", "4px");
        }

        imLayout(c, BLOCK); imSize(c, 100, PERCENT, 100, PERCENT);
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

