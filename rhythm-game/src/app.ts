import { pressKey, releaseAllKeys, releaseKey } from "./dsp-loop-interface";
import { EditView } from "./views/edit-view";
import { PlayView } from "./views/play-view";
import {
    GlobalContext,
    playAll,
    playCurrentInterval,
    stopPlaying,
    getCurrentSelectedSequenceName,
    loadCurrentSelectedSequence,
    moveLoadSaveSelection,
    saveStateDebounced
} from "./global-context";
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
} from "./state/sequencer-state";
import { deepCopyJSONSerializable } from "src/utils/deep-copy-json";
import { div, isEditingTextSomewhereInDocument, RenderGroup } from "./utils/dom-utils";
import { ChartSelect } from "./views/chart-select";
import { StartupView } from "./views/startup-view";
import { getKeyForKeyboardKey } from "./state/keyboard-state";

let instantiated = false;

// Contains ALL logic

export function App(rg: RenderGroup<GlobalContext>) {
    let ctx: GlobalContext;

    rg.preRenderFn(s => ctx = s);

    if (!instantiated) {
        instantiated = true;
    } else {
        throw new Error("Can't instantiate the app twice!");
    }

    // Add global event handlers.
    document.addEventListener("keydown", (e) => {
        if (handleKeyDown(ctx, e.key, e.ctrlKey || e.metaKey, e.shiftKey, e.repeat)) {
            e.preventDefault();
            ctx.render();
        }
    })


    document.addEventListener("keyup", (e) => {
        if (handleKeyUp(ctx, e.key, e.ctrlKey || e.metaKey, e.shiftKey)) {
            e.preventDefault();
            ctx.render();
        }
    });

    document.addEventListener("blur", () => {
        releaseAllKeys();
        ctx.render();
    })

    document.addEventListener("mousemove", () => {
        if (ctx.sequencer.currentHoveredTimelineItemIdx !== -1) {
            ctx.sequencer.currentHoveredTimelineItemIdx = -1;
            ctx.render();
        }
    });

    window.addEventListener("resize", () => {
        ctx.render();
    });

    return div({
        class: "absolute-fill row",
        style: "position: fixed",
    }, [
        rg.if(() => ctx.ui.currentView === "startup", StartupView),
        rg.else_if(() => ctx.ui.currentView === "chart-select", ChartSelect),
        rg.else_if(() => ctx.ui.currentView === "play-chart", PlayView),
        rg.else_if(() => ctx.ui.currentView === "edit-chart", EditView),
        rg.else(rg => div({}, [
            rg.text(() => "404 - view not found!!! (" + ctx.ui.currentView + ")")
        ])),
    ])
}


function handleKeyDown(
    ctx: GlobalContext,
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

    const { sequencer, ui, keyboard } = ctx;

    let vAxis = 0;
    if (key === "ArrowUp") {
        vAxis = -1;
    } else if (key === "ArrowDown") {
        vAxis = 1;
    }

    if (ui.currentView === "edit-chart") {
        if (key === "S" && ctrlPressed && shiftPressed) {
            ui.loadSaveSidebarOpen = !ui.loadSaveSidebarOpen;
            return true;
        }

        if (key === "K" && ctrlPressed && shiftPressed) {
            ui.isKeyboard = !ui.isKeyboard;
            return true;
        }

        if (ui.loadSaveSidebarOpen) {
            if (vAxis !== 0) {
                moveLoadSaveSelection(ctx, vAxis);
                return true;
            }

            if (key === "Enter") {
                loadCurrentSelectedSequence(ctx);
                playAll(ctx, 1);
                return true;
            }

            if (key === "Escape") {
                ui.loadSaveSidebarOpen = false;
                stopPlaying(ctx);
                return true;
            }

            if (key === "Delete") {
                const name = getCurrentSelectedSequenceName(ctx);
                if (name in ctx.savedState.allSavedSongs) {
                    // TODO: real UI
                    if (confirm("You sure you want to delete " + name)) {
                        delete ctx.savedState.allSavedSongs[name];
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
                    ui.copiedItems = sequencer.timeline.slice(startIdx, endIdx + 1)
                        .map(deepCopyJSONSerializable);

                    ui.copiedPositionStart = Math.min(
                        getCursorStartBeats(sequencer),
                        getItemStartBeats(sequencer.timeline[startIdx])
                    );

                    return true;
                }

                return false;
            }

            if ((key === "V" || key === 'v') && ctrlPressed) {
                if (ui.copiedItems.length > 0) {
                    mutateSequencerTimeline(sequencer, tl => {
                        const delta = getCursorStartBeats(sequencer) - ui.copiedPositionStart;
                        for (const item of ui.copiedItems) {
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
                    stopPlaying(ctx);
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
                    playAll(ctx, speed);
                } else {
                    playCurrentInterval(ctx, speed);
                }
                return true;
            }

            const instrumentKey = getKeyForKeyboardKey(keyboard, key);
            if (instrumentKey) {
                // TODO: Just do one or the other based on if we're in 'edit' mode or play mode ?

                // play the instrument
                {
                    pressKey(instrumentKey.index, instrumentKey.musicNote);
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

                    saveStateDebounced(ctx);
                }

                return true;
            }
        }
    }

    return false;
}


function handleKeyUp(
    ctx: GlobalContext,
    key: string,
    ctrlPressed: boolean,
    shiftPressed: boolean,
): boolean {
    if (key === "Shift") {
        return true;
    }

    const instrumentKey = getKeyForKeyboardKey(ctx.keyboard, key);
    if (instrumentKey) {
        releaseKey(instrumentKey.index, instrumentKey.musicNote);
        return true;
    }

    return false;
}
