import { chooseItem } from "src/utils/array-utils";
import { GlobalContext, setViewEditChart } from "./app";
import { clamp } from "src/utils/math-utils";
import { GameplayState, imGameplay } from "./gameplay";
import { getDeltaTimeSeconds, ImCache, imElse, imEndIf, imIf, imState, isFirstishRender } from "src/utils/im-core";
import { BLOCK, COL, imAlign, imFlex, imJustify, imLayout, imSize, imLayoutEnd, ROW, PERCENT, NA, EM, imRelative, imAbsolute, PX } from "src/components/core/layout";
import { elSetStyle, getGlobalEventSystem, imStr } from "src/utils/im-dom";

let MESSAGES = [
    "Nice!",
    "Well done!",
    "Amazin!",
    "Pogger!",
    "Let's go!",
    "You did it!",
    "Ain't no way dude!",
];

let currentMessage = "";

function randomizeMessage() {
    currentMessage = chooseItem(MESSAGES, Math.random());
}

export function imPlayView(c: ImCache, ctx: GlobalContext) {
    if (isFirstishRender(c)) {
        randomizeMessage();
    }

    // NOTE: strange code boundary here between the results screen and the gameplay screen, because I wrote this code a while ago.
    // but it seems to work ok for now.

    imLayout(c, COL); imFlex(c); {
        if (imIf(c) && ctx.ui.playView.result) {
            imResultsScreen(c, ctx.ui.playView.result);
        } else {
            imElse(c);

            imGameplay(c, ctx);
        } imEndIf(c);
    } imLayoutEnd(c);
}


function newResultsScreenState() {
    return {
        t: 0,
        fontSize: 0,
        baseFontSize: 4,
        wiggle: 0.6,
    };
}

function imResultsScreen(c: ImCache, result: GameplayState) {
    const s = imState(c, newResultsScreenState);

    const dt = getDeltaTimeSeconds(c);
    if (s.t < 100) {
        s.t += dt;
    }

    s.fontSize = s.baseFontSize + s.wiggle * Math.sin(Math.PI * 2 * s.t);

    const { keyDown } = getGlobalEventSystem().keyboard;
    if (keyDown && keyDown.key.toUpperCase() === "R") {
        s.t = 0;
    }

    const start = 0.3;


    imLayout(c, ROW); imFlex(c); imAlign(c); imJustify(c); {
        imLayout(c, BLOCK); imSize(c, 80, PERCENT, 80, PERCENT); {
            if (isFirstishRender(c)) {
                elSetStyle(c,"border", "1px solid currentColor");
            }

            imLayout(c, ROW); imAlign(c); imJustify(c); imRelative(c); imSize(c, 0, NA, 4, EM); {
                imLayout(c, ROW); imAlign(c); imJustify(c); imAbsolute(c, 0, PX, 0, PX, 0, PX, 0, PX); {
                    elSetStyle(c,"fontSize", s.fontSize + "rem");
                    imStr(c, currentMessage);
                } imLayoutEnd(c);
            } imLayoutEnd(c);

            imBeginAnimatedRow(c, s.t, start + 0.1, 0.1, 300); {
                imLayout(c, BLOCK); imSize(c, 25, PERCENT, 0, NA); imLayoutEnd(c);

                imStr(c, "Score: "); 

                imLayout(c, BLOCK); imFlex(c); imLayoutEnd(c);

                imAnimatedNumber(c, result.score, s.t, start + 0.7, 0.3);

                imLayout(c, BLOCK); imSize(c, 25, PERCENT, 0, NA); imLayoutEnd(c);
            } imLayoutEnd(c);
            imBeginAnimatedRow(c, s.t, start + 0.3, 0.1, 300); {
                imLayout(c, BLOCK); imSize(c, 25, PERCENT, 0, NA); imLayoutEnd(c);

                imStr(c, "Theoretical perfect score: <TODO>"); 

                imLayout(c, BLOCK); imFlex(c); imLayoutEnd(c);

                imLayout(c, BLOCK); imSize(c, 25, PERCENT, 0, NA); imLayoutEnd(c);
            } imLayoutEnd(c);


            // TODO: S S or some typical rhythm game score designation, and its 3d and rotating. epic

        } imLayoutEnd(c);
    } imLayoutEnd(c);
}



function imBeginAnimatedRow(
    c: ImCache,
    t: number,
    inTime: number,
    duration: number,
    downAmount: number
) {
    if (t < inTime - 1) {
        t = 0;
    }

    t = clamp((t - inTime) / duration, 0, 1);

    imLayout(c, ROW); imJustify(c); {
        elSetStyle(c,"opacity", t + "");
        elSetStyle(c,"transform", `translate(0, ${downAmount * (1 - t)}px)`);
    } // user specified end
}

function imAnimatedNumber(
    c: ImCache,
    targetNumber: number,
    tIn: number,
    inTime: number,
    duration: number,
) {
    let t = clamp((tIn - inTime) / duration, 0, 1);
    let number;
    if (t <= 0) {
        number = 0;
    } else if (t >= 1) {
        number = targetNumber;
    } else {
        number = Math.floor(targetNumber * t);
    }

    imStr(c, number);
}
