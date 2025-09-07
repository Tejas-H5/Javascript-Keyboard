import { newCssBuilder } from "src/utils/cssb";
import { cssVars } from "./core/stylesheets";
import { EL_INPUT, elSetAttr, elSetClass, imEl, imElEnd } from "src/utils/im-dom";
import { ImCache, imMemo, isFirstishRender } from "src/utils/im-core";
import { imLayoutEnd } from "./core/layout";

const cssb = newCssBuilder();

const cnInput = cssb.newClassName("im-text-input");
cssb.s(`
input.${cnInput} {
    all: unset;
    resize: none;
    width: 100%;
    box-sizing: border-box;
    padding: 5px;
}

input.${cnInput}:focus, input.${cnInput}:hover {
    background-color: ${cssVars.bg2};
}
`);


export function imTextInputBegin(c: ImCache, {
    value,
    placeholder = "",
}: {
    value: string;
    placeholder?: string;
}) {
    const input = imEl(c, EL_INPUT); {
        if (isFirstishRender(c)) {
            elSetClass(c, cnInput);
            elSetAttr(c, "type", "text");
        }

        if (imMemo(c, placeholder)) {
            elSetAttr(c, "placeholder", placeholder);
        }

        if (imMemo(c, value)) {
            input.root.value = value;
        }

    } // imElEnd(c, EL_INPUT);

    return input;
}

export function imTextInputEnd(c: ImCache) {
    imElEnd(c, EL_INPUT);
}


