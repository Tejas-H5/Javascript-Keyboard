export type SavedState = {
    allSavedSongs: Record<string, string>;
}

export function newSavedState(): SavedState {
    return {
        allSavedSongs: {}
    };
}

