import { TimelineItem } from "src/views/chart";

export const APP_VIEW_STARTUP = 1;
export const APP_VIEW_CHART_SELECT = 2;
export const APP_VIEW_PLAY_CHART = 3;
export const APP_VIEW_EDIT_CHART = 4;

export type AppView = typeof APP_VIEW_STARTUP |
    typeof APP_VIEW_CHART_SELECT |
    typeof APP_VIEW_PLAY_CHART |
    typeof APP_VIEW_EDIT_CHART;

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
        currentView: APP_VIEW_STARTUP,

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
