import { imFlex } from "src/components/core/layout";
import { imTextInputBegin, imTextInputEnd } from "src/components/text-input";
import {
    ImCache,
    imMemo
} from "src/utils/im-core";
import {
    EV_BLUR,
    EV_INPUT,
    getGlobalEventSystem,
    imOn
} from "src/utils/im-dom";

export function imTextInputOneLine(c: ImCache, currentName: string, placeholder: string = "Enter new name", hasFocus = true) {
    let val: { newName?: string; submit?: boolean; cancel?: boolean; } | null = null;

    const input = imTextInputBegin(c, {
        value: currentName,
        placeholder: placeholder,
    }); imFlex(c); {
        if (imMemo(c, hasFocus)) {
            setTimeout(() => {
                input.root.focus();
                input.root.select();
            }, 1);
        }

        const inputEvent = imOn(c, EV_INPUT);
        const blur = imOn(c, EV_BLUR);
        const keyboard = getGlobalEventSystem().keyboard;

        if (inputEvent) {
            val = { newName: input.root.value };
        } else if (keyboard.keyDown?.key === "Enter" || blur) {
            val = { submit: true, newName: input.root.value }
        } else if (keyboard.keyDown?.key === "Escape") {
            val = { cancel: true }
        }
    } imTextInputEnd(c);

    return val;
}
