import { GlobalContext } from "src/global-context";
import { div, RenderGroup } from "src/utils/dom-utils";

export function StartupView(rg: RenderGroup<GlobalContext>) {
    // TODO: better game name
    const gameName = "Rhythm Keyboard!!"

    let fontSize = 64;
    let animateScale = 13;
    let fontSizeAnimated = 0;
    let t = 0;

    rg.preRenderFn((s) => {
        t += s.dt;
        if (t > 1) {
            t = 0;
        }

        fontSizeAnimated = fontSize + animateScale * Math.sin(t * 2 * Math.PI);
    });

    return div({ class: "flex-1 col" }, [
        div({ class: "flex-1 col align-items-center", style: "font-size: 64px;" }, [
            rg.style("fontSize",  () => fontSizeAnimated + "px"),
            gameName,
        ])
    ]);
}
