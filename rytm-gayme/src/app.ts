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

export function App(rg: RenderGroup<RenderContext>) {
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

    function handleKeyDown(
        ctx: RenderContext,
        key: string,
        ctrlPressed: boolean,
        shiftPressed: boolean,
        repeat: boolean
    ): boolean {
        if (isEditingTextSomewhereInDocument()) {
            return false;
        }

        if (key === "I" && ctrlPressed && shiftPressed) {
            // allow inspecting the element
            return false;
        }

        if (key === "R" && ctrlPressed) {
            // allow refreshing page
            return false;
        }

        const globalState = ctx.globalState;
        const uiState = globalState.uiState;
        const sequencer = globalState.sequencer;
        let vAxis = 0;
        if (key === "ArrowUp") {
            vAxis = -1;
        } else if (key === "ArrowDown") {
            vAxis = 1;
        }

        if (key === "S" && ctrlPressed && shiftPressed) {
            globalState.uiState.loadSaveSidebarOpen = !globalState.uiState.loadSaveSidebarOpen;
            return true;
        }

        if (key === "K" && ctrlPressed && shiftPressed) {
            uiState.isKeyboard = !uiState.isKeyboard;
            return true;
        }

        if (uiState.loadSaveSidebarOpen) {
            if (vAxis !== 0) {
                moveLoadSaveSelection(globalState, vAxis);
                return true;
            }

            if (key === "Enter") {
                loadCurrentSelectedSequence(globalState);
                playAll(globalState, 1);
                return true;
            }

            if (key === "Escape") {
                uiState.loadSaveSidebarOpen = false;
                stopPlaying(globalState);
                return true;
            }

            if (key === "Delete") {
                const name = getCurrentSelectedSequenceName(globalState);
                if (name in globalState.savedState.allSavedSongs) {
                    // TODO: real UI
                    if (confirm("You sure you want to delete " + name)) {
                        delete globalState.savedState.allSavedSongs[name];
                        return true;
                    }
                }
            }

            return false;
        }

        if (vAxis !== 0) {
            // doesn't handle wrapping correctly.
            // setCurrentLineIdx(sequencer, sequencer.currentSelectedLineIdx + vAxis);
            // TODO: move thread selection thread up/down 
            return true;
        }

        if (shiftPressed && (
            key === "!" || key === "1"
            || key === "@" || key === "2"
            || key === "#" || key === "3"
        )) {

            const cycleThroughDivisors = (divisors: number[]) => {
                for (let i = 0; i < divisors.length; i++) {
                    const curr = divisors[i];
                    const next = divisors[(i + 1) % divisors.length];
                    let cursorDivisor = sequencer.cursorDivisor;
                    if (cursorDivisor === curr) {
                        setCursorDivisor(sequencer, next);
                        return;
                    }
                }

                setCursorDivisor(sequencer, divisors[0]);
            }

            if (key === "!" || key === "1") {
                setCursorDivisor(sequencer, 1);
            } else if (key === "@" || key === "2") {
                cycleThroughDivisors([2, 4, 8, 16]);
            } else if (key === "#" || key === "3") {
                cycleThroughDivisors([3, 6, 9, 12, 15]);
            } else if (key === "$" || key === "4") {
                cycleThroughDivisors([4, 7, 10, 11, 13, 14,]);
            }
        }

        // need to move by the current beat snap.
        if (key === "ArrowLeft" || key === "ArrowRight") {
            handleMovement(
                sequencer, 
                key === "ArrowRight" ? 1 : -1,
                ctrlPressed,
                shiftPressed
            );

            return true;
        }

        if (key === "Delete") {
            const [start, end] = getSelectionRange(sequencer);
            if (start !== -1 && end !== -1) {
                deleteRange(sequencer, start, end);
                return true;
            }

            const idx = getItemIdxAtBeat(sequencer, getCursorStartBeats(sequencer));
            if (idx !== -1) {
                deleteRange(sequencer, idx, idx);
                return true;
            }
        }

        if (repeat) {
            return false;
        }

        if ((key === "C" || key === "c") && ctrlPressed) {
            const [startIdx, endIdx] = getSelectionRange(sequencer);

            if (startIdx !== -1 && endIdx !== -1) {
                uiState.copiedItems = sequencer.timeline.slice(startIdx, endIdx + 1)
                    .map(deepCopyJSONSerializable);

                uiState.copiedPositionStart = Math.min(
                    getCursorStartBeats(sequencer),
                    getItemStartBeats(sequencer.timeline[startIdx])
                );

                return true;
            }

            return false;
        }

        if ((key === "V" || key === 'v') && ctrlPressed) {
            if (uiState.copiedItems.length > 0) {
                mutateSequencerTimeline(sequencer, tl => {
                    const delta = getCursorStartBeats(sequencer) - uiState.copiedPositionStart;
                    for (const item of uiState.copiedItems) {
                        const newItem = deepCopyJSONSerializable(item);

                        // TODO: attempt to use clean numbers/integers here.
                        // This is just my noob code for now
                        const beats = getItemStartBeats(newItem);
                        const newBeats = beats + delta;
                        newItem.start = newBeats * newItem.divisor;

                        tl.push(newItem);
                    }
                });
                return true;
            }
        }

        if (key === "Escape") {
            if (sequencer.isPlaying) {
                stopPlaying(globalState);
                return true;
            }

            if (hasRangeSelection(sequencer)) {
                clearRangeSelection(sequencer);
                return true;
            }
        }

        if (key === "Tab") {
            if (shiftPressed) {
                handleMovement(sequencer, -1, false, false);
            } else {
                handleMovement(sequencer, 1, false, false);
            }
            
            // TODO: extend currently held notes by 1 as well

            return true;
        }

        const instrumentKey = globalState.flatKeys.find(k => k.keyboardKey === key.toLowerCase());
        if (instrumentKey) {
            // TODO: Just do one or the other based on if we're in 'edit' mode or play mode ?

            // play the instrument
            {
                pressKey(instrumentKey);
            }

            // insert notes into the sequencer
            {
                mutateSequencerTimeline(sequencer, tl => {
                    const pos = sequencer.cursorStart;
                    const divisor = sequencer.cursorDivisor;
                    const note = instrumentKey.musicNote;

                    const hasNote = timelineHasNoteAtPosition(tl, pos, divisor, note);
                    setTimelineNoteAtPosition(
                        tl,
                        pos,
                        divisor,
                        note,
                        1,
                        !hasNote
                    );
                });

                saveStateDebounced(globalState);
            }

            return true;
        }

        if (key === " ") {
            const speed = ctrlPressed ? 0.5 : 1;
            if (shiftPressed) {
                playAll(ctx.globalState, speed);
            } else {
                playCurrentInterval(ctx.globalState, speed);
            }
            return true;
        }

        return false;
    }

    document.addEventListener("keydown", (e) => {
        const s = getState(rg);

        if (handleKeyDown(s, e.key, e.ctrlKey || e.metaKey, e.shiftKey, e.repeat)) {
            e.preventDefault();
            s.render();
        }
    })

    function handleKeyUp(
        ctx: RenderContext,
        key: string,
        ctrlPressed: boolean,
        shiftPressed: boolean,
    ): boolean {
        if (key === "Shift") {
            return true;
        }

        const instrumentKey = ctx.globalState.flatKeys.find(k => k.keyboardKey === key.toLowerCase());
        if (instrumentKey) {
            releaseKey(instrumentKey);
            return true;
        }

        return false;
    }

    document.addEventListener("keyup", (e) => {
        const s = getState(rg);
        if (handleKeyUp(s, e.key, e.ctrlKey || e.metaKey, e.shiftKey)) {
            e.preventDefault();
            s.render();
        }
    });

    document.addEventListener("blur", () => {
        const s = getState(rg);
        releaseAllKeys(s.globalState.flatKeys);
        s.render();
    })

    document.addEventListener("mousemove", () => {
        const s = getState(rg);
        if (s.globalState.sequencer.currentHoveredTimelineItemIdx !== -1) {
            s.globalState.sequencer.currentHoveredTimelineItemIdx = -1;
            s.render();
        }
    });

    window.addEventListener("resize", () => {
        const s = getState(rg);
        s.render();
    });


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

