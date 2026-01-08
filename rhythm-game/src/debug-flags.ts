import { sleepForMs } from "./utils/promise-utils";

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
};

export const debugFlags: DebugFlags = {
    testEditView: OFF,
    testLoadSave: OFF,

    testEditViewExport:  OFF,
    testEditViewImport:  OFF,
    testCopyModal:       OFF,
    testChart:           "Good old days",
    debuUndoBuffer:      OFF,
    testChartSelectView: ON,

    testGameplay:      OFF,
    testGameplaySpeed: getSpeed(1),
    testPracticeMode:  OFF,
    testResultsView:   OFF,

    testFixDatabase: OFF,

    testSoundLab: ON,
    testSoundLabWaveEditor: ON,
    testSoundLabAllEffectRackEffects: ON,
    testSoundLabLoadPreset: "design",

    testAsync: OFF,
    testAsyncALittle: OFF,
};

// You're welcome
(window as any).debugFlags = debugFlags;

// NOTE: to test this correctly if at all, put the timeout _after_ something that might be a single API request
export function getTestSleepMs(f: DebugFlags): number {
    if (f.testAsync) return 100 + 1000 * Math.random();
    if (f.testAsyncALittle) return 10 + 100 * Math.random();
    return 0;
}

export async function sleepForAsyncTesting() {
    const testSleepMs = getTestSleepMs(debugFlags);
    await sleepForMs(testSleepMs);
}
