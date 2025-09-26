import { imTextInputOneLine } from "src/app-components/text-input-one-line";
import { BLOCK, COL, imAlign, imFg, imFlex, imLayout, imLayoutEnd, imSize, INLINE, NA, PERCENT, ROW, STRETCH } from "src/components/core/layout";
import { pressKey } from "src/dsp/dsp-loop-interface";
import { deleteChart, } from "src/state/chart-repository";
import { getKeyForKeyboardKey } from "src/state/keyboard-state";
import {
    playFromCursor,
    playFromLastMeasure,
    stopPlaying
} from "src/state/playing-pausing";
import {
    CHART_STATUS_READONLY,
    FRACTIONAL_UNITS_PER_BEAT,
    getBpm,
    getBpmChangeItemBeforeBeats,
    getChartDurationInBeats,
    getLastMeasureBeats,
    getNextMeasureBeats,
    getPlaybackDuration,
    newChart,
    newTimelineItemBpmChange,
    newTimelineItemMeasure,
    newTimelineItemNote,
    sequencerChartInsertItems,
    sequencerChartRemoveItems,
    timelineMeasureAtBeatsIdx
} from "src/state/sequencer-chart";
import {
    clearRangeSelection,
    deleteRange,
    getCurrentPlayingTime,
    getSelectionStartEndIndexes,
    handleMovement,
    handleMovementAbsolute,
    hasRangeSelection,
    recomputeState,
    setCursorSnap,
    setTimelineNoteAtPosition,
    shiftItemsAfterCursor,
    shiftSelectedItems,
    transposeSelectedItems
} from "src/state/sequencer-state";
import { APP_VIEW_PLAY_CHART, EditViewState, NAME_OPERATION_COPY, NAME_OPERATION_CREATE, NAME_OPERATION_RENAME } from "src/state/ui-state";
import {
    getDeltaTimeSeconds,
    ImCache,
    imElse,
    imEndFor,
    imEndIf,
    imFor,
    imIf,
    imIfElse,
    imIfEnd,
    imMemo
} from "src/utils/im-core";
import {
    elSetStyle,
    imStr
} from "src/utils/im-dom";
import { imSequencer } from "src/views/edit-view-sequencer";
import {
    copyNotesToTempStore,
    getChartIndexForId,
    GlobalContext,
    openChartUpdateModal,
    pasteNotesFromTempStore,
    redoSequencerEdit,
    setCurrentChartIdx,
    setLoadSaveModalOpen,
    setViewChartSelect,
    undoSequencerEdit
} from "./app";
import { runSaveCurrentChartTask } from "./background-tasks";
import { cssVarsApp } from "./styling";

const OVERPLAY_MS = 1000;

