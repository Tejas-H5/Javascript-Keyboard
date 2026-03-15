import { imTextInputBegin, imTextInputEnd } from "src/components/text-input.ts";
import { im, ImCache, imdom, el, ev, } from "src/utils/im-js";
import { imui } from "src/utils/im-js/im-ui";


export function imTextInputOneLine(
    c: ImCache,
    currentName: string,
    placeholder: string = "Enter new name",
    hasFocus = true,
    canFocusWithTab = false,
) {
    let val: { newName?: string; submit?: boolean; cancel?: boolean; } | null = null;

    const input = imTextInputBegin(c, {
        value: currentName,
        placeholder: placeholder,
    }); imui.Flex(c); {
        if (im.Memo(c, canFocusWithTab)) {
            imdom.setAttr(c, "tabindex", "-1", input.root);
        }

        if (im.Memo(c, hasFocus) && hasFocus) {
            setTimeout(() => {
                input.root.focus();
                input.root.select();
            }, 1);
        }

        const isFocused = document.activeElement === input.root;

        const inputEvent = imdom.On(c, ev.INPUT);
        const blur =       imdom.On(c, ev.BLUR);

        if (inputEvent) {
            val = { newName: input.root.value };
        } else {
            const keyboard = imdom.getKeyboard();
            if ((isFocused && keyboard.keyDown?.key === "Enter") || blur) {
                val = { submit: true, newName: input.root.value }
            } else if (isFocused && keyboard.keyDown?.key === "Escape") {
                val = { cancel: true }
            }
        } 
    } imTextInputEnd(c);

    return val;
}
