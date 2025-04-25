import { newCssBuilder } from "src/utils/cn";
import { cnApp, cssVars } from "./styling";
import { ALIGN_CENTER, imBeginLayout, JUSTIFY_CENTER, ROW } from "./layout";
import { elementHasMouseClick, imEnd, imInit, setClass, setInnerText } from "src/utils/im-dom-utils";

const cssb = newCssBuilder();

const cnButton = cssb.cn("button", [
    ` { user-select: none; cursor: pointer; border: 2px solid ${cssVars.fg}; border: 2px solid currentColor; border-radius: 8px; 
    padding: 2px 10px; box-sizing: border-box; }`,
    `:hover { background-color: ${cssVars.bg2} }`,
    `:active { background-color: ${cssVars.mg} }`,

    `.${cnApp.inverted}:hover { background-color: ${cssVars.fg2} }`,
]);


export function imBeginButton(toggled: boolean = false) {
    const root = imBeginLayout(ROW | ALIGN_CENTER | JUSTIFY_CENTER); {
        if (imInit()) {
            setClass(cnButton);
        }

        setClass(cnApp.inverted, toggled);
    };

    return root;
}

export function imButton(text: string, toggled = false): boolean {
    let clicked = false;

    imBeginButton(toggled); {
        setInnerText(text);
        clicked = elementHasMouseClick();
    } imEnd();

    return clicked;
}
