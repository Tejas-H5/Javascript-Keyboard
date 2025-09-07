import { COL, imFixed, imLayout, imLayoutEnd, PX } from "src/components/core/layout";
import { FpsCounterState } from "src/components/fps-counter";
import { pressKey, releaseAllKeys, releaseKey, setScheduledPlaybackVolume } from "src/dsp/dsp-loop-interface";
import { getKeyForKeyboardKey, KeyboardState, newKeyboardState } from "src/state/keyboard-state";
import {
    saveStateDebounced,
} from "src/state/loading-saving-charts";
import {
    playAll,
    playFromCursor,
    playFromLastMeasure,
    startPlaying,
    stopPlaying
} from "src/state/playing-pausing";
import {
    getChartIdx,
    getOrCreateCurrentChart,
    SavedState
} from "src/state/saved-state";
import {
    copyTimelineItem,
    equalBeats,
    getBpm,
    getBpmChangeItemBeforeBeats,
    getChartExtent,
    getItemStartBeats,
    getLastMeasureBeats,
    getNextMeasureBeats,
    newChart,
    newTimelineItemBpmChange,
    newTimelineItemMeasure,
    newTimelineItemNote,
    redoEdit,
    SequencerChart,
    sequencerChartInsertItems,
    sequencerChartRemoveItems,
    sortAndIndexTimeline,
    timelineHasNoteAtPosition,
    timelineMeasureAtBeatsIdx,
    undoEdit
} from "src/state/sequencer-chart";
import {
    clearRangeSelection,
    deleteRange,
    getBeats,
    getCursorStartBeats,
    getSelectionStartEndIndexes,
    handleMovement,
    handleMovementAbsolute,
    hasRangeSelection,
    newSequencerState,
    SequencerState,
    setCursorDivisor,
    setTimelineNoteAtPosition,
    shiftItemsAfterCursor,
    shiftSelectedItems,
    transposeSelectedItems,
} from "src/state/sequencer-state";
import { APP_VIEW_CHART_SELECT, APP_VIEW_EDIT_CHART, APP_VIEW_PLAY_CHART, APP_VIEW_SOUND_LAB, APP_VIEW_STARTUP, AppView, newUiState, UIState } from "src/state/ui-state";
import { arraySwap, filterInPlace } from "src/utils/array-utils";
import { assert } from "src/utils/assert";
import { isEditingTextSomewhereInDocument } from "src/utils/dom-utils";
import { ImCache, imMemo, imSwitch, imSwitchEnd } from "src/utils/im-core";
import { EL_H2, getGlobalEventSystem, imEl, imElEnd, imStr } from "src/utils/im-dom";
import { clamp } from "src/utils/math-utils";
import { notesEqual } from "src/utils/music-theory-utils";
import { ChartSelect as imChartSelect } from "src/views/chart-select";
import { imEditView as imEditView } from "src/views/edit-view";
import { PlayView as imPlayView } from "src/views/play-view";
import { imStartupView } from "src/views/startup-view";
import { imSoundLab } from "./sound-lab-view";


export type GlobalContext = {
    keyboard: KeyboardState;
    sequencer: SequencerState;
    ui: UIState;
    savedState: SavedState;
    keyPressState: KeyPressState | null;
    render(): void;
}

export function newGlobalContext(saveState: SavedState) {
    const firstChart = getOrCreateCurrentChart(saveState);

    const ctx: GlobalContext = {
        keyboard: newKeyboardState(),
        sequencer: newSequencerState(firstChart),
        ui: newUiState(),
        savedState: saveState,
        keyPressState: null,
        // TODO: delete
        render: () => {},
    };

    setCurrentChart(ctx, ctx.sequencer._currentChart);

    ctx.sequencer.cursorStart = ctx.sequencer._currentChart.cursorStart;
    ctx.sequencer.cursorDivisor = ctx.sequencer._currentChart.cursorDivisor;

    return ctx;
}

function handleStartupKeyDown(ctx: GlobalContext, keyPressState: KeyPressState): boolean {
    const { key } = keyPressState;

    if (key === "Enter") {
        // NOTE: will need to change when we add more screens we can go to from here
        setViewChartSelect(ctx);
        return true;
    }

    return false;
}

