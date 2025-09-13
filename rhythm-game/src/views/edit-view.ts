import { BLOCK, COL, imAlign, imFlex, imLayout, imLayoutEnd, imSize, NA, PERCENT, ROW, STRETCH } from "src/components/core/layout";
import { imTextInputBegin, imTextInputEnd } from "src/components/text-input";
import {
    playAll,
    playFromCursor,
    playFromLastMeasure,
    stopPlaying
} from "src/state/playing-pausing";
import {
    FRACTIONAL_UNITS_PER_BEAT,
    getBpm,
    getBpmChangeItemBeforeBeats,
    getChartDurationInBeats,
    getLastMeasureBeats,
    getNextMeasureBeats,
    getPlaybackDuration,
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
import {
    ImCache,
    imElse,
    imEndFor,
    imEndIf,
    imFor,
    imIf,
    imMemo,
    isFirstishRender
} from "src/utils/im-core";
import {
    elHasMousePress,
    elSetStyle,
    EV_INPUT,
    EV_KEYDOWN,
    imOn,
    imStr
} from "src/utils/im-dom";
import { imSequencer } from "src/views/sequencer";
import {
    addNewUserChart,
    copyNotesToTempStore,
    deleteChart,
    GlobalContext,
    pasteNotesFromTempStore,
    redoSequencerEdit,
    setCurrentChart,
    setCurrentChartIdx,
    setViewChartSelect,
    setViewTestCurrentChart,
    undoSequencerEdit
} from "./app";
import { cssVarsApp } from "./styling";
import { assert } from "src/utils/assert";
import { arraySwap } from "src/utils/array-utils";
import { getKeyForKeyboardKey } from "src/state/keyboard-state";
import { pressKey } from "src/dsp/dsp-loop-interface";
import { APP_VIEW_PLAY_CHART } from "src/state/ui-state";

const OVERPLAY_MS = 1000;

function handleEditChartKeyDown(ctx: GlobalContext): boolean {
    if (!ctx.keyPressState) return false;

    const {
        key, keyUpper, ctrlPressed, shiftPressed, altPressed, listNavAxis, vAxis, isRepeat,
        startTestingPressed, isPlayPausePressed
    } = ctx.keyPressState;

    const { ui, sequencer, keyboard, savedState } = ctx;
    const chart = sequencer._currentChart;

    const loadSaveModal = ui.loadSave.modal;

    // I'm already using arrow keys to navigate the editor. may as well allow my left hand to open this on it's own
    let hasOpenSaveChartsSidebar = keyUpper === "S" && ctrlPressed;

    if (hasOpenSaveChartsSidebar && !loadSaveModal.open) {
        loadSaveModal.open = true;
        loadSaveModal.isRenaming = false;
        loadSaveModal.idx = ctx.savedState.userCharts.indexOf(chart);
        return true;
    } 

    if (loadSaveModal.open) {
        let handled = false;
        let closeSaveModal = false;

        const idx = loadSaveModal.idx;
        assert(idx >= 0 && idx <= savedState.userCharts.length);
        const chart = idx < savedState.userCharts.length ? savedState.userCharts[idx] : null;

        if (loadSaveModal.isRenaming) {
            // the input component over there will handle these.
        } else {
            if (listNavAxis !== 0) {
                const prevIdx = loadSaveModal.idx;

                setCurrentChartIdx(ctx, loadSaveModal.idx + listNavAxis);

                if (altPressed) {
                    arraySwap(savedState.userCharts, loadSaveModal.idx, prevIdx);
                }

                handled = true;
            } else if (key === "Enter") {
                if (chart) {
                    setCurrentChart(ctx, chart);
                    playAll(ctx);
                } else {
                    const chart = addNewUserChart(ctx);
                    setCurrentChart(ctx, chart);
                }

                handled = true;
            } else if (key === "Escape" || hasOpenSaveChartsSidebar) {
                closeSaveModal = true;
                handled = true;
            } else if (key === "Delete" && chart) {
                if (savedState.userCharts.length > 1) {
                    if (confirm("You sure you want to delete " + chart.name)) {
                        // NOTE: this only deletes the save file, but not the currently loaded chart's name
                        deleteChart(ctx, chart.name);
                    }
                }

                handled = true;
            } else if (keyUpper === "R" && chart) {
                loadSaveModal.isRenaming = true;
                handled = true;
            }
        }

        if (closeSaveModal) {
            loadSaveModal.open = false;
            stopPlaying(ctx);
        }

        if (handled) {
            return true;
        }
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

    if (shiftPressed && (vAxis !== 0)) {
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
                note.start,
                sequencer.cursorSnap,
                note.note,
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
                deleteRange(chart, start, end);
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
                    note.start,
                    sequencer.cursorSnap,
                    note.note,
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
            pressKey(instrumentKey.index, instrumentKey.musicNote, isRepeat);
        }

        // insert notes into the sequencer
        if (!isRepeat) {
            const pos = sequencer.cursor;

            if (!isRepeat) {
                sequencer.notesToPreview.push(newTimelineItemNote(
                    instrumentKey.musicNote, 
                    pos,
                    sequencer.cursorSnap
                ));
                sequencer.notesToPreviewVersion++;
            }
        }

        return true;
    }

    // need to move by the current beat snap.
        if (key === "ArrowLeft" || key === "ArrowRight") {
            handleMovement(
                sequencer,
                key === "ArrowRight" ? sequencer.cursorSnap : -sequencer.cursorSnap,
                ctrlPressed,
                shiftPressed
            );

            return true;
        }

    // move back and forth between measures
    const downArrow = key === "ArrowDown";
    const upArrow = key === "ArrowUp";
    if (!shiftPressed && (downArrow || upArrow)) {
        const cursorBeats = sequencer.cursor;

        let newPos;
        if (upArrow) {
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

    if (startTestingPressed) {
        setViewTestCurrentChart(ctx);
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
            deleteRange(chart, startIdx, endIdx);

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
            sequencerChartInsertItems(chart, [newTimelineItemMeasure(start)]);
        } else {
            const measure = chart.timeline[idx];
            sequencerChartRemoveItems(chart, [measure]);
        }
        return true;
    }

    if (shiftPressed && (keyUpper === "B")) {
        const start = sequencer.cursor;
        const bpmChange = getBpmChangeItemBeforeBeats(chart, start);
        if (bpmChange && start ===  bpmChange.start) {
            sequencerChartRemoveItems(chart, [bpmChange]);
        } else {
            const start = sequencer.cursor;
            const bpm = getBpm(bpmChange);
            const newBpmChange = newTimelineItemBpmChange(start, bpm);
            sequencerChartInsertItems(chart, [newBpmChange]);
        }
        return true;
    }

    return false;
}


export function imEditView(c: ImCache, ctx: GlobalContext) {
    const { sequencer, ui } = ctx;

    if (!ctx.handled) {
        ctx.handled = handleEditChartKeyDown(ctx);
    }

    const loadSaveModal = ui.loadSave.modal;

    recomputeState(sequencer);

    const currentTime = getCurrentPlayingTime(sequencer);
    const duration = getPlaybackDuration(sequencer._currentChart);
    if (currentTime > duration + OVERPLAY_MS) {
        stopPlaying(ctx);
    }

    imLayout(c, ROW); imFlex(c); {
        imSequencer(c, ctx);

        if (imIf(c) && loadSaveModal.open) {
            // Load save panel

            imLayout(c, COL); imSize(c, 33, PERCENT, 0, NA); imAlign(c, STRETCH); {
                imFor(c); for (let i = 0; i <= ctx.savedState.userCharts.length; i++) {
                    imLayout(c, ROW); {
                        const chart = i < ctx.savedState.userCharts.length ? ctx.savedState.userCharts[i] : null;
                        const isFocused = i === loadSaveModal.idx;

                        const shouldRename = isFocused && loadSaveModal.isRenaming && chart;
                        const shouldRenameChanged = imMemo(c, shouldRename);

                        elSetStyle(c,"backgroundColor", isFocused ? cssVarsApp.bg2 : "");

                        if (imIf(c) && shouldRename) {
                            const input = imTextInputBegin(c, {
                                value: chart.name,
                                placeholder: "enter new name",
                            }); {
                                if (imMemo(c, true)) {
                                    setTimeout(() => {
                                        input.root.focus();
                                        input.root.select();
                                    }, 1);
                                }

                                if (isFirstishRender(c)) {
                                    elSetStyle(c,"width", "100%");
                                }

                                if (shouldRenameChanged) {
                                    input.root.focus();
                                    input.root.selectionStart = 0;
                                    input.root.selectionEnd = chart.name.length;
                                }

                                const inputEvent = imOn(c, EV_INPUT);
                                if (inputEvent) {
                                    chart.name = input.root.value;
                                }

                                const keyDown = imOn(c, EV_KEYDOWN);
                                if (keyDown) {
                                    if (keyDown.key === "Enter" || keyDown.key === "Escape") {
                                        loadSaveModal.isRenaming = false;
                                    }
                                }
                            } imTextInputEnd(c);
                        } else {
                            imElse(c);

                            imLayout(c, BLOCK); {
                                let name;
                                if (chart === null) {
                                    name = "[+ new chart]";
                                } else {
                                    name = chart.name || "untitled"
                                }

                                imStr(c, name);

                                if (elHasMousePress(c)) {
                                    // TODO: fix up mouse interactions
                                    // if (chart) {
                                    //     setCurrentChart(ctx, chart);
                                    // } else {
                                    //     const newChart = addNewUserChart(ctx);
                                    //     setCurrentChart(ctx, newChart);
                                    // }
                                }
                            } imLayoutEnd(c);
                        } imEndIf(c);
                    } imLayoutEnd(c);
                } imEndFor(c);

                imLayout(c, BLOCK); imFlex(c); imLayoutEnd(c);

                imLayout(c, BLOCK); {
                    imStr(c, "[R] to rename");
                } imLayoutEnd(c);
            } imLayoutEnd(c);
        } imEndIf(c);
    } imLayoutEnd(c);
}
