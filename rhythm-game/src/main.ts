import { getDspInfo, initDspLoopInterface } from "src/dsp/dsp-loop-interface";
import { fpsMarkRenderingEnd, fpsMarkRenderingStart, newFpsCounterState } from "./components/fps-counter";
import { loadSaveState } from "./state/loading-saving-charts";
import { stopPlaying } from "./state/playing-pausing";
import { syncPlayback } from "./state/sequencer-state";
import { initCssbStyles } from "./utils/cssb";
import { ImCache, imCacheBegin, imCacheEnd, imState, USE_ANIMATION_FRAME } from "./utils/im-core";
import { imDomRootBegin, imDomRootEnd, imGlobalEventSystemBegin, imGlobalEventSystemEnd } from "./utils/im-dom";
import { imApp, newGlobalContext, setViewEditChart } from "./views/app";

const saveState = loadSaveState();
const globalContext = newGlobalContext(saveState);

function imMainInner(c: ImCache) {
    const fps = imState(c, newFpsCounterState);
    fpsMarkRenderingStart(fps);

    imApp(c, globalContext, fps);

    fpsMarkRenderingEnd(fps);
}

function imMain(c: ImCache) {
    imCacheBegin(c, imMain, USE_ANIMATION_FRAME); {
        imDomRootBegin(c, document.body); {
            const ev = imGlobalEventSystemBegin(c); {
                imMainInner(c);
            } imGlobalEventSystemEnd(c, ev);
        } imDomRootEnd(c, document.body);
    } imCacheEnd(c);
}

const cGlobal: ImCache = [];
imMain(cGlobal);

initCssbStyles();

// initialize the app.
(async () => {
    await initDspLoopInterface({
        render: () => {
            const dspInfo = getDspInfo();
            const sequencer = globalContext.sequencer;

            if (sequencer.isPlaying) {
                if (dspInfo.scheduledPlaybackTime === -1) {
                    stopPlaying(globalContext);
                } else {
                    syncPlayback(sequencer, dspInfo.scheduledPlaybackTime, dspInfo.isPaused);
                }
            } 
        }
    });

    // Our code only works after the audio context has loaded.
    setViewEditChart(globalContext);
})();
