import { chooseItem } from "src/utils/array-utils";
import { cn, div, DomUtilsChildren, RenderGroup } from "src/utils/dom-utils";
import { GlobalContext, setViewEditChart } from "./app";
import { Gameplay } from "./gameplay";
import { clamp } from "src/utils/math-utils";

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
        if (s.sequencer.isPlaying) {
            // TODO: revert
            // showResultsScreen = false;
            showResultsScreen = true;
            return;
        } 

        if (playView.isTesting) {
            setViewEditChart(s);
        } else {
            showResultsScreen = true;
            randomizeMessage();
        }
    });

    // Rewind the track a bit, and then start from there
    return div({ class: [cn.flex1, cn.col] }, [
        rg.if(() => !showResultsScreen, Gameplay),
        rg.else(ResultsScreen)
    ]);
}

function ResultsScreen(rg: RenderGroup<GlobalContext>) {
    let t = 0;
    let fontSize = 0;

    const baseFontSize = 4;
    const wiggle = 0.6;

    rg.preRenderFn(s => {
        if (t < 100) {
            t += s.dt;
        }

        fontSize = baseFontSize + wiggle * Math.sin(Math.PI * 2 * t);
    });

    document.addEventListener("keydown", (e) => {
        if (e.key === 'R') {
            t = 0;
        }
    });

    const start = 0.3;

    return div({ 
        class: [cn.flex1, cn.row, cn.alignItemsCenter, cn.justifyContentCenter]
    }, [
        div({ style: `width: 80%; height: 80%; border: 1px solid currentColor;` }, [
            div({ 
                class: [cn.row, cn.alignItemsCenter, cn.justifyContentCenter],
                style: `height: ${fontSize + baseFontSize}rem;` 
            }, [
                rg.style("fontSize", () => fontSize + "rem"),
                currentMessage,
            ]),
            rg.cArgs(AnimatedRow, (c) => c.render({
                t, inTime: start + 0.1, duration: 0.1, downAmount: 300,
            }), [
                div({ style: "width: 25%" }),
                div({}, "Time taken:"),
                div({ class: [cn.flex1] }),
                rg.c(AnimatedNumber, (c, s) => c.render({
                    targetNumber: 12132,
                    t, inTime: start + 0.7, duration: 0.3,
                })),
                div({ style: "width: 25%" }),
            ]),
            rg.cArgs(AnimatedRow, (c, s) => c.render({
                t, inTime: start + 0.3, duration: 0.1, downAmount: 300,
            }), [
                div({ style: "width: 25%" }),
                div({}, "Hits"),
                div({ class: [cn.flex1] }),
                rg.c(AnimatedNumber, (c, s) => c.render({
                    targetNumber: 12132,
                    t, inTime: start + 1.1, duration: 0.3,
                })),
                div({ style: "width: 25%" }),
            ]),
            rg.cArgs(AnimatedRow, (c, s) => c.render({
                t, inTime: start + 0.5, duration: 0.1, downAmount: 300,
            }), [
                div({ style: "width: 25%" }),
                div({}, "Pauses"),
                div({ class: [cn.flex1] }),
                rg.c(AnimatedNumber, (c, s) => c.render({
                    targetNumber: 12132,
                    t, inTime: start + 1.4, duration: 0.3,
                })),
                div({ style: "width: 25%" }),
            ])
        ])
    ]);
}

function AnimatedRow(rg: RenderGroup<{
    t: number;
    inTime: number;
    duration: number;
    downAmount: number;
}>, children: DomUtilsChildren) {
    let t = 0;
    rg.preRenderFn(s => {
        if (s.t < s.inTime - 1) {
            t = 0;
            return;
        }

        t = clamp((s.t - s.inTime) / s.duration, 0, 1);
    });

    return div({ class: [cn.row, cn.justifyContentCenter] }, [
        rg.style("opacity", () => t + ""),
        rg.style("transform", s => {
            const dy = s.downAmount * (1 - t);
            return `translate(0, ${dy}px)`;
        }),
        ...children
    ])
}

function AnimatedNumber(rg: RenderGroup<{
    targetNumber: number;
    t: number;
    inTime: number;
    duration: number;
}>) {
    let number = 0;
    let t = 0;

    rg.preRenderFn(s => {
        t = clamp((s.t - s.inTime) / s.duration, 0, 1);

        if (t <= 0) {
            number = 0;
        } else if (t >= 1) {
            number = s.targetNumber;
        } else {
            number = Math.floor(s.targetNumber * t);
        }
    });

    return div({}, [
        rg.text(() => number + ""),
    ]);
}