function handleEditChartKeyDown(ctx: GlobalContext, editView: EditViewState): boolean {
    if (!ctx.keyPressState) return false;

    const {
        key, keyUpper, isRepeat,
        ctrlPressed, shiftPressed, altPressed,
        vAxis, hAxis,
        isPlayPausePressed,
        isLoadSavePressed,
    } = ctx.keyPressState;

    const { ui, sequencer, keyboard } = ctx;
    const chart = sequencer._currentChart;

    const loadSaveModal = ui.loadSave.modal;

    if (isLoadSavePressed && !loadSaveModal._open) {
        setLoadSaveModalOpen(ctx, chart, true);
        return true;
    } 

    let hasShiftLeft = key === "<" || key === ",";
    let hasShiftRight = key === ">" || key === ".";
    if (shiftPressed && (hasShiftLeft || hasShiftRight)) {
        const amount = hasShiftRight ? sequencer.cursorSnap : -sequencer.cursorSnap;

        if (hasRangeSelection(sequencer)) {
            shiftSelectedItems(sequencer, amount)
        } else {
            shiftItemsAfterCursor(sequencer, amount);
        }

        return true;
    }

    if (ctrlPressed && (vAxis !== 0)) {
        const amount = vAxis > 0 ? 1 : -1;
        if (hasRangeSelection(sequencer)) {
            transposeSelectedItems(sequencer, amount)
        } 

        return true;
    }


    if (keyUpper === "Z" && ctrlPressed) {
        if (shiftPressed) {
            redoSequencerEdit(ctx);
        } else {
            undoSequencerEdit(ctx);
        } 
        return true;
    }

    if (keyUpper === "Y" && ctrlPressed) {
        redoSequencerEdit(ctx);
        return true;
    }


    if (key === "Tab") {
        const amnt = shiftPressed ? -sequencer.cursorSnap : sequencer.cursorSnap;
        handleMovement(sequencer, amnt, false, false);

        // Add the previewed notes to the sequencer, push forwards
        for (const note of sequencer.notesToPreview) {
            setTimelineNoteAtPosition(
                chart,
                sequencer.notesFilter,
                note.start,
                sequencer.cursorSnap,
                note.noteId,
                true,
            );
            note.start += amnt;
        }

        return true;
    }

    if (key === "Delete" || key === "`" || key === "~") {
        if (hasRangeSelection(sequencer)) {
            const [start, end] = getSelectionStartEndIndexes(sequencer);
            if (start !== -1 && end !== -1) {
                deleteRange(chart, sequencer.notesFilter, start, end);
                clearRangeSelection(sequencer, false);
                return true;
            }
        }

        // Remove the previewed notes to the sequencer, push forwards.
        // Technically, the preview is the exact opposite feedback we are supposed to give the user here.
        // But this method of deleting notes seems good enough to offset that fact for now
        if (sequencer.notesToPreview.length > 0) {
            const amnt = shiftPressed ? -sequencer.cursorSnap : sequencer.cursorSnap;
            handleMovement(sequencer, amnt, false, false);

            for (const note of sequencer.notesToPreview) {
                setTimelineNoteAtPosition(
                    chart,
                    sequencer.notesFilter,
                    note.start,
                    sequencer.cursorSnap,
                    note.noteId,
                    false,
                );
                note.start += amnt;
            }
        }
    }

    const instrumentKey = getKeyForKeyboardKey(keyboard, key);
    if (instrumentKey && !shiftPressed && !altPressed && !ctrlPressed) {
        // need to handle '/' even though it wasn't actually pressed.
        // hence not early returning on repeats

        // play the instrument
        {
            pressKey(instrumentKey.index, instrumentKey.noteId, isRepeat);
        }

        // insert notes into the sequencer
        if (!isRepeat) {
            const pos = sequencer.cursor;

            if (!isRepeat) {
                sequencer.notesToPreview.push(newTimelineItemNote(
                    instrumentKey.noteId, 
                    pos,
                    sequencer.cursorSnap
                ));
                sequencer.notesToPreviewVersion++;
            }
        }

        return true;
    }

    // need to move by the current beat snap.
    if (hAxis) {
        handleMovement(
            sequencer,
            hAxis * sequencer.cursorSnap,
            ctrlPressed,
            shiftPressed
        );

        return true;
    }

    // move back and forth between measures
    if (vAxis) {
        const cursorBeats = sequencer.cursor;

        let newPos;
        if (vAxis > 0) {
            newPos = getNextMeasureBeats(sequencer._currentChart, cursorBeats);
        } else {
            newPos = getLastMeasureBeats(sequencer._currentChart, cursorBeats);
        }

        handleMovementAbsolute(sequencer, newPos, ctrlPressed, shiftPressed);

        return true;
    }

    if (isRepeat) {
        return false;
    }

    if (isPlayPausePressed) {
        if (sequencer.isPlaying) {
            // pause at the cursor
            stopPlaying(ctx, true);
            return true;
        }

        const speed = ctrlPressed ? 0.5 : 1;
        const isUserDriven = ui.currentView === APP_VIEW_PLAY_CHART;
        if (shiftPressed) {
            playFromLastMeasure(ctx, { speed, isUserDriven });
        } else {
            playFromCursor(ctx, { speed, isUserDriven });
        }

        return true;
    }

    if (shiftPressed && (
        key === "!" || key === "1"
        || key === "@" || key === "2"
        || key === "#" || key === "3"
        // Nah if you want the weird divisors you'l have to set them manually with mouse clicks
        // || key === "$" || key === "4"
    )) {

        const cycleThroughCursorSnaps = (snaps: number[]) => {
            for (let i = 0; i < snaps.length; i++) {
                const curr = snaps[i];
                const nextSnap = snaps[(i + 1) % snaps.length];
                if (curr === sequencer.cursorSnap) {
                    setCursorSnap(sequencer, nextSnap);
                    return;
                }
            }

            setCursorSnap(sequencer, snaps[0]);
        }

        if (key === "!" || key === "1") {
            setCursorSnap(sequencer, FRACTIONAL_UNITS_PER_BEAT);
        } else if (key === "@" || key === "2") {
            cycleThroughCursorSnaps([
                FRACTIONAL_UNITS_PER_BEAT / 2,
                FRACTIONAL_UNITS_PER_BEAT / 4,
                FRACTIONAL_UNITS_PER_BEAT / 8,
                FRACTIONAL_UNITS_PER_BEAT / 16
            ]);
        } else if (key === "#" || key === "3") {
            cycleThroughCursorSnaps([
                FRACTIONAL_UNITS_PER_BEAT / 3,
                FRACTIONAL_UNITS_PER_BEAT / 6,
                FRACTIONAL_UNITS_PER_BEAT / 12,
            ]);
        } else if (key === "$" || key === "4") {
            cycleThroughCursorSnaps([
                Math.floor(FRACTIONAL_UNITS_PER_BEAT / 7),
                FRACTIONAL_UNITS_PER_BEAT / 9,
                Math.floor(FRACTIONAL_UNITS_PER_BEAT / 11),
                Math.floor(FRACTIONAL_UNITS_PER_BEAT / 13),
                Math.floor(FRACTIONAL_UNITS_PER_BEAT / 14),
                FRACTIONAL_UNITS_PER_BEAT / 15,
            ]);
        }

        return true;
    }

    if ((keyUpper === "C") && ctrlPressed) {
        const [startIdx, endIdx] = getSelectionStartEndIndexes(sequencer);
        return copyNotesToTempStore(ctx, startIdx, endIdx);
    }

    if ((keyUpper === "X") && ctrlPressed) {
        const [startIdx, endIdx] = getSelectionStartEndIndexes(sequencer);
        if (copyNotesToTempStore(ctx, startIdx, endIdx)) {
            deleteRange(chart, sequencer.notesFilter, startIdx, endIdx);

            return true;
        }
        return false;
    }

    if ((keyUpper === "V") && ctrlPressed) {
        pasteNotesFromTempStore(ctx);
        return false;
    }

    if (key === "Escape") {
        if (sequencer.isPlaying) {
            stopPlaying(ctx);
            return true;
        }

        if (hasRangeSelection(sequencer)) {
            clearRangeSelection(sequencer, false);
            return true;
        }

        setViewChartSelect(ctx);
        return true;
    }

    if (key === "Home") {
        handleMovementAbsolute(sequencer, 0, ctrlPressed, shiftPressed);
        return true;
    }

    if (key === "End") {
        const end = getChartDurationInBeats(chart);
        handleMovementAbsolute(sequencer, end, ctrlPressed, shiftPressed);
        return true;
    }

    if (shiftPressed && (keyUpper === "M")) {
        const cursorStartBeats = sequencer.cursor;
        const idx = timelineMeasureAtBeatsIdx(chart, cursorStartBeats);
        if (idx === -1) {
            const start = sequencer.cursor;
            sequencerChartInsertItems(chart, [newTimelineItemMeasure(start)], sequencer.notesFilter);
        } else {
            const measure = chart.timeline[idx];
            sequencerChartRemoveItems(chart, [measure], sequencer.notesFilter);
        }
        return true;
    }

    if (shiftPressed && (keyUpper === "B")) {
        const start = sequencer.cursor;
        const bpmChange = getBpmChangeItemBeforeBeats(chart, start);
        if (bpmChange && start ===  bpmChange.start) {
            sequencerChartRemoveItems(chart, [bpmChange], sequencer.notesFilter);
        } else {
            const start = sequencer.cursor;
            const bpm = getBpm(bpmChange);
            const newBpmChange = newTimelineItemBpmChange(start, bpm);
            sequencerChartInsertItems(chart, [newBpmChange], sequencer.notesFilter);
        }
        return true;
    }

    return false;
}


