import { deepCopyJSONSerializable } from "src/utils/deep-copy-json";
import { KeyboardState, newKeyboardState } from "./keyboard-state";
import { loadChart } from "./loading-saving-charts";
import { startPlaying, stopPlaying } from "./playing-pausing";
import { newSavedState, SavedState } from "./saved-state";
import {
    getBeats,
    getCursorStartBeats,
    getItemStartBeats,
    mutateSequencerTimeline,
    newSequencerState,
    SequencerState
} from "./sequencer-state";
import { AppView, newUiState, UIState } from "./ui-state";

export type GlobalContext = {
    keyboard: KeyboardState;
    sequencer: SequencerState;
    ui: UIState;
    savedState: SavedState; 
    render(): void;
    dt: DOMHighResTimeStamp;
}

export function newGlobalContext(renderFn: () => void): GlobalContext {
    return { 
        keyboard: newKeyboardState(),
        sequencer: newSequencerState(),
        ui: newUiState(),
        savedState: newSavedState(),
        render: renderFn,
        dt: 0,
    };
}

export function resetSequencer(ctx: GlobalContext) {
    ctx.sequencer = newSequencerState();
}

export function copyNotesToTempStore(ctx: GlobalContext, startIdx: number, endIdx: number): boolean {
    const { sequencer, ui } = ctx;

    if (startIdx === -1 || endIdx === -1) {
        return false;
    }

    ui.copied.items = sequencer.timeline.slice(startIdx, endIdx + 1)
        .map(deepCopyJSONSerializable);

    ui.copied.positionStart = Math.min(
        getCursorStartBeats(sequencer),
        getItemStartBeats(sequencer.timeline[startIdx])
    );

    return true;
}

export function pasteNotesFromTempStore(ctx: GlobalContext): boolean {
    const { ui, sequencer } = ctx;

    if (ui.copied.items.length === 0) {
        return false;
    }

    mutateSequencerTimeline(sequencer, () => {
        const delta = getCursorStartBeats(sequencer) - ui.copied.positionStart;
        for (const item of ui.copied.items) {
            const newItem = deepCopyJSONSerializable(item);

            // TODO: attempt to use clean numbers/integers here.
            // This is just my noob code for now
            const beats = getItemStartBeats(newItem);
            const newBeats = beats + delta;
            newItem.start = newBeats * newItem.divisor;

            sequencer.timeline.push(newItem);
        }
    });

    return true;
}

export function setViewEditChart(ctx: GlobalContext, chartName: string) {
    setCurrentView(ctx, "edit-chart");
    loadChart(ctx, chartName);
}

export function setViewTestCurrentChart(ctx: GlobalContext) {
    ctx.ui.playView.isTesting = true;
    setViewPlayChart(ctx, ctx.ui.loadSave.loadedChartName);
}

export function setViewPlayCurrentChart(ctx: GlobalContext) {
    ctx.ui.playView.isTesting = false;
    setViewPlayChart(ctx, ctx.ui.loadSave.selectedChartName);
}

function setViewPlayChart(ctx: GlobalContext, chartName: string) {
    loadChart(ctx, chartName);
    setCurrentView(ctx, "play-chart");
}

export function setViewChartSelect(ctx: GlobalContext) {
    setCurrentView(ctx, "chart-select");
}

export function setViewStartScreen(ctx: GlobalContext) {
    setCurrentView(ctx, "startup");
}

function setCurrentView(ctx: GlobalContext, view: AppView) {
    const { editView, playView } = ctx.ui;
    const sequencer = ctx.sequencer;

    switch(ctx.ui.currentView) {
        case "edit-chart":
            editView.lastCursorStart = sequencer.cursorStart;
            editView.lastCursorDivisor = sequencer.cursorDivisor;
            break;
        case "play-chart":
            stopPlaying(ctx);
            break;
    }

    ctx.ui.currentView = view;

    switch(ctx.ui.currentView) {
        case "edit-chart":
            if (editView.lastCursorDivisor !== 0) {
                sequencer.cursorStart = editView.lastCursorStart;
                sequencer.cursorDivisor = editView.lastCursorDivisor;
            }
            break;
        case "chart-select":
            editView.lastCursorStart = 0;
            editView.lastCursorDivisor = 0;
            break;
        case "play-chart":
            let startFromBeats: number;
            if (playView.isTesting) {
                startFromBeats = getBeats(editView.lastCursorStart, editView.lastCursorDivisor);
            } else {
                startFromBeats = 0;
            }

            startPlaying(ctx, startFromBeats - 2);
            break;
    }
}
