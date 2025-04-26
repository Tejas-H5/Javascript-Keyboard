import { typeGuard } from "src/utils/assert";
import { autoMigrate, recursiveCloneNonComputedFields } from "src/utils/serialization-utils";
import { GlobalContext } from "src/views/app";
import { newChart, newTimelineItemBpmChangeDefault, newTimelineItemMeasureDefault, newTimelineItemNoteDefault, TIMELINE_ITEM_BPM, TIMELINE_ITEM_MEASURE, TIMELINE_ITEM_NOTE } from "src/state/sequencer-chart";
import { newSavedState, SavedState } from "./saved-state";

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
                chart.timeline[i] = autoMigrate(item, newTimelineItemNoteDefault);
            } else if (item.type === TIMELINE_ITEM_MEASURE) {
                chart.timeline[i] = autoMigrate(item, newTimelineItemMeasureDefault);
            } else {
                typeGuard(item);
            }
        }
    }

    return loadedState;

    // ctx.savedState = loadedState;
    // ctx.ui.loadSave.loadedChartName = "autosaved";
}

export function saveAllState(ctx: GlobalContext) {
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
    }, 100);
}

