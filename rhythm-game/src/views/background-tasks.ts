import { loadChartMetadataList, saveChart, SaveResult } from "src/state/chart-repository";
import { isReadonlyChart, } from "src/state/sequencer-chart";
import { AsyncData } from "src/utils/promise-utils";
import { GlobalContext } from "./app";

// TODO: doesn't need to be here. does it?
// Separate code by concern. not by 'is it a background task or not?'. xd

export function loadAvailableCharts(ctx: GlobalContext) {
    const result = loadChartMetadataList(ctx.repo).then(metadata => {
        const availableCharts = [...metadata]; 
        availableCharts.sort((a, b) => a.name.localeCompare(b.name));
        ctx.ui.chartSelect.availableCharts = availableCharts;
    });
    return result;
}

const saveTasks = new Set<AsyncData<SaveResult>>();
export function isSavingAnyChart() {
    return saveTasks.size > 0;
}

export function runSaveCurrentChartTask(ctx: GlobalContext) {
    const sequencer = ctx.sequencer;
    const chart = sequencer._currentChart;
    if (isReadonlyChart(chart)) {
        // Shouldn't save charts without a valid id. It's probably a bundled chart
        return;
    }

    const editView = ctx.ui.editView;
    editView.chartSaveTimerSeconds = -1;

    const saveTask = saveChart(ctx.repo, chart)
    saveTasks.add(saveTask);
    saveTask.finally(d => saveTasks.delete(d));
}

