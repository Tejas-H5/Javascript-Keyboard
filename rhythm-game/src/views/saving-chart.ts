import { saveChart } from "src/state/data-repository";
import { isReadonlyChart, } from "src/state/sequencer-chart";
import { GlobalContext } from "./app";
import { newAsyncContext } from "src/utils/promise-utils";

const saveTasks = new Set<number>();
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

    const a = newAsyncContext("Saving current chart");
    const saveTask = saveChart(a, ctx.repo, chart)
    saveTasks.add(chart.id);
    saveTask.finally(() => saveTasks.delete(chart.id));
}

