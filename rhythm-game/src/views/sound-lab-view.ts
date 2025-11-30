import { imBeginCanvasRenderingContext2D, imEndCanvasRenderingContext2D } from "src/components/canvas2d";
import {
    BLOCK,
    COL,
    imFlex,
    imJustify,
    imLayout,
    imLayoutEnd,
    imSize,
    NA,
    PERCENT,
    ROW
} from "src/components/core/layout";
import { imLine, LINE_VERTICAL } from "src/components/im-line";
import { imRangeSlider } from "src/components/range-slider";
import { debugFlags } from "src/debug-flags";
import { dspProcess, dspReceiveMessage, DspState, newDspState } from "src/dsp/dsp-loop";
import { getCurrentPlaySettings, getDspInfo, pressKey, updatePlaySettings } from "src/dsp/dsp-loop-interface";
import { getKeyForKeyboardKey } from "src/state/keyboard-state";
import { newArray } from "src/utils/array-utils";
import { assert } from "src/utils/assert";
import { fft, resizeNumberArrayPowerOf2 } from "src/utils/fft";
import {
    getRenderCount,
    ImCache,
    imIf,
    imIfEnd,
    imMemo,
    imState
} from "src/utils/im-core";
import { imStr } from "src/utils/im-dom";
import { derivative } from "src/utils/math-utils";
import { GlobalContext, setViewChartSelect } from "./app";
import { imKeyboard } from "./keyboard";
import { imWaveProgramEditor, imWaveProgramPreview, newWaveProgramEditorState, WaveProgramEditorState } from "./sound-lab-wave-program-editor";
import { getCurrentTheme } from "./styling";
import { drawSamples, newPlotState } from "./plotting";
import { compileInstructions, fixInstructions } from "src/dsp/dsp-loop-instruction-set";
import { EffectRackEditorState, imEffectRackEditor, newEffectRackEditorState } from "./sound-lab-effect-rack-editor";
import { compileEffectsRack } from "src/dsp/dsp-loop-effect-rack";

export type SoundLabState = {
    dsp: DspState;
    allSamples: number[]
    allSamplesStartIdx: number;
    allSamplesWindowLength: number;
    allSamplesVisibleStart: number;
    allSamplesVisibleEnd: number;
    frequenciesStartIdx: number;
    frequenciesLength: number;
    signalFftWindow: number[];
    derivative: number[];
    frequenciesReal: number[];
    frequenciesIm: number[];
    frequenciesReal2: number[];
    frequenciesIm2: number[];
    frequencies: number[];
    frequencies2: number[];
    autoPan: boolean;
    // This is just the format that the audo worker script needs to output.
    // [output(? not sure)][channel][sample] I think
    output: [[Float32Array]]; 

    isEditingInstructions: boolean;
    waveProgramEditorLegacy: WaveProgramEditorState;
    effectRackEditor: EffectRackEditorState;
}

function newSoundLabState(): SoundLabState {
    return {
        dsp: newDspState(44800),
        allSamples: [0],
        allSamplesStartIdx: 0,
        allSamplesWindowLength: 5000,
        allSamplesVisibleStart: 0,
        allSamplesVisibleEnd: 0,
        frequenciesStartIdx: 0,
        frequenciesLength: 500,
        signalFftWindow: [0],
        derivative: [0],
        frequenciesReal: [0],
        frequenciesIm: [0],
        frequenciesReal2: [0],
        frequenciesIm2: [0],
        frequencies: [0],
        frequencies2: [0],
        autoPan: true,
        output: [[new Float32Array()]],

        isEditingInstructions: !!debugFlags.testSoundLabWaveEditor,
        waveProgramEditorLegacy: newWaveProgramEditorState(), 
        effectRackEditor: newEffectRackEditorState(),
    };
}

