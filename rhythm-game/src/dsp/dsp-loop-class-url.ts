import { newFunctionUrl } from "src/utils/web-workers";

import * as dspLoopEffectRack from "./dsp-loop-effect-rack";
import * as dspLoop from "./dsp-loop";
import * as random from "src/utils/random";
import * as assertions from "src/utils/assert";
import * as math from "src/utils/math-utils";
import * as music from "src/utils/music-theory-utils";
import * as turnBasedWaves from "src/utils/turn-based-waves";
import * as arrayUtils from "src/utils/array-utils";

import {
    DspLoopMessage,
    dspProcess,
    dspReceiveMessage,
    DspState,
    getMessageForMainThread,
    newDspState
} from "./dsp-loop";

let lastUrl: string = "";
export function getDspLoopClassUrl(): string {
    if (lastUrl) {
        return lastUrl;
    }

    // Every single dependency must be injected here manually, so that the worker url has access to everything it needs.
    // (I want the entire web-app to be a single HTML file that can be easily saved, at any cost)


    // BTW: https://codeberg.org/uzu/strudel/src/branch/main/packages/vite-plugin-bundle-audioworklet/vite-plugin-bundle-audioworklet.js
    // xd. Didnt know you could do that. I cannot be bothered now. Maybe later

    // NOTE: we know about new Worker(new URL('./worker.js', import.meta.url), { type: 'module' }),
    // but I have set a goal to make the entire website, at least the final build, to fit into a SINGLE HTML PAGE.
    // That way you can just download it and run it locally.

    lastUrl = newFunctionUrl([
        dspLoopEffectRack,
        dspLoop,
        random,
        assertions,
        math, 
        music,
        turnBasedWaves,
        arrayUtils,
    ], [
    ], function register() {

        // @ts-expect-error sampleRate is in audio-worklet global sclop
        let _sampleRate = sampleRate;

        // @ts-expect-error - AudioWorkletProcessor
        class DSPLoop extends AudioWorkletProcessor {
            s: DspState = newDspState(_sampleRate);

            constructor() {
                super();
                this.s.sampleRate = _sampleRate;

                // @ts-expect-error this.port is valid on AudioWorkletProcessor
                this.port.onmessage = (e) => {
                    this.onMessage(e.data);
                };
            }

            process(
                _inputs: Float32Array[][],
                outputs: Float32Array[][],
                _parameters: Record<string, Float32Array>
            ) {
                const s = this.s;

                const result = dspProcess(s, outputs);

                // if we pressed keys, we should send a message about s back to the main thread,
                // so that the UI will update accordingly. It's not so important for when we release things though.
                if (s.trackPlayback.shouldSendUiUpdateSignals) {
                    s.trackPlayback.shouldSendUiUpdateSignals = false;
                    this.sendCurrentPlayingMessageBack(false);
                }

                return result;
            }

            // This is expensive, so don't call too often
            sendCurrentPlayingMessageBack(signals = true) {
                const payload = getMessageForMainThread(this.s, signals);

                // @ts-expect-error this.port is valid on AudioWorkletProcessor
                const port = this.port;

                port.postMessage(payload);
            }

            onMessage(e: DspLoopMessage) {
                if (e === 1337) {
                    this.sendCurrentPlayingMessageBack();
                    return;
                }

                dspReceiveMessage(this.s, e);
            }
        }

        // @ts-expect-error registerProcessor is in audio-worklet global sclop
        registerProcessor("dsp-loop", DSPLoop);
    }, {
        includeEsBuildPolyfills: true
    });

    return lastUrl;
}
