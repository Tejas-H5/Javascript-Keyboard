import { imui, BLOCK, ROW, COL, NA, PERCENT, REM } from "src/utils/im-js/im-ui";
import { chooseItem } from "src/utils/array-utils";
import { el, im, ImCache, imdom } from "src/utils/im-js";

import { clamp } from "src/utils/math-utils";
import { GlobalContext, setViewChartSelect, setViewEditChart, setViewPlayCurrentChart } from "./app";
import { GameplayState, imGameplay } from "./gameplay";
import { assert } from "src/utils/assert";

function handlePlayViewKeyDown(ctx: GlobalContext) {
    if (!ctx.keyPressState) return false;

    const { key } = ctx.keyPressState;

    const s = ctx.ui.playView;

    if (key === "Escape") {
        if (s.isTesting) {
            setViewEditChart(ctx);
        } else {
            setViewChartSelect(ctx);
        }

        return true;
    }

    return false;
}

export function imPlayView(c: ImCache, ctx: GlobalContext) {
    // NOTE: strange code boundary here between the results screen and the gameplay screen, because I wrote this code a while ago.
    // but it seems to work ok for now.

    imui.Begin(c, COL); imui.Flex(c); {
        if (im.If(c) && ctx.ui.playView.result) {
            imResultsScreen(ctx, c, ctx.ui.playView.result);
        } else {
            im.Else(c);

            assert(!!ctx.gameplay);
            imGameplay(c, ctx, ctx.gameplay);
        } im.IfEnd(c);
    } imui.End(c);

    if (!ctx.handled) {
        ctx.handled = handlePlayViewKeyDown(ctx);
    }

}


function newResultsScreenState() {
    return {
        t: 0,
        fontSize: 0,
        baseFontSize: 4,
        wiggle: 0.6,
        message: ""
    };
}

type Designation 
    =  "SSS"
    | "SS"
    | "S"
    | "A"
    | "B"
    | "C"
    | "L";


function getDesignation(score: number, bestPossibleScore: number): Designation {
    if (score > bestPossibleScore) {
        // The way I compute the best possible score uses a far simpler codepath than the game's actual codepath, so
        // this could actually happen.
        return "SSS" 
    }
    if (score === bestPossibleScore) return "SS";
    if (score >   bestPossibleScore * 0.98) return "S";
    if (score >   bestPossibleScore * 0.9)  return "A";
    if (score >   bestPossibleScore * 0.8) return "B";
    if (score >   bestPossibleScore * 0.7) return "C";
    return "L";
}

// Its cringe but I like it. Reminds me of this old typing game 'stamina' I used to play
function getMessagesForDesignation(d: Designation): string[] {
    switch(d) {
        case "SSS": return ["HOW"];
        case "SS":  return ["LETS GOOOO!!!!"];
        case "S":   return ["Amazing!"];
        case "A":   return ["Well done!", "This is a good improvement.", "Yes", "So close", "Missed it by THAT much"];
    }
    return ["Press and hold [Backspace] while playing at any time to enter practice mode"];
}

