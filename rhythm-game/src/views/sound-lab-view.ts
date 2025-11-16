import { imCompactDragSlider } from "src/app-components/drag-slider";
import { imModalBegin, imModalEnd } from "src/app-components/modal";
import { imButtonIsClicked } from "src/components/button";
import { imBeginCanvasRenderingContext2D, imEndCanvasRenderingContext2D } from "src/components/canvas2d";
import {
    BLOCK,
    COL,
    EM,
    imAlign,
    imBg,
    imFg,
    imFlex,
    imFlex1,
    imGap,
    imJustify,
    imLayout,
    imLayoutEnd,
    imPadding,
    imSize,
    NA,
    PERCENT,
    PX,
    ROW
} from "src/components/core/layout";
import { cssVars } from "src/components/core/stylesheets";
import { imLine, LINE_HORIZONTAL_PADDING, LINE_VERTICAL, LINE_VERTICAL_PADDING } from "src/components/im-line";
import { imRangeSlider } from "src/components/range-slider";
import { imScrollContainerBegin, imScrollContainerEnd, newScrollContainer } from "src/components/scroll-container";
import { imSliderInput } from "src/components/slider";
import { debugFlags } from "src/debug-flags";
import { dspProcess, dspReceiveMessage, DspState, newDspState } from "src/dsp/dsp-loop";
import {
    compileInstructions,
    computeSample,
    DEFAULT_PARAMETERS,
    DspSynthInstructionItem,
    IDX_MAX,
    instrToString,
    newSampleContext,
    registerIdxToString
} from "src/dsp/dsp-loop-instruction-set";
import { getCurrentPlaySettings, getDspInfo, pressKey, updatePlaySettings } from "src/dsp/dsp-loop-interface";
import { getKeyForKeyboardKey } from "src/state/keyboard-state";
import { newArray } from "src/utils/array-utils";
import { assert } from "src/utils/assert";
import { fft, resizeNumberArrayPowerOf2 } from "src/utils/fft";
import {
    getRenderCount,
    ImCache,
    imElse,
    imEndIf,
    imFor,
    imForEnd,
    imGet,
    imIf,
    imIfEnd,
    imMemo,
    imSet,
    imState,
    isFirstishRender
} from "src/utils/im-core";
import { EL_B, elHasMousePress, elSetStyle, getGlobalEventSystem, imEl, imElEnd, imStr, imStrFmt } from "src/utils/im-dom";
import { arrayMax, arrayMin, clamp, derivative, gridsnapRound, inverseLerp, lerp, max, min } from "src/utils/math-utils";
import { getNoteFrequency } from "src/utils/music-theory-utils";
import { GlobalContext, setViewChartSelect } from "./app";
import { imKeyboard } from "./keyboard";
import { cssVarsApp, getCurrentTheme } from "./styling";


function getExtentX(plot: PlotState): number {
    const { originalExtentX: originalExtent, zoom } = plot;
    return originalExtent / zoom;
}

function getExtentY(plot: PlotState): number {
    const { originalExtentY: originalExtent, zoom } = plot;
    return originalExtent / zoom;
}

function getDim(plot: PlotState): number {
    const { width, height } = plot;
    return max(width, height);
}

function getOtherDim(plot: PlotState): number {
    const { width, height } = plot;
    return min(width, height);
}

function getMaxDim(plot: PlotState): number {
    const { width, height } = plot;
    return max(width, height);
}

function getMinDim(plot: PlotState): number {
    const { width, height } = plot;
    return max(width, height);
}

function getCanvasElementX(plot: PlotState, x: number): number {
    const { posX } = plot;
    const extent = getExtentX(plot);
    const x0Extent = posX - extent;
    const x1Extent = posX + extent;
    return (inverseLerp(x, x0Extent, x1Extent) * getDim(plot));
}


function screenToCanvas(plot: PlotState, val: number): number {
    return val * plot.dpi;
}

function canvasToScreen(plot: PlotState, val: number): number {
    return val / plot.dpi;
}

function getCanvasElementY(plot: PlotState, y: number): number {
    const { posY } = plot;
    const extent = getExtentY(plot);
    const y0Extent = posY - extent;
    const y1Extent = posY + extent;

    const dim = getDim(plot);
    const other = getOtherDim(plot);
    const diff = dim - other;

    return (inverseLerp(y, y0Extent, y1Extent) * dim - (diff / 2));
}

