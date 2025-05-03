import { imBeginCanvasRenderingContext2D, imEndCanvasRenderingContext2D } from "src/components/canvas2d";
import { dspProcess, dspReceiveMessage, newDspState } from "src/dsp/dsp-loop";
import { getCurrentPlaySettings, getDspInfo, pressKey } from "src/dsp/dsp-loop-interface";
import { getKeyForKeyboardKey } from "src/state/keyboard-state";
import { assert } from "src/utils/assert";
import { disableIm, enableIm, imEnd, imInit, imMemo, imMemoArray, imState, imStateInline, imTextSpan, setStyle } from "src/utils/im-dom-utils";
import { arrayMax, arrayMin, clamp, derivativeF32, inverseLerp, lerp, max, min, normalizeNegativeOneOneF32 } from "src/utils/math-utils";
import { GlobalContext, setViewChartSelect, setViewStartScreen } from "./app";
import { imKeyboard } from "./keyboard";
import { COL, FIXED, FLEX1, H3, imBeginLayout, imBeginSpace, JUSTIFY_CENTER, NOT_SET, PERCENT, PX, ROW } from "./layout";
import { cssVars, getCurrentTheme } from "./styling";
import { normalizePath } from "vite";
import { getNoteIndex } from "src/utils/music-theory-utils";


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
    samples: Float32Array,
    plotState: PlotState,
    ctx: CanvasRenderingContext2D,
) {
    disableIm();

    const max = arrayMax(samples);
    const min = arrayMin(samples);
    plotState.posX = samples.length / 2;
    plotState.posY = (min + max) / 2;
    plotState.originalExtentX = samples.length / 2;
    plotState.originalExtentY = max - min;

    let x0 = 0;
    let y0 = samples[0];
    const x0Plot = getCanvasElementX(plotState, x0);
    const y0Plot = getCanvasElementY(plotState, y0);

    ctx.beginPath(); {
        ctx.moveTo(x0Plot, y0Plot);
        for (let i = 1; i < samples.length; i++) {
            const x1 = i;
            const y1 = samples[i];

            const x1Plot = getCanvasElementX(plotState, x1);
            const y1Plot = getCanvasElementY(plotState, y1);

            ctx.lineTo(x1Plot, y1Plot);

            x0 = x1; y0 = y1;
        }
        ctx.stroke();
    }
    ctx.closePath();

    enableIm();
}

type Vec2 = { x: number; y: number; };


