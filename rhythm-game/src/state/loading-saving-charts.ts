import { unreachable } from "src/utils/assert";
import { autoMigrate, recursiveCloneNonComputedFields } from "src/utils/serialization-utils";
import { GlobalContext } from "src/views/app";
import {
    newChart,
    newTimelineItemBpmChangeDefault,
    newTimelineItemMeasureDefault,
    newTimelineItemNoteDefault,
    NoteItem,
    TIMELINE_ITEM_BPM,
    TIMELINE_ITEM_MEASURE,
    TIMELINE_ITEM_NOTE
} from "src/state/sequencer-chart";
import { newSavedState, SavedState } from "./saved-state";
import { Sample } from "src/assets/samples/all-samples";
import { sampleToNoteIdx } from "./keyboard-state";

const SAVED_STATE_KEY = "rhythmGameSavedState";

export function loadSaveState(): SavedState {
    const savedState = localStorage.getItem(SAVED_STATE_KEY);
    if (!savedState) {
        return newSavedState();
    }

    let loadedState: SavedState = JSON.parse(savedState);;

    loadedState = autoMigrate(loadedState, newSavedState);

    for (let i = 0; i < loadedState.userCharts.length; i++) {
        let chart = loadedState.userCharts[i];
        chart = autoMigrate(chart, newChart);
        loadedState.userCharts[i] = chart;

        for (let i = 0; i < chart.timeline.length; i++) {
            const item = chart.timeline[i];
            if (item.type === TIMELINE_ITEM_BPM) {
                chart.timeline[i] = autoMigrate(item, newTimelineItemBpmChangeDefault);
            } else if (item.type === TIMELINE_ITEM_NOTE) {
                // at least one of these fields must be set
                type MusicNoteOld = {
                    noteIndex?: number;
                    sample?: Sample;
                }

                // @ts-expect-error old field we removed - note
                const sample = (item.note as MusicNoteOld | undefined)?.sample;
                // @ts-expect-error old field we removed - note
                const noteIndex = (item.note as MusicNoteOld | undefined)?.noteIndex;

                chart.timeline[i] = autoMigrate(item, newTimelineItemNoteDefault);

                if (sample || noteIndex) {
                    if (noteIndex) {
                        (chart.timeline[i] as NoteItem).noteId = noteIndex;
                    } else if (sample) {
                        (chart.timeline[i] as NoteItem).noteId = sampleToNoteIdx(sample);
                    }
                }
            } else if (item.type === TIMELINE_ITEM_MEASURE) {
                chart.timeline[i] = autoMigrate(item, newTimelineItemMeasureDefault);
            } else {
                unreachable(item);
            }
        }
    }

    if (loadedState.userCharts.length === 0) {
        // TODO: insert premade charts here.
    }

    return loadedState;
}

export function saveAllState(ctx: GlobalContext) {
    return;
    const { savedState } = ctx;
    const serialzed = recursiveCloneNonComputedFields(savedState);

    localStorage.setItem(SAVED_STATE_KEY , JSON.stringify(serialzed));
    console.log("saved!");
}


export function saveStateDebounced(ctx: GlobalContext) {
    const ui = ctx.ui.loadSave;

    clearTimeout(ui.saveStateTimeout);
    ui.saveStateTimeout = setTimeout(() => {
        saveAllState(ctx);
        ui.saveStateTimeout = 0;
    }, 100);
}

export function isSaving(ctx: GlobalContext) {
    return !!ctx.ui.loadSave.saveStateTimeout;
}

