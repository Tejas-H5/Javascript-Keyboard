import { el, im, ImCache, imdom } from "src/utils/im-js";
import { cssVars, imui } from "src/utils/im-js/im-ui";

const cssb = imui.newCssBuilder();

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
    const input = imdom.ElBegin(c, el.INPUT); {
        if (im.isFirstishRender(c)) {
            imdom.setClass(c, cnInput);
            imdom.setAttr(c, "type", "text");
        }

        if (im.Memo(c, placeholder)) {
            imdom.setAttr(c, "placeholder", placeholder);
        }

        if (im.Memo(c, value)) {
            input.root.value = value;
        }

    } // imdom.ElEnd(c, el.INPUT);

    return input;
}

export function imTextInputEnd(c: ImCache) {
    imdom.ElEnd(c, el.INPUT);
}
