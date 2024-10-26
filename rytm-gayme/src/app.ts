import { pressKey, releaseAllKeys, releaseKey } from "./dsp-loop-interface";
import { EditView } from "./edit-view";
import { PlayView } from "./play-view";
import { RenderContext } from "./render-context";
import { SelectView } from "./select-view";
import {
    clearRangeSelection,
    deleteRange,
    getCursorStartBeats,
    getItemIdxAtBeat,
    getItemStartBeats,
    getSelectionRange,
    handleMovement,
    hasRangeSelection,
    mutateSequencerTimeline,
    setCursorDivisor,
    setTimelineNoteAtPosition, timelineHasNoteAtPosition
} from "./sequencer-state";
import { StartupView } from "./startup-view";
import {
    deepCopyJSONSerializable,
    getCurrentSelectedSequenceName,
    loadCurrentSelectedSequence,
    moveLoadSaveSelection,
    playAll,
    playCurrentInterval,
    saveStateDebounced,
    stopPlaying,
    UIState
} from "./state";
import { div, isEditingTextSomewhereInDocument, RenderGroup } from "./utils/dom-utils";

let instantiated = false;

// Contains ALL logic

export function App(rg: RenderGroup<RenderContext>) {
    let uiState: UIState;
    let renderContext: RenderContext;

    if (!instantiated) {
        instantiated = true;
    } else {
        throw new Error("Can't instantiate the app twice!");
    }

    rg.preRenderFn(s => {
        uiState = s.globalState.uiState;
        renderContext = s;
    });

    // Add global event handlers.
    document.addEventListener("keydown", (e) => {
        if (handleKeyDown(renderContext, e.key, e.ctrlKey || e.metaKey, e.shiftKey, e.repeat)) {
            e.preventDefault();
            renderContext.render();
        }
    })


    document.addEventListener("keyup", (e) => {
        if (handleKeyUp(renderContext, e.key, e.ctrlKey || e.metaKey, e.shiftKey)) {
            e.preventDefault();
            renderContext.render();
        }
    });

    document.addEventListener("blur", () => {
        releaseAllKeys(renderContext.globalState.flatKeys);
        renderContext.render();
    })

    document.addEventListener("mousemove", () => {
        if (renderContext.globalState.sequencer.currentHoveredTimelineItemIdx !== -1) {
            renderContext.globalState.sequencer.currentHoveredTimelineItemIdx = -1;
            renderContext.render();
        }
    });

    window.addEventListener("resize", () => {
        renderContext.render();
    });

    return div({
        class: "absolute-fill row",
        style: "position: fixed",
    }, [
        rg.if(() => uiState.currentView === "startup", StartupView),
        rg.else_if(() => uiState.currentView === "chart-select", SelectView),
        rg.else_if(() => uiState.currentView === "play-chart", PlayView),
        rg.else_if(() => uiState.currentView === "edit-chart", EditView),
        rg.else(rg => div({}, [
            rg.text(() => "404 - view not found!!! (" + uiState.currentView + ")")
        ])),
    ])
}


function handleKeyDown(
    ctx: RenderContext,
    key: string,
    ctrlPressed: boolean,
    shiftPressed: boolean,
    repeat: boolean
): boolean {
    if (
        // allow typing into text fields
        isEditingTextSomewhereInDocument() ||
        // allow inspecting the element
        (key === "I" && ctrlPressed && shiftPressed) ||
        // allow refreshing page
        (key === "R" && ctrlPressed)
    ) {
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

    if (uiState.currentView === "edit-chart") {
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

        if (!repeat) {

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

            if (key === " ") {
                const speed = ctrlPressed ? 0.5 : 1;
                if (shiftPressed) {
                    playAll(ctx.globalState, speed);
                } else {
                    playCurrentInterval(ctx.globalState, speed);
                }
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
        }
    }

    return false;
}


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
