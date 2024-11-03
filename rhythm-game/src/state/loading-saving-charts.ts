import { clamp } from "src/utils/math-utils";
import { GlobalContext } from "./global-context";
import {
    mutateSequencerTimeline
} from "./sequencer-state";
import { recursiveShallowCopyRemovingComputedFields } from "src/utils/serialization-utils";

export function load(ctx: GlobalContext) {
    const savedState = localStorage.getItem("savedState");
    if (!savedState) {
        return;
    }

    ctx.savedState = JSON.parse(savedState);
    ctx.ui.loadSave.loadedChartName = "autosaved";
}

export function getCurrentSelectedChartName(ctx: GlobalContext) {
    return ctx.ui.loadSave.selectedChartName;
}

// TODO: save the individual chart...
export function saveAllCharts(ctx: GlobalContext) {
    const { sequencer, savedState } = ctx;

    const serialzed = recursiveShallowCopyRemovingComputedFields(sequencer.timeline);
    const currentTracks = JSON.stringify(serialzed);

    savedState.allSavedSongs["autosaved"] = currentTracks;

    localStorage.setItem("savedState", JSON.stringify(savedState));
    console.log("saved!");
}


export function saveStateDebounced(ctx: GlobalContext) {
    const ui = ctx.ui.loadSave;

    clearTimeout(ui.saveStateTimeout);
    ui.saveStateTimeout = setTimeout(() => {
        saveAllCharts(ctx);
    }, 100);
}

export function moveLoadSaveSelection(ctx: GlobalContext, amount: number) {
    const ui = ctx.ui.loadSave;

    const keys = Object.keys(ctx.savedState.allSavedSongs);
    const idx = keys.indexOf(ui.selectedChartName);
    if (idx === -1) {
        ui.selectedChartName = keys[0];
        return;
    }

    const newIdx = clamp(idx + amount, 0, keys.length - 1);
    ui.selectedChartName = keys[newIdx];
}

export function loadChart(ctx: GlobalContext, chartName: string) {
    const ui = ctx.ui.loadSave;

    if (!ctx.savedState.allSavedSongs[chartName]) {
        return;
    }

    const json = ctx.savedState.allSavedSongs[chartName];
    ui.loadedChartName = chartName;
    const tl = ctx.sequencer.timeline;
    mutateSequencerTimeline(ctx.sequencer, () => {
        tl.splice(0, tl.length);
        tl.push(...JSON.parse(json));
    });
}

