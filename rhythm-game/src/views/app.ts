import { pressKey, releaseAllKeys, releaseKey, setScheduledPlaybackVolume } from "src/dsp/dsp-loop-interface";
import { getKeyForKeyboardKey, KeyboardState, newKeyboardState } from "src/state/keyboard-state";
import {
    getCurrentSelectedChartName,
    loadAutosaved,
    loadChart,
    moveLoadSaveSelection,
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
    deleteChart,
    getChart,
    getOrCreateAutosavedChart,
    SavedState
} from "src/state/saved-state";
import {
    clearRangeSelection,
    deleteRange,
    getBeats,
    getCursorStartBeats,
    getSelectionStartEndIndexes,
    handleMovement,
    hasRangeSelection,
    mutateSequencerTimeline,
    newSequencerState,
    SequencerState,
    setCursorDivisor,
    setTimelineNoteAtPosition,
    shiftItemsAfterCursor,
    shiftSelectedItems,
    transposeSelectedItems,
} from "src/state/sequencer-state";
import { APP_VIEW_CHART_SELECT, APP_VIEW_EDIT_CHART, APP_VIEW_PLAY_CHART, APP_VIEW_STARTUP, AppView, newUiState, UIState } from "src/state/ui-state";
import { deepCopyJSONSerializable } from "src/utils/deep-copy-json";
import {
    getKeyEvents,
    imBeginList,
    imEnd,
    imEndList,
    imInit,
    imTextSpan,
    isEditingTextSomewhereInDocument,
    nextListRoot,
    setClass
} from "src/utils/im-dom-utils";
import { ChartSelect as imChartSelect } from "src/views/chart-select";
import { EditView as imEditView } from "src/views/edit-view";
import { PlayView as imPlayView } from "src/views/play-view";
import { imStartupView } from "src/views/startup-view";
import {
    equalBeats,
    getBpm,
    getBpmChangeItemBeforeBeats,
    getItemIdxAtBeat,
    getItemStartBeats,
    newTimelineItemBpmChange,
    newTimelineItemMeasure,
    timelineHasNoteAtPosition,
    timelineMeasureAtBeatsIdx,
} from "./chart";
import { ABSOLUTE, FIXED, H2, imBeginLayout, ROW } from "./layout";
import { cnApp } from "./styling";


export type GlobalContext = {
    keyboard: KeyboardState;
    sequencer: SequencerState;
    ui: UIState;
    savedState: SavedState;
    render(): void;
    dt: DOMHighResTimeStamp;
}