function imResultsScreen(ctx: GlobalContext, c: ImCache, result: GameplayState) {
    if (!ctx.handled) {
        if (ctx.keyPressState) {
            if (ctx.keyPressState.key === "Enter") {
                // restart this chart

                setViewPlayCurrentChart(ctx);
            }
        }
    }

    const focusChanged = im.Memo(c, true);
    let s = im.Get(c, newResultsScreenState);
    if (!s || focusChanged) {
        s = im.Set(c, newResultsScreenState());
        const designation = getDesignation(result.score, result.bestPossibleScore);
        const messages = getMessagesForDesignation(designation);
        s.message = chooseItem(messages, Math.random());
    }

    const dt = im.getDeltaTimeSeconds(c);
    if (s.t < 100) {
        s.t += dt * 0.5;
    }

    s.fontSize = s.baseFontSize + s.wiggle * Math.sin(Math.PI * 2 * s.t);

    imui.Begin(c, ROW); imui.Flex(c); imui.Align(c); imui.Justify(c); {
        imui.Begin(c, COL); imui.Size(c, 80, PERCENT, 80, PERCENT); {
            if (im.isFirstishRender(c)) {
                imdom.setStyle(c,"border", "1px solid currentColor");
            }

            let currentStart = 0.1;

            imBeginAnimatedRow(c, s.t, currentStart, 0.1, 300); imui.Size(c, 0, NA, s.baseFontSize + s.wiggle, REM); {
                currentStart += 0.3;
                imdom.setStyle(c, "fontSize", s.fontSize + "rem");

                imdom.ElBegin(c, el.B); imdom.Str(c, result.chartName); imdom.ElEnd(c, el.B);
            } imui.End(c);

            imui.Begin(c, BLOCK); imui.Flex(c); imui.End(c);

            imBeginAnimatedRow(c, s.t, currentStart, 0.1, 300); {
                currentStart += 0.3;

                imui.Begin(c, BLOCK); imui.Size(c, 25, PERCENT, 0, NA); imui.End(c);

                imdom.Str(c, "Best possible score: "); 

                imui.Begin(c, BLOCK); imui.Flex(c); imui.End(c);

                imAnimatedNumber(c, result.bestPossibleScore, s.t, currentStart, 0.3);
                currentStart += 0.3;

                imui.Begin(c, BLOCK); imui.Size(c, 25, PERCENT, 0, NA); imui.End(c);
            } imui.End(c);

            imBeginAnimatedRow(c, s.t, currentStart, 0.1, 300); {
                currentStart += 0.3;

                imui.Begin(c, BLOCK); imui.Size(c, 25, PERCENT, 0, NA); imui.End(c);

                imdom.Str(c, "Score: "); 

                imui.Begin(c, BLOCK); imui.Flex(c); imui.End(c);

                imAnimatedNumber(c, result.score, s.t, currentStart, 0.3);
                currentStart += 0.3;

                imui.Begin(c, BLOCK); imui.Size(c, 25, PERCENT, 0, NA); imui.End(c);
            } imui.End(c);

            imui.Begin(c, BLOCK); imui.Flex(c); imui.End(c);

            imBeginAnimatedRow(c, s.t, currentStart, 0.1, 300); {
                currentStart += 0.3;
                imdom.Str(c, s.message);
            } imui.End(c);

            const root = imBeginAnimatedRow(c, s.t, currentStart, 0.1, 300); 
            imui.Align(c); imui.Justify(c); imui.Flex(c, 4); {
                currentStart += 0.3;

                const height = root.clientHeight;
                const sizeChanged = im.Memo(c, height);
                if (sizeChanged) {
                    imdom.setStyle(c, "fontSize", (height / 2) + "px");
                }

                const designation = getDesignation(result.score, result.bestPossibleScore);

                const dt = im.getDeltaTimeSeconds(c);
                let angle = im.Get(c, Number, 0) || 0; {
                    angle += dt;
                    const twoPi = Math.PI * 2;
                    if (angle > twoPi) {
                        angle -= twoPi;
                    }
                } im.Set(c, angle);

                // Guyse. which its rotatign . ??
                let scale = 1;
                if (Math.PI / 2 < angle && angle < 3 * Math.PI / 2) {
                    scale = -1;
                }

                im.For(c); for (let i = 0; i < designation.length; i++) {
                    imui.Begin(c, BLOCK); {
                        if (im.isFirstishRender(c)) {
                            imdom.setStyle(c, "position", `absolute`);
                        }

                        imdom.setStyle(c, "transform", `scaleX(${scale}) rotateY(${angle}rad) translate3d(${i * 0.05 * height}px, ${i * 0.05 * height}px, ${i * 10}px)`);

                        imdom.ElBegin(c, el.I); imdom.Str(c, designation[i]); imdom.ElEnd(c, el.I);
                    } imui.End(c);
                } im.ForEnd(c);
            } imui.End(c);
        } imui.End(c);
    } imui.End(c);
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

    const root = imui.Begin(c, ROW); imui.Justify(c); {
        imdom.setStyle(c,"opacity", t + "");
        imdom.setStyle(c,"transform", `translate(0, ${downAmount * (1 - t)}px)`);
    } // user specified end

    return root;
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

    imdom.Str(c, number);
}
