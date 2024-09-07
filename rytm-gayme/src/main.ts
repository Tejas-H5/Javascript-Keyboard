import "src/css/layout.css";
import { appendChild, Component, div, el, getState, newComponent, newInsertable, newStyleGenerator, RenderGroup, setCssVars, span } from "src/utils/dom-utils";
import { getCurrentOscillatorGain, initDspLoopInterface, pressKey, releaseAllKeys, releaseKey } from "./dsp-loop-interface";
import "./main.css";
import { addNewLine as insertNewLineBelow, insertNewLineItemAfter, InstrumentKey, newGlobalState, SEQ_ITEM, SequencerLine, SequencerState, SequencerTrack, SequencerLineItem, setCurrentItemChord, setCurrentItemIdx, setCurrentLineIdx, setCurrentItemRest, setCurrentItemHold, deleteCurrentLineItem } from "./state";
import { getNoteText, MusicNote } from "./utils/music-theory-utils";

const sg = newStyleGenerator();

// all util styles

function Slider(rg: RenderGroup<{
    label: string;
    value: number;
    min: number;
    max: number;
    step: number;
    onChange: (value: number) => void;
}>) {
    return div({ class: "row" }, [
        div({}, rg.text((s) => s.label)),
        el<HTMLInputElement>("INPUT", { type: "range", class: "slider", }, [
            rg.attr("min", (s) => "" + s.min),
            rg.attr("max", (s) => "" + s.max),
            rg.attr("step", (s) => "" + s.step),
            rg.attr("value", (s) => "" + s.value),
            rg.on("input", (s, e) => {
                s.onChange((e.target! as HTMLInputElement).value as unknown as number);
            })
        ]),
    ]);
}

function Keyboard(rg: RenderGroup) {
    function KeyboardRow(rg: RenderGroup<{
        keys: InstrumentKey[];
        keySize: number;
        startOffset: number;
    }>) {
        function KeyboardKey(rg: RenderGroup<{
            key: InstrumentKey;
            keySize: number;
        }>) {
            function handlePress() {
                const s = getState(rg);
                pressKey(s.key);
                rerenderApp();
            }

            function handleRelease() {
                const s = getState(rg);
                releaseKey(s.key);
                rerenderApp();
            }

            let signal = 0;

            rg.preRenderFn((s) => {
                signal = getCurrentOscillatorGain(s.key.index);
            });

            return span({
                class: " relative",
                style: "font-family: monospace; outline: 1px solid var(--foreground);" +
                    "display: inline-block; text-align: center; user-select: none;",
            }, [
                rg.style("width", s => s.keySize + "px"),
                rg.style("height", s => s.keySize + "px"),
                rg.style("fontSize", s => (s.keySize / 2) + "px"),
                // TODO: opacity between 0 and 1 here
                rg.style("backgroundColor", () => signal > 0.1 ? `rgba(0, 0, 0, ${signal})` : `rgba(255, 255, 255, ${signal})`),
                rg.style("color", (s) => signal > 0.1 ? `var(--bg)` : `var(--fg)`),
                rg.on("mousedown", handlePress),
                rg.on("mouseup", handleRelease),
                rg.on("mouseleave", handleRelease),
                div({
                    style: "position: absolute; top:5px; left: 0; right:0;"
                }, [
                    rg.text(s => s.key.text)
                ]),
                div({
                    class: "text-mg",
                    style: "position: absolute; bottom:5px; left: 0; right:0;" +
                        "text-align: right;"
                }, [
                    rg.style("fontSize", s => (s.keySize / 4) + "px"),
                    rg.style("paddingRight", s => (s.keySize / 10) + "px"),
                    rg.text(s => s.key.noteText),
                ]),
            ]);
        }

        return div({ class: "row", style: "gap: 5px; margin-top: 5px;" }, [
            div({}, [
                rg.style("width", s => (s.startOffset * s.keySize) + "px"),
            ]),
            rg.list(div({ class: "row" }), KeyboardKey, (getNext, s) => {
                for (let i = 0; i < s.keys.length; i++) {
                    const key = getNext();
                    key.render({ key: s.keys[i], keySize: s.keySize });
                }
            })
        ]);
    }

    const root = div({ class: "" });

    return rg.list(root, KeyboardRow, (getNext, s) => {
        const offsets = [
            0,
            0.5,
            0.75,
            1.25,
            1.75,
        ];

        let maxOffset = 0;
        for (let i = 0; i < globalState.keys.length; i++) {
            const row = globalState.keys[i];
            let computedOffset = offsets[i] + row.length + 1;
            maxOffset = Math.max(maxOffset, computedOffset);
        }

        const width = root.el.clientWidth;
        // const height = root.el.clientHeight;
        const keySize = Math.min(
            width / maxOffset,
            // height / (2 * keys.length)
        )

        for (let i = 0; i < globalState.keys.length; i++) {
            const row = globalState.keys[i];
            getNext().render({
                keys: row,
                keySize,
                startOffset: offsets[i],
            });
        }
    });
}

