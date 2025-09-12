import { imButtonIsClicked } from "src/components/button";
import { BLOCK, COL, imAbsolute, imAlign, imFlex, imLayout, imLayoutEnd, imRelative, NA, PERCENT } from "src/components/core/layout";
import { getDeltaTimeSeconds, ImCache, imState, isFirstishRender } from "src/utils/im-core";
import { elSetStyle, imStr } from "src/utils/im-dom";
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
    const s = imState(c, newStartupViewState);

    const dt = getDeltaTimeSeconds(c);
    s.t += dt;
    if (s.t > 1) {
        s.t = 0;
    } 
    s.fontSizeAnimated = s.fontSize + s.animateScale * Math.sin(s.t * 2 * Math.PI);

    imLayout(c, COL); imFlex(c); imAlign(c); imRelative(c); {
        imLayout(c, COL); imFlex(c); imAlign(c); imRelative(c); {
            elSetStyle(c,"fontSize", s.fontSizeAnimated + "px");
            imStr(c, gameName);
        } imLayoutEnd(c);
        imLayout(c, BLOCK); imAbsolute(c, 25, PERCENT, 0, NA, 25, PERCENT, 0, NA); {
            if (isFirstishRender(c)) {
                elSetStyle(c,"fontSize", "24px");
            }

            if (imButtonIsClicked(c, "Play")) {
                setViewChartSelect(ctx);
            }
        } imLayoutEnd(c);
    } imLayoutEnd(c);
}

