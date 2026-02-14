import {
    CACHE_ITEMS_ITERATED_LAST_FRAME,
    CACHE_TOTAL_DESTRUCTORS,
    CACHE_TOTAL_MAP_ENTRIES_LAST_FRAME,
    ImCache,
    imGet,
    getFpsCounterState,
    imSet,
    inlineTypeId
} from "src/utils/im-core.ts";
import { imStr } from "src/utils/im-dom.ts";
import { BLOCK, imLayoutBegin, imLayoutEnd } from "./core/layout.ts";

export function imFpsCounterSimple(c: ImCache) {
    const fpsCounter = getFpsCounterState(c);

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

    imLayoutBegin(c, BLOCK); imStr(c, Math.round(renderMs) + "ms/" + Math.round(frameMs) + "ms"); imLayoutEnd(c);
}

export function imExtraDiagnosticInfo(c: ImCache) {
    const itemsIterated  = c[CACHE_ITEMS_ITERATED_LAST_FRAME];
    const numDestructors = c[CACHE_TOTAL_DESTRUCTORS];
    const numMapEntries  = c[CACHE_TOTAL_MAP_ENTRIES_LAST_FRAME];

    const fps = getFpsCounterState(c);

    imLayoutBegin(c, BLOCK); {
        imStr(c, itemsIterated);
        imStr(c, "i ");

        // If either of these just keep increasing forever, you have a memory leak.
        imStr(c, numDestructors);
        imStr(c, "d ");
        imStr(c, numMapEntries);
        imStr(c, "m ");
        imStr(c, fps.lastRenderCount);
        imStr(c, "r");
    } imLayoutEnd(c);
}