const cnButton = sg.makeClass("button", [
    `{
        all: unset; background-color: var(--bg); user-select: none; cursor: pointer; padding: 4px; text-align: center; 
        border: 1px solid var(--fg); 
     }`,
    `:hover { background-color: var(--bg2);  } `,
    `:active { background-color: var(--fg); color: var(--bg);  } `,
]);

function Button(rg: RenderGroup<{ text: string; onClick(): void; flex1?: boolean; }>) {
    return el("BUTTON", { type: "button", class: cnButton }, [
        rg.class("flex-1", s => !!s.flex1),
        rg.text(s => s.text),
        rg.on("click", s => s.onClick()),
    ]);
}

const cnSequencerCell = sg.makeClass("sequencer-cell", [
    `{ padding: 2px 10px }`
]);


function SequencerLineUI(rg: RenderGroup<{
    lineIdx: number;
    track: SequencerTrack;
    state: SequencerState;
    render(): void;
}>) {

    function handleHoverRow(lineIdx: number) {
        const s = getState(rg);
        s.state.currentHoveredLineIdx = lineIdx;
        s.render();
    }

    function handleClickRow(lineIdx: number) {
        const s = getState(rg);
        s.state.currentSelectedLineIdx = lineIdx;
        s.render();
    }

    function isLineSelected(state: SequencerState, row: number) {
        return state.currentSelectedLineIdx === row;
    }

    function isLineHovered(state: SequencerState, row: number) {
        return state.currentHoveredLineIdx === row;
    }

    let line: SequencerLine;
    rg.preRenderFn((s) => {
        line = s.track.lines[s.lineIdx];
    });

    return div({
        class: "row",
        style: "font-size: 20px; border: 1px solid var(--fg);"
    }, [
        rg.on("mouseenter", s => handleHoverRow(s.lineIdx)),
        rg.on("mousedown", s => handleClickRow(s.lineIdx)),
        rg.style("borderBottom", s => s.lineIdx === s.track.lines.length - 1 ? "1px solid var(--fg)" : "none"),
        rg.style(
            "backgroundColor",
            s => isLineSelected(s.state, s.lineIdx) ? "var(--bg2)" :
                isLineHovered(s.state, s.lineIdx) ? "var(--bg2)" : "",
        ),
        div({ class: cnSequencerCell }, rg.text((s) => "" + s.lineIdx)),
        div({ class: "flex-1" }, [
            rg.with(
                s => line.comment,
                rg => div({}, rg.text(s => s))
            ),
            rg.text(s => [
                line.bpm === undefined ? "" : (line.bpm + " bpm"),
                line.interval === undefined ? "" : ("1 / " + line.interval),
            ].filter(s => !!s).join(" : ")),
            () => {
                function SequencerItemUI(rg: RenderGroup<{
                    lineIdx: number;
                    itemIdx: number;
                    line: SequencerLine;
                    state: SequencerState;
                    render(): void;
                }>) {
                    function isLineItemSelected(state: SequencerState, row: number, col: number) {
                        return state.currentSelectedLineIdx === row && state.currentSelectedItemIdx === col;
                    }

                    function isLineItemHovered(state: SequencerState, row: number, col: number) {
                        return state.currentHoveredLineIdx === row && state.currentHoveredItemIdx === col;
                    }

                    let item: SequencerLineItem;
                    rg.preRenderFn(s => item = s.line.items[s.itemIdx]);
                    return span({ class: "inline-block", style: "padding: 4px; border: 1px solid var(--fg);" }, [
                        rg.on("mouseenter", (s, e) => {
                            e.stopImmediatePropagation();
                            s.state.currentHoveredLineIdx = s.lineIdx;
                            s.state.currentHoveredItemIdx = s.itemIdx;
                            s.render();
                        }),
                        rg.style(
                            "backgroundColor", 
                            s => isLineItemSelected(s.state, s.lineIdx, s.itemIdx) ? "var(--mg)" :
                                isLineItemHovered(s.state, s.lineIdx, s.itemIdx) ? "var(--mg)" :
                                ""
                        ),
                        rg.text(s => {
                            if (item.t === SEQ_ITEM.REST) {
                                return ".";
                            }

                            if (item.t === SEQ_ITEM.HOLD) {
                                return "_";
                            }

                            if (item.t === SEQ_ITEM.CHORD) {
                                return item.notes.map(n => {
                                    if (n.sample) return n.sample;
                                    if (n.noteIndex) return getNoteText(n.noteIndex);
                                    return "<???>";
                                }).join(" ");
                            }

                            return "<????>";
                        })
                    ]);
                }

                const root =  div({ 
                    class: "flex-wrap", 
                    style: "padding: 10px; gap: 10px" 
                });
                return rg.list(root, SequencerItemUI, (getNext, s) => {
                    for (let i = 0; i < line.items.length; i++) {
                        getNext().render({ 
                            lineIdx: s.lineIdx, itemIdx: i, line, state: s.state, render: s.render 
                        });
                    }
                })
            }
        ])
    ]);
}

