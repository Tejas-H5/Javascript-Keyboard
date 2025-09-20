import { BLOCK, COL, imAlign, imFlex, imJustify, imLayout, imLayoutEnd, imSize, NA, PERCENT, REM, ROW } from "src/components/core/layout";
import { chooseItem } from "src/utils/array-utils";
import {
    getDeltaTimeSeconds,
    ImCache,
    imElse,
    imEndIf,
    imFor,
    imForEnd,
    imGet,
    imIf,
    imMemo,
    imSet,
    isFirstishRender
} from "src/utils/im-core";
import { EL_B, EL_I, elSetStyle, imEl, imElEnd, imStr } from "src/utils/im-dom";
import { clamp } from "src/utils/math-utils";
import { GlobalContext, setViewChartSelect, setViewPlayCurrentChart } from "./app";
import { GameplayState, imGameplay } from "./gameplay";

function handlePlayViewKeyDown(ctx: GlobalContext) {
    if (!ctx.keyPressState) return false;

    const { key } = ctx.keyPressState;

    if (key === "Escape") {
        setViewChartSelect(ctx);
        return true;
    }

    return false;
}

export function imPlayView(c: ImCache, ctx: GlobalContext) {
    // NOTE: strange code boundary here between the results screen and the gameplay screen, because I wrote this code a while ago.
    // but it seems to work ok for now.

    if (!ctx.handled) {
        ctx.handled = handlePlayViewKeyDown(ctx);
    }

    imLayout(c, COL); imFlex(c); {
        if (imIf(c) && ctx.ui.playView.result) {
            imResultsScreen(ctx, c, ctx.ui.playView.result);
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
    if (score > Math.max(bestPossibleScore - 10, bestPossibleScore * 0.98)) return "S";
    if (score > Math.max(bestPossibleScore - 50, bestPossibleScore * 0.9))  return "A";
    if (score > Math.max(bestPossibleScore - 100, bestPossibleScore * 0.8)) return "B";
    if (score > Math.max(bestPossibleScore - 500, bestPossibleScore * 0.7)) return "C";
    return "L";
}

// Its cringe but I like it. Reminds me of this old typing game 'stamina' I used to play
function getMessagesForDesignation(d: Designation): string[] {
    switch(d) {
        case "SSS": return ["HOW"];
        case "SS":  return ["LETS GOOOO!!!!"];
        case "S":   return ["Amazing!", "Very nice!", ">message goes here<"];
        case "A":   return ["Well done!", "This is a good improvement.", "Yes", "So close", "Missed it by THAT much"];
        case "B":   return ["Nice!", "Good job!", "This message is randomly generated"];
        case "C":   return [
            "You passed!",
            "Bare minimum!",
            "De-fault!",
            "Do worse to unlock the tutorial. Well, kinda"
        ];
        case "L":   return [
            "...",
            "Taking Ls is the only way to grow as a person", 
            "This game is hard. Because really, you're learning a full instrument",
            "We'll get em next time.", "This game is hard. Because really, you're learning a full instrument",
            "The road is long and hard. Will the destination be worth it? probably not, so make sure you're enjoying yourself",
            "This game comes with a chart editor, which you may be interested in",
            "Excess keys being held down do not detract from score",
            "Press and hold [Backspace] to engage practice mode. You can use it to rewind by a couple seconds, and try again.",
            "Reminder to sit up straight and hydrate", // https://www.youtube.com/watch?v=A7UkRXNnCeQ
        ];
    }
    return ["???"];
}

function imResultsScreen(ctx: GlobalContext, c: ImCache, result: GameplayState) {
    if (!ctx.handled) {
        if (ctx.keyPressState) {
            if (ctx.keyPressState.key === "Enter") {
                // restart this chart

                setViewPlayCurrentChart(ctx, ctx.sequencer._currentChart);
            }
        }
    }

    const focusChanged = imMemo(c, true);
    let s = imGet(c, newResultsScreenState);
    if (!s || focusChanged) {
        s = imSet(c, newResultsScreenState());
        const designation = getDesignation(result.score, result.bestPossibleScore);
        const messages = getMessagesForDesignation(designation);
        s.message = chooseItem(messages, Math.random());
    }

    const dt = getDeltaTimeSeconds(c);
    if (s.t < 100) {
        s.t += dt * 0.5;
    }

    s.fontSize = s.baseFontSize + s.wiggle * Math.sin(Math.PI * 2 * s.t);

    imLayout(c, ROW); imFlex(c); imAlign(c); imJustify(c); {
        imLayout(c, COL); imSize(c, 80, PERCENT, 80, PERCENT); {
            if (isFirstishRender(c)) {
                elSetStyle(c,"border", "1px solid currentColor");
            }

            let currentStart = 0.1;

            imBeginAnimatedRow(c, s.t, currentStart, 0.1, 300); imSize(c, 0, NA, s.baseFontSize + s.wiggle, REM); {
                currentStart += 0.3;
                elSetStyle(c, "fontSize", s.fontSize + "rem");

                imEl(c, EL_B); imStr(c, result.chartName); imElEnd(c, EL_B);
            } imLayoutEnd(c);

            imLayout(c, BLOCK); imFlex(c); imLayoutEnd(c);

            imBeginAnimatedRow(c, s.t, currentStart, 0.1, 300); {
                currentStart += 0.3;

                imLayout(c, BLOCK); imSize(c, 25, PERCENT, 0, NA); imLayoutEnd(c);

                imStr(c, "Best possible score: "); 

                imLayout(c, BLOCK); imFlex(c); imLayoutEnd(c);

                imAnimatedNumber(c, result.bestPossibleScore, s.t, currentStart, 0.3);
                currentStart += 0.3;

                imLayout(c, BLOCK); imSize(c, 25, PERCENT, 0, NA); imLayoutEnd(c);
            } imLayoutEnd(c);

            imBeginAnimatedRow(c, s.t, currentStart, 0.1, 300); {
                currentStart += 0.3;

                imLayout(c, BLOCK); imSize(c, 25, PERCENT, 0, NA); imLayoutEnd(c);

                imStr(c, "Score: "); 

                imLayout(c, BLOCK); imFlex(c); imLayoutEnd(c);

                imAnimatedNumber(c, result.score, s.t, currentStart, 0.3);
                currentStart += 0.3;

                imLayout(c, BLOCK); imSize(c, 25, PERCENT, 0, NA); imLayoutEnd(c);
            } imLayoutEnd(c);

            imLayout(c, BLOCK); imFlex(c); imLayoutEnd(c);

            imBeginAnimatedRow(c, s.t, currentStart, 0.1, 300); {
                currentStart += 0.3;
                imStr(c, s.message);
            } imLayoutEnd(c);

            const root = imBeginAnimatedRow(c, s.t, currentStart, 0.1, 300); 
            imAlign(c); imJustify(c); imFlex(c, 4); {
                currentStart += 0.3;

                const height = root.clientHeight;
                const sizeChanged = imMemo(c, height);
                if (sizeChanged) {
                    elSetStyle(c, "fontSize", (height / 2) + "px");
                }

                const designation = getDesignation(result.score, result.bestPossibleScore);

                const dt = getDeltaTimeSeconds(c);
                let angle = imGet(c, Number, 0) || 0; {
                    angle += dt;
                    const twoPi = Math.PI * 2;
                    if (angle > twoPi) {
                        angle -= twoPi;
                    }
                } imSet(c, angle);

                // Guyse. which its rotatign . ??
                let scale = 1;
                if (Math.PI / 2 < angle && angle < 3 * Math.PI / 2) {
                    scale = -1;
                }

                imFor(c); for (let i = 0; i < designation.length; i++) {
                    imLayout(c, BLOCK); {
                        if (isFirstishRender(c)) {
                            elSetStyle(c, "position", `absolute`);
                        }

                        elSetStyle(c, "transform", `scaleX(${scale}) rotateY(${angle}rad) translate3d(${i * 0.05 * height}px, ${i * 0.05 * height}px, ${i * 10}px)`);

                        imEl(c, EL_I); imStr(c, designation[i]); imElEnd(c, EL_I);
                    } imLayoutEnd(c);
                } imForEnd(c);
            } imLayoutEnd(c);
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

    const root = imLayout(c, ROW); imJustify(c); {
        elSetStyle(c,"opacity", t + "");
        elSetStyle(c,"transform", `translate(0, ${downAmount * (1 - t)}px)`);
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

    imStr(c, number);
}
