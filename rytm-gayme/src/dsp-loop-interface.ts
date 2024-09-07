import { DspInfo, DspLoopEventNotification, DspLoopMessage, DSPPlaySettings } from "./dsp-loop";
import { InstrumentKey } from "./state";
import { getNoteFrequency } from "./utils/music-theory-utils";
import dspLoopWorkerUrl from "./dsp-loop.ts?worker&url";

function unreachable() {
    throw new Error("Unreachable code in dsp interface!");
}

const playSettings: DSPPlaySettings = {
    attack: 0.01,
    decay: 0.5,
    sustainVolume: 0.5,
    sustain: 0.25,
};

export function updatePlaySettings(fn: (s: DSPPlaySettings) => void) {
    fn(playSettings);
    audioLoopDispatch({ playSettings });
}

let dspPort: MessagePort | undefined;
const dspInfo: DspInfo = { currentlyPlaying: [] };

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

export function pressKey(k: InstrumentKey) {
    resumeAudio();

    setCurrentOscillatorGain(k.index, 1);

    if (k.musicNote.sample) {
        audioLoopDispatch({ playSample: [k.index, { sample: k.musicNote.sample }] })
    } else if (k.musicNote.noteIndex) {
        const frequency = getNoteFrequency(k.musicNote.noteIndex);
        audioLoopDispatch({ setOscilatorSignal: [k.index, { frequency, signal: 1 }] })
    } else {
        unreachable();
    }
}

export function releaseKey(k: InstrumentKey) {
    if (k.musicNote.sample) {
        // do nothing
    } else if (k.musicNote.noteIndex) {
        const frequency = getNoteFrequency(k.musicNote.noteIndex);
        audioLoopDispatch({ setOscilatorSignal: [k.index, { frequency, signal: 0 }] })
    }
}

// TODO: this shouldn't require any inputs. the dsp knows what keys are currently held.
export function releaseAllKeys(flatKeys: InstrumentKey[]) {
    for (const key of flatKeys) {
        releaseKey(key);
    }
}

// TODO: better name
export function releasePressedKeysBasedOnDuration(flatKeys: InstrumentKey[]) {
    for (const key of flatKeys) {
        if (key.remainingDuration > 0) {
            key.remainingDuration -= 1;
        }

        if (key.remainingDuration === 0) {
            releaseKey(key);
        }
    }
}

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


const audioCtx = new AudioContext()

export async function initDspLoopInterface({
    onCurrentPlayingChanged
}: {
    onCurrentPlayingChanged(): void;
}) {
    // registers the DSP loop. we must communicate with this thread through a Port thinggy
    await audioCtx.audioWorklet.addModule(dspLoopWorkerUrl);
    const dspLoopNode = new AudioWorkletNode(audioCtx, "dsp-loop");
    dspLoopNode.onprocessorerror = (e) => {
        console.error("dsp process error:", e);
    }
    dspLoopNode.connect(audioCtx.destination);

    dspPort = dspLoopNode.port;

    // I'm surprized this isn't a memory leak...
    // but yeah this will literally create a new array and serialize it over
    // some port several times a second just so we know what the current
    // 'pressed' state of one of the notes is.
    const frequency = 1000 / 20;
    // const frequency = 1000 / 60; //  too much cpu heat 
    setInterval(() => {
        audioLoopDispatch(1337);
    }, frequency);

    // sync initial settings.
    updatePlaySettings(() => { });

    dspPort.onmessage = ((e) => {
        const data = e.data as DspLoopEventNotification;
        if (data.currentlyPlaying) {
            if (areDifferent(dspInfo.currentlyPlaying, data.currentlyPlaying)) {
                dspInfo.currentlyPlaying = data.currentlyPlaying;
                onCurrentPlayingChanged();
            }
        }
    });
}

