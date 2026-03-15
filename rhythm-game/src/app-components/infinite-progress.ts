import { imLink } from "src/components/im-link.ts";
import { im, ImCache, imdom } from "src/utils/im-js";
import { BLOCK, COL, cssVars, imui, NA, PERCENT, PX, REM, STRETCH } from "src/utils/im-js/im-ui";

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
    const s = im.State(c, newInfiniteLoadState);
    if (im.Memo(c, true)) s.t = 0;

    // animate t -> 1. However, animation speed is inversly proportional to how far we've come.
    s.t = lerp(s.t, 1, (1 - s.t) * im.getDeltaTimeSeconds(c) * INFINTE_LOAD_SPEED)

    imui.Begin(c, COL); imui.Align(c, STRETCH); imui.Relative(c); imui.Padding(c, 0.5, REM, 0, NA, 0.5, REM, 0, NA); {
        imui.Begin(c, BLOCK); imui.Size(c, 100 * (s.t), PERCENT, 20, PX); {
            imui.Begin(c, BLOCK); imui.Size(c, 0, NA, 100, PERCENT); imui.Bg(c, cssVars.fg); imui.Fg(c, cssVars.bg); imui.End(c);
        } imui.End(c);
    } imui.End(c);

    imui.Begin(c, BLOCK); {
        if (im.If(c) && s.t > 0.93) {
            imdom.Str(c, "This action should have completed by now, but it hasn't. Submit this bug to ");
            imLink(c, "https://github.com/Tejas-H5/Javascript-Keyboard/issues");
            imdom.Str(c, "(if it hasn't already)");
        } else {
            im.IfElse(c);
            imdom.Str(c, Math.round(s.t * 100) + "%");
        } im.IfEnd(c);
    } imui.End(c);


    return s.t;
}
