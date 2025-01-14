import { cnLayout, cnStyle } from "src/dom-root";
import { chooseItem } from "src/utils/array-utils";
import { div, InsertableInitializerList, RenderGroup } from "src/utils/dom-utils";
import { GlobalContext, setViewEditChart } from "./app";
import { Gameplay } from "./gameplay";

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

export function PlayView(rg: RenderGroup<GlobalContext>) {
    let showResultsScreen = false;

    randomizeMessage();

    rg.preRenderFn(s => {
        const playView = s.ui.playView;
        if (!s.sequencer.isPlaying) {
            if (playView.isTesting) {
                setViewEditChart(s);
            } else {
                showResultsScreen = true;
                randomizeMessage();
            }
            return;
        } 

        // TODO: revert
        // showResultsScreen = false;
        showResultsScreen = true;
    })
    // Rewind the track a bit, and then start from there
    return div({ class: cnLayout.flex1 + cnLayout.col }, [
        rg.if(() => !showResultsScreen, Gameplay),
        rg.else(ResultsScreen)
    ]);
}

function ResultsScreen(rg: RenderGroup<GlobalContext>) {
    let animation = 0;
    let fontSize = 0;

    const baseFontSize = 4;
    const wiggle = 0.6;

    rg.preRenderFn(s => {
        animation += s.dt;
        if (animation > 1) {
            animation = 0;
        }

        fontSize = baseFontSize + wiggle * Math.sin(Math.PI * 2 * animation);
    });

    return div({ 
        class: cnLayout.flex1 + cnLayout.row + cnLayout.alignItemsCenter + cnLayout.justifyContentCenter
    }, [
        div({ class: cnStyle.border1Solid, style: `width: 80%; height: 80%;` }, [
            div({ 
                class: cnLayout.row + cnLayout.alignItemsCenter + cnLayout.justifyContentCenter, 
                style: `height: ${fontSize + baseFontSize}rem;` 
            }, [
                rg.style("fontSize", () => fontSize + "rem"),
                currentMessage,
            ]),
        ])
    ]);
}

function AnimatedRow(rg: RenderGroup, children: InsertableInitializerList) {
    return div({ class: cnLayout.row + cnLayout.justifyContentCenter }, [
        ...children
    ])
}
