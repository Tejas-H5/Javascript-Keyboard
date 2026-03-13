import { im, ImCache, imdom, el, ev, } from "src/utils/im-js";

import { BLOCK, imLayoutBegin, imLayoutEnd } from "./core/layout.ts";

export function imFpsCounterSimple(c: ImCache) {
    const fpsCounter = im.getFpsCounterState(c);

    const RINGBUFFER_SIZE = 20;
    let arr; arr = im.GetInline(c, Array);
    if (!arr) arr = im.Set(c, {
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

    imLayoutBegin(c, BLOCK); imdom.Str(c, Math.round(renderMs) + "ms/" + Math.round(frameMs) + "ms"); imLayoutEnd(c);
}

export function imExtraDiagnosticInfo(c: ImCache) {
    const itemsIterated  = im.getItemsIterated(c);
    const numDestructors = im.getTotalDestructors(c);
    const numMapEntries  = im.getTotalMapEntries(c);

    const fps = im.getFpsCounterState(c);

    imLayoutBegin(c, BLOCK); {
        imdom.Str(c, itemsIterated);
        imdom.Str(c, "i ");

        // If either of these just keep increasing forever, you have a memory leak.
        imdom.Str(c, numDestructors);
        imdom.Str(c, "d ");
        imdom.Str(c, numMapEntries);
        imdom.Str(c, "m ");
        imdom.Str(c, fps.lastRenderCount);
        imdom.Str(c, "r");
    } imLayoutEnd(c);
}
