import { debugFlags } from "src/debug-flags";
import { DspInfo, DspLoopMessage, DSPPlaySettings, newDspPlaySettings, getDspLoopClassUrl } from "./dsp-loop";
import { compileEffectRack, newEffectRackEnvelope, newEffectRackItem, newEffectRackMaths, newEffectRackMathsItemCoefficient, newEffectRackMathsItemTerm, newEffectRackNoise, newEffectRackOscillator, newEffectRackSwitch } from "./dsp-loop-effect-rack";

// NOTE: contains cyclic references, so it shouldn't be serialized.
export type ScheduledKeyPress = {
    time: number;
    // Used to know which keyboard key is being played by the DSP.
    keyId: number;
    timeEnd: number;
    noteId: number;
}

const audioCtx = new AudioContext()

const playSettings = newDspPlaySettings();
// init play settings
{
    const rack = playSettings.parameters.rack;

    // Good default
    const osc = newEffectRackOscillator();
    rack.effects.push(newEffectRackItem(osc));

    const env = newEffectRackEnvelope();
    rack.effects.push(newEffectRackItem(env));


    // Rest are for testing purposes
    if (
        debugFlags.testSoundLab &&
        debugFlags.testSoundLabAllEffectRackEffects
    ) {
        const maths = newEffectRackMaths();
        rack.effects.push(newEffectRackItem(maths));
        {
            const term = newEffectRackMathsItemTerm();
            maths.terms.push(term);
            term.coefficients.push(newEffectRackMathsItemCoefficient());
            term.coefficients.push(newEffectRackMathsItemCoefficient());
        }
        {
            const term = newEffectRackMathsItemTerm();
            maths.terms.push(term);
            term.coefficients.push(newEffectRackMathsItemCoefficient());
            term.coefficients.push(newEffectRackMathsItemCoefficient());
        }

        rack.effects.push(newEffectRackItem(newEffectRackSwitch()));
        rack.effects.push(newEffectRackItem(newEffectRackNoise()));
    }

    compileEffectRack(rack);
}


let dspPort: MessagePort | undefined;
const dspInfo: DspInfo = { 
    currentlyPlaying: [],
    scheduledPlaybackTime: 0,
    isPaused: false,
    sampleRate: 1,
};
let scheduledVolume = 1;
let scheduledSpeed = 1;

function unreachable() {
    throw new Error("Unreachable code in dsp interface!");
}

function noOp() {};

export function updatePlaySettings(fn: (s: DSPPlaySettings) => void = noOp) {
    fn(playSettings);
    audioLoopDispatch({ playSettings });
}

export function getCurrentPlaySettings() {
    return playSettings;
}

export function setPlaybackVolume(value: number) {
    scheduledVolume = value;
    audioLoopDispatch({ scheduleKeysVolume: value });
}

export function setPlaybackSpeed(value: number) {
    scheduledSpeed = value;
    audioLoopDispatch({ scheduleKeysSpeed: value });
}

export function getPlaybackSpeed(): number {
    return scheduledSpeed;
}

export function setPlaybackTime(value: number) {
    audioLoopDispatch({ newPlaybackTime: value });
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
export function getCurrentOscillatorGainForOwner(id: number, owner: number): number {
    const block = getInfoBlock(id);
    if (!block) return 0;

    const [,gain, blockOwner] = block;
    if (blockOwner !== owner) return 0;

    return gain;
}

export function isAnythingPlaying() {
    const info = getDspInfo();
    return info.currentlyPlaying.some(block => block[1] > 0 && block[2] === 0);
}

const pressedKeys = new Set<number>();

export function isKeyPressed(keyId: number) {
    return pressedKeys.has(keyId);
}

// we keep forgetting to ignore repeats, so I've made it an argument to this method.
export function pressKey(keyId: number, noteId: number, isRepeat: boolean) {
    if (isRepeat) {
        return false;
    }

    resumeAudio();

    pressedKeys.add(keyId);

    // pull-push cache.
    // gameplay code also relies on these values updating as soon as we press the key, rather
    // than waiting for the oscilator messaging port round-trip
    setCurrentOscillatorGain(keyId, 1);

    audioLoopDispatch({ setOscilatorSignal: [keyId, { noteId: noteId, signal: 1 }] })
}

export function releaseKey(keyId: number, noteId: number) {
    audioLoopDispatch({ setOscilatorSignal: [keyId, { noteId: noteId, signal: 0 }] })
    pressedKeys.delete(keyId);
}

export function schedulePlayback(presses: ScheduledKeyPress[]) {
    resumeAudio();
    audioLoopDispatch({ scheduleKeys: presses });
}

export function releaseAllKeys() {
    audioLoopDispatch({ clearAllOscilatorSignals: true });
    pressedKeys.clear();
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
    const url = getDspLoopClassUrl();
    await audioCtx.audioWorklet.addModule(url);
    // URL.revokeObjectURL(url);
    const dspLoopNode = new AudioWorkletNode(audioCtx, "dsp-loop");
    dspLoopNode.onprocessorerror = (e) => {
        const message = e.message;
        console.error("dsp process error:", message, e);
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

    dspPort.onmessage = ((e) => {
        const data = e.data as Partial<DspInfo>;

        let rerender = false;
        if (
            data.currentlyPlaying
            && !areEqual(dspInfo.currentlyPlaying, data.currentlyPlaying)
        ) {
            console.log(dspInfo.currentlyPlaying);
            dspInfo.currentlyPlaying = data.currentlyPlaying;
            rerender = true;
        }

        if (data.scheduledPlaybackTime !== undefined) {
            dspInfo.scheduledPlaybackTime = data.scheduledPlaybackTime;
            rerender = true;
        }

        if (data.isPaused !== undefined) {
            dspInfo.isPaused = data.isPaused;
        }

        if (data.sampleRate !== undefined) {
            dspInfo.sampleRate = data.sampleRate;
        }

        if (rerender) {
            render();
        }
    });
}

