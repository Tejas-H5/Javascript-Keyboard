import { Button } from "src/components/button";
import "src/css/layout.css";
import {
    div,
    el,
    getState,
    isEditingTextSomewhereInDocument,
    RenderGroup,
    setCssVars,
    setInputValue,
    span
} from "src/utils/dom-utils";
import {
    pressKey,
    releaseAllKeys,
    releaseKey
} from "./dsp-loop-interface";
import { Gameplay } from "./gameplay";
import { Keyboard } from "./keyboard";
import "./main.css";
import { RenderContext } from "./render-context";
import { Sequencer } from "./sequencer";
import {
    clearRangeSelection,
    deleteRange,
    getCurrentPlayingTimeRelative,
    getCursorStartBeats,
    getItemIdxAtBeat,
    getItemStartBeats,
    getPlaybackDuration,
    getSelectionRange,
    handleMovement,
    hasRangeSelection,
    mutateSequencerTimeline,
    setCursorDivisor,
    setTimelineNoteAtPosition,
    timelineHasNoteAtPosition
} from "./sequencer-state";
import { Slider } from "./slider";
import {
    deepCopyJSONSerializable,
    getCurrentSelectedSequenceName,
    loadCurrentSelectedSequence,
    moveLoadSaveSelection,
    playAll,
    playCurrentInterval,
    recomputeState,
    resetSequencer,
    save,
    saveStateDebounced,
    stopPlaying
} from "./state";


function LoadSavePanel(rg: RenderGroup<RenderContext>) {
    function Item(rg: RenderGroup<{ ctx: RenderContext; name: string; }>) {
        return div({}, [
            rg.text(s => s.name),
            rg.style("backgroundColor", s => s.name === getCurrentSelectedSequenceName(s.ctx.globalState) ? "var(--bg2)" : ""),
            rg.on("click", s => {
                setInputValue(input, s.name);
                s.ctx.render();
            })
        ]);
    }

    const input = el<HTMLInputElement>("INPUT", { style: "width: 100%", placeholder: "enter name here" }, [
        rg.on("input", (s) => {
            s.globalState.uiState.loadSaveCurrentSelection = input.el.value;
            s.render();
        })
    ]);

    rg.preRenderFn(s => {
        setInputValue(input, getCurrentSelectedSequenceName(s.globalState));
    });

    return div({ style: "width: 33vw" }, [
        div({ class: "row", style: "gap: 10px" }, [
            // dont want to accidentally load over my work. smh.
            rg.if(
                s => (getCurrentSelectedSequenceName(s.globalState) in s.globalState.savedState.allSavedSongs),
                rg => rg.c(Button, (c, s) => c.render({
                    text: "Load",
                    onClick() {
                        loadCurrentSelectedSequence(s.globalState);
                        s.render();
                    }
                })),
            ),
            input,
            rg.if(
                s => !!getCurrentSelectedSequenceName(s.globalState),
                rg => rg.c(Button, (c, s) => c.render({
                    text: "Save",
                    onClick() {
                        const key = getCurrentSelectedSequenceName(s.globalState);
                        s.globalState.savedState.allSavedSongs[key] = JSON.stringify(s.globalState.sequencer.timeline);
                        save(s.globalState);
                        s.render();
                    }
                })),
            )
        ]),
        rg.list(div(), Item, (getNext, s) => {
            for (const key in s.globalState.savedState.allSavedSongs) {
                getNext().render({ ctx: s, name: key });
            }
        })
    ]);
}

export function EditView(rg: RenderGroup<RenderContext>) {
    setCssVars({
        "--foreground": "black",
        "--background": "white",
        "--key-size": "75px",
    });

    rg.preRenderFn((s) => {
        recomputeState(s.globalState);

        const sequencer = s.globalState.sequencer;
        const currentTime = getCurrentPlayingTimeRelative(sequencer);
        const duration = getPlaybackDuration(sequencer);
        if (currentTime > duration) {
            stopPlaying(s.globalState);
        }
    });

    function newSliderTemplateFn(name: string, initialValue: number, fn: (val: number) => void) {
        return rg.c(Slider, (c, s) => c.render({
            label: name,
            min: 0.01, max: 1, step: 0.01,
            value: initialValue,
            onChange(val) { fn(val); s.render(); },
        }));
    }

    function clearSequencer() {
        if (confirm("Are you sure you want to clear your progress?")) {
            const s = getState(rg);
            resetSequencer(s.globalState);
            s.render();
        }
    }

    function toggleLoadSaveSiderbar() {
        const s = getState(rg);
        s.globalState.uiState.loadSaveSidebarOpen = !s.globalState.uiState.loadSaveSidebarOpen;
        // needs it twice for some reason...
        s.render();
        s.render();
    }

    return div({
        class: "absolute-fill row",
        style: "position: fixed",
    }, [
        div({ class: "col flex-1" }, [
            // div({ class: "row justify-content-center flex-1" }, [
            //     rg.c(Teleprompter, c => c.render(null)),
            // ]),
            rg.if(
                s => s.globalState.uiState.isKeyboard,
                rg => (
                    div({ class: "col flex-1" }, [
                        div({ class: "row", style: "gap: 5px" }, [
                            div({ class: "flex-1" }),
                            span({ class: "b" }, "Keyboard"),
                            div({ class: "flex-1" }),
                        ]),
                        div({ class: "row justify-content-center flex-1" }, [
                            rg.c(Keyboard, (c, s) => c.render(s)),
                        ]),
                    ])
                ),
            ),
            rg.else(
                rg => (
                    div({ class: "col flex-1" }, [
                        div({ class: "row", style: "gap: 5px" }, [
                            div({ class: "flex-1" }),
                            span({ class: "b" }, "Gameplay"),
                            div({ class: "flex-1" }),
                        ]),
                        div({ class: "row justify-content-center flex-1" }, [
                            rg.c(Gameplay, (c, s) => c.render(s)),
                        ]),
                    ])
                )
            ),
            div({ class: "col flex-1" }, [
                div({ class: "row", style: "gap: 5px" }, [
                    div({ class: "flex-1" }),
                    span({ class: "b" }, "Sequencer"),

                    // TODO: put this in a better place
                    rg.if(
                        s => s.globalState.uiState.copiedItems.length > 0,
                        rg => rg.text(s => s.globalState.uiState.copiedItems.length + " items copied")
                    ),

                    div({ class: "flex-1" }),
                    rg.c(Button, c => c.render({
                        text: "Clear All",
                        onClick: clearSequencer
                    })),
                    rg.c(Button, (c, s) => c.render({
                        text: (s.globalState.uiState.loadSaveSidebarOpen ? ">" : "<") + "Load/Save",
                        onClick: toggleLoadSaveSiderbar
                    }))
                ]),
                rg.c(Sequencer, (c, s) => c.render(s)),
            ])
        ]),
        rg.if(
            s => s.globalState.uiState.loadSaveSidebarOpen,
            rg => div({ class: "col" }, [
                rg.c(LoadSavePanel, (c, s) => c.render(s))
            ])
        )
    ])
}

