import { COL, imFixed, imLayout, imLayoutEnd, PX } from "src/components/core/layout";
import { FpsCounterState } from "src/components/fps-counter";
import { TEST_RESULTS_VIEW } from "src/debug-flags";
import { releaseAllKeys, releaseKey, schedulePlayback, setScheduledPlaybackVolume, updatePlaySettings } from "src/dsp/dsp-loop-interface";
import { getChartRepository, getSavedChartsMetadata } from "src/state/chart-repository";
import { getKeyForKeyboardKey, InstrumentKey, KeyboardState, newKeyboardState } from "src/state/keyboard-state";
import {
    saveStateDebounced,
} from "src/state/loading-saving-charts";
import {
    startPlaying,
    stopPlaying
} from "src/state/playing-pausing";
import {
    SavedState
} from "src/state/saved-state";
import {
    copyTimelineItem,
    newChart,
    redoEdit,
    SequencerChart,
    sequencerChartInsertItems,
    TIMELINE_ITEM_MEASURE,
    undoEdit
} from "src/state/sequencer-chart";
import { newSequencerState, SequencerState, setSequencerChart } from "src/state/sequencer-state";
import { APP_VIEW_CHART_SELECT, APP_VIEW_EDIT_CHART, APP_VIEW_PLAY_CHART, APP_VIEW_SOUND_LAB, APP_VIEW_STARTUP, AppView, ChartSelectState, newUiState, UIState } from "src/state/ui-state";
import { filterInPlace } from "src/utils/array-utils";
import { isEditingTextSomewhereInDocument } from "src/utils/dom-utils";
import { ImCache, imIf, imIfEnd, imMemo, imSwitch, imSwitchEnd } from "src/utils/im-core";
import { EL_H2, getGlobalEventSystem, imEl, imElEnd, imStr } from "src/utils/im-dom";
import { handleKeysLifecycle, KeyState, newKeyState } from "src/utils/key-state";
import { clamp } from "src/utils/math-utils";
import { runCancellableAsyncFn } from "src/utils/promise-utils";
import { imChartSelect } from "src/views/chart-select";
import { imEditView } from "src/views/edit-view";
import { imPlayView } from "src/views/play-view";
import { imStartupView } from "src/views/startup-view";
import { newGameplayState } from "./gameplay";
import { imSoundLab } from "./sound-lab-view";
import { imCopyModal } from "./copy-modal";


type AllKeysState = {
    keys: KeyState[];

    ctrlKey:  KeyState;
    shiftKey: KeyState;
    altKey:   KeyState;
};

function newAllKeysState(): AllKeysState {
    const state: AllKeysState = {
        keys: [],

        ctrlKey:  newKeyState("Ctrl", "Control", "Meta"),
        shiftKey: newKeyState("Shift", "Shift"),
        altKey:   newKeyState("Alt", "Alt"),
    };

    for (const k in state) {
        const key = k as keyof typeof state;
        if (key !== "keys") state.keys.push(state[key]); 
    }

    return state;
}

export type GlobalContext = {
    keyboard: KeyboardState;
    sequencer: SequencerState;
    ui: UIState;
    savedState: SavedState;

    allKeysState: AllKeysState;

    keyPressState: KeyPressState | null;
    keyReleaseState: KeyPressState | null;
    blurredState: boolean;

    handled: boolean;
};

export function newGlobalContext(saveState: SavedState) {
    // const firstChart = getOrCreateCurrentChart(saveState);

    const keyboard = newKeyboardState();

    const ctx: GlobalContext = {
        keyboard,
        allKeysState: newAllKeysState(),
        sequencer: newSequencerState(),
        ui: newUiState(),
        savedState: saveState,
        keyPressState: null,
        keyReleaseState: null,
        blurredState: false,
        handled: false,
    };

    setSequencerChart(ctx.sequencer, ctx.sequencer._currentChart);

    ctx.sequencer.cursor = ctx.sequencer._currentChart.cursor;

    return ctx;
}


// I know I'll need ctx here. I just can't prove it ...
export function playKeyPressForUI(ctx: GlobalContext, key: InstrumentKey) {
    updatePlaySettings(s => s.isUserDriven = false);
    schedulePlayback([{
        time: 0, timeEnd: 200,
        keyId: key.index,
        noteId: key.noteId,
    }]);
}

