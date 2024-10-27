import { clamp } from "src/utils/math-utils";
import { recursiveShallowCopyRemovingComputedFields } from "src/utils/serialization-utils";
import { mutateSequencerTimeline, TimelineItem } from "./sequencer-state";

export type SavedState = {
    allSavedSongs: Record<string, string>;
}

type View = "startup" | "chart-select" | "play-chart" | "edit-chart";
export type UIState = {
    currentView: View;

    loadSaveSidebarOpen: boolean;
    isKeyboard: boolean;
    loadSaveCurrentSelection: string;

    // TODO: polish. right now it's only good for local dev
    saveStateTimeout: number;
    copiedPositionStart: number;
    copiedItems: TimelineItem[];
};

export function newUiState(): UIState {
    return {
        currentView: "startup",

        loadSaveSidebarOpen: false,
        isKeyboard: true,
        loadSaveCurrentSelection: "",

        // TODO: polish. right now it's only good for local dev
        saveStateTimeout: 0,
        copiedPositionStart: 0,
        copiedItems: [],
    };
}

export function newSavedState(): SavedState {
    return {
        allSavedSongs: {}
    };
}

export function deepCopyJSONSerializable<T>(thing: T) {
    return JSON.parse(JSON.stringify(thing)) as T;
}