export const CHART_SAVE_DEBOUNCE_SECONDS = 0.5;

export function imEditView(c: ImCache, ctx: GlobalContext) {
    const { sequencer, ui } = ctx;

    const loadSaveModal = ui.loadSave.modal;
    const s = ui.editView;

    recomputeState(sequencer);

    if (imMemo(c, sequencer._currentChart._lastUpdated)) {
        s.chartSaveTimerSeconds = CHART_SAVE_DEBOUNCE_SECONDS;
    }

    if (s.chartSaveTimerSeconds >= 0) {
        s.chartSaveTimerSeconds -= getDeltaTimeSeconds(c);
        if (s.chartSaveTimerSeconds < 0) {
            runSaveCurrentChartTask(ctx);
            s.chartSaveTimerSeconds = -1;
        }
    }

    const currentTime = getCurrentPlayingTime(sequencer);
    const duration = getPlaybackDuration(sequencer._currentChart);
    if (currentTime > duration + OVERPLAY_MS) {
        stopPlaying(ctx);
    }

    imLayout(c, ROW); imFlex(c); {
        imSequencer(c, ctx);

        if (imIf(c) && loadSaveModal._open) {
            imLoadSaveModal(c, ctx);
        } imEndIf(c);
    } imLayoutEnd(c);

    // NOTE: we should actually handle keyboard input at the _end_, so that deeper components
    // can decide to handle inputs for themselves if they want. 
    // Not doing this in the other views yet, but that should change.
    if (!ctx.handled) {
        ctx.handled = handleEditChartKeyDown(ctx, s);
    }
}

