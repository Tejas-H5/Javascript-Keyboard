import { div, RenderGroup } from "src/utils/dom-utils";
import { Gameplay } from "./gameplay";
import { GlobalContext } from "./app";
import { cnLayout } from "src/dom-root";

export function PlayView(rg: RenderGroup<GlobalContext>) {
    // Rewind the track a bit, and then start from there
    return div({ class: cnLayout.flex1 + cnLayout.col }, [
        // rg.c(Keyboard, (c, s) => c.render(s)),
        rg.c(Gameplay, (c, s) => c.render(s))
    ]);
}
