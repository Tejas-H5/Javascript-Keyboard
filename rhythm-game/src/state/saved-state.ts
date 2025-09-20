export type SavedState = {
    currentChartId: number;
}

export function newSavedState(): SavedState {
    return { currentChartId: -1 };
}