export function setCurrentChartIdx(ctx: GlobalContext, i: number) {
    ctx.ui.chartSelect.idx = clamp(
        i,
        0,
        ctx.ui.chartSelect.availableCharts.length - 1
    );
}

export function addNewUserChart(ctx: GlobalContext) {
    const result = newChart("new chart");
    return result;
}

function handleKeyRelased(ctx: GlobalContext, keyPressState: KeyPressState): boolean {
    const { key } = keyPressState;

    if (key === "Shift") {
        // I forgot what this was for, but might be important ...
        return true;
    }

    const instrumentKey = getKeyForKeyboardKey(ctx.keyboard, key);
    if (instrumentKey) {
        let len = ctx.sequencer.notesToPreview.length;
        filterInPlace(ctx.sequencer.notesToPreview, note => {
            return note.noteId !== instrumentKey.noteId;
        });
        if (len !== ctx.sequencer.notesToPreview.length) {
            ctx.sequencer.notesToPreviewVersion++;
        }

        releaseKey(instrumentKey.index, instrumentKey.noteId);
        return true;
    }

    return false;
}

export function copyNotesToTempStore(ctx: GlobalContext, startIdx: number, endIdx: number): boolean {
    const { sequencer, ui } = ctx;

    if (startIdx === -1 || endIdx === -1) {
        return false;
    }

    const tl = sequencer._currentChart.timeline;

    ui.copied.items = tl.slice(startIdx, endIdx + 1)
        .filter(item => item.type !== TIMELINE_ITEM_MEASURE)
        .map(copyTimelineItem);

    ui.copied.positionStart = Math.min(
        sequencer.cursor,
        tl[startIdx].start
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

    const delta = sequencer.cursor - ui.copied.positionStart;

    const newNotes = ui.copied.items.map(item => {
        const newItem = copyTimelineItem(item);
        newItem.start = newItem.start + delta;
        return newItem;
    });

    sequencerChartInsertItems(sequencer._currentChart, newNotes, sequencer.notesFilter);

    return true;
}


export function setViewEditChart(ctx: GlobalContext, chart: SequencerChart) {
    setSequencerChart(ctx.sequencer, chart);
    setCurrentView(ctx, APP_VIEW_EDIT_CHART);
}

export function setViewSoundLab(ctx: GlobalContext) {
    setCurrentView(ctx, APP_VIEW_SOUND_LAB);
}

export function setViewPlayCurrentChart(ctx: GlobalContext, chart: SequencerChart) {
    setSequencerChart(ctx.sequencer, chart);
    setCurrentView(ctx, APP_VIEW_PLAY_CHART);
}

export function setViewChartSelect(ctx: GlobalContext) {
    setCurrentView(ctx, APP_VIEW_CHART_SELECT);
}

export function setViewStartScreen(ctx: GlobalContext) {
    setCurrentView(ctx, APP_VIEW_STARTUP);
}

function setCurrentView(ctx: GlobalContext, view: AppView) {
    const { editView, playView, chartSelect } = ctx.ui;
    const sequencer = ctx.sequencer;

    // run code while exiting a view
    {
        switch (ctx.ui.currentView) {
            case APP_VIEW_EDIT_CHART: {
                editView.lastCursor = sequencer.cursor;
            } break;
            case APP_VIEW_PLAY_CHART: {
                stopPlaying(ctx);
                setScheduledPlaybackVolume(1);
            } break;
        }
    }

    ctx.ui.currentView = view;

    // run code while entering a view
    {
        switch (ctx.ui.currentView) {
            case APP_VIEW_EDIT_CHART: {
                if (editView.lastCursor !== 0) {
                    sequencer.cursor = editView.lastCursor;
                }
            } break;
            case APP_VIEW_CHART_SELECT: {
                editView.lastCursor = 0;
            } break;
            case APP_VIEW_PLAY_CHART: {
                let startFrom = editView.lastCursor;

                playView.result = null;

                // Testing results screen
                if (TEST_RESULTS_VIEW) {
                    const result = newGameplayState(newKeyboardState(), newChart("Test chart name"));
                    result.score = 199
                    result.bestPossibleScore = 200;
                    playView.result = result;
                } 

                setScheduledPlaybackVolume(0.1);
                startPlaying(ctx, startFrom - 2, undefined, { isUserDriven: true });
            } break;
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
    listNavAxis: number;
    hAxis: number;

    isPlayPausePressed: boolean;
    isLoadSavePressed: boolean;
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
        listNavAxis: 0,
        hAxis: 0,
        isPlayPausePressed: false,
        isLoadSavePressed: false,
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

    dst.isPlayPausePressed = key === " ";
    dst.isLoadSavePressed = dst.keyUpper === "S" && dst.ctrlPressed;

    let vAxis = 0;
    if (key === "ArrowUp") {
        vAxis = 1;
    } else if (key === "ArrowDown") {
        vAxis = -1;
    }
    dst.vAxis = vAxis;

    let listNavAxis = -vAxis;
    if (vAxis === 0) {
        if (key === "PageUp") {
            listNavAxis = -10;
        } else if (key === "PageDown") {
            listNavAxis = 10;
        }
    }
    dst.listNavAxis = listNavAxis;

    let hAxis = 0;
    if (key === "ArrowRight") {
        hAxis = 1;
    } else if (key === "ArrowLeft") {
        hAxis = -1;
    }
    dst.hAxis = hAxis;
}
// Contains ALL logic
export function imApp(
    c: ImCache,
    ctx: GlobalContext,
    fps: FpsCounterState
) {
    const { ui } = ctx;

    const { keyDown, keyUp, blur } = getGlobalEventSystem().keyboard;

    ctx.keyPressState = null;
    ctx.keyReleaseState = null;
    ctx.blurredState = false;
    ctx.handled = false;

    handleKeysLifecycle(ctx.allKeysState.keys, keyDown, keyUp, blur);

    // NOTE: this is not quite how I would do key input today - this
    // app has gone through a lot of rewrites as I was improving the framework 
    // alongside other projects and upgrading everything side-by-side.
    // It's close-enough for now.

    if (keyDown) {
        const keyPressState = newKeyPressState(keyDown);
        ctx.keyPressState = keyPressState;
        getKeyPressState(keyDown, keyPressState);

        if (ctx.keyPressState) {
            const { key, keyUpper, ctrlPressed, shiftPressed } = ctx.keyPressState;

            const typingText = isEditingTextSomewhereInDocument() &&
                key !== "Escape" &&
                key !== "Enter";

            if (
                // allow typing into text fields
                typingText ||
                // allow inspecting the element
                (keyUpper === "I" && ctrlPressed && shiftPressed) ||
                // allow refreshing page
                (keyUpper === "R" && ctrlPressed)
            ) {
                ctx.handled = true;
            }
        }
    }

    if (keyUp) {
        const keyReleaseState = newKeyPressState(keyUp);
        ctx.keyReleaseState = keyReleaseState;
        getKeyPressState(keyUp, keyReleaseState);
        if (handleKeyRelased(ctx, keyReleaseState)) {
            keyUp.preventDefault();
            ctx.handled = true;
        }
    }

    if (blur) {
        releaseAllKeys();
        if (ctx.sequencer.notesToPreview.length) {
            ctx.sequencer.notesToPreview.length = 0;
            ctx.sequencer.notesToPreviewVersion++;
        }
        ctx.blurredState = true;
    }

    if (imMemo(c, ctx.ui.chartSelect.availableChartsInvalidated)) {
        loadAvailableChartsAsync(ctx);
    }

    imLayout(c, COL); imFixed(c, 0, PX, 0, PX, 0, PX, 0, PX); {
        if (imIf(c) && ui.copyModal) {
            imCopyModal(c, ctx, ui.copyModal);
        } imIfEnd(c);

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

    if (ctx.handled && ctx.keyPressState) {
        if (!isEditingTextSomewhereInDocument()) {
            ctx.keyPressState.e.preventDefault();
        }
    }
}

export async function loadAvailableChartsAsync(ctx: GlobalContext) {
    ctx.ui.chartSelect.availableChartsInvalidated = false;

    runCancellableAsyncFn(getSavedChartsMetadata, async (task) => {
        const repo = await getChartRepository(); 
        if (task.done) {
            return;
        }

        const charts = await getSavedChartsMetadata(repo);
        if (task.done) {
            return;
        }

        charts.sort((a, b) => a.name.localeCompare(b.name));
        ctx.ui.chartSelect.availableCharts = charts;
    });
}