function handlePlayChartOrEditChartKeyDown(ctx: GlobalContext, keyPressState: KeyPressState): boolean {
    const { key, ctrlPressed, shiftPressed, isRepeat } = keyPressState;
    const { sequencer } = ctx;

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

    // move back and forth between measures
    const downArrow = key === "ArrowDown";
    const upArrow = key === "ArrowUp";
    if (downArrow || upArrow) {
        const cursorBeats = getCursorStartBeats(sequencer);

        let newPos;
        if (upArrow) {
            newPos = getNextMeasureBeats(sequencer._currentChart, cursorBeats);
        } else {
            newPos = getLastMeasureBeats(sequencer._currentChart, cursorBeats);
        }

        handleMovementAbsolute(
            sequencer,
            newPos * sequencer.cursorDivisor,
            ctrlPressed,
            shiftPressed
        );

        return true;
    }

    if (isRepeat) {
        return false;
    }

    return false;
}

function handlePlayChartKeyDown(ctx: GlobalContext, keyPressState: KeyPressState): boolean {
    const { key, startTestingPressed } = keyPressState;
    const { ui, keyboard } = ctx;

    if (key === "Escape" || startTestingPressed) {
        if (ui.playView.isTesting) {
            setViewEditChart(ctx);
        } else {
            setViewChartSelect(ctx);
        }
        return true;
    }

    const instrumentKey = getKeyForKeyboardKey(keyboard, key);
    if (instrumentKey) {
        pressKey(instrumentKey.index, instrumentKey.musicNote, keyPressState.isRepeat);
        return true;
    }

    return false;
}

