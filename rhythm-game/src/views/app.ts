import { pressKey, releaseKey } from "src/dsp/dsp-loop-interface";
import {
    copyNotesToTempStore,
    GlobalContext,
    pasteNotesFromTempStore,
    setViewChartSelect,
    setViewEditChart,
    setViewPlayCurrentChart,
    setViewStartScreen,
    setViewTestCurrentChart,
} from "src/state/global-context";
import { getKeyForKeyboardKey } from "src/state/keyboard-state";
import {
    getCurrentSelectedChartName,
    loadChart,
    moveLoadSaveSelection,
    saveStateDebounced,
} from "src/state/loading-saving-charts";
import {
    playAll,
    playFromCursor,
    playFromLastMeasure,
    stopPlaying
} from "src/state/playing-pausing";
import {
    clearRangeSelection,
    deleteRange,
    equalBeats,
    getBpm,
    getBpmChangeItemBeforeBeats,
    getCursorStartBeats,
    getItemIdxAtBeat,
    getItemStartBeats,
    getSelectionStartEndIndexes,
    handleMovement,
    hasRangeSelection,
    mutateSequencerTimeline,
    newTimelineItemBpmChange,
    newTimelineItemMeasure,
    setCursorDivisor,
    setTimelineNoteAtPosition,
    shiftItemsAfterCursor,
    shiftSelectedItems,
    timelineHasNoteAtPosition,
    timelineMeasureAtBeatsIdx
} from "src/state/sequencer-state";
import { div, isEditingTextSomewhereInDocument, RenderGroup } from "src/utils/dom-utils";
import { ChartSelect } from "src/views/chart-select";
import { EditView } from "src/views/edit-view";
import { PlayView } from "src/views/play-view";
import { StartupView } from "src/views/startup-view";

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

    const startTestingPressed =  ctrlPressed && shiftPressed && key === "T";

    if (ui.currentView === "chart-select") {
        if (key === "E" || key === "e") {
            setViewEditChart(ctx, ui.loadSave.selectedChartName);
            return true;
        }

        if (key === "Enter") {
            setViewPlayCurrentChart(ctx);
            return true;
        }

        if (key === "Escape") {
            setViewStartScreen(ctx);
            return true;
        }
    }
    
    if (ui.currentView === "play-chart") {
        // TODO: keyboard input


        if (key === "Escape" || startTestingPressed) {
            if (ui.playView.isTesting) {
                setViewEditChart(ctx, ui.loadSave.loadedChartName);
            } else {
                setViewChartSelect(ctx);
            }
            return true;
        }
    }

    if (ui.currentView === "startup") {
        if (key === "Enter") {
            // NOTE: will need to change when we add more screens we can go to from here
            setViewChartSelect(ctx);
            return true;
        }
    }


    if (
        (ui.currentView === "edit-chart") ||
        (ui.currentView === "play-chart" && ui.playView.isTesting)
    ) {

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
            if (key === " ") {
                if (sequencer.isPlaying) {
                    // pause at the cursor
                    stopPlaying(ctx, true);
                    return true;
                }

                const speed = ctrlPressed ? 0.5 : 1;
                if (shiftPressed) {
                    playFromLastMeasure(ctx, speed);
                } else {
                    playFromCursor(ctx, speed);
                }

                return true;
            }
        }
    }


    if (ui.currentView === "edit-chart") {
        if (key === "S" && ctrlPressed && shiftPressed) {
            ui.editView.sidebarOpen = !ui.editView.sidebarOpen;
            return true;
        }

        if (ui.editView.sidebarOpen) {
            if (vAxis !== 0) {
                moveLoadSaveSelection(ctx, vAxis);
                return true;
            }

            if (key === "Enter") {
                loadChart(ctx, ui.loadSave.selectedChartName);
                playAll(ctx, 1);
                return true;
            }

            if (key === "Escape") {
                ctx.ui.editView.sidebarOpen = false;
                stopPlaying(ctx);
                return true;
            }

            if (key === "Delete") {
                const name = getCurrentSelectedChartName(ctx);
                if (name in ctx.savedState.allSavedSongs) {
                    // TODO: real UI instead of confirm
                    if (confirm("You sure you want to delete " + name)) {
                        delete ctx.savedState.allSavedSongs[name];

                        // NOTE: this only deletes the save file, but not the currently loaded chart's name

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

        let hasShiftLeft = key === "<" || key === ",";
        let hasShiftRight = key === ">" || key === ".";
        if (shiftPressed && (hasShiftLeft || hasShiftRight)) {
            const amount = hasShiftRight ? 1 : -1;

            mutateSequencerTimeline(sequencer, () => {
                if (sequencer.isRangeSelecting) {
                    shiftSelectedItems(sequencer, amount)
                } else {
                    shiftItemsAfterCursor(sequencer, amount);
                }
            });

            return true;
        }

        if (!repeat) {
            if (startTestingPressed) {
                setViewTestCurrentChart(ctx);
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

                return true;
            }

            if (key === "Delete") {
                const [start, end] = getSelectionStartEndIndexes(sequencer);
                if (start !== -1 && end !== -1) {
                    mutateSequencerTimeline(sequencer, () => {
                        deleteRange(sequencer.timeline, start, end);
                    });
                    return true;
                }

                const idx = getItemIdxAtBeat(sequencer, getCursorStartBeats(sequencer));
                if (idx !== -1) {
                    mutateSequencerTimeline(sequencer, () => {
                        deleteRange(sequencer.timeline, idx, idx);
                    });
                    return true;
                }
            }

            if ((key === "C" || key === "c") && ctrlPressed) {
                const [startIdx, endIdx] = getSelectionStartEndIndexes(sequencer);
                return copyNotesToTempStore(ctx, startIdx, endIdx);
            }

            if ((key === "X" || key === "x") && ctrlPressed) {
                const [startIdx, endIdx] = getSelectionStartEndIndexes(sequencer);
                if (copyNotesToTempStore(ctx, startIdx, endIdx)) {
                    mutateSequencerTimeline(sequencer, () => {
                        deleteRange(sequencer.timeline, startIdx, endIdx);
                    })

                    return true;
                }
                return false;
            }

            if ((key === "V" || key === 'v') && ctrlPressed) {
                pasteNotesFromTempStore(ctx);
                return false;
            }

            if (key === "Escape") {
                if (sequencer.isPlaying) {
                    stopPlaying(ctx);
                    return true;
                }

                if (hasRangeSelection(sequencer)) {
                    clearRangeSelection(sequencer, true);
                    return true;
                }

                setViewChartSelect(ctx);
                return true;
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

            if (shiftPressed && (key === "M" || key === "m")) {
                const cursorStartBeats = getCursorStartBeats(sequencer);
                const idx = timelineMeasureAtBeatsIdx(sequencer, cursorStartBeats);
                if (idx === -1) {
                    const start = sequencer.cursorStart;
                    const divisor = sequencer.cursorDivisor;
                    mutateSequencerTimeline(sequencer, () => {
                        sequencer.timeline.push(newTimelineItemMeasure(start, divisor));
                    });
                } else {
                    mutateSequencerTimeline(sequencer, () => {
                        deleteRange(sequencer.timeline, idx, idx);
                    });
                }
                return true;
            }

            if (shiftPressed && (key === "b" || key === "B")) {
                const start = getCursorStartBeats(sequencer);
                const bpmChange = getBpmChangeItemBeforeBeats(sequencer, start);
                if (bpmChange && equalBeats(start, getItemStartBeats(bpmChange))) {
                    mutateSequencerTimeline(sequencer, () => {
                        deleteRange(sequencer.timeline, bpmChange._index, bpmChange._index);
                    });
                } else {
                    mutateSequencerTimeline(sequencer, () => {
                        const start = sequencer.cursorStart;
                        const divisor = sequencer.cursorDivisor;
                        const bpm = getBpm(bpmChange);
                        const newBpmChange = newTimelineItemBpmChange(start, divisor, bpm);
                        sequencer.timeline.push(newBpmChange);
                    });
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
                    mutateSequencerTimeline(sequencer, () => {
                        const tl = sequencer.timeline;
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
