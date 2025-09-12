import { newChart, SequencerChart, TimelineItem } from "src/state/sequencer-chart";
import { GameplayState, newGameplayState } from "src/views/gameplay";
import { newKeyboardState } from "./keyboard-state";

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

export type UIState = {
    currentView: AppView;

    chartSelect: {
        // A sorted lists of charts
        loadedCharts: SequencerChart[];
        idx: number;
    },

    loadSave: {
        saveStateTimeout: number;

        modal: {
            open: boolean;
            idx: number;
            isRenaming: boolean;
        }
    }

    copied: {
        items: TimelineItem[];
        positionStart: number;
    }

    editView: {
        lastCursorStart: number;
        lastCursorDivisor: number;
    }

    playView: {
        isTesting: boolean;
        result: GameplayState | null;
    }
};

export function newUiState(): UIState {
    const s: UIState = {
        // NOTE: program breaks if we don't start from here
        currentView: APP_VIEW_STARTUP,

        chartSelect: {
            loadedCharts: [],
            idx: 0,
        },

        loadSave: {
            saveStateTimeout: 0,

            modal: {
                isRenaming: false,
                open: false,
                idx: 0,
            }
        },

        copied: {
            positionStart: 0,
            items: [],
        },

        editView: {
            lastCursorStart: 0,
            lastCursorDivisor: 0,
        },

        playView: {
            isTesting: false,
            result: null,
        }
    };

    return s;
}
