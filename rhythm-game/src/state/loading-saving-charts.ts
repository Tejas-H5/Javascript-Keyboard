import { clamp } from "src/utils/math-utils";
import { autoMigrate, recursiveCloneNonComputedFields } from "src/utils/serialization-utils";
import { GlobalContext } from "src/views/app";
import { getChart, getChartIdx, getOrCreateAutosavedChart, newSavedState, SavedState } from "./saved-state";

const SAVED_STATE_KEY = "rhythmGameSavedState";

export function loadSaveState(): SavedState {
    const savedState = localStorage.getItem(SAVED_STATE_KEY);
    if (!savedState) {
        return newSavedState();
    }

    const loadedState: SavedState = JSON.parse(savedState);;

    // TODO: consider migrating the charts?
    // for now, I just want to get the format of the charts correct, so that I never have to migrate them, ideally.
    autoMigrate(loadedState, newSavedState);

    return loadedState;

    // ctx.savedState = loadedState;
    // ctx.ui.loadSave.loadedChartName = "autosaved";
}

export function getCurrentSelectedChartName(ctx: GlobalContext) {
    return ctx.ui.loadSave.selectedChartName;
}

export function loadAutosaved(ctx: GlobalContext) {
    const autosaved = getOrCreateAutosavedChart(ctx.savedState);
    ctx.ui.loadSave.loadedChartName = autosaved.name;

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

export function moveLoadSaveSelection(ctx: GlobalContext, amount: number) {
    const ui = ctx.ui.loadSave;

    const idx = getChartIdx(ctx.savedState, ui.selectedChartName);
    if (idx === -1) {
        let autosaved = getOrCreateAutosavedChart(ctx.savedState);
        ui.selectedChartName = autosaved.name;
        return;
    }

    const newIdx = clamp(idx + amount, 0, ctx.savedState.userCharts.length - 1);
    ui.selectedChartName = ctx.savedState.userCharts[newIdx].name;
}

export function loadChart(ctx: GlobalContext, chartName: string) {
    const chart = getChart(ctx.savedState, chartName);
    if (!chart) {
        return;
    }

    ctx.sequencer._currentChart = chart;
}

