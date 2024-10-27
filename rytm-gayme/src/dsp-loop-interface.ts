import { newFunctionUrl } from "src/utils/web-workers";
import { MusicNote } from "src/utils/music-theory-utils";
import { DspInfo, DspLoopMessage, DSPPlaySettings, registerDspLoopClass } from "./dsp-loop";
import { getAllSamples } from "./samples";

// NOTE: contains cyclic references, so it shouldn't be serialized.
export type ScheduledKeyPress = {
    time: number;
    // Used to know which keyboard key is being played by the DSP.
    keyId: number;

    pressed: boolean;
    noteIndex?: number;
    sample?: string;
}

const audioCtx = new AudioContext()
const playSettings: DSPPlaySettings = {
    attack: 0.01,
    decay: 0.5,
    sustainVolume: 0.5,
    sustain: 0.25,
};
let dspPort: MessagePort | undefined;
const dspInfo: DspInfo = { 
    currentlyPlaying: [],
    scheduledPlaybackTime: 0,
};

function unreachable() {
    throw new Error("Unreachable code in dsp interface!");
}

export function updatePlaySettings(fn: (s: DSPPlaySettings) => void) {
    fn(playSettings);
    audioLoopDispatch({ playSettings });
}

export function getDspInfo() {
    return dspInfo;
}

export function getInfoBlock(id: number): [number, number] | undefined {
    return dspInfo.currentlyPlaying.find(b => b[0] === id);
}

// This thing gets overwritten very frequently every second, but we probably want our ui to update instantly and not
// within 1/10 of a second. this compromise is due to an inability to simply pull values from the dsp loop as needed - 
// instead, the dsp loop has been configured to push it's relavant state very frequently. SMH.
function getOrMakeInfoBlock(id: number): [number, number] {
    const block = getInfoBlock(id);
    if (block) return block;
    const b: [number, number] = [id, 0];
    dspInfo.currentlyPlaying.push(b);
    return b;
}

export function setCurrentOscillatorGain(id: number, value: number) {
    const block = getOrMakeInfoBlock(id);
    block[1] = value;
}
export function getCurrentOscillatorGain(id: number): number {
    const block = getInfoBlock(id);
    if (!block) {
        return 0;
    }
    return block[1];
}

export const currentPressedNoteIndexes = new Set<number>();

export function pressKey(noteIndex: number, note: MusicNote) {
    resumeAudio();

    setCurrentOscillatorGain(noteIndex, 1);

    if (note.sample) {
        audioLoopDispatch({ playSample: [noteIndex, { sample: note.sample }] })
    } else if (note.noteIndex) {
        currentPressedNoteIndexes.add(note.noteIndex);
        audioLoopDispatch({ setOscilatorSignal: [noteIndex, { noteIndex, signal: 1 }] })
    } else {
        unreachable();
    }
}

export function releaseKey(noteIndex: number, note: MusicNote) {
    if (note.sample) {
        // do nothing
    } else if (note.noteIndex) {
        currentPressedNoteIndexes.delete(note.noteIndex);
        audioLoopDispatch({ setOscilatorSignal: [noteIndex, { noteIndex: note.noteIndex, signal: 0 }] })
    }
}

export function schedulePlayback(presses: ScheduledKeyPress[]) {
    console.log("scheduling playback", presses);
    resumeAudio();
    audioLoopDispatch({ scheduleKeys: presses });
}

export function releaseAllKeys() {
    audioLoopDispatch({ clearAllOscilatorSignals: true });
}

// // TODO: better name
// export function releasePressedKeysBasedOnDuration(flatKeys: InstrumentKey[]) {
//     for (const key of flatKeys) {
//         if (key.remainingDuration > 0) {
//             key.remainingDuration -= 1;
//         }
//
//         if (key.remainingDuration === 0) {
//             releaseKey(key);
//         }
//     }
// }
//
function areDifferent(a: [number, number][], b: [number, number][]): boolean {
    if (a.length !== b.length) {
        return true;
    }

    for (let i = 0; i < a.length; i++) {
        if (a[i][0] !== b[i][0]) {
            return true;
        }

        if (a[i][1] !== b[i][1]) {
            return true;
        }
    }

    return false;
}

export function audioLoopDispatch(message: DspLoopMessage) {
    if (!dspPort) {
        return;
    }

    dspPort.postMessage(message);
}

function resumeAudio() {
    // the audio context can only be started in response to a user gesture.
    audioCtx.resume().catch(console.error);
}

export async function initDspLoopInterface({
    render
}: {
    render(): void;
}) {
    // registers the DSP loop. we must communicate with this thread through a Port thinggy
    const url = newFunctionUrl([], registerDspLoopClass, {
        includeEsBuildPolyfills: true
    });
    await audioCtx.audioWorklet.addModule(url);
    // URL.revokeObjectURL(url);
    const dspLoopNode = new AudioWorkletNode(audioCtx, "dsp-loop");
    dspLoopNode.onprocessorerror = (e) => {
        console.error("dsp process error:", e);
    }
    dspLoopNode.connect(audioCtx.destination);
    dspPort = dspLoopNode.port;

    // TODO: check if memory leak
    // but yeah this will literally create a new array and serialize it over
    // some port several times a second just so we know what the current
    // 'pressed' state of one of the notes is.
    const frequency = 1000 / 20;
    // const frequency = 1000 / 60; //  too much cpu heat 
    // TODO: just linearly animate the current 'opacity' of a key so we can reduce poll rate even further.
    setInterval(() => {
        audioLoopDispatch(1337);
    }, frequency);

    // sync initial settings.
    updatePlaySettings(() => { });
    audioLoopDispatch({ setAllSamples: getAllSamples() });

    dspPort.onmessage = ((e) => {
        const data = e.data as Partial<DspInfo>;

        let rerender = false;
        if (
            data.currentlyPlaying
            && areDifferent(dspInfo.currentlyPlaying, data.currentlyPlaying)
        ) {
            dspInfo.currentlyPlaying = data.currentlyPlaying;
            rerender = true;
        }

        if (data.scheduledPlaybackTime) {
            dspInfo.scheduledPlaybackTime = data.scheduledPlaybackTime;
            rerender = true;
        }

        if (rerender) {
            render();
        }
    });
}