// It's actually more of a sidebar popout thing
function imLoadSaveModal(c: ImCache, ctx: GlobalContext) {
    const { ui } = ctx;

    const s = ui.loadSave.modal;
    const chartSelect = ui.chartSelect;
    const currentChart = chartSelect.currentChart.data;

    imLayout(c, COL); imSize(c, 33, PERCENT, 0, NA); imAlign(c, STRETCH); {
        imFor(c); for (let i = 0; i < chartSelect.availableCharts.length; i++) {
            imLayout(c, ROW); {
                const chart = chartSelect.availableCharts[i];
                const isFocused = i === chartSelect.idx;

                const shouldRename = isFocused && s.isRenaming && chart;

                if (imMemo(c, isFocused)) {
                    elSetStyle(c, "backgroundColor", isFocused ? cssVarsApp.bg2 : "");
                }

                if (imIf(c) && shouldRename) {
                    const ev = imTextInputOneLine(c, chart.name);
                    if (ev) {
                        if (ev.newName !== undefined) {
                            chart.name = ev.newName;
                        } else if (ev.submit || ev.cancel) {
                            s.isRenaming = false;
                        }
                    }
                } else {
                    imElse(c);

                    imLayout(c, BLOCK); {
                        let name = chart.name || "untitled"
                        imStr(c, name);
                        if (imIf(c) && chart?.bundled) {
                            imLayout(c, INLINE); imFg(c, cssVarsApp.error); {
                                imStr(c, " (readonly)");
                            } imLayoutEnd(c);
                        } imIfEnd(c);
                    } imLayoutEnd(c);
                } imEndIf(c);
            } imLayoutEnd(c);
        } imEndFor(c);

        imLayout(c, BLOCK); imFlex(c); imLayoutEnd(c);

        imLayout(c, BLOCK); {
            if (!ctx.handled && ctx.keyPressState?.keyUpper === "H") {
                s.helpEnabled = !s.helpEnabled;
                ctx.handled = true;
            }

            if (imIf(c) && s.helpEnabled) {
                imLayout(c, BLOCK); imStr(c, "[Up/Down] -> move, preview"); imLayoutEnd(c);
                imLayout(c, BLOCK); imStr(c, "[Enter] -> start editing"); imLayoutEnd(c);
                imLayout(c, BLOCK); imStr(c, "[R] -> rename"); imLayoutEnd(c);
                imLayout(c, BLOCK); imStr(c, "[N] -> new"); imLayoutEnd(c);
                if (imIf(c) && currentChart) {
                    imLayout(c, BLOCK); imStr(c, "[C] -> copy"); imLayoutEnd(c);
                } imIfEnd(c);
                imLayout(c, BLOCK); imStr(c, "[X] -> delete"); imLayoutEnd(c);
            } else {
                imIfElse(c);

                imStr(c, "[H] to toggle help");
            } imIfEnd(c);


        } imLayoutEnd(c);
    } imLayoutEnd(c);

    // handle keys
    if (!ctx.handled && ctx.keyPressState && currentChart) {
        let handled = false;

        const { key, keyUpper, listNavAxis, isLoadSavePressed, shiftPressed } = ctx.keyPressState;

        if (s.isRenaming) {
            // the input component over there will handle these.
        } else {
            if (listNavAxis !== 0) {
                stopPlaying(ctx);
                setCurrentChartIdx(ctx, ui.chartSelect.idx + listNavAxis)
                handled = true;
            } else if (key === "Enter") {
                if (shiftPressed) {
                    // TODO: create new chart here
                    // const chart = addNewUserChart(ctx);
                } else {
                    // The current chart has already been selected. We just need to close this modal
                    setLoadSaveModalOpen(ctx, currentChart, false);
                }

                handled = true;
            } else if (key === "Escape" || isLoadSavePressed) {
                if (ctx.sequencer.isPlaying) {
                    stopPlaying(ctx, true);
                } else if (
                    s.chartBeforeOpen && 
                    currentChart.id !== s.chartBeforeOpen.id
                ) {
                    // TODO: consider - Is the tail wagging the dog here?
                    const idx = getChartIndexForId(ctx, s.chartBeforeOpen.id);
                    setCurrentChartIdx(ctx, idx);
                } else {
                    setLoadSaveModalOpen(ctx, currentChart, false);
                }

                handled = true;
            } else if (
                currentChart && 
                currentChart._savedStatus !== CHART_STATUS_READONLY &&
                (key === "Delete" || keyUpper === "X")
            ) {
                deleteChart(ctx.repo, currentChart);
                handled = true;
            } else if (currentChart && keyUpper === "R") {
                openChartUpdateModal(ctx, currentChart, NAME_OPERATION_RENAME, "Rename chart");
                handled = true;
            } else if (keyUpper === "N") {
                openChartUpdateModal(ctx, newChart(""), NAME_OPERATION_CREATE, "Create new chart");
                handled = true;
            } else if (currentChart && keyUpper === "C") {
                openChartUpdateModal(ctx, currentChart, NAME_OPERATION_COPY , "Copy this chart");
                handled = true;
            }
        }

        ctx.handled = handled;
    }
}


