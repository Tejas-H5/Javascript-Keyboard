import {
    deltaTimeSeconds,
    elementHasMouseClick,
    imBeginDiv,
    imBeginSpan,
    imEnd,
    imInit,
    setInnerText,
    setStyle,
    imMemo,
    imTextSpan,
    getNumImStateEntriesRendered as getNumItemsRendered
} from 'src/utils/im-dom-utils';
import { cssVars } from 'src/views/styling';

const VAR_BG = cssVars.bg;

export type FpsCounterState = {
    t: number;
    t0: number;
    frames: number;
    frameTime: number;
    screenHz: number;

    timeSpentRendering: number;
    timeSpentRenderingPerFrame: number;
    renders: number;
    renderHz: number;

    // Try to infer the 'baseline' frequency, so we know when we're lagging.
    baselineFrameMs: number;
    baselineFrameMsFreq: number;
    baselineLocked: boolean;
    nextBaseline: number;
    nextFreq: number;

    framesMsRounded: number;
    renderMsRounded: number;
}

export function newFpsCounterState(): FpsCounterState {
    return {
        t: 0,
        t0: 0,
        frames: 0,
        frameTime: 0,
        screenHz: 0,

        timeSpentRendering: 0,
        timeSpentRenderingPerFrame: 0,
        renders: 0,
        renderHz: 0,

        // Try to infer the 'baseline' frequency, so we know when we're lagging.
        baselineFrameMs: 100,
        baselineFrameMsFreq: 0,
        baselineLocked: false,
        nextBaseline: 100,
        nextFreq: 0,

        framesMsRounded: 0,
        renderMsRounded: 0,
    };
}

export function startFpsCounter(fps: FpsCounterState) {
    fps.t0 = performance.now();
    const dt = deltaTimeSeconds();
    fps.t += dt;
    fps.frames++;


    fps.framesMsRounded = Math.round(1000 * fps.frameTime);
    fps.renderMsRounded = Math.round(1000 * fps.timeSpentRenderingPerFrame);

    // Compute our baseline framerate based on the frames we see.
    // Lock it down once we've seen the same framerate for long enough.
    fps.baselineLocked = fps.baselineFrameMsFreq > 240
    if (!fps.baselineLocked) {
        if (fps.framesMsRounded === fps.nextBaseline) {
            if (fps.nextFreq < Number.MAX_SAFE_INTEGER) {
                fps.nextFreq++;
            }
        } else if (fps.framesMsRounded === fps.baselineFrameMs) {
            if (fps.baselineFrameMsFreq < Number.MAX_SAFE_INTEGER) {
                fps.baselineFrameMsFreq++;
            }
        } else {
            fps.nextBaseline = fps.framesMsRounded;
            fps.nextFreq = 1;
        }

        if (fps.nextFreq > fps.baselineFrameMsFreq) {
            fps.baselineFrameMs = fps.nextBaseline;
            fps.baselineFrameMsFreq = fps.nextFreq;
            fps.nextBaseline = 100;
            fps.nextFreq = 0;
        }
    }
}

export function stopFpsCounter(fps: FpsCounterState) {
    // render-start     -> Timer start
    //      rendering code()
    // render-end       -> timer stop
    // --- wait for next animation frame ---
    // this timer intentionally skips all of the time here.
    // we want to know what our remaining performance budget is, basically
    // ---
    // repeat

    fps.timeSpentRendering += (performance.now() - fps.t0);
    fps.renders++;

    if (fps.t > 1) {
        fps.frameTime = fps.t / fps.frames;
        fps.screenHz = Math.round(fps.frames / fps.t);
        fps.t = 0;
        fps.frames = 0;

        fps.timeSpentRenderingPerFrame = (fps.timeSpentRendering / 1000) / fps.renders;
        fps.renderHz = Math.round(fps.renders / (fps.timeSpentRendering / 1000));
        fps.timeSpentRendering = 0;
        fps.renders = 0;
    } 
}

export function imFpsCounterOutput(fps: FpsCounterState, left: boolean = false) {
    imBeginDiv(); {
        if (imInit()) {
            setStyle("position", "absolute");
            setStyle("top", "5px");
            setStyle("padding", "5px");
            setStyle("zIndex", "1000000");
            setStyle("backgroundColor", VAR_BG);
            setStyle("borderRadius", "1000px");
            setStyle("opacity", "0.5");
        }

        if (imMemo(left)) {
            if (left) {
                setStyle("right", "");
                setStyle("left", "5px");
            } else {
                setStyle("right", "5px");
                setStyle("left", "");
            }
        }

        // r.text(screenHz + "hz screen, " + renderHz + "hz code");

        imBeginDiv(); {
            imTextSpan(fps.baselineLocked ? (fps.baselineFrameMs + "ms baseline, ") : "computing baseline...");
        } imEnd();

        imBeginDiv(); {
            imTextSpan(fps.framesMsRounded + "ms frame, ");
        } imEnd();

        imBeginDiv(); {
            imBeginSpan(); {
                const fpsChanged = imMemo(fps.renderMsRounded);
                if (fpsChanged) {
                    setStyle("color", fps.renderMsRounded / fps.baselineFrameMs > 0.5 ? "red" : "");
                }
                setInnerText(fps.renderMsRounded + "ms render");
            } imEnd();
        } imEnd();
        // setStyle("transform", "rotate(" + angle + "deg)");

        if (elementHasMouseClick()) {
            fps.baselineFrameMsFreq = 0;
        }

        imBeginDiv(); {
            imTextSpan(getNumItemsRendered() + " IM entries");
        } imEnd();

    } imEnd();
}