export function imSoundLab(c: ImCache, ctx: GlobalContext) {
    const MIN_ZOOM = 100;

    const state = imState(c, newSoundLabState);
    if (imMemo(c, state.waveProgramEditorLegacy.instructionsVersion)) {
        const settings = getCurrentPlaySettings();
        const waveProgram = state.waveProgramEditorLegacy.waveProgram;
        fixInstructions(waveProgram.instructions);
        compileInstructions(waveProgram.instructions, settings.parameters.instructions);
        updatePlaySettings();
    }

    if (imMemo(c, state.effectRackEditor.version)) {
        const settings = getCurrentPlaySettings();
        const rack = state.effectRackEditor.effectRack;
        compileEffectsRack(rack);

        // TODO: can make it more performant by updating just the specific register being edited
        // rather than the entire effect rack if we're editing a value in realtime
        
        settings.parameters.rack = rack;
        updatePlaySettings();
    }


    let soundPlayed = false;

    // The DSP we're running here is purely for visuals.
    // It is the exact same code that runs in the DSP loop, but in slow motion.
    // If we run it at full speed, we'll just generate way too many samples, and it's hard to see what's going on.
    const playbackFps = 240;
    const numSamples = Math.floor((1 / playbackFps) * state.dsp.sampleRate);

    const isPlaying = state.dsp.playingOscillators.length > 0;

    const info = getDspInfo();
    const sampleRate = info.sampleRate;
    const sampleRateChanged = imMemo(c, sampleRate);
    const infoCurrentlyPlaying = info.currentlyPlaying.length > 0;
    const infoCurrentlyPlayingChanged = imMemo(c, infoCurrentlyPlaying);

    if (
        sampleRateChanged ||
        soundPlayed ||
        infoCurrentlyPlayingChanged ||
        soundPlayed ||
        infoCurrentlyPlayingChanged
    ) {
        if (sampleRate !== 1) {
            if (infoCurrentlyPlayingChanged && infoCurrentlyPlaying) {
                // output[something idk what it is][channel][sample] lmao
                const outputSamples = new Float32Array(Math.max(MIN_ZOOM, numSamples));
                state.output = [[outputSamples]];

                state.dsp = newDspState(44800);
                state.dsp.sampleRate = sampleRate;
                dspReceiveMessage(state.dsp, {
                    playSettings: getCurrentPlaySettings(),
                });

                // divide by 2 bc of nyquist theorem
                const numFrequencies = Math.floor(sampleRate / 2);
                state.frequencies = newArray(numFrequencies, () => 0);
                state.frequenciesReal = newArray(numFrequencies, () => 0);
                state.frequenciesIm = newArray(numFrequencies, () => 0);
                state.allSamples.length = 0;
                state.derivative.length = 0;

                state.autoPan = true;
            }
        }
    }

    // compute one frame of the dsp 
    {
        for (const [keyId] of info.currentlyPlaying) {
            const key = ctx.keyboard.flatKeys[keyId];
            assert(key.index === keyId);

            dspReceiveMessage(state.dsp, {
                setOscilatorSignal: [keyId, {
                    noteId: key.noteId,
                    signal: 1
                }]
            });
        }

        for (const [id, osc] of state.dsp.playingOscillators) {
            if (!info.currentlyPlaying.find(block => block[0] === id)) {
                dspReceiveMessage(state.dsp, {
                    setOscilatorSignal: [id, {
                        noteId: osc.inputs.noteId,
                        signal: 0
                    }]
                });
            }
        }

        // Only step the DSP if we have things playing
        if (isPlaying && state.allSamples.length < 100_000) {
            dspProcess(state.dsp, state.output);

            const samples = state.output[0][0];
            for (const f of samples) {
                state.allSamples.push(f);
            }

            derivative(state.allSamples, state.derivative);
        }
    }

    imLayout(c, COL); imFlex(c); {
        if (imIf(c) && state.isEditingInstructions && 0) {
            imWaveProgramEditor(c, ctx, state.waveProgramEditorLegacy);
        } imIfEnd(c);

        if (imIf(c) && state.isEditingInstructions) {
            imEffectRackEditor(c, ctx, state.effectRackEditor);
        } imIfEnd(c);

        imLayout(c, COL); imFlex(c); {
            imLayout(c, ROW); imFlex(c); {
                imOscilloscope(c, state);

                imLine(c, LINE_VERTICAL, 10, 0);

                imWaveProgramPreview(c, ctx, state);
            } imLayoutEnd(c);
            imLayout(c, ROW); imJustify(c); imSize(c, 0, NA, 30, PERCENT); {
                imKeyboard(c, ctx);
            } imLayoutEnd(c);
        } imLayoutEnd(c);
    } imLayoutEnd(c);

    if (!ctx.handled) {
        if (ctx.keyPressState) {
            const { key, keyUpper, shiftPressed } = ctx.keyPressState;

            let handled = false;

            if (key === "Escape") {
                setViewChartSelect(ctx);
                handled = true;
            } else if (keyUpper === "E" && shiftPressed) {
                state.isEditingInstructions = !state.isEditingInstructions;
                handled = true;
            }

            if (!handled) {
                const instrumentKey = getKeyForKeyboardKey(ctx.keyboard, key);
                if (instrumentKey) {
                    if (!ctx.keyPressState.isRepeat) {
                        pressKey(instrumentKey.index, instrumentKey.noteId, ctx.keyPressState.isRepeat);
                        soundPlayed = true;
                    }
                    handled = true;
                }
            }

            if (handled) {
                ctx.keyPressState.e.preventDefault();
                ctx.keyPressState = null;
            }
        }
    }
}