function handleChartSelectKeyDown(ctx: GlobalContext, keyPressState: KeyPressState): boolean {
    const { key, keyUpper } = keyPressState;

    if (keyUpper === "E") {
        setViewEditChart(ctx);
        return true;
    }

    if (keyUpper === "L") {
        setViewSoundLab(ctx);
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
    return false;
}

function handleEditChartKeyDown(ctx: GlobalContext, keyPressState: KeyPressState): boolean {
    const {
        key, keyUpper, ctrlPressed, shiftPressed, altPressed, vAxis, isRepeat,
        startTestingPressed, isPlayPausePressed
    } = keyPressState;

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
            if (vAxis !== 0) {
                const prevIdx = loadSaveModal.idx;

                setCurrentChartIdx(ctx, loadSaveModal.idx - vAxis);

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
        const amount = hasShiftRight ? 1 : -1;

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
        let amnt;
        if (shiftPressed) { amnt = -1; } else { amnt = 1; }
        handleMovement(sequencer, amnt, false, false);

        // Add the previewed notes to the sequencer, push forwards
        for (const note of sequencer.notesToPreview) {
            setTimelineNoteAtPosition(chart, note.start, note.divisor, note.note, 1, true);
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
            let amnt;
            if (shiftPressed) { amnt = -1; } else { amnt = 1; }
            handleMovement(sequencer, amnt, false, false);

            for (const note of sequencer.notesToPreview) {
                setTimelineNoteAtPosition(chart, note.start, note.divisor, note.note, 1, false);
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
            const pos = sequencer.cursorStart;
            const divisor = sequencer.cursorDivisor;

            if (!isRepeat) {
                sequencer.notesToPreview.push(newTimelineItemNote(
                    instrumentKey.musicNote, 
                    pos,
                    1,
                    divisor, 
                ));
                sequencer.notesToPreviewVersion++;
            }
        }

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
        const end = getChartExtent(chart) * sequencer.cursorDivisor;
        handleMovementAbsolute(sequencer, end, ctrlPressed, shiftPressed);
        return true;
    }

    if (shiftPressed && (keyUpper === "M")) {
        const cursorStartBeats = getCursorStartBeats(sequencer);
        const idx = timelineMeasureAtBeatsIdx(chart, cursorStartBeats);
        if (idx === -1) {
            const start = sequencer.cursorStart;
            const divisor = sequencer.cursorDivisor;
            sequencerChartInsertItems(chart, [newTimelineItemMeasure(start, divisor)]);
        } else {
            const measure = chart.timeline[idx];
            sequencerChartRemoveItems(chart, [measure]);
        }
        return true;
    }

    if (shiftPressed && (keyUpper === "B")) {
        const start = getCursorStartBeats(sequencer);
        const bpmChange = getBpmChangeItemBeforeBeats(chart, start);
        if (bpmChange && equalBeats(start, getItemStartBeats(bpmChange))) {
            sequencerChartRemoveItems(chart, [bpmChange]);
        } else {
            const start = sequencer.cursorStart;
            const divisor = sequencer.cursorDivisor;
            const bpm = getBpm(bpmChange);
            const newBpmChange = newTimelineItemBpmChange(start, divisor, bpm);
            sequencerChartInsertItems(chart, [newBpmChange]);
        }
        return true;
    }

    return false;
}

function handleSoundLabKeyDown(ctx: GlobalContext, keyPressState: KeyPressState): boolean {
    // NOTE: has been moved into the component
    return false;
}


export function setCurrentChartIdx(ctx: GlobalContext, i: number) {
    const loadSaveModal = ctx.ui.loadSave.modal;
    loadSaveModal.idx = clamp(i, 0, ctx.savedState.userCharts.length);

    if (loadSaveModal.idx >= ctx.savedState.userCharts.length) {
        return;
    }

    setCurrentChart(ctx, ctx.savedState.userCharts[loadSaveModal.idx]);

    ctx.savedState.lastUserChartIdx = loadSaveModal.idx;

    saveStateDebounced(ctx);
}

export function setCurrentChart(ctx: GlobalContext, chart: SequencerChart) {
    const sequencer = ctx.sequencer;
    sequencer._currentChart.cursorDivisor = sequencer.cursorDivisor;
    sequencer._currentChart.cursorStart = sequencer.cursorStart;

    sequencer._currentChart = chart;
    sequencer.cursorStart = chart.cursorStart;
    sequencer.cursorDivisor = chart.cursorDivisor;
    sortAndIndexTimeline(sequencer._currentChart);

    assert(ctx.savedState.userCharts.indexOf(chart) !== -1);
}

export function deleteChart(ctx: GlobalContext, name: string) {
    const { savedState, sequencer } = ctx;

    let idx = getChartIdx(savedState, name);
    if (idx === -1) return null;

    savedState.userCharts.splice(idx, 1);

    const loadSaveModal = ctx.ui.loadSave.modal;
    loadSaveModal.idx = clamp(loadSaveModal.idx, 0, savedState.userCharts.length - 1);

    if (idx === savedState.userCharts.length) {
        idx--;
    }

    if (idx < 0) {
        sequencer._currentChart = getOrCreateCurrentChart(savedState);
    } else {
        sequencer._currentChart = savedState.userCharts[idx];
    }
}

export function addNewUserChart(ctx: GlobalContext) {
    const result = newChart("new chart");
    ctx.savedState.userCharts.push(result);
    return result;
}

function handleKeyDown(ctx: GlobalContext, keyPressState: KeyPressState): boolean {
    const { keyUpper, ctrlPressed, shiftPressed } = keyPressState;

    if (
        // allow typing into text fields
        isEditingTextSomewhereInDocument() ||
        // allow inspecting the element
        (keyUpper === "I" && ctrlPressed && shiftPressed) ||
        // allow refreshing page
        (keyUpper === "R" && ctrlPressed)
    ) {
        return false;
    }

    const { ui } = ctx;

    if (ui.currentView === APP_VIEW_STARTUP) {
        return handleStartupKeyDown(ctx, keyPressState);
    }

    if (ui.currentView === APP_VIEW_CHART_SELECT) {
        return handleChartSelectKeyDown(ctx, keyPressState)
    }

    // There's a lot of overlap in the functionality of these two views
    if (ui.currentView === APP_VIEW_PLAY_CHART || ui.currentView === APP_VIEW_EDIT_CHART) {
        if (handlePlayChartOrEditChartKeyDown(ctx, keyPressState)) {
            return true;
        }

        if (ui.currentView === APP_VIEW_PLAY_CHART) {
            return handlePlayChartKeyDown(ctx, keyPressState);
        }

        return handleEditChartKeyDown(ctx, keyPressState);
    }

    if (ui.currentView === APP_VIEW_SOUND_LAB) {
        return handleSoundLabKeyDown(ctx, keyPressState);
    }

    throw new Error("Unhandled view - " + ui.currentView);
}


function handleKeyUp(ctx: GlobalContext, keyPressState: KeyPressState): boolean {
    const { key } = keyPressState;

    if (key === "Shift") {
        return true;
    }

    const instrumentKey = getKeyForKeyboardKey(ctx.keyboard, key);
    if (instrumentKey) {
        let len = ctx.sequencer.notesToPreview.length;
        filterInPlace(ctx.sequencer.notesToPreview, note => {
            return !notesEqual(note.note, instrumentKey.musicNote);
        });
        if (len !== ctx.sequencer.notesToPreview.length) {
            ctx.sequencer.notesToPreviewVersion++;
        }

        releaseKey(instrumentKey.index, instrumentKey.musicNote);
        return true;
    }

    return false;
}

export function resetSequencer(ctx: GlobalContext) {
    ctx.sequencer = newSequencerState(ctx.sequencer._currentChart);
}

export function copyNotesToTempStore(ctx: GlobalContext, startIdx: number, endIdx: number): boolean {
    const { sequencer, ui } = ctx;

    if (startIdx === -1 || endIdx === -1) {
        return false;
    }

    const tl = sequencer._currentChart.timeline;

    ui.copied.items = tl.slice(startIdx, endIdx + 1).map(copyTimelineItem);

    ui.copied.positionStart = Math.min(
        getCursorStartBeats(sequencer),
        getItemStartBeats(tl[startIdx])
    );

    return true;
}

export function undoSequencerEdit(ctx: GlobalContext) {
    const chart = ctx.sequencer._currentChart;
    undoEdit(chart);
}

export function redoSequencerEdit(ctx: GlobalContext) {
    const chart = ctx.sequencer._currentChart;
    redoEdit(chart);
}


export function pasteNotesFromTempStore(ctx: GlobalContext): boolean {
    const { ui, sequencer } = ctx;

    if (ui.copied.items.length === 0) {
        return false;
    }

    const delta = getCursorStartBeats(sequencer) - ui.copied.positionStart;

    const newNotes = ui.copied.items.map(item => {
        const newItem = copyTimelineItem(item);
        const beats = getItemStartBeats(newItem);

        const newBeats = beats + delta;
        newItem.start = newBeats * newItem.divisor;

        return newItem;
    });

    sequencerChartInsertItems(sequencer._currentChart, newNotes);

    return true;
}


export function setViewEditChart(ctx: GlobalContext) {
    setCurrentView(ctx, APP_VIEW_EDIT_CHART);
}

export function setViewSoundLab(ctx: GlobalContext) {
    setCurrentView(ctx, APP_VIEW_SOUND_LAB);
}

export function setViewTestCurrentChart(ctx: GlobalContext) {
    ctx.ui.playView.isTesting = true;

    // dont reload the chart, just use the one we have now...
    setCurrentView(ctx, APP_VIEW_PLAY_CHART);
}

export function setViewPlayCurrentChart(ctx: GlobalContext) {
    ctx.ui.playView.isTesting = false;

    setCurrentView(ctx, APP_VIEW_PLAY_CHART);
}

export function setViewChartSelect(ctx: GlobalContext) {
    setCurrentView(ctx, APP_VIEW_CHART_SELECT);
}

export function setViewStartScreen(ctx: GlobalContext) {
    setCurrentView(ctx, APP_VIEW_STARTUP);
}

function setCurrentView(ctx: GlobalContext, view: AppView) {
    if (ctx.ui.currentView === view) {
        return;
    }

    const { editView, playView } = ctx.ui;
    const sequencer = ctx.sequencer;

    // run code while exiting a view
    {
        switch (ctx.ui.currentView) {
            case APP_VIEW_EDIT_CHART:
                editView.lastCursorStart = sequencer.cursorStart;
                editView.lastCursorDivisor = sequencer.cursorDivisor;
                break;
            case APP_VIEW_PLAY_CHART:
                stopPlaying(ctx);
                setScheduledPlaybackVolume(1);
                break;
        }
    }

    ctx.ui.currentView = view;

    // run code while entering a view
    {
        switch (ctx.ui.currentView) {
            case APP_VIEW_EDIT_CHART:
                if (editView.lastCursorDivisor !== 0) {
                    sequencer.cursorStart = editView.lastCursorStart;
                    sequencer.cursorDivisor = editView.lastCursorDivisor;
                }
                break;
            case APP_VIEW_CHART_SELECT:
                editView.lastCursorStart = 0;
                editView.lastCursorDivisor = 0;
                break;
            case APP_VIEW_PLAY_CHART:
                let startFromBeats: number;
                if (playView.isTesting) {
                    startFromBeats = getBeats(editView.lastCursorStart, editView.lastCursorDivisor);
                } else {
                    startFromBeats = 0;
                }

                setScheduledPlaybackVolume(0.1);
                startPlaying(ctx, startFromBeats - 2, undefined, { isUserDriven: true });
                break;
        }
    }
}

type KeyPressState = {
    e: KeyboardEvent;

    key: string;
    keyUpper: string;
    ctrlPressed: boolean,
    shiftPressed: boolean,
    altPressed: boolean;
    isRepeat: boolean

    vAxis: number;
    hAxis: number;

    startTestingPressed: boolean;
    isPlayPausePressed: boolean;
};

function newKeyPressState(e: KeyboardEvent): KeyPressState {
    return {
        e,
        key: "",
        keyUpper: "",
        ctrlPressed: false,
        shiftPressed: false,
        altPressed: false,
        isRepeat: false,
        vAxis: 0,
        hAxis: 0,
        startTestingPressed: false,
        isPlayPausePressed: false,
    };
}

function getKeyPressState(e: KeyboardEvent, dst: KeyPressState) {
    const key = e.key;
    dst.key = key;
    dst.keyUpper = key.toUpperCase();
    dst.ctrlPressed = e.ctrlKey || e.metaKey;
    dst.shiftPressed = e.shiftKey;
    dst.altPressed = e.altKey;
    dst.isRepeat = e.repeat;

    dst.startTestingPressed = dst.shiftPressed && (key === "T" || key === 't');
    dst.isPlayPausePressed = key === " ";

    let vAxis = 0;
    if (key === "ArrowUp") {
        vAxis = 1;
    } else if (key === "ArrowDown") {
        vAxis = -1;
    }
    dst.vAxis = vAxis;

    let hAxis = 0;
    if (key === "ArrowRight") {
        hAxis = 1;
    } else if (key === "ArrowLeft") {
        hAxis = -1;
    }
    dst.hAxis = hAxis;
}
// Contains ALL logic
export function imApp(c: ImCache, ctx: GlobalContext, fps: FpsCounterState) {
    const { ui } = ctx;

    const { keyDown, keyUp, blur } = getGlobalEventSystem().keyboard;

    ctx.keyPressState = null;

    if (keyDown) {
        const keyPressState = newKeyPressState(keyDown);
        ctx.keyPressState = keyPressState;
        getKeyPressState(keyDown, keyPressState);
        if (handleKeyDown(ctx, keyPressState)) {
            keyDown.preventDefault();
        }
    }
    if (keyUp) {
        const keyReleaseState = newKeyPressState(keyUp);
        getKeyPressState(keyUp, keyReleaseState);
        if (handleKeyUp(ctx, keyReleaseState)) {
            keyUp.preventDefault();
        }
    }
    if (blur) {
        releaseAllKeys();
        if (ctx.sequencer.notesToPreview.length) {
            ctx.sequencer.notesToPreview.length = 0;
            ctx.sequencer.notesToPreviewVersion++;
        }
    }

    if (imMemo(c, ctx.sequencer._currentChart._timelineLastUpdated)) {
        saveStateDebounced(ctx);
    }

    imLayout(c, COL); imFixed(c, 0, PX, 0, PX, 0, PX, 0, PX); {
        imSwitch(c, ui.currentView); switch(ui.currentView) { 
            case APP_VIEW_STARTUP:      imStartupView(c, ctx); break;
            case APP_VIEW_CHART_SELECT: imChartSelect(c, ctx); break;
            case APP_VIEW_PLAY_CHART:   imPlayView(c, ctx);    break;
            case APP_VIEW_EDIT_CHART:   imEditView(c, ctx);    break;
            case APP_VIEW_SOUND_LAB:    imSoundLab(c, ctx);    break;
            default: {
                imEl(c, EL_H2); imStr(c, `TODO: implement ${ui.currentView} ...`); imElEnd(c, EL_H2);
            } break;
        } imSwitchEnd(c);
    } imLayoutEnd(c);
}