function SequencerTrackUI(rg: RenderGroup<{ track: number; state: SequencerState; render(): void; }>) {
    return div({}, [
        div({}, [
            rg.text(s => "Track " + (s.track + 1)),
        ]),
        rg.list(div(), SequencerLineUI, (getNext, s) => {
            const track = s.state.sequencerTracks[s.track];
            for (let i = 0; i < track.lines.length; i++) {
                getNext().render({ track, lineIdx: i, render: s.render, state: s.state });
            }
        })
    ]);
}

function Sequencer(rg: RenderGroup) {
    function handleMouseLeave() {
        const state = globalState.sequencer;
        state.currentHoveredLineIdx = -1;
        state.currentHoveredItemIdx = -1;
        rg.renderWithCurrentState();
    }

    function handlePlay() {
        // TODO: step through the sequence
    }

    return div({
        class: "flex-1 col",
        style: "padding: 10px",
    }, [
        div({ class: "row align-items-center", style: "padding:10px; gap: 10px;" }, [
            "Sequencer",
            // TODO: play btn, other action buttons
            rg.c(Button, c => c.render({ text: "Play", onClick: handlePlay }))
        ]),
        rg.list(div({
            class: "overflow-y-auto flex-1",
        }, [
            rg.on("mouseleave", handleMouseLeave),
        ]), SequencerTrackUI, (getNext) => {
            const { sequencerTracks } = globalState.sequencer;
            for (let i = 0; i < sequencerTracks.length; i++) {
                getNext().render({ track: i, state: globalState.sequencer, render: rg.renderWithCurrentState });
            }
        }),
        // div({ class: "row" }, [
        //     rg.c(Button, c => c.render({ text: "+ Notes", onClick: handleNewRowNotes, flex1: true })),
        //     rg.c(Button, c => c.render({ text: "+ BPM", onClick: handleNewRowBpm, flex1: true })),
        //     rg.c(Button, c => c.render({ text: "+ Subdivision", onClick: handleNewRowSubdivision, flex1: true })),
        // ])
    ]);
}

