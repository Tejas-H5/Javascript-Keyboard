import { newChart, SequencerChart, TimelineItem, undoEdit } from "src/state/sequencer-chart";
import { GameplayState } from "src/views/gameplay";
import { SequencerChartMetadata } from "./chart-repository";
import { newDefaultTrackedPrimise, TrackedPromise } from "src/utils/promise-utils";
import { GlobalContext } from "src/views/app";
import { UnitTestsState } from "./unit-tests";

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
    currentChartMeta: SequencerChartMetadata | null;

    currentChart: TrackedPromise<void>;
    currentChartLoadingId: number | null;
}

export function getCurrentChartMetadata(ctx: GlobalContext): SequencerChartMetadata | null {
    return ctx.ui.chartSelect.currentChartMeta;
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
    
    updateResult: TrackedPromise<boolean>;
};

export type LoadSaveState = {
    saveStateTimeout: number;
    modal: {
        _open: boolean;
        isRenaming: boolean;
        helpEnabled: boolean;
        chartBeforeOpenMeta: SequencerChartMetadata | null;
    }
};

// NOTE: there is no reason why this can't just be on GlobalContext directly.
// TODO: do this
export type UIState = {
    currentView: AppView;
    chartSelect: ChartSelectState;
    loadSave: LoadSaveState;
    copied: {
        items: TimelineItem[];
        positionStart: number;
    }
    editView: EditViewState;
    playView: {
        result: GameplayState | null;
        isTesting: boolean;
    },

    // TODO: only one modal open at a time.
    updateModal: UpdateModalState | null;
    unitTestModal: UnitTestsState | null;
};

export function newUiState(): UIState {
    const s: UIState = {
        // NOTE: program breaks if we don't start from here
        currentView: APP_VIEW_STARTUP,

        chartSelect: {
            loading: false,
            loadCounter: 0,

            // actually used to track our position in the list
            currentChartMeta: null, 
            currentChart: newDefaultTrackedPrimise(undefined),
            currentChartLoadingId: null,
        },

        loadSave: {
            saveStateTimeout: 0,

            modal: {
                helpEnabled: false,
                isRenaming: false,
                _open: false,
                chartBeforeOpenMeta: null,
            }
        },

        updateModal: null,
        unitTestModal: null,

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
            isTesting: false,
        }
    };

    return s;
}
