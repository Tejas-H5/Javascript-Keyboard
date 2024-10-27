import { TimelineItem } from "./sequencer-state";

type AppView = "startup" | "chart-select" | "play-chart" | "edit-chart";
export type UIState = {
    currentView: AppView;

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

export function setScreenChartSelect(state: UIState) {
    state.currentView = "chart-select";
}
