export const IS_PROD = import.meta.env.IS_PROD;

export const ON_EVERYWHERE = 1;
export const ON = IS_PROD ? 0 : 1;
export const OFF = 0;

type Flag = 0 | 1;

export function getSpeed(val: number) {
    if (IS_PROD) return 1;
    return val;
}

export type DebugFlags = {
    testEditView: Flag;
    testLoadSave: Flag;

    testEditViewExport: Flag;
    testEditViewImport: Flag;
    testCopyModal: Flag;
    testChart: string;
    debuUndoBuffer: Flag;
    testChartSelectView: Flag;
    testPracticeMode: Flag;

    testGameplay: Flag;
    testGameplaySpeed: number;
    testResultsView: Flag;

    testFixDatabase: Flag;

    testSoundLab: Flag;
    testSoundLabEditingKeyboardConfig: Flag;
    testSoundLabAllEffectRackEffects: Flag;
    testSoundLabLoadPreset: string;

    testAsync: Flag;
    testAsyncALittle: Flag;

    testUnitTests: Flag;
};

export const debugFlags: DebugFlags = {
    testEditView: OFF,
    testLoadSave: OFF,

    testEditViewExport:  OFF,
    testEditViewImport:  OFF,
    testCopyModal:       OFF,
    debuUndoBuffer:      OFF,
    testChartSelectView: OFF,

    testGameplay:      ON,
    testGameplaySpeed: getSpeed(1),
    testPracticeMode:  OFF,
    testResultsView:   OFF,

    testChart:           "Snarky puppy we like it here",

    testFixDatabase: OFF,

    testSoundLab: OFF,
    testSoundLabEditingKeyboardConfig: OFF,
    testSoundLabAllEffectRackEffects: OFF,
    testSoundLabLoadPreset: "edm pluck 4",

    testAsync: OFF,
    testAsyncALittle: OFF,

    testUnitTests: OFF,
};

// You're welcome
(window as any).debugFlags = debugFlags;