export function newGlobalContext(saveState: SavedState): GlobalContext {
    const autosaved = getOrCreateAutosavedChart(saveState);

    return {
        keyboard: newKeyboardState(),
        sequencer: newSequencerState(autosaved),
        ui: newUiState(),
        savedState: saveState,
        // TODO: delete
        render: () => {},
        dt: 0,
    };
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
    const { key } = keyPressState;

    if (key === "E" || key === "e") {
        setViewEditChart(ctx);
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
        key, ctrlPressed, shiftPressed, vAxis, isRepeat,
        startTestingPressed, isPlayPausePressed
    } = keyPressState;

    const { ui, sequencer, keyboard } = ctx;

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
            playAll(ctx, { speed: 1 });
            return true;
        }

        if (key === "Escape") {
            ctx.ui.editView.sidebarOpen = false;
            stopPlaying(ctx);
            return true;
        }

        if (key === "Delete") {
            const name = getCurrentSelectedChartName(ctx);
            if (getChart(ctx.savedState, name)) {
                // TODO: real UI instead of confirm
                if (confirm("You sure you want to delete " + name)) {
                    deleteChart(ctx.savedState, name);

                    // NOTE: this only deletes the save file, but not the currently loaded chart's name

                    return true;
                }
            }
        }

        return false;
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

    if (shiftPressed && (vAxis !== 0)) {
        const amount = vAxis > 0 ? 1 : -1;
        mutateSequencerTimeline(sequencer, () => {
            if (sequencer.isRangeSelecting) {
                transposeSelectedItems(sequencer, amount)
            } 
        });

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

    if (key === "Delete") {
        const [start, end] = getSelectionStartEndIndexes(sequencer);
        if (start !== -1 && end !== -1) {
            mutateSequencerTimeline(sequencer, (tl) => {
                deleteRange(tl, start, end);
            });
            return true;
        }

        const chart = sequencer._currentChart;
        const idx = getItemIdxAtBeat(chart, getCursorStartBeats(sequencer));
        if (idx !== -1) {
            mutateSequencerTimeline(sequencer, (tl) => {
                deleteRange(tl, idx, idx);
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
                deleteRange(sequencer._currentChart.timeline, startIdx, endIdx);
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
        const idx = timelineMeasureAtBeatsIdx(sequencer._currentChart, cursorStartBeats);
        if (idx === -1) {
            const start = sequencer.cursorStart;
            const divisor = sequencer.cursorDivisor;
            mutateSequencerTimeline(sequencer, () => {
                sequencer._currentChart.timeline.push(newTimelineItemMeasure(start, divisor));
            });
        } else {
            mutateSequencerTimeline(sequencer, () => {
                deleteRange(sequencer._currentChart.timeline, idx, idx);
            });
        }
        return true;
    }

    if (shiftPressed && (key === "b" || key === "B")) {
        const start = getCursorStartBeats(sequencer);
        const bpmChange = getBpmChangeItemBeforeBeats(sequencer._currentChart, start);
        if (bpmChange && equalBeats(start, getItemStartBeats(bpmChange))) {
            mutateSequencerTimeline(sequencer, (tl) => {
                deleteRange(tl, bpmChange._index, bpmChange._index);
            });
        } else {
            mutateSequencerTimeline(sequencer, (tl) => {
                const start = sequencer.cursorStart;
                const divisor = sequencer.cursorDivisor;
                const bpm = getBpm(bpmChange);
                const newBpmChange = newTimelineItemBpmChange(start, divisor, bpm);
                tl.push(newBpmChange);
            });
        }
        return true;
    }

    const instrumentKey = getKeyForKeyboardKey(keyboard, key);
    if (instrumentKey) {
        // play the instrument
        {
            pressKey(instrumentKey.index, instrumentKey.musicNote, isRepeat);
        }

        // insert notes into the sequencer
        {
            mutateSequencerTimeline(sequencer, (tl) => {
                const pos = sequencer.cursorStart;
                const divisor = sequencer.cursorDivisor;
                const note = instrumentKey.musicNote;

                const hasNote = timelineHasNoteAtPosition(sequencer._currentChart, pos, divisor, note);
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

    return false;
}

function handleKeyDown(ctx: GlobalContext, keyPressState: KeyPressState): boolean {
    const { key, ctrlPressed, shiftPressed } = keyPressState;

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

    throw new Error("Unhandled view - " + ui.currentView);
}


function handleKeyUp(ctx: GlobalContext, keyPressState: KeyPressState): boolean {
    const { key } = keyPressState;

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

export function resetSequencer(ctx: GlobalContext) {
    ctx.sequencer = newSequencerState(ctx.sequencer._currentChart);
}

export function copyNotesToTempStore(ctx: GlobalContext, startIdx: number, endIdx: number): boolean {
    const { sequencer, ui } = ctx;

    if (startIdx === -1 || endIdx === -1) {
        return false;
    }

    const tl = sequencer._currentChart.timeline;

    ui.copied.items = tl.slice(startIdx, endIdx + 1)
        .map(deepCopyJSONSerializable);

    ui.copied.positionStart = Math.min(
        getCursorStartBeats(sequencer),
        getItemStartBeats(tl[startIdx])
    );

    return true;
}

export function pasteNotesFromTempStore(ctx: GlobalContext): boolean {
    const { ui, sequencer } = ctx;

    if (ui.copied.items.length === 0) {
        return false;
    }

    mutateSequencerTimeline(sequencer, (tl) => {
        const delta = getCursorStartBeats(sequencer) - ui.copied.positionStart;
        for (const item of ui.copied.items) {
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


export function setViewEditChart(ctx: GlobalContext) {
    setCurrentView(ctx, APP_VIEW_EDIT_CHART);
}

export function setViewTestCurrentChart(ctx: GlobalContext) {
    ctx.ui.playView.isTesting = true;

    if (!ctx.ui.loadSave.loadedChartName) {
        loadAutosaved(ctx);
    }

    // dont reload the chart, just use the one we have now...
    setCurrentView(ctx, APP_VIEW_PLAY_CHART);
}

export function setViewPlayCurrentChart(ctx: GlobalContext) {
    ctx.ui.playView.isTesting = false;

    if (!ctx.ui.loadSave.loadedChartName) {
        loadAutosaved(ctx);
    }

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
    key: string;
    ctrlPressed: boolean,
    shiftPressed: boolean,
    isRepeat: boolean

    vAxis: number;
    hAxis: number;

    startTestingPressed: boolean;
    isPlayPausePressed: boolean;
};

function newKeyPressState(): KeyPressState {
    return {
        key: "",
        ctrlPressed: false,
        shiftPressed: false,
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
    dst.ctrlPressed = e.ctrlKey || e.metaKey;
    dst.shiftPressed = e.shiftKey;
    dst.isRepeat = e.repeat;

    dst.startTestingPressed = dst.shiftPressed && (key === "T" || key === 't');
    dst.isPlayPausePressed = key === " ";

    let vAxis = 0;
    if (key === "ArrowUp") {
        vAxis = -1;
    } else if (key === "ArrowDown") {
        vAxis = 1;
    }
    dst.vAxis = vAxis;

    let hAxis = 0;
    if (key === "ArrowRight") {
        hAxis = -1;
    } else if (key === "ArrowLeft") {
        hAxis = 1;
    }
    dst.hAxis = hAxis;
}
// Contains ALL logic
export function imApp(ctx: GlobalContext) {
    const { ui } = ctx;

    const keyPressState = newKeyPressState();
    const keyReleaseState = newKeyPressState();
    
    const { keyDown, keyUp, blur } = getKeyEvents();
    if (keyDown) {
        getKeyPressState(keyDown, keyPressState);
        if (handleKeyDown(ctx, keyPressState)) {
            keyDown.preventDefault();
        }
    }
    if (keyUp) {
        getKeyPressState(keyUp, keyReleaseState);
        if (handleKeyUp(ctx, keyReleaseState)) {
            keyUp.preventDefault();
        }
    }
    if (blur) {
        releaseAllKeys();
    }

    imBeginLayout(ABSOLUTE | FIXED | ROW); {
        if (imInit()) {
            setClass(cnApp.normalFont);
        }

        imBeginList(); 
        nextListRoot(ui.currentView);
        switch(ui.currentView) { 
            case APP_VIEW_STARTUP: { imStartupView(ctx); } break;
            case APP_VIEW_CHART_SELECT: { imChartSelect(ctx); } break;
            case APP_VIEW_PLAY_CHART: { imPlayView(ctx); } break;
            case APP_VIEW_EDIT_CHART: { imEditView(ctx); } break;
            default: {
                imBeginLayout(H2); {
                    imTextSpan(`TODO: implement ${ui.currentView} ...`);
                } imEnd();
            } break;
        }
        imEndList();
    } imEnd();
}
