import { BLOCK, COL, imAbsolute, imBg, imFixed, imLayoutBegin, imLayoutEnd, imZIndex, NA, PX } from "src/components/core/layout.ts";
import { imExtraDiagnosticInfo, imFpsCounterSimple } from "src/components/fps-counter.ts";
import { imLine, LINE_HORIZONTAL } from "src/components/im-line.ts";
import { debugFlags } from "src/debug-flags.ts";
import { getCurrentPlaySettings, getDspInfo, getPlaybackSpeed, getPlaybackVolume, releaseAllKeys, releaseKey, schedulePlayback, setPlaybackSpeed, setPlaybackTime, setPlaybackVolume, updatePlaySettings } from "src/dsp/dsp-loop-interface.ts";
import { DataRepository, loadChartMetadataList, loadChart, SequencerChartMetadata } from "src/state/data-repository.ts";
import { getKeyForKeyboardKey, KeyboardState, newKeyboardState } from "src/state/keyboard-state.ts";
import {
    startPlaying,
    stopPlayback
} from "src/state/playing-pausing.ts";
import {
    copyTimelineItem,
    FRACTIONAL_UNITS_PER_BEAT,
    newChart,
    redoEdit,
    SequencerChart,
    sequencerChartInsertItems,
    TIMELINE_ITEM_MEASURE,
    undoEdit
} from "src/state/sequencer-chart.ts";
import { getNextPlayingId, SequencerState, setSequencerChart } from "src/state/sequencer-state.ts";
import { APP_VIEW_CHART_SELECT, APP_VIEW_EDIT_CHART, APP_VIEW_PLAY_CHART, APP_VIEW_SOUND_LAB, APP_VIEW_STARTUP, AppView, getCurrentChartMetadata, NAME_OPERATION_COPY, NAME_OPERATION_CREATE, NAME_OPERATION_RENAME, newUiState, OperationType, UIState } from "src/state/ui-state.ts";
import { imUnitTestsModal, newUnitTestsState } from "src/state/unit-tests.ts";
import { filterInPlace } from "src/utils/array-utils.ts";
import { assert, unreachable } from "src/utils/assert.ts";
import { AsyncCallback, AsyncCallbackResult, done, DONE, getTrackedAsyncActions } from "src/utils/async-utils.ts";
import { isEditingTextSomewhereInDocument } from "src/utils/dom-utils.ts";
import { ImCache, imFor, imForEnd, imIf, imIfElse, imIfEnd, imSwitch, imSwitchEnd } from "src/utils/im-core.ts";
import { EL_H2, getGlobalEventSystem, imElBegin, imElEnd, imStr } from "src/utils/im-dom.ts";
import { imChartSelect } from "src/views/chart-select.ts";
import { imEditView } from "src/views/edit-view.ts";
import { imPlayView } from "src/views/play-view.ts";
import { imStartupView } from "src/views/startup-view.ts";
import { enablePracticeMode, GameplayState, newGameplayState } from "./gameplay.ts";
import { runSaveCurrentChartTask } from "./saving-chart.ts";
import { imSoundLab } from "./sound-lab.ts";
import { imUpdateModal } from "./update-modal.ts";

export type GlobalContext = {
    keyboard:  KeyboardState;
    sequencer: SequencerState;
    gameplay:  GameplayState | null;

    deltaTime: number;

    ui: UIState;

    repo: DataRepository;

    // TODO: input state
    keyPressState: KeyPressState | null;
    keyReleaseState: KeyPressState | null;
    blurredState: boolean;
    handled: boolean;
    dontPreventDefault: boolean;
};

export function newGlobalContext(
    repo: DataRepository,
    sequencer: SequencerState,
) {
    // const firstChart = getOrCreateCurrentChart(saveState);

    const keyboard = newKeyboardState();

    const ctx: GlobalContext = {
        keyboard,
        sequencer: sequencer,
        gameplay: null,
        ui: newUiState(),
        repo: repo,
        keyPressState: null,
        keyReleaseState: null,
        blurredState: false,
        handled: false,
        dontPreventDefault: false,
        deltaTime: 0,
    };

    setSequencerChart(ctx.sequencer, ctx.sequencer._currentChart);

    ctx.sequencer.cursor = ctx.sequencer._currentChart.cursor;

    return ctx;
}


export function playKeyPressForUI(ctx: GlobalContext, normalizedPitch: number) {
    const idx = Math.floor(normalizedPitch * (ctx.keyboard.flatKeys.length - 1));
    const key = ctx.keyboard.flatKeys[idx]; assert(!!key);

    const settings = getCurrentPlaySettings();
    settings.isUserDriven = false;
    updatePlaySettings();

    schedulePlayback({
        keys: [{ time: 0, timeEnd: 10, keyIndex: key.index, noteId: key.noteId, }],
        timeEnd: 10,
        playingId: getNextPlayingId(),
    });
}

