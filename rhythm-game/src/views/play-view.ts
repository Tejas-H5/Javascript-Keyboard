import { chooseItem } from "src/utils/array-utils";
import { GlobalContext, setViewEditChart } from "./app";
import { clamp } from "src/utils/math-utils";
import { deltaTimeSeconds, getKeyEvents, imBeginList, imEnd, imEndList, imInit, imState, imTextDiv, nextListRoot, setInnerText, setStyle } from "src/utils/im-dom-utils";
import { ALIGN_CENTER, COL, FLEX1, imBeginLayout, imBeginSpace, JUSTIFY_CENTER, ROW, PERCENT, EM, NOT_SET, imBeginAbsolute, PX, RELATIVE } from "./layout";
import { imGameplay } from "./gameplay";

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

function newPlayViewState() {
    return {
        showResultsScreen: false,
    };
}

export function PlayView(ctx: GlobalContext) {
    const s = imState(newPlayViewState);

    if (imInit()) {
        randomizeMessage();
    }

    const playView = ctx.ui.playView;
    if (!ctx.sequencer.isPlaying) {
        if (playView.isTesting) {
            setViewEditChart(ctx);
        } else {
            s.showResultsScreen = true;
            // TODO: the old code randomizes the message every frame???
            // randomizeMessage();
        }
    } else {
        // TODO: revert
        // showResultsScreen = false;
        s.showResultsScreen = true;
    }

    imBeginLayout(FLEX1 | COL); {
        imBeginList(); 
        if (nextListRoot() && s.showResultsScreen) {
            ResultsScreen();
        } else {
            nextListRoot();
            imGameplay(ctx);
        }
        imEndList();
    } imEnd();
}


function newResultsScreenState() {
    return {
        t: 0,
        fontSize: 0,
        baseFontSize: 4,
        wiggle: 0.6,
    };
}

function ResultsScreen() {
    const s = imState(newResultsScreenState);

    const dt = deltaTimeSeconds();
    if (s.t < 100) {
        s.t += dt;
    }

    s.fontSize = s.baseFontSize + s.wiggle * Math.sin(Math.PI * 2 * s.t);

    const { keyDown } = getKeyEvents();
    if (keyDown && keyDown.key.toUpperCase() === "R") {
        s.t = 0;
    }

    const start = 0.3;

    imBeginLayout(FLEX1 | ROW | ALIGN_CENTER | JUSTIFY_CENTER); {
        imBeginSpace(80, PERCENT, 80, PERCENT); {
            if (imInit()) {
                setStyle("border", "1px solid currentColor");
            }

            imBeginSpace(
                0, NOT_SET, 4, EM, 
                ROW | ALIGN_CENTER | JUSTIFY_CENTER | RELATIVE
            ); {
                imBeginAbsolute(0, PX, 0, PX, 0, PX, 0, PX, ROW | ALIGN_CENTER | JUSTIFY_CENTER); {
                    setStyle("fontSize", s.fontSize + "rem");
                    setInnerText(currentMessage);
                } imEnd();
            } imEnd();

            imBeginAnimatedRow(s.t, start + 0.1, 0.1, 300); {
                imBeginSpace(25, PERCENT, 0, NOT_SET); imEnd();

                imTextDiv("Time taken: "); 

                imBeginLayout(FLEX1); imEnd();

                imAnimatedNumber(12321, s.t, start + 0.7, 0.3);

                imBeginSpace(25, PERCENT, 0, NOT_SET); imEnd();
            } imEnd();
            imBeginAnimatedRow(s.t, start + 0.3, 0.1, 300); {
                imBeginSpace(25, PERCENT, 0, NOT_SET); imEnd();

                imTextDiv("Hits: "); 

                imBeginLayout(FLEX1); imEnd();

                imAnimatedNumber(12321, s.t, start + 1.1, 0.3);

                imBeginSpace(25, PERCENT, 0, NOT_SET); imEnd();
            } imEnd();
            imBeginAnimatedRow(s.t, start + 0.5, 0.1, 300); {
                imBeginSpace(25, PERCENT, 0, NOT_SET); imEnd();

                imTextDiv("Pauses: "); 

                imBeginLayout(FLEX1); imEnd();

                imAnimatedNumber(12321, s.t, start + 1.4, 0.3);

                imBeginSpace(25, PERCENT, 0, NOT_SET); imEnd();
            } imEnd();

        } imEnd();
    } imEnd();
}



function imBeginAnimatedRow(
    t: number,
    inTime: number,
    duration: number,
    downAmount: number
) {
    if (t < inTime - 1) {
        t = 0;
    }

    t = clamp((t - inTime) / duration, 0, 1);

    imBeginLayout(ROW | JUSTIFY_CENTER); {
        setStyle("opacity", t + "");
        setStyle("transform", `translate(0, ${downAmount * (1 - t)}px)`);
    } // user specified end
}

function imAnimatedNumber(
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

    imTextDiv(number + "");
}
