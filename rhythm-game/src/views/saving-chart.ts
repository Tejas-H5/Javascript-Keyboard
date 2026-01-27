import { saveChart } from "src/state/data-repository";
import { isReadonlyChart, } from "src/state/sequencer-chart";
import { GlobalContext } from "./app";
import { DONE } from "src/utils/async-utils";

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

    saveTasks.add(chart.id);
    saveChart(ctx.repo, chart, () => {
        saveTasks.delete(chart.id)
        return DONE;
    })
}

