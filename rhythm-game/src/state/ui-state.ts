import { SequencerChart, TimelineItem } from "src/state/sequencer-chart";
import { GameplayState } from "src/views/gameplay";
import { SequencerChartMetadata } from "./chart-repository";

export const APP_VIEW_STARTUP = 1;
export const APP_VIEW_CHART_SELECT = 2;
export const APP_VIEW_PLAY_CHART = 3;
export const APP_VIEW_EDIT_CHART = 4;
export const APP_VIEW_SOUND_LAB = 5;

export type AppView = typeof APP_VIEW_STARTUP |
    typeof APP_VIEW_CHART_SELECT |
    typeof APP_VIEW_PLAY_CHART |
    typeof APP_VIEW_EDIT_CHART |
    typeof APP_VIEW_SOUND_LAB;

export type ChartSelectState = {
    loading: boolean;
    loadCounter: number;

    availableCharts: SequencerChartMetadata[];
    idx: number;

    // Needs to be loaded in
    currentChart: SequencerChart | null;
}

export type UIState = {
    currentView: AppView;

    chartSelect: ChartSelectState;

    loadSave: {
        saveStateTimeout: number;

        modal: {
            open: boolean;
            isRenaming: boolean;
        }
    }

    copied: {
        items: TimelineItem[];
        positionStart: number;
    }

    editView: {
        lastCursor: number;
    }

    playView: {
        result: GameplayState | null;
    }
};

export function newUiState(): UIState {
    const s: UIState = {
        // NOTE: program breaks if we don't start from here
        currentView: APP_VIEW_STARTUP,

        chartSelect: {
            loading: false,
            loadCounter: 0,

            availableCharts: [],
            idx: 0,
            currentChart: null,
        },

        loadSave: {
            saveStateTimeout: 0,

            modal: {
                isRenaming: false,
                open: false,
            }
        },

        copied: {
            positionStart: 0,
            items: [],
        },

        editView: {
            lastCursor: 0,
        },

        playView: {
            result: null,
        }
    };

    return s;
}
