import { imButtonIsClicked } from "src/components/button";
import { im, ImCache, imdom } from "src/utils/im-js";
import { BLOCK, COL, imui, NA, PERCENT } from "src/utils/im-js/im-ui";

import { GlobalContext, setViewChartSelect } from "./app";

function newStartupViewState() {
    return { 
        t: 0,
        fontSize: 64,
        animateScale: 13,
        fontSizeAnimated: 0,

        currentView: 0,
    };
}

function handleStartupKeyDown(ctx: GlobalContext): boolean {
    if (!ctx.keyPressState) return false;
    const { key } = ctx.keyPressState;

    if (key === "Enter") {
        // NOTE: will need to change when we add more screens we can go to from here
        setViewChartSelect(ctx);
        return true;
    }

    return false;
}

export function imStartupView(c: ImCache, ctx: GlobalContext) {
    if (!ctx.handled) {
        ctx.handled = handleStartupKeyDown(ctx);
    }

    // TODO: better game name
    const gameName = "Rhythm Keyboard!! (name subject to change)"
    const s = im.State(c, newStartupViewState);

    const dt = im.getDeltaTimeSeconds(c);
    s.t += dt;
    if (s.t > 1) {
        s.t = 0;
    } 
    s.fontSizeAnimated = s.fontSize + s.animateScale * Math.sin(s.t * 2 * Math.PI);

    imui.Begin(c, COL); imui.Flex(c); imui.Align(c); imui.Relative(c); {
        imui.Begin(c, COL); imui.Flex(c); imui.Align(c); imui.Relative(c); {
            imdom.setStyle(c,"fontSize", s.fontSizeAnimated + "px");
            imdom.Str(c, gameName);
        } imui.End(c);
        imui.Begin(c, BLOCK); imui.Absolute(c, 25, PERCENT, 0, NA, 25, PERCENT, 0, NA); {
            if (im.isFirstishRender(c)) {
                imdom.setStyle(c,"fontSize", "24px");
            }

            if (imButtonIsClicked(c, "Play")) {
                setViewChartSelect(ctx);
            }
        } imui.End(c);
    } imui.End(c);
}

