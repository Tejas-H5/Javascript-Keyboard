export const IS_PROD = import.meta.env.PROD;

const ON_EVERYWHERE = 1;
const ON = IS_PROD ? 0 : 1;
const OFF = 0;

type Flag = 0 | 1;

function getSpeed(val: number) {
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
    testSoundLabWaveEditor: Flag;
    testSoundLabAllEffectRackEffects: Flag;
    testSoundLabLoadPreset: string;

    testAsync: Flag;
    testAsyncALittle: Flag;

    testUnitTests: Flag;
};

export const debugFlags: DebugFlags = {
    testEditView: ON,
    testLoadSave: OFF,

    testEditViewExport:  OFF,
    testEditViewImport:  OFF,
    testCopyModal:       OFF,
    testChart:           "Geostationary orbit",
    debuUndoBuffer:      OFF,
    testChartSelectView: OFF,

    testGameplay:      OFF,
    testGameplaySpeed: getSpeed(1),
    testPracticeMode:  OFF,
    testResultsView:   OFF,

    testFixDatabase: OFF,

    testSoundLab: OFF,
    testSoundLabWaveEditor: ON,
    testSoundLabAllEffectRackEffects: OFF,
    testSoundLabLoadPreset: "edm pluck 4",

    testAsync: OFF,
    testAsyncALittle: OFF,

    testUnitTests: OFF,
};

// You're welcome
(window as any).debugFlags = debugFlags;
