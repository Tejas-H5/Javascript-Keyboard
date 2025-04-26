import { newFunctionUrl } from "src/utils/web-workers";
import { MusicNote } from "src/utils/music-theory-utils";
import { DspInfo, DspLoopMessage, DSPPlaySettings, registerDspLoopClass } from "./dsp-loop";
import { getAllSamples } from "src/samples/all-samples";

// NOTE: contains cyclic references, so it shouldn't be serialized.
export type ScheduledKeyPress = {
    time: number;
    // Used to know which keyboard key is being played by the DSP.
    keyId: number;

    timeEnd: number;
    noteIndex?: number;
    sample?: string;
}

const audioCtx = new AudioContext()
const playSettings: DSPPlaySettings = {
    attack: 0.01,
    decay: 0.5,
    sustainVolume: 0.5,
    sustain: 0.25,
    isUserDriven: false,
};
let dspPort: MessagePort | undefined;
const dspInfo: DspInfo = { 
    currentlyPlaying: [],
    scheduledPlaybackTime: 0,
    isPaused: false,
};
let scheduledVolume = 1;

function unreachable() {
    throw new Error("Unreachable code in dsp interface!");
}

export function updatePlaySettings(fn: (s: DSPPlaySettings) => void) {
    fn(playSettings);
    audioLoopDispatch({ playSettings });
}

export function setScheduledPlaybackVolume(value: number) {
    scheduledVolume = value;
    audioLoopDispatch({ scheduleKeysVolume: value });
}

export function getDspInfo() {
    return dspInfo;
}

export function getInfoBlock(id: number): [number, number, number] | undefined {
    return dspInfo.currentlyPlaying.find(b => b[0] === id);
}

// This thing gets overwritten very frequently every second, but we probably want our ui to update instantly and not
// within 1/10 of a second. this compromise is due to an inability to simply pull values from the dsp loop as needed - 
// instead, the dsp loop has been configured to push it's relavant state very frequently. SMH.
function getOrMakeInfoBlock(id: number): [number, number, number] {
    const block = getInfoBlock(id);
    if (block) return block;
    const b: [number, number, number] = [id, 0, 0];
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

// 0 -> user. 
// 1 -> Not implement yet, but  it will be (track_idx + 1) - you'll need to do id - 1 to get the track index
export function getCurrentOscillatorOwner(id: number): number {
    const block = getInfoBlock(id);
    if (!block) {
        return 0;
    }
    return block[2];
}

// we keep forgetting to ignore repeats, so I've made it an argument to this method.
export function pressKey(id: number, note: MusicNote, isRepeat: boolean) {
    if (isRepeat) {
        return false;
    }

    resumeAudio();

    setCurrentOscillatorGain(id, 1);

    if (note.sample) {
        audioLoopDispatch({ playSample: [id, { sample: note.sample }] })
    } else if (note.noteIndex) {
        audioLoopDispatch({ setOscilatorSignal: [id, { noteIndex: note.noteIndex, signal: 1 }] })
    } else {
        unreachable();
    }
}

export function releaseKey(noteIndex: number, note: MusicNote) {
    if (note.sample) {
        // do nothing
    } else if (note.noteIndex) {
        audioLoopDispatch({ setOscilatorSignal: [noteIndex, { noteIndex: note.noteIndex, signal: 0 }] })
    }
}

export function schedulePlayback(presses: ScheduledKeyPress[]) {
    resumeAudio();
    audioLoopDispatch({ scheduleKeys: presses });
}

export function releaseAllKeys() {
    audioLoopDispatch({ clearAllOscilatorSignals: true });
}

function areEqual(a: [number, number, number][], b: [number, number, number][]): boolean {
    if (a.length !== b.length) {
        return false;
    }

    for (let i = 0; i < a.length; i++) {
        for (let j = 0; j < a[i].length; j++) {
            if (a[i][j] !== b[i][j]) {
                return false;
            }
        }
    }

    return true;
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
            && !areEqual(dspInfo.currentlyPlaying, data.currentlyPlaying)
        ) {
            dspInfo.currentlyPlaying = data.currentlyPlaying;
            rerender = true;
        }

        if (data.scheduledPlaybackTime !== undefined) {
            dspInfo.scheduledPlaybackTime = data.scheduledPlaybackTime;
            rerender = true;
        }

        if (data.isPaused !== undefined && data.isPaused !== dspInfo.isPaused) {
            dspInfo.isPaused = data.isPaused;
        }

        if (rerender) {
            render();
        }
    });
}