function App(rg: RenderGroup) {
    setCssVars({
        "--foreground": "black",
        "--background": "white",
        "--key-size": "75px",
    });

    function newSliderTemplateFn(name: string, initialValue: number, fn: (val: number) => void) {
        return rg.c(Slider, (c, s) => c.render({
            label: name,
            min: 0.01, max: 1, step: 0.01,
            value: initialValue,
            onChange(val) { fn(val); rerenderApp(); },
        }));
    }

    let firstRender = false;
    rg.preRenderFn(() => {
        if (!firstRender) {
            firstRender = true;
        }
    });

    // TODO: automate playing some songs.
    // let on = false;
    // setInterval(() => {
    //     if (on) {
    //         keyboardHandle.pressNote({
    //             noteIndex: getNoteIndex("A", 4, false)
    //         });
    //     } else {
    //         keyboardHandle.releaseNote({main
    //             noteIndex: getNoteIndex("A", 4, false)
    //         });
    //     }
    //     on = !on;
    // }, 1000);
    //
    //

    const currentlyPressedNotes: MusicNote[] = [];
    function handleKeyDown(
        key: string,
        ctrlPressed: boolean,
        shiftPressed: boolean,
    ): boolean {
        const sequencer = globalState.sequencer;

        if (
            key === "ArrowUp"
            || key === "ArrowDown"
        ) {
            if (key === "ArrowUp") {
                setCurrentLineIdx(sequencer, sequencer.currentSelectedLineIdx - 1);
            } else if (key === "ArrowDown") {
                setCurrentLineIdx(sequencer, sequencer.currentSelectedLineIdx + 1);
            }
            return true;
        }

        if (
            key === "ArrowLeft"
            || key === "ArrowRight"
        ) {
            if (key === "ArrowLeft") {
                setCurrentItemIdx(sequencer, sequencer.currentSelectedItemIdx - 1);
            } else if (key === "ArrowRight") {
                setCurrentItemIdx(sequencer, sequencer.currentSelectedItemIdx + 1);
            }
            return true;
        }

        if (key === "Tab") {
            insertNewLineItemAfter(sequencer);
            return true;
        }

        if (key === "Enter" && shiftPressed) {
            insertNewLineBelow(sequencer);
            return true;
        }

        if (key === ">") {
            setCurrentItemRest(sequencer);
            return true;
        }

        if (key === "_") {
            setCurrentItemHold(sequencer);
            return true;
        }

        if (key === "Delete") {
            deleteCurrentLineItem(sequencer);
            return true;
        }

        const instrumentKey = globalState.flatKeys.find(k => k.keyboardKey === key.toLowerCase());
        if (instrumentKey) {
            pressKey(instrumentKey);
            const note = instrumentKey.musicNote;
            if (!currentlyPressedNotes.includes(note)) {
                currentlyPressedNotes.push(note);
            }
            setCurrentItemChord(globalState.sequencer, currentlyPressedNotes);
            return true;
        }

        return false;
    }

    document.addEventListener("keydown", (e) => {
        if (e.repeat) {
            return;
        }

        if (handleKeyDown(e.key, e.ctrlKey || e.metaKey, e.shiftKey)) {
            e.preventDefault();
            rerenderApp();
        }
    })

    document.addEventListener("keyup", (e) => {
        const key = globalState.flatKeys.find(k => k.keyboardKey === e.key.toLowerCase());
        if (!key) {
            return;
        }

        e.preventDefault();
        releaseKey(key);
        rerenderApp();
        currentlyPressedNotes.splice(0, currentlyPressedNotes.length);
    });

    document.addEventListener("blur", () => {
        releaseAllKeys(globalState.flatKeys);
        rerenderApp();
    })

    document.addEventListener("mousemove", () => {
        globalState.sequencer.currentHoveredItemIdx = -1;
        globalState.sequencer.currentHoveredLineIdx = -1;
        rerenderApp();
    });

    window.addEventListener("resize", () => {
        rerenderApp();
    });


    return div({
        class: "absolute-fill col",
        style: "position: fixed",
    }, [
        div({ class: "col flex-1" }, [
            rg.c(Sequencer, c => c.render(null))
        ]),
        // newComponent(Description),
        // TODO: fix
        // newSliderTemplateFn("Attack", settings.attack, (val) => {
        //     settings.attack = val;
        //     audioLoopDispatch({ playSettings: settings });
        // }),
        // newSliderTemplateFn("Decay", settings.decay, (val) => {
        //     settings.decay = val;
        //     audioLoopDispatch({ playSettings: settings });
        // }),
        // newSliderTemplateFn("Sustain Volume", settings.sustainVolume, (val) => {
        //     settings.sustainVolume = val;
        //     audioLoopDispatch({ playSettings: settings });
        // }),
        // newSliderTemplateFn("Sustain Time", settings.sustain, (val) => {
        //     settings.sustain = val;
        //     audioLoopDispatch({ playSettings: settings });
        // }),
        div({ class: "col justify-content-center flex-1" }, [
            div({ class: "flex-1" }),
            rg.c(Keyboard, c => c.render(null)),
        ])
    ])
}

const globalState = newGlobalState();

const root = newInsertable(document.body);
let app: Component<any, any> | undefined;
function rerenderApp() {
    app?.render(null);
}

// initialize the app.
(async () => {
    await initDspLoopInterface({
        onCurrentPlayingChanged: rerenderApp
    });

    // Our code only works after the audio context has loaded.
    app = newComponent(App);
    appendChild(root, app);
    rerenderApp();
})();
