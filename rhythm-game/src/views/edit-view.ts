import { imFlex, imLayoutBegin, imLayoutEnd, ROW } from "src/components/core/layout";
import { pressKey, setPlaybackSpeed } from "src/dsp/dsp-loop-interface";
import { getKeyForKeyboardKey } from "src/state/keyboard-state";
import {
    playFromCursor,
    playFromLastMeasure,
    stopPlayback
} from "src/state/playing-pausing";
import {
    FRACTIONAL_UNITS_PER_BEAT,
    getBpm,
    getBpmChangeItemBeforeBeats,
    getChartDurationInBeats,
    getLastMeasureBeats,
    getNextMeasureBeats,
    getPlaybackDuration,
    isReadonlyChart,
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
    getCurrentPlayingTimeIntoChart,
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
import { APP_VIEW_PLAY_CHART, EditViewState } from "src/state/ui-state";
import {
    getDeltaTimeSeconds,
    ImCache,
    imEndIf,
    imIf,
    imMemo
} from "src/utils/im-core";
import { imSequencer } from "src/views/edit-view-sequencer";
import {
    copyNotesToTempStore,
    GlobalContext,
    pasteNotesFromTempStore,
    redoSequencerEdit,
    setLoadSaveModalOpen,
    setViewChartSelect,
    undoSequencerEdit
} from "./app";
import { runSaveCurrentChartTask } from "./saving-chart";
import { imLoadSaveSidebar } from "./edit-view-load-save-sidebar";

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
        setLoadSaveModalOpen(ctx);
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

        handleMovementAbsolute(sequencer, newPos, shiftPressed);

        return true;
    }

    if (isRepeat) {
        return false;
    }

    if (isPlayPausePressed) {
        let startedPlaying = false;

        const isUserDriven = ui.currentView === APP_VIEW_PLAY_CHART;
        if (shiftPressed) {
            playFromLastMeasure(ctx, { isUserDriven });
            startedPlaying = true;
        } else {
            if (sequencer.playingId) {
                stopPlayback(ctx, true);
            } else {
                playFromCursor(ctx, { isUserDriven });
                startedPlaying = true;
            }
        }

        if (startedPlaying) {
            setPlaybackSpeed(ctrlPressed ? 0.5 : 1);
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
        if (sequencer.playingId) {
            stopPlayback(ctx);
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
        handleMovementAbsolute(sequencer, 0, shiftPressed);
        return true;
    }

    if (key === "End") {
        const end = getChartDurationInBeats(chart);
        handleMovementAbsolute(sequencer, end, shiftPressed);
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

    if (
        sequencer._currentChart._lastUpdated !== sequencer._currentChart._lastUpdatedWithSave && 
        !isReadonlyChart(sequencer._currentChart)
    ) {
        sequencer._currentChart._lastUpdatedWithSave = sequencer._currentChart._lastUpdated;
        s.chartSaveTimerSeconds = CHART_SAVE_DEBOUNCE_SECONDS;
    }

    if (s.chartSaveTimerSeconds >= 0) {
        s.chartSaveTimerSeconds -= getDeltaTimeSeconds(c);
        if (s.chartSaveTimerSeconds < 0) {
            runSaveCurrentChartTask(ctx);
            s.chartSaveTimerSeconds = -1;
        }
    }

    const currentTime = getCurrentPlayingTimeIntoChart(sequencer);
    const duration = getPlaybackDuration(sequencer._currentChart);
    if (currentTime > duration + OVERPLAY_MS) {
        stopPlayback(ctx);
    }

    imLayoutBegin(c, ROW); imFlex(c); {
        imSequencer(c, ctx);

        if (imIf(c) && loadSaveModal._open) {
            imLoadSaveSidebar(c, ctx);
        } imEndIf(c);
    } imLayoutEnd(c);

    // NOTE: we should actually handle keyboard input at the _end_, so that deeper components
    // can decide to handle inputs for themselves if they want. 
    // Not doing this in the other views yet, but that should change.
    if (!ctx.handled) {
        ctx.handled = handleEditChartKeyDown(ctx, s);
    }
}



