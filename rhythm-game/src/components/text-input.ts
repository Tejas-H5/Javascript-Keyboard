import { imBeginEl, imMemo, setAttr, setInputValue } from "src/utils/im-dom-utils";

function newInput() {
    return document.createElement("input");
}

export function imBeginInput({
    value,
    autoSize,
    placeholder = null,
}: {
    value: string;
    autoSize: boolean;
    placeholder?: string | null;
}) {
    const inputRoot = imBeginEl(newInput);
    const input = inputRoot.root; {
        if (imMemo(placeholder)) {
            setAttr("placeholder", placeholder);
        }

        if (imMemo(value)) {
            if (value !== input.value) {
                setInputValue(input, value);

                if (autoSize) {
                    // TODO: test this code
                    input.style.width = "0px";
                    input.style.width = input.scrollWidth + "px";
                }
            }
        }
    } // user-supplied end

    return inputRoot;
}