export function imSoundLab(ctx: GlobalContext) {
    const MIN_ZOOM = 100;

    const state = imStateInline(() => {
        return {
            dsp: newDspState(),
            output: [[new Float32Array()]],
            derivative: new Float32Array(),
            frequencies: new Float32Array(),
            t: 0,
            numSamples: 1000,
        }
    });

    let soundPlayed = false;

    if (ctx.keyPressState) {
        const { key } = ctx.keyPressState;

        let handled = false;

        if (key === "Escape") {
            setViewChartSelect(ctx);
            handled = true;
        } else if (key === "ArrowLeft") {
            state.t--;
            handled = true;
        } else if (key === "ArrowRight") {
            state.t++;
            handled = true;
        } else if (key === "ArrowUp") {
            state.numSamples += 1000;
            handled = true;
        } else if (key === "ArrowDown") {
            state.numSamples -= 1000;
            handled = true;
        }

        state.numSamples = max(state.numSamples, MIN_ZOOM);

        if (!handled) {
            const instrumentKey = getKeyForKeyboardKey(ctx.keyboard, key);
            if (instrumentKey) {
                if (!ctx.keyPressState.isRepeat) {
                    pressKey(instrumentKey.index, instrumentKey.musicNote, ctx.keyPressState.isRepeat);
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

    const info = getDspInfo();
    const sampleRate = info.sampleRate;
    const sampleRateChanged = imMemo(sampleRate);
    const tChanged = imMemo(state.t);
    const numFloatsChanged = imMemo(state.numSamples);
    const infoCurrentlyPlayingChanged = imMemo(info.currentlyPlaying.length);


    if (
        sampleRateChanged ||
        tChanged ||
        numFloatsChanged ||
        soundPlayed ||
        soundPlayed ||
        infoCurrentlyPlayingChanged
    ) {
        if (sampleRate !== 1) {

            console.log("new dsp loaded");

            // n/2 is because of the nyquist theorem
            const numFrequencies = Math.floor(state.numSamples / 2);

            // output[something idk what it is][channel][sample] lmao
            const outputSamples = new Float32Array(Math.max(MIN_ZOOM, state.numSamples));
            state.output = [[outputSamples]];
            state.derivative = new Float32Array(outputSamples.length);
            state.frequencies = new Float32Array(numFrequencies);
            state.dsp = newDspState();

            state.dsp.sampleRate = sampleRate;

            for (const [keyId] of info.currentlyPlaying) {
                const key = ctx.keyboard.flatKeys[keyId];
                assert(key.index === keyId);

                if (key.musicNote.noteIndex !== undefined) {
                    dspReceiveMessage(state.dsp, {
                        playSettings: getCurrentPlaySettings(),
                        setOscilatorSignal: [keyId, {
                            noteIndex: key.musicNote.noteIndex,
                            signal: 1
                        }]
                    });
                }
            }

            for (let i = 0; i <= state.t; i++) {
                dspProcess(state.dsp, state.output);
            }

            const samples = state.output[0][0];
            derivativeF32(samples, state.derivative);
            // derivativeF32(state.derivative, state.derivative);

            
            // Goat FT video: https://www.youtube.com/watch?v=spUNpyF58BY
            // TODO: fast fourier transform
            for (let fIdx = 1; fIdx < state.frequencies.length; fIdx++) {
                let a = 0;

                const f = fIdx / state.dsp.sampleRate;
                const dA = Math.PI * 2 * f;

                let x = 0, y = 0;
                for (let i = 0; i < samples.length; i++) {
                    const dx = samples[i] * Math.cos(a);
                    const dy = samples[i] * Math.sin(a);
                    a += dA;

                    x += dx;
                    y += dy;
                }

                state.frequencies[fIdx] = x;
            }

        }
    }

    imBeginLayout(FIXED | COL); {
        imBeginLayout(H3 | ROW | JUSTIFY_CENTER); {
            imTextSpan("Sound lab t=" + state.t + " sample " + state.t * state.numSamples + " -> " + (state.t + 1) * state.numSamples);
        } imEnd();
        imBeginLayout(COL | FLEX1); {
            imBeginLayout(ROW | FLEX1); {
                imBeginLayout(FLEX1); {
                    const [_, ctx, width, height, dpi] = imBeginCanvasRenderingContext2D(); {
                        const plotState = imState(newPlotState);
                        plotState.width = width;
                        plotState.height = height;
                        plotState.dpi = dpi;

                        ctx.clearRect(0, 0, width, height);

                        const samples = state.output[0][0];

                        const theme = getCurrentTheme();
                        ctx.strokeStyle = theme.fg.toString();
                        ctx.lineWidth = 2;
                        drawSamples(samples, plotState, ctx);

                        ctx.strokeStyle = "green";
                        ctx.lineWidth = 2;
                        drawSamples(state.derivative, plotState, ctx);

                    } imEndCanvasRenderingContext2D();
                } imEnd();
                imBeginSpace(2, PX, 100, PERCENT); {
                    if (imInit()) {
                        setStyle("backgroundColor", cssVars.fg);
                    }
                } imEnd();
                imBeginLayout(FLEX1); {
                    const [_, ctx, width, height, dpi] = imBeginCanvasRenderingContext2D(); {
                        const plotState = imState(newPlotState);
                        plotState.width = width;
                        plotState.height = height;
                        plotState.dpi = dpi;

                        ctx.clearRect(0, 0, width, height);

                        ctx.strokeStyle = "blue";
                        ctx.lineWidth = 2;
                        drawSamples(state.frequencies, plotState, ctx);

                    } imEndCanvasRenderingContext2D();
                } imEnd();
            } imEnd();
            imBeginLayout(FLEX1 | ROW | JUSTIFY_CENTER); {
                imKeyboard(ctx);
            } imEnd();
        } imEnd();
    } imEnd();
}
