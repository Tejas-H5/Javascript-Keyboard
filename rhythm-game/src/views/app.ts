import { imExtraDiagnosticInfo, imFpsCounterSimple } from "components/fps-counter.ts";
import { debugFlags } from "debug-flags.ts";
import { getCurrentPlaySettings, getDspInfo, getPlaybackSpeed, getPlaybackVolume, releaseAllKeys, releaseKey, schedulePlayback, setPlaybackSpeed, setPlaybackTime, setPlaybackVolume, updatePlaySettings } from "dsp/dsp-loop-interface.ts";
import { DataRepository, loadChart, loadChartMetadataList, SequencerChartMetadata } from "state/data-repository.ts";
import { getKeyForKeyboardKey, KeyboardState, newKeyboardState } from "state/keyboard-state.ts";
import {
    startPlaying,
    stopPlayback
} from "state/playing-pausing.ts";
import {
    copyTimelineItem,
    FRACTIONAL_UNITS_PER_BEAT,
    isBeatWithinInclusve,
    newChart,
    redoEdit,
    SequencerChart,
    sequencerChartInsertItems,
    TIMELINE_ITEM_BPM,
    TIMELINE_ITEM_MEASURE,
    undoEdit
} from "state/sequencer-chart.ts";
import { getNextPlayingId, SequencerState, setSequencerChart } from "state/sequencer-state.ts";
import { APP_VIEW_CHART_SELECT, APP_VIEW_EDIT_CHART, APP_VIEW_PLAY_CHART, APP_VIEW_SOUND_LAB, APP_VIEW_STARTUP, AppView, getCurrentChartMetadata, NAME_OPERATION_COPY, NAME_OPERATION_CREATE, NAME_OPERATION_DELETE, NAME_OPERATION_RENAME, newUiState, OperationType, UIState } from "state/ui-state.ts";
import { imUnitTestsModal, newUnitTestsState } from "state/unit-tests.ts";
import { filterInPlace } from "utils/array-utils.ts";
import { assert, unreachable } from "utils/assert.ts";
import { el, im, ImCache, imdom } from "imcf";
import { BLOCK, COL, imui, isEditingTextSomewhereInDocument, NA, PX } from "imcf/im-ui";

