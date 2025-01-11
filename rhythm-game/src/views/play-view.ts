import { div, RenderGroup } from "src/utils/dom-utils";
import { Gameplay } from "./gameplay";
import { GlobalContext } from "./app";

export function PlayView(rg: RenderGroup<GlobalContext>) {
    // Rewind the track a bit, and then start from there
    return div({ class: "flex-1 col" }, [
        // rg.c(Keyboard, (c, s) => c.render(s)),
        rg.c(Gameplay, (c, s) => c.render(s))
    ]);
}
