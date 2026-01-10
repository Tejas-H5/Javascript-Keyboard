import { imBeginCanvasRenderingContext2D, imEndCanvasRenderingContext2D } from "src/components/canvas2d";
import { getRenderCount, ImCache, imMemo, imState } from "src/utils/im-core";
import { inverseLerp, lerp, max, min } from "src/utils/math-utils";

// TODO: consider moving to components.ts

export function newPlotState(): PlotState {
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

        isNewFrame: false,
        ctx: null,
    };
}

export function getExtentX(plot: PlotState): number {
    const { originalExtentX: originalExtent, zoom } = plot;
    return originalExtent / zoom;
}

export function getExtentY(plot: PlotState): number {
    const { originalExtentY: originalExtent, zoom } = plot;
    return originalExtent / zoom;
}

export function getDim(plot: PlotState): number {
    const { width, height } = plot;
    return max(width, height);
}

export function getOtherDim(plot: PlotState): number {
    const { width, height } = plot;
    return min(width, height);
}

export function getMaxDim(plot: PlotState): number {
    const { width, height } = plot;
    return max(width, height);
}

export function getMinDim(plot: PlotState): number {
    const { width, height } = plot;
    return max(width, height);
}

export function getCanvasElementX(plot: PlotState, x: number): number {
    const { posX } = plot;
    const extent = getExtentX(plot);
    const x0Extent = posX - extent;
    const x1Extent = posX + extent;
    return (inverseLerp(x, x0Extent, x1Extent) * getDim(plot));
}


export function screenToCanvas(plot: PlotState, val: number): number {
    return val * plot.dpi;
}

export function canvasToScreen(plot: PlotState, val: number): number {
    return val / plot.dpi;
}

export function getCanvasElementY(plot: PlotState, y: number): number {
    const { posY } = plot;
    const extent = getExtentY(plot);
    const y0Extent = posY - extent;
    const y1Extent = posY + extent;

    const dim = getDim(plot);
    const other = getOtherDim(plot);
    const diff = dim - other;

    return (inverseLerp(y, y0Extent, y1Extent) * dim - (diff / 2));
}

export function getPlotX(plot: PlotState, x: number): number {
    const { posX } = plot;
    const extent = getExtentX(plot);
    const x0Extent = posX - extent;
    const x1Extent = posX + extent;

    return lerp(x0Extent, x1Extent, (x / getDim(plot)));
}

export function getPlotLength(plot: PlotState, l: number): number {
    return getPlotX(plot, l) - getPlotX(plot, 0);
}

export function getCanvasElementLength(plot: PlotState, l: number): number {
    return getCanvasElementX(plot, l) - getCanvasElementX(plot, 0);
}

export function getPlotY(plot: PlotState, y: number): number {
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

export function isPointOnScreen(plot: PlotState, x: number, y: number) {
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

export type PlotState = {
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

    isNewFrame: boolean;
    ctx: CanvasRenderingContext2D | null;
}


export function imPlotBegin(c: ImCache): PlotState {
    const plotState = imState(c, newPlotState);
    plotState.isNewFrame = false;

    let isNewFrame = imMemo(c, getRenderCount(c));
    if (isNewFrame) {
        plotState.isNewFrame = true;
    }

    const [_, ctx, width, height, dpi] = imBeginCanvasRenderingContext2D(c); {
        plotState.ctx = ctx;


        const widthChanged  = imMemo(c, width);
        const heightChanged = imMemo(c, height);
        const dpiChanged    = imMemo(c, dpi);

        const resize = widthChanged || heightChanged || dpiChanged;
        if (resize) {
            plotState.width = width;
            plotState.height = height;
            plotState.dpi = dpi;

            plotState.isNewFrame = true;
        }
    }

    return plotState;
}

export function imPlotEnd(c: ImCache) {
    imEndCanvasRenderingContext2D(c);
}


export function drawSamples(
    samples: number[] | Float32Array,
    min: number, 
    max: number,
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

                // Plotted upside down ???
                let y0Plot = Math.ceil(getCanvasElementY(plotState, minSample));
                let y1Plot = Math.floor(getCanvasElementY(plotState, maxSample));

                ctx.moveTo(x1Plot, y0Plot - 0.5);
                ctx.lineTo(x1Plot, y1Plot + 0.5);
            }
            ctx.stroke();
        } ctx.closePath();
    }

}