import { CANCELLED, DONE, Done, getTasks, Then } from "utils/async-utils.ts";
import { imChartSelect } from "views/chart-select.ts";
import { imEditView } from "views/edit-view.ts";
import { imPlayView } from "views/play-view.ts";
import { imStartupView } from "views/startup-view.ts";
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
    then: Then<void>,
): Done {
    const chartSelect = ctx.ui.chartSelect;
    if (chartSelect.currentChartLoadingId === metadata.id) {
        return then();
    }

    chartSelect.currentChartLoadingId = metadata.id;
    chartSelect.currentChartMeta      = metadata;

    return loadChart(ctx.repo, metadata.id, (chart) => {
        if (!chart || chart.id !== chartSelect.currentChartLoadingId) {
            return CANCELLED;
        }

        setSequencerChart(ctx.sequencer, chart);
        return then();
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

    const toCopy = tl
        .slice(startIdx, endIdx + 1)
        .filter(item => {
            const isDirectlyOnCursor = sequencer.rangeSelectStart === item.start;
            if (item.type === TIMELINE_ITEM_MEASURE) return !isDirectlyOnCursor;
            if (item.type === TIMELINE_ITEM_BPM)     return !isDirectlyOnCursor;
            return true;
        })
        .map(copyTimelineItem);

    if (toCopy.length === 0) {
        return false;
    }

    ui.copied.items = toCopy;
    ui.copied.positionStart = Math.min(sequencer.cursor, toCopy[0].start);

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

    sequencerChartInsertItems(sequencer._currentChart, newNotes);

    return true;
}


export function setViewEditChart(ctx: GlobalContext) {
    setCurrentView(ctx, APP_VIEW_EDIT_CHART);
}

export function openChartUpdateModal(
    ctx: GlobalContext,
    chart: SequencerChart,
    operation: OperationType,
) {
    let newName;
    let message;
    switch(operation) {
        case NAME_OPERATION_COPY:   {
            newName = chart.name + " Copy";
            message = "Copy this chart";
        } break;
        case NAME_OPERATION_RENAME: {
            newName = chart.name;
            message = "Rename chart";
        } break;
        case NAME_OPERATION_CREATE: {
            newName = "New chart";
            message = "";
        } break;
        case NAME_OPERATION_DELETE: {
            newName = "";
            if (chart.timeline.length === 0) {
                message = "Are you sure you want to delete " + chart.name + "?";
            } else {
                message = "Can't delete a non-empty chart";
            }
        } break;
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
            case APP_VIEW_CHART_SELECT: {
                stopPlayback(ctx);
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
                    if (availableCharts.length === 0) return DONE;

                    const currentChartId = ctx.sequencer._currentChart.id;
                    let idx = availableCharts.findIndex(c => c.id === currentChartId);
                    if (idx === -1) idx = 0;

                    return setCurrentChartMeta(ctx, availableCharts[idx], () => DONE);
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
    dst.isLoadSavePressed = dst.keyUpper === "O" && dst.ctrlPressed && !dst.shiftPressed;

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

    const blur = imdom.getBlur();
    const keyboard = imdom.getKeyboard();
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
            } else if( 
                (keyUpper === "S" && ctrlPressed) ||
                (keyUpper === "A" && ctrlPressed)
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

    imui.Begin(c, COL); imui.Fixed(c, 0, PX, 0, PX, 0, PX, 0, PX); {
        if (im.If(c) && ui.unitTestModal) {
            imUnitTestsModal(c, ctx, ui.unitTestModal);
        } else if (im.IfElse(c) && ui.updateModal) {
            imUpdateModal(c, ctx, ui.updateModal);
        } im.IfEnd(c);

        im.Switch(c, ui.currentView); switch(ui.currentView) { 
            case APP_VIEW_STARTUP:      imStartupView(c, ctx); break;
            case APP_VIEW_CHART_SELECT: imChartSelect(c, ctx); break;
            case APP_VIEW_PLAY_CHART:   imPlayView(c, ctx);    break;
            case APP_VIEW_EDIT_CHART:   imEditView(c, ctx);    break;
            case APP_VIEW_SOUND_LAB:    imSoundLab(c, ctx);    break;
            default: {
                imdom.ElBegin(c, el.H2); imdom.Str(c, `TODO: implement ${ui.currentView} ...`); imdom.ElEnd(c, el.H2);
            } break;
        } im.SwitchEnd(c);

    } imui.End(c);

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

    if (
        keyDown && 
        !isEditingTextSomewhereInDocument()
    ) {
        // Stop random browser shortcuts from doing things
        keyDown.preventDefault();
    }
}

export function imDiagnosticInfo(c: ImCache, ctx: GlobalContext | undefined) {
    // diagnostic info
    imui.Begin(c, BLOCK); imui.Absolute(c, 0, NA, 10, PX, 10, PX, 0, NA); imui.Bg(c, `rgba(255, 255, 255, 0.6)`); imui.ZIndex(c, 10000); {
        imFpsCounterSimple(c);
        imExtraDiagnosticInfo(c);

        // What's playing?

        if (im.If(c) && ctx) {
            imui.Begin(c, BLOCK); {
                const info = getDspInfo();
                im.For(c); for (const [keyId, signal] of info.currentlyPlaying) {
                    const key = ctx.keyboard.flatKeys[keyId];
                    imui.Begin(c, BLOCK); {
                        imdom.Str(c, "[");
                        imdom.Str(c, key.text);
                        imdom.Str(c, ",");
                        imdom.Str(c, signal.toFixed(1));
                        imdom.Str(c, "]");
                    } imui.End(c);
                } im.ForEnd(c);

                imui.Begin(c, BLOCK); {
                    imdom.Str(c, "volume="); imdom.Str(c, getPlaybackVolume());
                    imdom.Str(c, "speed="); imdom.Str(c, getPlaybackSpeed());
                } imui.End(c);
            } imui.End(c);
        } im.IfEnd(c);

        // Info about background tasks
        imui.Begin(c, BLOCK); {
            const tasks = getTasks();
            im.For(c); for (const task of tasks.tasks) {
                imui.Begin(c, BLOCK); {
                    const ms = performance.now() - task.t0;
                    imdom.Str(c, Math.round(ms));
                    imdom.Str(c, "ms |");
                    imdom.Str(c, task.name);
                } imui.End(c);
            } im.ForEnd(c);
        } imui.End(c);
    } imui.End(c);
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
