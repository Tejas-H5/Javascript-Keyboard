import { imFlex } from "src/components/core/layout.ts";
import { imTextInputBegin, imTextInputEnd } from "src/components/text-input.ts";
import {
    ImCache,
    imMemo
} from "src/utils/im-core.ts";
import {
    elSetAttr,
    EV_BLUR,
    EV_INPUT,
    getGlobalEventSystem,
    imOn
} from "src/utils/im-dom.ts";

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
    }); imFlex(c); {
        if (imMemo(c, canFocusWithTab)) {
            elSetAttr(c, "tabindex", "-1", input.root);
        }

        if (imMemo(c, hasFocus) && hasFocus) {
            setTimeout(() => {
                input.root.focus();
                input.root.select();
            }, 1);
        }

        const isFocused = document.activeElement === input.root;

        const inputEvent = imOn(c, EV_INPUT);
        const blur = imOn(c, EV_BLUR);

        if (inputEvent) {
            val = { newName: input.root.value };
        } else if (isFocused) {
            const keyboard = getGlobalEventSystem().keyboard;
            if (keyboard.keyDown?.key === "Enter" || blur) {
                val = { submit: true, newName: input.root.value }
            } else if (isFocused && keyboard.keyDown?.key === "Escape") {
                val = { cancel: true }
            }
        } 
    } imTextInputEnd(c);

    return val;
}
