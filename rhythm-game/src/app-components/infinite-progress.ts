import { getDeltaTimeSeconds, ImCache, imIf, imIfElse, imIfEnd, imMemo, imState } from "src/utils/im-core";
import { BLOCK, COL, imAlign, imBg, imFg, imLayoutBegin, imLayoutEnd, imPadding, imRelative, imSize, NA, PERCENT, PX, REM, STRETCH } from "src/components/core/layout";
import { imStr } from "src/utils/im-dom";
import { imLink } from "src/components/im-link";
import { cssVars } from "src/components/core/stylesheets";

function newInfiniteLoadState() {
    return { t: 0 };
}

function lerp(a: number, b: number, t: number) {
    return a + (b - a) * t;
}

const INFINTE_LOAD_SPEED = 2;

// Makes the UI feel like it's doing real work, even though it isn't.
// As such, it is a diabolical component. I stole the idea from windows file explorer, who stole it from 
// https://en.wikipedia.org/wiki/Zeno%27s_paradoxes
// Links to our github if its taking too long to make it less diabolical. But now it cant be a shared component.
export function imInfiniteProgress(c: ImCache): number {
    const s = imState(c, newInfiniteLoadState);
    if (imMemo(c, true)) s.t = 0;

    // animate t -> 1. However, animation speed is inversly proportional to how far we've come.
    s.t = lerp(s.t, 1, (1 - s.t) * getDeltaTimeSeconds(c) * INFINTE_LOAD_SPEED)

    imLayoutBegin(c, COL); imAlign(c, STRETCH); imRelative(c); imPadding(c, 0.5, REM, 0, NA, 0.5, REM, 0, NA); {
        imLayoutBegin(c, BLOCK); imSize(c, 100 * (s.t), PERCENT, 20, PX); {
            imLayoutBegin(c, BLOCK); imSize(c, 0, NA, 100, PERCENT); imBg(c, cssVars.fg); imFg(c, cssVars.bg); imLayoutEnd(c);
        } imLayoutEnd(c);
    } imLayoutEnd(c);

    imLayoutBegin(c, BLOCK); {
        if (imIf(c) && s.t > 0.93) {
            imStr(c, "This action should have completed by now, but it hasn't. Submit this bug to ");
            imLink(c, "https://github.com/Tejas-H5/Javascript-Keyboard/issues");
            imStr(c, "(if it hasn't already)");
        } else {
            imIfElse(c);
            imStr(c, Math.round(s.t * 100) + "%");
        } imIfEnd(c);
    } imLayoutEnd(c);


    return s.t;
}
