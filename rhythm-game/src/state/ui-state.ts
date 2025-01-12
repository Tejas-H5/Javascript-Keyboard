import { TimelineItem } from "./sequencer-state";

export type AppView = "startup" | "chart-select" | "play-chart" | "edit-chart";
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
        sidebarOpen: boolean;
        lastCursorStart: number;
        lastCursorDivisor: number;
    }

    playView: {
        isTesting: boolean;
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
            sidebarOpen: false,
            lastCursorStart: 0,
            lastCursorDivisor: 0,
        },

        playView: {
            isTesting: false,
        }
    };
}
