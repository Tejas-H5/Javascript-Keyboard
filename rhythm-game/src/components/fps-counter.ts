import {
    CACHE_ITEMS_ITERATED_LAST_FRAME,
    CACHE_TOTAL_DESTRUCTORS,
    CACHE_TOTAL_MAP_ENTRIES_LAST_FRAME,
    ImCache,
    imGet,
    imSet,
    inlineTypeId
} from "src/utils/im-core";
import { imStr } from "src/utils/im-dom";
import { BLOCK, imLayout, imLayoutEnd } from "./core/layout";

export type FpsCounterState = {
    renderStart: number;
    renderEnd: number;
    frameMs: number;
    renderMs: number;
}

export function newFpsCounterState(): FpsCounterState {
    return {
        renderStart: 0,
        renderEnd: 0,
        frameMs: 0,
        renderMs: 0,
    }
}

// It's a bit complicated and I've forgotten how it works, but it seems to be working so I'll keep it around for now
export function fpsMarkRenderingStart(fps: FpsCounterState) {
    const t = performance.now();;

    fps.renderMs = fps.renderEnd - fps.renderStart;
    fps.frameMs = t - fps.renderStart;

    fps.renderStart = t;
}

export function fpsMarkRenderingEnd(fps: FpsCounterState) {
    fps.renderEnd = performance.now();
}

export function imFpsCounterSimple(c: ImCache, fpsCounter: FpsCounterState) {
    const RINGBUFFER_SIZE = 20;
    let arr; arr = imGet(c, inlineTypeId(Array));
    if (!arr) arr = imSet(c, {
        frameMsRingbuffer: new Array(RINGBUFFER_SIZE).fill(0),
        idx1: 0,
        renderMsRingbuffer: new Array(RINGBUFFER_SIZE).fill(0),
        idx2: 0,
    });

    arr.frameMsRingbuffer[arr.idx1] = fpsCounter.frameMs;
    arr.idx1 = (arr.idx1 + 1) % arr.frameMsRingbuffer.length;

    arr.renderMsRingbuffer[arr.idx2] = fpsCounter.renderMs;
    arr.idx2 = (arr.idx2 + 1) % arr.renderMsRingbuffer.length;

    let renderMs = 0;
    let frameMs = 0;
    for (let i = 0; i < arr.renderMsRingbuffer.length; i++) {
        renderMs += arr.renderMsRingbuffer[i];
        frameMs += arr.frameMsRingbuffer[i];
    }
    renderMs /= arr.frameMsRingbuffer.length;
    frameMs /= arr.frameMsRingbuffer.length;

    imLayout(c, BLOCK); imStr(c, Math.round(renderMs) + "ms/" + Math.round(frameMs) + "ms"); imLayoutEnd(c);
}

export function imExtraDiagnosticInfo(c: ImCache) {
    const itemsIterated  = c[CACHE_ITEMS_ITERATED_LAST_FRAME];
    const numDestructors = c[CACHE_TOTAL_DESTRUCTORS];
    const numMapEntries  = c[CACHE_TOTAL_MAP_ENTRIES_LAST_FRAME];

    imLayout(c, BLOCK); {
        imStr(c, itemsIterated);
        imStr(c, "i ");

        // If either of these just keep increasing forever, you have a memory leak.
        imStr(c, numDestructors);
        imStr(c, "d ");
        imStr(c, numMapEntries);
        imStr(c, "m");
    } imLayoutEnd(c);
}