function imOscilloscope(c: ImCache, state: SoundLabState) {
    const isNewFrame = imMemo(c, getRenderCount(c));

    const visibleStartChanged = imMemo(c, state.allSamplesVisibleStart);
    const visibleEndChanged = imMemo(c, state.allSamplesVisibleEnd);
    const numFrequencies = Math.min(state.allSamplesWindowLength, 1000);
    const numFrequenciesToView = Math.floor(numFrequencies / 2);
    // compute frequencies of what we're looking at
    if (visibleStartChanged || visibleEndChanged) {
        resizeNumberArrayPowerOf2(state.signalFftWindow, state.allSamplesWindowLength);
        for (let i = 0; i < state.allSamplesWindowLength; i++) {
            const idx = i + state.allSamplesStartIdx;
            if (idx >= state.allSamples.length) break;

            state.signalFftWindow[i] = state.allSamples[idx];
        }

        fft(state.signalFftWindow, state.frequenciesReal2, state.frequenciesIm2);

        for (let i = 0; i < numFrequenciesToView; i++) {
            const r = state.frequenciesReal[i];
            const im = state.frequenciesIm[i];
            const mag = Math.sqrt(r * r + im * im);
            state.frequencies[i] = mag;
        }

        for (let i = 0; i < numFrequenciesToView; i++) {
            const r = state.frequenciesReal2[i];
            const im = state.frequenciesIm2[i];
            const mag = Math.sqrt(r * r + im * im);
            state.frequencies2[i] = mag;
        }
    }

    imLayout(c, COL); imFlex(c); {
        imLayout(c, COL); imFlex(c); {
            imLayout(c, BLOCK); {
                imStr(c, "Waveform t=");
                imStr(c, (state.allSamplesStartIdx / state.dsp.sampleRate).toPrecision(3));
                imStr(c, " sample ");
                imStr(c, state.allSamplesStartIdx);
                imStr(c, " -> ");
                imStr(c, state.allSamplesStartIdx + state.allSamplesWindowLength);
            } imLayoutEnd(c);

            const [_, ctx, width, height, dpi] = imBeginCanvasRenderingContext2D(c); {
                const plotState = imState(c, newPlotState);

                const widthChanged = imMemo(c, width);
                const heightChanged = imMemo(c, height);
                const dpiChanged = imMemo(c, dpi);
                const resize = widthChanged || heightChanged || dpiChanged;
                if (resize) {
                    plotState.width = width;
                    plotState.height = height;
                    plotState.dpi = dpi;
                }

                if (isNewFrame || resize) {
                    ctx.clearRect(0, 0, width, height);

                    // const samples = state.output[0][0];
                    const samples = state.allSamples;

                    const theme = getCurrentTheme();
                    ctx.strokeStyle = theme.fg.toString();
                    ctx.lineWidth = 2;
                    drawSamples(samples, plotState, ctx, state.allSamplesStartIdx, state.allSamplesWindowLength);

                    ctx.strokeStyle = "green";
                    ctx.lineWidth = 2;
                    drawSamples(state.derivative, plotState, ctx, state.allSamplesStartIdx, state.allSamplesWindowLength);
                }

            } imEndCanvasRenderingContext2D(c);

            if (state.autoPan) {
                state.allSamplesStartIdx = state.allSamples.length - 1 - state.allSamplesWindowLength
            }

            let [start, end, draggingStart, draggingEnd] = imRangeSlider(
                c,
                0, state.allSamples.length,
                state.allSamplesStartIdx, state.allSamplesStartIdx + state.allSamplesWindowLength, 1,
                500,
            ).value;

            state.allSamplesStartIdx = start;
            state.allSamplesVisibleStart = start;
            state.allSamplesVisibleEnd = end;
            if (draggingStart || draggingEnd) {
                state.allSamplesWindowLength = end - start;

                if (draggingEnd) {
                    state.autoPan = false;
                }
            }


        } imLayoutEnd(c);
        imLayout(c, COL); imFlex(c); {
            imLayout(c, BLOCK); {
                imStr(c, "Frequencies (hz) (?)");
                imStr(c, " -> ");
                imStr(c, state.frequenciesReal.length);
                imStr(c, "hz (?)");
            } imLayoutEnd(c);

            const [_, ctx, width, height, dpi] = imBeginCanvasRenderingContext2D(c); {
                const plotState = imState(c, newPlotState);
                const widthChanged = imMemo(c, width);
                const heightChanged = imMemo(c, height);
                const dpiChanged = imMemo(c, dpi);

                const resize = widthChanged || heightChanged || dpiChanged;
                if (resize) {
                    plotState.width = width;
                    plotState.height = height;
                    plotState.dpi = dpi;
                }

                if (resize || isNewFrame) {
                    ctx.clearRect(0, 0, width, height);

                    ctx.strokeStyle = "blue";
                    ctx.lineWidth = 2;
                    drawSamples(state.frequencies, plotState, ctx, state.frequenciesStartIdx, state.frequenciesLength);

                    ctx.strokeStyle = "red";
                    ctx.lineWidth = 2;
                    drawSamples(state.frequencies2, plotState, ctx, state.frequenciesStartIdx, state.frequenciesLength);
                }

            } imEndCanvasRenderingContext2D(c);

            const [start, end, draggingStart, draggingEnd] = imRangeSlider(
                c,
                0, numFrequenciesToView,
                state.frequenciesStartIdx, state.frequenciesStartIdx + state.frequenciesLength,
                1, 100
            ).value;

            state.frequenciesStartIdx = start;
            if (draggingStart || draggingEnd) {
                state.frequenciesLength = end - start;
            }
        } imLayoutEnd(c);
    } imLayoutEnd(c);
}