function getPlotX(plot: PlotState, x: number): number {
    const { posX } = plot;
    const extent = getExtentX(plot);
    const x0Extent = posX - extent;
    const x1Extent = posX + extent;

    return lerp(x0Extent, x1Extent, (x / getDim(plot)));
}

function getPlotLength(plot: PlotState, l: number): number {
    return getPlotX(plot, l) - getPlotX(plot, 0);
}

function getCanvasElementLength(plot: PlotState, l: number): number {
    return getCanvasElementX(plot, l) - getCanvasElementX(plot, 0);
}

function getPlotY(plot: PlotState, y: number): number {
    const { posY } = plot;
    const extent = getExtentY(plot);
    const y0Extent = posY - extent;
    const y1Extent = posY + extent;

    const dim = getDim(plot);
    const other = getOtherDim(plot);
    const diff = dim - other;


    // NOTE: needs to be an exact inverse of getCanvasElementY
    // for zooming in and out to work properly
    return lerp(y0Extent, y1Extent, (((y) + (diff / 2)) / getDim(plot)));
}

function isPointOnScreen(plot: PlotState, x: number, y: number) {
    const { posX, posY } = plot;

    const extentX = getExtentX(plot);
    const extentY = getExtentY(plot);

    const y0Extent = posY - extentY;
    const y1Extent = posY + extentY;
    const x0Extent = posX - extentX;
    const x1Extent = posX + extentX;

    return (x >= x0Extent && x <= x1Extent) &&
        (y >= y0Extent && y <= y1Extent);
}

type PlotState = {
    autofit: boolean;
    overlay: boolean;
    posX: number;
    posY: number;
    originalExtentX: number;
    originalExtentY: number;
    zoom: number;
    width: number;
    height: number;
    dpi: number;
    maximized: boolean;
    isPanning: boolean;
    canZoom: boolean;
    scrollY: number;
}


function newPlotState(): PlotState {
    return {
        scrollY: 0,
        overlay: true,
        autofit: true,
        posX: 0,
        posY: 0,
        zoom: 1,
        originalExtentX: 0,
        originalExtentY: 0,
        width: 0,
        height: 0,
        dpi: 0,
        maximized: false,
        isPanning: false,
        canZoom: false,
    };
}


function drawSamples(
    samples: number[] | Float32Array,
    plotState: PlotState,
    ctx: CanvasRenderingContext2D,
    startIdx?: number,
    numSamples?: number,
) {
    if (startIdx === undefined) {
        startIdx = 0;
    }

    if (numSamples === undefined) {
        numSamples = samples.length;
    }

    // Prevent various overflows and underflows
    let endIdx = startIdx + numSamples - 1;
    if (endIdx >= samples.length) endIdx = samples.length - 1;
    if (startIdx < 0) startIdx = 0;
    numSamples = endIdx - startIdx + 1;

    const max = arrayMax(samples);
    const min = arrayMin(samples);
    plotState.posX = startIdx + numSamples / 2;
    plotState.posY = (min + max) / 2;
    plotState.originalExtentX = numSamples / 2;
    plotState.originalExtentY = -3 * (max - min);

    const startX = Math.floor(getCanvasElementX(plotState, startIdx));
    const endX =   Math.floor(getCanvasElementX(plotState, startIdx + numSamples));
    const screenWidth = endX - startX;

    if (screenWidth > numSamples) {
        ctx.beginPath(); {
            // Simply connect up each sample
            let lastPlotX = 0, lastPlotY = 0;
            let x0 = startIdx;
            let y0 = samples[startIdx];
            const x0Plot = getCanvasElementX(plotState, x0);
            const y0Plot = getCanvasElementY(plotState, y0);
            ctx.moveTo(Math.floor(x0Plot), Math.floor(y0Plot));
            for (let i = startIdx + 1; i < startIdx + numSamples; i++) {
                const x1 = i;
                const y1 = samples[i];

                let x1Plot = getCanvasElementX(plotState, x1);
                let y1Plot = getCanvasElementY(plotState, y1);

                x1Plot = Math.floor(x1Plot);
                y1Plot = Math.floor(y1Plot);

                if (x1Plot !== lastPlotX || y1Plot !== lastPlotY) {
                    ctx.lineTo(x1Plot, y1Plot);
                }

                lastPlotX = x1Plot;
                lastPlotY = y1Plot;
                x0 = x1; y0 = y1;
            }
            ctx.stroke();
        } ctx.closePath();
    } else {
        // Find the min/max for each bin, and draw a vertical line spanning these
        const binsPerSample = Math.ceil(numSamples / screenWidth);
        const binsPerSampleToIterate = Math.floor(numSamples / screenWidth);
        ctx.beginPath(); {
            for (let i = startIdx; i < startIdx + numSamples; i+= binsPerSampleToIterate) {
                let minSample = Number.POSITIVE_INFINITY, maxSample = Number.NEGATIVE_INFINITY;
                for (let j = i; j < i + binsPerSample && j < startIdx + numSamples; j++) {
                    minSample = Math.min(minSample, samples[j]);
                    maxSample = Math.max(maxSample, samples[j]);
                }

                const x1 = i;

                let x1Plot = Math.floor(getCanvasElementX(plotState, x1));
                let y0Plot = Math.floor(getCanvasElementY(plotState, minSample));
                let y1Plot = Math.ceil(getCanvasElementY(plotState, maxSample));

                ctx.moveTo(x1Plot, y0Plot);
                ctx.lineTo(x1Plot, y1Plot);
            }
            ctx.stroke();
        } ctx.closePath();
    }

}

