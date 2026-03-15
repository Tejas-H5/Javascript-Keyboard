import { im, ImCache, imdom, el, ev, } from "src/utils/im-js";
import { BLOCK, cssVars, EM, imui, INLINE_BLOCK, PERCENT } from "src/utils/im-js/im-ui";

const cssb = imui.newCssBuilder();

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
    // This encourages the use of `im.Memo(c, value)` to respond to changes, which is wrong.
    // `value` may depend on other state - if it changes, you actually have no way of knowing
    // if it was this checkbox that did it or the other state changin when you use im.Memo. 
    // So instead, an event is returned.
    let result = null;

    // I didn't think a checkbox could be broken down any further ...
    imCheckboxBegin(c); {
        if (imdom.hasMousePress(c)) {
            result = { checked: !checked }
        }
        imCheckboxCheckBegin(c, checked);
        imCheckboxCheckEnd(c);
    } imCheckboxEnd(c);

    return result;
}

export function imCheckboxBegin(c: ImCache) {
    imui.Begin(c, INLINE_BLOCK); imui.Align(c); {
        if (im.isFirstishRender(c)) {
            imdom.setClass(c, root);
            imdom.setStyle(c, "cursor", "pointer");
        }
    } // imui.End
}

export function imCheckboxEnd(c: ImCache) {
    // imui.Layout
    {
    } imui.End(c);
}

export function imCheckboxCheckBegin(c: ImCache, checked: boolean) {
    imui.Begin(c, BLOCK); imui.Size(c, 0.65, EM, 0.65, EM); {
        if (im.isFirstishRender(c)) {
            imdom.setClass(c, cnL.solidBorderSmRounded);
            imdom.setStyle(c, "padding", "4px");
        }

        imui.Begin(c, BLOCK); imui.Size(c, 100, PERCENT, 100, PERCENT);
        imui.Bg(c, checked ? cssVars.fg : ""); {
            if (im.isFirstishRender(c)) {
                imdom.setClass(c, cnL.checkboxButton);
            }
        } // imui.End(c);
    } // imui.End(c);
}

export function imCheckboxCheckEnd(c: ImCache) {
    // imui.Layout
    {
        // imui.Layout
        {

        } imui.End(c);
    } imui.End(c);
}

