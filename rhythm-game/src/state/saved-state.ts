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

export function getOrCreateFirstChart(state: SavedState): RhythmGameChart {
    if (state.userCharts.length > 0) {
        return state.userCharts[0];
    }

    const first = newChart("First chart");
    state.userCharts.push(first);

    return first;
}

