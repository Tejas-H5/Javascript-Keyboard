import { imFlex } from "src/components/core/layout";
import { imTextInputBegin, imTextInputEnd } from "src/components/text-input";
import {
    ImCache,
    imMemo
} from "src/utils/im-core";
import {
    EV_INPUT,
    EV_KEYDOWN,
    imOn
} from "src/utils/im-dom";

export function imTextInputOneLine(c: ImCache, currentName: string, hasFocus = true) {
    let val: { newName?: string; submit?: boolean; cancel?: boolean; } | null = null;

    const input = imTextInputBegin(c, {
        value: currentName,
        placeholder: "enter new name",
    }); imFlex(c); {
        if (imMemo(c, hasFocus)) {
            setTimeout(() => {
                input.root.focus();
                input.root.select();
            }, 1);
        }

        const inputEvent = imOn(c, EV_INPUT);
        if (inputEvent) {
            val = { newName: input.root.value };
        }

        const keyDown = imOn(c, EV_KEYDOWN);
        if (keyDown) {
            if (keyDown.key === "Enter") {
                val = { submit: true }
            } else if (keyDown.key === "Escape") {
                val = { cancel: true }
            }
        }
    } imTextInputEnd(c);

    return val;
}
