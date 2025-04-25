import { deltaTimeSeconds, imEnd, imInit, imState, setInnerText, setStyle } from "src/utils/im-dom-utils";
import { GlobalContext, setViewChartSelect } from "./app";
import { imButton } from "./button";
import { ALIGN_CENTER, COL, FLEX1, imBeginAbsolute, imBeginLayout, NOT_SET, PERCENT, RELATIVE } from "./layout";

function newStartupViewState() {
    return { 
        t: 0,
        fontSize: 64,
        animateScale: 13,
        fontSizeAnimated: 0,

        currentView: 0,
    };
}

export function imStartupView(ctx: GlobalContext) {
    // TODO: better game name
    const gameName = "Rhythm Keyboard!! (name subject to change)"
    const s = imState(newStartupViewState);

    const dt = deltaTimeSeconds();
    s.t += dt;
    if (s.t > 1) {
        s.t = 0;
    } 
    s.fontSizeAnimated = s.fontSize + s.animateScale * Math.sin(s.t * 2 * Math.PI);

    imBeginLayout(FLEX1 | COL | ALIGN_CENTER | RELATIVE); {
        imBeginLayout(FLEX1 | COL | ALIGN_CENTER | RELATIVE); {
            setStyle("fontSize", s.fontSizeAnimated + "px");
            setInnerText(gameName);
        } imEnd();
        imBeginAbsolute(
            25, PERCENT, 0, NOT_SET,
            25, PERCENT, 0, NOT_SET
        ); {
            if (imInit()) {
                setStyle("fontSize", "24px");
            }

            if (imButton("Play")) {
                setViewChartSelect(ctx);
            }
        } imEnd();
    } imEnd();
}

