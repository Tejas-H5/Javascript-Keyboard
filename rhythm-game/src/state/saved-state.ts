import { newChart, RhythmGameChart } from "src/views/chart";


export type SavedState = {
    userCharts: RhythmGameChart[];
}

export function newSavedState(): SavedState {
    return {
        userCharts: []
    };
}

export function getChartIdx(state: SavedState, name: string): number {
    const idx = state.userCharts.findIndex(c => c.name === name);
    return idx;
}

export function getChart(state: SavedState, name: string): RhythmGameChart | null {
    const idx = getChartIdx(state, name);
    if (idx === -1) return null;
    return state.userCharts[idx];
}

export function deleteChart(state: SavedState, name: string) {
    const idx = getChartIdx(state, name);
    if (idx === -1) return null;
    state.userCharts.splice(idx, 1);
}

export const AUTOSAVED_NAME = "autosaved";
export function getOrCreateAutosavedChart(state: SavedState): RhythmGameChart {
    let autosaved = getChart(state, AUTOSAVED_NAME);

    if (!autosaved) {
        autosaved = newChart(AUTOSAVED_NAME);
        state.userCharts.push(autosaved);
    }

    return autosaved;
}
