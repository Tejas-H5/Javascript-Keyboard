import { getDspInfo, initDspLoopInterface } from "src/dsp/dsp-loop-interface";
import { BLOCK, imLayout, imLayoutEnd } from "./components/core/layout";
import { fpsMarkRenderingEnd, fpsMarkRenderingStart, newFpsCounterState } from "./components/fps-counter";
import { TEST_EDIT_VIEW, TEST_CHART, TEST_GAMEPLAY, TEST_CHART_SELECT_VIEW } from "./debug-flags";
import { loadSaveState } from "./state/loading-saving-charts";
import { getChart } from "./state/saved-state";
import { syncPlayback } from "./state/sequencer-state";
import { assert } from "./utils/assert";
import { initCssbStyles } from "./utils/cssb";
import { ImCache, imCacheBegin, imCacheEnd, imCatch, imIf, imIfElse, imIfEnd, imState, imTry, imTryEnd, isFirstishRender, USE_ANIMATION_FRAME } from "./utils/im-core";
import { EL_H2, elSetStyle, imDomRootBegin, imDomRootEnd, imEl, imElEnd, imGlobalEventSystemBegin, imGlobalEventSystemEnd, imStr } from "./utils/im-dom";
import { imApp, newGlobalContext, setCurrentChart, setViewChartSelect, setViewEditChart, setViewPlayCurrentChart } from "./views/app";

const saveState = loadSaveState();
const globalContext = newGlobalContext(saveState);

function imMainInner(c: ImCache) {
    const fps = imState(c, newFpsCounterState);
    fpsMarkRenderingStart(fps);

    const tryState = imTry(c); try {
        const { err } = tryState;
        if (imIf(c) && !err) {
            imApp(c, globalContext, fps);
        } else {
            imIfElse(c);

            imLayout(c, BLOCK); {
                imEl(c, EL_H2); imStr(c, "An error occured..."); imElEnd(c, EL_H2);
                imLayout(c, BLOCK); {
                    imStr(c, err);
                } imLayoutEnd(c);

                if (imIf(c) && err instanceof Error && err.stack) {
                    imLayout(c, BLOCK); {
                        if (isFirstishRender(c)) {
                            elSetStyle(c, "fontFamily", "monospace");
                            elSetStyle(c, "whiteSpace", "pre");
                        }

                        imStr(c, err.stack);
                    } imLayoutEnd(c);
                } imIfEnd(c);
            } imLayoutEnd(c);
        } imIfEnd(c);
    } catch(err) {
        imCatch(c, tryState, err);
        console.error("An error in the render loop:", err);
    } imTryEnd(c, tryState);

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
                // Allow playback to go off the end, so that downstream code may react to this.
                if (dspInfo.scheduledPlaybackTime !== -1) {
                    syncPlayback(sequencer, dspInfo.scheduledPlaybackTime, dspInfo.isPaused);
                } 
            } 
        }
    });

    // Our code only works after the audio context has loaded.

    if (
        TEST_EDIT_VIEW || 
        TEST_GAMEPLAY ||
        TEST_CHART_SELECT_VIEW
    ) {
        const chart = getChart(globalContext.savedState, TEST_CHART);
        assert(!!chart);
        setCurrentChart(globalContext, chart);

        if (TEST_EDIT_VIEW) {
            setViewEditChart(globalContext);
        } else if (TEST_GAMEPLAY) {
            setViewPlayCurrentChart(globalContext);
        } else if (TEST_CHART_SELECT_VIEW) {
            setViewChartSelect(globalContext);
        }
    }

})();