type SoundLabState = {
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
    instructionBuilder: {
        instructions: DspSynthInstructionItem[]
    };
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
        instructionBuilder: {
            instructions: []
        }
    };
}

export function imSoundLab(c: ImCache, ctx: GlobalContext) {
    const MIN_ZOOM = 100;

    const state = imState(c, newSoundLabState);

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
        if (isPlaying) {
            dspProcess(state.dsp, state.output);

            const samples = state.output[0][0];
            for (const f of samples) {
                state.allSamples.push(f);
            }

            derivative(state.allSamples, state.derivative);
        }
    }

    imLayout(c, COL); imFlex(c); {
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

        if (imIf(c) && state.isEditingInstructions) {
            imWaveProgramEditor(c, ctx, state);
        } imIfEnd(c);

    } imLayoutEnd(c);

    if (!ctx.handled) {
        if (ctx.keyPressState) {
            const { key } = ctx.keyPressState;

            let handled = false;

            if (key === "Escape") {
                setViewChartSelect(ctx);
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



function imWaveProgramPreview(
    c: ImCache,
    ctx: GlobalContext,
    state: SoundLabState
) {
    imLayout(c, COL); imFlex(c); {
        imLayout(c, ROW); {
            imStr(c, "Wave program"); 

            imFlex1(c);

            if (imButtonIsClicked(c, "Edit")) {
                state.isEditingInstructions = true;
            }
        } imLayoutEnd(c);

        imLine(c, LINE_HORIZONTAL_PADDING);

        const sc = imState(c, newScrollContainer);
        imScrollContainerBegin(c, sc); {
            imFor(c); for (const instr of state.instructionBuilder.instructions) {
                imLayout(c, ROW); imGap(c, 6, PX); {
                    imStrFmt(c, instr.instruction.type, instrToString);

                    imStr(c, " TODO: Implement this");
                } imLayoutEnd(c);
            } imForEnd(c);
        } imScrollContainerEnd(c);

    } imLayoutEnd(c);
}


function imHeading(c: ImCache, text: string) {
    imLayout(c, ROW); imJustify(c); {
        imEl(c, EL_B); imStr(c, text); imElEnd(c, EL_B);
    } imLayoutEnd(c);
}

function imWaveProgramEditor(c: ImCache, ctx: GlobalContext, state: SoundLabState) {
    const editor = state.instructionBuilder;
    const sampleRate = state.dsp.sampleRate;
    const playSettings = getCurrentPlaySettings();

    let updateSettings = false;

    imModalBegin(c); imPadding(c, 10, PX, 10, PX, 10, PX, 10, PX); {
        imLayout(c, ROW); imSize(c, 100, PERCENT, 100, PERCENT); imBg(c, cssVars.bg); {
            const sc = imState(c, newScrollContainer);

            imLayout(c, COL); imFlex(c); {
                imHeading(c, "Instructions");

                imScrollContainerBegin(c, sc); {
                    let i = 0;
                    imFor(c); for (const instruction of editor.instructions) {
                        const instr = instruction.instruction;

                        imLayout(c, ROW); imAlign(c); {
                            if (isFirstishRender(c)) {
                                elSetStyle(c, "lineHeight", "1");
                            }

                            imLayout(c, ROW); imAlign(c); {
                                imStrFmt(c, instr.type, instrToString);
                                imStr(c, "(");
                            } imLayoutEnd(c);

                            // register value 1
                            {
                                imLayout(c, ROW); imAlign(c); imGap(c, 10, PX);
                                imPadding(c, 0, NA, 10, PX, 0, NA, 10, PX); {
                                    if (imButtonIsClicked(c, instr.reg1 ? "reg:" : "val:", instr.reg1, BLOCK, true)) {
                                        instr.reg1 = !instr.reg1;
                                        updateSettings = true;
                                    }

                                    imLayout(c, ROW); imAlign(c); imJustify(c); imFlex(c); {
                                        if (imIf(c) && instr.reg1) {
                                            // Reinterpret this thing as an index.
                                            imStr(c, "reg ");
                                            imStrFmt(c, instr.val1, registerIdxToString);
                                        } else {
                                            imElse(c);
                                            imStr(c, instr.val1);
                                        } imEndIf(c);
                                    } imLayoutEnd(c);
                                } imLayoutEnd(c);
                            }


                            // register value 2
                            {
                                imLayout(c, ROW); imAlign(c); imGap(c, 10, PX);
                                imPadding(c, 0, NA, 10, PX, 0, NA, 10, PX); {
                                    if (imButtonIsClicked(c, instr.reg2 ? "reg:" : "val:", instr.reg2, BLOCK, true)) {
                                        instr.reg2 = !instr.reg2;
                                        updateSettings = true;
                                    }

                                    imLayout(c, ROW); imAlign(c); imJustify(c); imFlex(c); {
                                        if (imIf(c) && instr.reg2) {
                                            // Reinterpret this thing as an index.
                                            imStr(c, "reg ");
                                            imStrFmt(c, instr.val2, registerIdxToString);
                                        } else {
                                            imElse(c);
                                            imStr(c, instr.val2);
                                        } imEndIf(c);
                                    } imLayoutEnd(c);
                                } imLayoutEnd(c);
                            }

                            imLayout(c, ROW); imAlign(c); {
                                imStr(c, ") -> ");
                            } imLayoutEnd(c);

                            imLayout(c, ROW); imAlign(c); imJustify(c); imFlex(c); {
                                imStr(c, "register: ");
                                imStrFmt(c, instr.dst, registerIdxToString);
                            } imLayoutEnd(c);
                        } imLayoutEnd(c);

                        i++;
                    } imForEnd(c);
                } imScrollContainerEnd(c);
            } imLayoutEnd(c);

            imLine(c, LINE_VERTICAL_PADDING);
            imLine(c, LINE_VERTICAL);
            imLine(c, LINE_VERTICAL_PADDING);

            imLayout(c, COL); imFlex(c); {
                // want to visualize the program somehow. 
                {
                    const mockSampleRate = 44800;

                    const s = imGet(c, imSoundLab) ?? imSet(c, {
                        noteIdx: 0,
                        ctx: newSampleContext(),
                        samples: Array(mockSampleRate / 10).fill(0) as number[],
                        viewingIdx: 0,
                        viewingLen: 500,
                        viewingInvalidated: false,
                    });

                    if (imMemo(c, s.noteIdx)) s.viewingInvalidated = true;

                    imHeading(c, "Wave program");

                    const params = playSettings.parameters;
                    let samplesRecomputed = false;
                    if (s.viewingInvalidated) {
                        s.viewingInvalidated = false;
                        samplesRecomputed = true;

                        for (let i = 0; i < s.samples.length; i++) {
                            let frequency = getNoteFrequency(s.noteIdx);
                            const time = i / mockSampleRate;

                            s.ctx.time = time;
                            s.ctx.frequency = frequency;
                            s.ctx.dt = 1 / sampleRate;
                            s.samples[i] = computeSample(s.ctx, params.instructions);
                        }
                    }

                    imLayout(c, COL); imSize(c, 0, NA, 200, PX); {
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

                            if (samplesRecomputed) {
                                ctx.clearRect(0, 0, width, height);

                                ctx.strokeStyle = "black";
                                ctx.lineWidth = 2;
                                drawSamples(
                                    s.samples,
                                    plotState,
                                    ctx,
                                    s.viewingIdx,
                                    s.viewingLen
                                );
                            }
                        } imEndCanvasRenderingContext2D(c);
                    } imLayoutEnd(c);

                    let [start, end, draggingStart, draggingEnd] = imRangeSlider(
                        c,
                        0, s.samples.length,
                        s.viewingIdx, s.viewingIdx + s.viewingLen, 1,
                        100,
                    ).value;

                    s.viewingIdx = start;
                    s.viewingLen = end - start;
                    if (draggingStart || draggingEnd) {
                        s.viewingInvalidated = true;
                    }
                }

                imHeading(c, "Parameters");

                const sc = imState(c, newScrollContainer);
                imScrollContainerBegin(c, sc); {
                    const defaultParams = DEFAULT_PARAMETERS;
                    imFor(c); for (let i = 0; i < defaultParams.length; i++) {
                        const paramInfo = defaultParams[i];
                        imLayout(c, ROW); imFg(c, cssVarsApp.mg); {
                            imLayout(c, ROW); imSize(c, 40, PX, 0, NA); imJustify(c); {
                                imStr(c, i);
                            } imLayoutEnd(c);
                            imStr(c, " -> ");
                            imStr(c, "[Default parameter] ");
                            imStr(c, paramInfo.name);
                        } imLayoutEnd(c);
                    } imForEnd(c);

                    imFor(c); for (let i = defaultParams.length; i < IDX_MAX; i++) {
                        imLayout(c, ROW); {
                            imLayout(c, ROW); imSize(c, 40, PX, 0, NA); imJustify(c); {
                                imStr(c, i);
                            } imLayoutEnd(c);
                            imStr(c, " -> ");
                            // TODO: users should be able to name and configure these parameters. 
                            imStr(c, "[Unbound]");
                        } imLayoutEnd(c);
                    } imForEnd(c);

                } imScrollContainerEnd(c);
            } imLayoutEnd(c);
        } imLayoutEnd(c);
    } imModalEnd(c);

    if (updateSettings) {
        compileInstructions(state.instructionBuilder.instructions, playSettings.parameters.instructions);
        updatePlaySettings();
    }

    if (!ctx.handled) {
        if (ctx.keyPressState) {
            if (ctx.keyPressState.key === "Escape") {
                state.isEditingInstructions = false;
                ctx.handled = true;
            }
        }
    }
}

function imParameterSlider(
    c: ImCache,
    name: string,
    min: number,
    max: number,
    step: number,
    val: number,
    defaultValue: number,
): { val: number } | null {
    let initialVal = val;

    imLayout(c, ROW); imAlign(c); {
        imLayout(c, BLOCK); {
            imStr(c, name);
            imStr(c, ": ");
            imStr(c, val.toFixed(3));
        } imLayoutEnd(c);

        imLayout(c, COL); imSize(c, 0, NA, 1, EM); imFlex(c); {
            val = imSliderInput(c, min, max, step, val);
        } imLayoutEnd(c);

        if (imButtonIsClicked(c, "<")) {
            val = defaultValue;
        }
    } imLayoutEnd(c);

    if (val !== initialVal) {
        return { val };
    }

    return null;
}

function imParameterSliderCompact(
    c: ImCache,
    name: string,
    min: number,
    max: number,
    step: number,
    val: number,
    defaultValue: number,
): { val: number } | null {
    let initialVal = val;

    imLayout(c, BLOCK); imAlign(c); {
        imLayout(c, BLOCK); {
            imStr(c, name);
            imStr(c, val.toFixed(3));
        } imLayoutEnd(c);

        val = imCompactDragSlider(c, 100, val, min, max);
        val = gridsnapRound(val, step);
        val = clamp(val, min, max);

        const mouse = getGlobalEventSystem().mouse;
        if (elHasMousePress(c) && mouse.rightMouseButton) {
            // Reset to default value on rightclick
            mouse.ev?.preventDefault();
            val = defaultValue;
        }
    } imLayoutEnd(c);

    if (val !== initialVal) {
        return { val };
    }

    return null;
}
