import { newChart, SequencerChart, TimelineItem } from "src/state/sequencer-chart";
import { GameplayState } from "src/views/gameplay";
import { SequencerChartMetadata } from "./chart-repository";
import { arrayAt } from "src/utils/array-utils";
import { AsyncData, newAsyncData } from "src/utils/promise-utils";

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
    availableChartsInvalidated: boolean;
    idx: number;

    currentChart: AsyncData<SequencerChart>;
    currentChartLoadingId: number | null;
}

export function getCurrentChartMetadata(state: ChartSelectState): SequencerChartMetadata | null {
    return arrayAt(state.availableCharts, state.idx) ?? null;
}

export type EditViewState = {
    lastCursor: number;
    chartSaveTimerSeconds: number;
}

// These operations all specifically require us to input a new name
export const NAME_OPERATION_COPY   = 1;
export const NAME_OPERATION_RENAME = 2;
export const NAME_OPERATION_CREATE = 3;

export type OperationType 
    = typeof NAME_OPERATION_COPY
    | typeof NAME_OPERATION_RENAME
    | typeof NAME_OPERATION_CREATE;

export type UpdateModalState = {
    message:       string;
    operation:     OperationType;
    chartToUpdate: SequencerChart;
    newName:       string;
    
    updateResult: AsyncData<boolean>;
};

export type LoadSaveState = {
    saveStateTimeout: number;
    modal: {
        _open: boolean;
        isRenaming: boolean;
        helpEnabled: boolean;
        chartBeforeOpen: SequencerChart | null;
    }
};

// NOTE: there is no reason why this can't just be on GlobalContext directly.
// TODO: do this
export type UIState = {
    currentView: AppView;
    // TODO: deprecate
    chartSelect: ChartSelectState;
    loadSave: LoadSaveState;
    updateModal: UpdateModalState | null;
    copied: {
        items: TimelineItem[];
        positionStart: number;
    }
    editView: EditViewState;
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
            availableChartsInvalidated: false,
            idx: 0,
            currentChart: newAsyncData("", async () => newChart("First chart")),
            currentChartLoadingId: null,
        },

        loadSave: {
            saveStateTimeout: 0,

            modal: {
                helpEnabled: false,
                isRenaming: false,
                _open: false,
                chartBeforeOpen: null,
            }
        },

        updateModal: null,

        copied: {
            positionStart: 0,
            items: [],
        },

        editView: {
            lastCursor: 0,
            chartSaveTimerSeconds: -1,
        },

        playView: {
            result: null,
        }
    };

    return s;
}
