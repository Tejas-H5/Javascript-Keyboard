import { TimelineItem } from "./sequencer-state";

type AppView = "startup" | "chart-select" | "play-chart" | "edit-chart";
export type UIState = {
    currentView: AppView;

    chartSelect: {
        loadedCharts: string[];
    },

    loadSave: {
        saveStateTimeout: number;
        selectedChartName: string;
        loadedChartName: string;
    }

    copied: {
        items: TimelineItem[];
        positionStart: number;
    }

    editView: {
        isKeyboard: boolean;
        sidebarOpen: boolean;
    }
};

export function newUiState(): UIState {
    return {
        currentView: "startup",

        chartSelect: {
            loadedCharts: [],
        },

        loadSave: {
            saveStateTimeout: 0,
            loadedChartName: "",
            selectedChartName: "",
        },

        copied: {
            positionStart: 0,
            items: [],
        },

        editView: {
            isKeyboard: true,
            sidebarOpen: false,
        },
    };
}
