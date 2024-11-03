import { loadChart } from "./loading-saving-charts";
import { KeyboardState, newKeyboardState } from "./keyboard-state";
import { newSavedState, SavedState } from "./saved-state";
import {
    getCursorStartBeats,
    getItemStartBeats,
    mutateSequencerTimeline,
    newSequencerState,
    SequencerState
} from "./sequencer-state";
import { newUiState, UIState } from "./ui-state";
import { deepCopyJSONSerializable } from "src/utils/deep-copy-json";

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
    ctx.ui.currentView = "edit-chart";
    loadChart(ctx, chartName);
}

export function setViewPlayChart(ctx: GlobalContext, chartName: string) {
    ctx.ui.currentView = "play-chart";
    loadChart(ctx, chartName);
}

export function setViewChartSelect(ctx: GlobalContext) {
    ctx.ui.currentView = "chart-select";
}

export function setViewStartScreen(ctx: GlobalContext) {
    ctx.ui.currentView = "startup";
}