// NOTE: there should always at least be 1 bundled chart, so you should never need to 
// clear the current metadata to `null`
export function setCurrentChartMeta(
    ctx: GlobalContext,
    metadata: SequencerChartMetadata,
    cb: AsyncCallback<void>
): AsyncCallbackResult {
    const chartSelect = ctx.ui.chartSelect;
    if (chartSelect.currentChartLoadingId === metadata.id) {
        return cb();
    }

    chartSelect.currentChartLoadingId = metadata.id;
    chartSelect.currentChartMeta      = metadata;

    return loadChart(ctx.repo, metadata.id, (chart, err) => {
        if (!chart) return DONE;

        if (chart.id !== chartSelect.currentChartLoadingId) {
            return DONE;
        }

        setSequencerChart(ctx.sequencer, chart);

        return cb(undefined, err);
    });
}

export function addNewUserChart(_ctx: GlobalContext) {
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


export function setViewEditChart(ctx: GlobalContext) {
    setCurrentView(ctx, APP_VIEW_EDIT_CHART);
}

export function openChartUpdateModal(
    ctx: GlobalContext,
    chart: SequencerChart,
    operation: OperationType,
    message: string
) {
    let newName;
    switch(operation) {
        case NAME_OPERATION_COPY:   newName = chart.name + " Copy"; break;
        case NAME_OPERATION_RENAME: newName = chart.name;           break;
        case NAME_OPERATION_CREATE: newName = "New chart";          break;
        default: unreachable(operation);
    }

    ctx.ui.updateModal = {
        message: message,
        operation: operation,
        chartToUpdate: chart,
        newName: newName,
        error: null,
        isUpdating: false,
    };
}

export function setViewSoundLab(ctx: GlobalContext) {
    setCurrentView(ctx, APP_VIEW_SOUND_LAB);
}

export function setViewPlayCurrentChart(ctx: GlobalContext) {
    setCurrentView(ctx, APP_VIEW_PLAY_CHART);
}

export function setViewPlayCurrentChartTest(ctx: GlobalContext, time: number) {
    setCurrentView(ctx, APP_VIEW_PLAY_CHART);
    setPlaybackTime(time);
    assert(!!ctx.gameplay);
    enablePracticeMode(ctx.gameplay);
    ctx.ui.playView.isTesting = true;
}

export function setViewChartSelect(ctx: GlobalContext) {
    setCurrentView(ctx, APP_VIEW_CHART_SELECT);
}

export function setViewStartScreen(ctx: GlobalContext) {
    setCurrentView(ctx, APP_VIEW_STARTUP);
}

function setCurrentView(ctx: GlobalContext, view: AppView) {
    const { editView, playView } = ctx.ui;
    const sequencer = ctx.sequencer;

    // run code while exiting a view
    {
        switch (ctx.ui.currentView) {
            case APP_VIEW_EDIT_CHART: {
                editView.lastCursor = sequencer.cursor;
            } break;
            case APP_VIEW_PLAY_CHART: {
                stopPlayback(ctx);
                setPlaybackVolume(1);
                setPlaybackSpeed(1);
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

                loadChartMetadataList(ctx.repo, (availableCharts) => {
                    if (!availableCharts)             return DONE;
                    if (availableCharts.length === 0) return DONE;

                    const currentChartId = ctx.sequencer._currentChart.id;
                    let idx = availableCharts.findIndex(c => c.id === currentChartId);
                    if (idx === -1) idx = 0;

                    setCurrentChartMeta(ctx, availableCharts[idx], done);
                    return DONE;
                });
            } break;
            case APP_VIEW_PLAY_CHART: {
                playView.result = null;

                const currentChart = ctx.sequencer._currentChart;
                assert(!!currentChart);
                ctx.gameplay = newGameplayState(ctx.keyboard, ctx.sequencer._currentChart)

                // Testing results screen
                if (debugFlags.testResultsView) {
                    const result = newGameplayState(newKeyboardState(), newChart("Test chart name"));
                    result.score = 199
                    result.bestPossibleScore = 200;
                    playView.result = result;
                } 

                setPlaybackVolume(1);
                setPlaybackSpeed(debugFlags.testGameplaySpeed);
                startPlaying(ctx, -1 * FRACTIONAL_UNITS_PER_BEAT, undefined, { isUserDriven: true });
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
) {
    const { ui } = ctx;

    const { blur, keyboard } = getGlobalEventSystem();
    const { keyDown, keyUp } = keyboard;

    ctx.keyPressState = null;
    ctx.keyReleaseState = null;
    ctx.blurredState = false;
    ctx.handled = false;
    ctx.dontPreventDefault = false;

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
                ctx.dontPreventDefault = true;
            }
        }
    }

    if (keyUp) {
        const keyReleaseState = newKeyPressState(keyUp);
        ctx.keyReleaseState = keyReleaseState;
        getKeyPressState(keyUp, keyReleaseState);
        if (handleKeyRelased(ctx, keyReleaseState)) {
            keyUp.preventDefault();
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

    imLayoutBegin(c, COL); imFixed(c, 0, PX, 0, PX, 0, PX, 0, PX); {
        if (imIf(c) && ui.unitTestModal) {
            imUnitTestsModal(c, ctx, ui.unitTestModal);
        } else if (imIfElse(c) && ui.updateModal) {
            imUpdateModal(c, ctx, ui.updateModal);
        } imIfEnd(c);

        imSwitch(c, ui.currentView); switch(ui.currentView) { 
            case APP_VIEW_STARTUP:      imStartupView(c, ctx); break;
            case APP_VIEW_CHART_SELECT: imChartSelect(c, ctx); break;
            case APP_VIEW_PLAY_CHART:   imPlayView(c, ctx);    break;
            case APP_VIEW_EDIT_CHART:   imEditView(c, ctx);    break;
            case APP_VIEW_SOUND_LAB:    imSoundLab(c, ctx);    break;
            default: {
                imElBegin(c, EL_H2); imStr(c, `TODO: implement ${ui.currentView} ...`); imElEnd(c, EL_H2);
            } break;
        } imSwitchEnd(c);

    } imLayoutEnd(c);

    if (!ctx.handled) {
        if (ctx.keyPressState?.key === "F1") {
            ui.unitTestModal = newUnitTestsState();
            ctx.handled = true;
        }
    }

    if (ctx.handled && ctx.keyPressState) {
        if (
            !isEditingTextSomewhereInDocument() && 
            !ctx.dontPreventDefault
        ) {
            ctx.keyPressState.e.preventDefault();
        }
    }
}

export function imDiagnosticInfo(c: ImCache, ctx: GlobalContext | undefined) {
    // diagnostic info
    imLayoutBegin(c, BLOCK); imAbsolute(c, 0, NA, 10, PX, 10, PX, 0, NA); imBg(c, `rgba(255, 255, 255, 0.6)`); imZIndex(c, 10000); {
        imFpsCounterSimple(c);
        imExtraDiagnosticInfo(c);

        // What's playing?

        if (imIf(c) && ctx) {
            imLayoutBegin(c, BLOCK); {
                const info = getDspInfo();
                imFor(c); for (const [keyId, signal] of info.currentlyPlaying) {
                    const key = ctx.keyboard.flatKeys[keyId];
                    imLayoutBegin(c, BLOCK); {
                        imStr(c, "[");
                        imStr(c, key.text);
                        imStr(c, ",");
                        imStr(c, signal.toFixed(1));
                        imStr(c, "]");
                    } imLayoutEnd(c);
                } imForEnd(c);

                imLayoutBegin(c, BLOCK); {
                    imStr(c, "volume="); imStr(c, getPlaybackVolume());
                    imStr(c, "speed="); imStr(c, getPlaybackSpeed());
                } imLayoutEnd(c);
            } imLayoutEnd(c);
        } imIfEnd(c);

        // Info about background tasks
        imLayoutBegin(c, BLOCK); {
            const asyncActions = getTrackedAsyncActions();
            imFor(c); for (const slot of asyncActions.values()) {
                imFor(c); for (const action of slot) {
                    imLayoutBegin(c, BLOCK); imBg(c, action.error ? `rgba(255, 0, 0, 0.5)` : `rgba(0, 255, 255, 1)`); {
                        const t1 = action.t1 ?? performance.now();
                        const ms = t1 - action.t0;
                        imStr(c, Math.round(ms));
                        imStr(c, "ms |");
                        imStr(c, action.name);
                    } imLayoutEnd(c);
                } imForEnd(c);

                imLine(c, LINE_HORIZONTAL, 1);
            } imForEnd(c);
        } imLayoutEnd(c);
    } imLayoutEnd(c);
}

export function setLoadSaveModalOpen(ctx: GlobalContext) {
    const ui = ctx.ui;
    ui.loadSave.modal._open = true;
    runSaveCurrentChartTask(ctx);
    const currentChartMeta = getCurrentChartMetadata(ctx);
    ui.loadSave.modal.chartBeforeOpenMeta = currentChartMeta;
}

export function setLoadSaveModalClosed(ctx: GlobalContext) {
    const ui = ctx.ui;
    ui.loadSave.modal._open = false;
    ui.loadSave.modal.chartBeforeOpenMeta = null;
}
