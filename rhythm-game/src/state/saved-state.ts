import { newChart, SequencerChart } from "src/state/sequencer-chart";


export type SavedState = {
    userCharts: SequencerChart[];
    lastUserChartIdx: number;
}

export function newSavedState(): SavedState {
    return {
        userCharts: [],
        lastUserChartIdx: 0,
    };
}

export function getChartIdx(state: SavedState, name: string): number {
    const idx = state.userCharts.findIndex(c => c.name === name);
    return idx;
}

export function getChart(state: SavedState, name: string): SequencerChart | null {
    const idx = getChartIdx(state, name);
    if (idx === -1) return null;
    return state.userCharts[idx];
}

export function getOrCreateCurrentChart(state: SavedState): SequencerChart {
    const lastIdx = state.lastUserChartIdx;
    if (lastIdx >= 0 && lastIdx < state.userCharts.length) {
        return state.userCharts[lastIdx];
    }

    // fallback to first
    if (state.userCharts.length > 0) {
        return state.userCharts[0];
    }

    // fallback to making a new chart
    const first = newChart("First chart");
    state.userCharts.push(first);

    return first;
}

