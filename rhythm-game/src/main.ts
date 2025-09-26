import { getDspInfo, initDspLoopInterface } from "src/dsp/dsp-loop-interface";
import { BLOCK, imLayout, imLayoutEnd } from "./components/core/layout";
import { fpsMarkRenderingEnd, fpsMarkRenderingStart, newFpsCounterState } from "./components/fps-counter";
import { TEST_CHART, TEST_CHART_SELECT_VIEW, TEST_COPY_MODAL, TEST_EDIT_VIEW, TEST_GAMEPLAY, TEST_LOAD_SAVE } from "./debug-flags";
import { loadSaveState } from "./state/loading-saving-charts";
import { newSequencerState, syncPlayback } from "./state/sequencer-state";
import { getCurrentChartMetadata, NAME_OPERATION_COPY } from "./state/ui-state";
import { assert } from "./utils/assert";
import { initCssbStyles } from "./utils/cssb";
import { ImCache, imCacheBegin, imCacheEnd, imCatch, imEndIf, imIf, imIfElse, imIfEnd, imState, imTry, imTryEnd, isFirstishRender, USE_ANIMATION_FRAME } from "./utils/im-core";
import { EL_H2, elSetStyle, imDomRootBegin, imDomRootEnd, imEl, imElEnd, imGlobalEventSystemBegin, imGlobalEventSystemEnd, imStr } from "./utils/im-dom";
import { newAsyncData } from "./utils/promise-utils";
import { imApp, newGlobalContext, openChartUpdateModal, setCurrentChartIdx, setLoadSaveModalOpen, setViewChartSelect, setViewEditChart, setViewPlayCurrentChart } from "./views/app";
import { loadChartMetadataList, newChartRepository, queryChart } from "./state/chart-repository";

const programState = newAsyncData("Entrypoint", async () => {
    // Our code only works after we've established a connection with our
    // IndexedDB instance, and the audio context has loaded.
    
    const repoPromise = newChartRepository();

    const sequencer = newSequencerState();
    const dspPromise = initDspLoopInterface({
        render: () => {
            const dspInfo = getDspInfo();

            if (sequencer.isPlaying) {
                // Allow playback to go off the end, so that downstream code may react to this.
                if (dspInfo.scheduledPlaybackTime !== -1) {
                    syncPlayback(sequencer, dspInfo.scheduledPlaybackTime, dspInfo.isPaused);
                } 
            } 
        }
    });

    const saveState = loadSaveState();

    const [repo, dspVoid] = await Promise.all([repoPromise, dspPromise]);

    const ctx = newGlobalContext(
        saveState,
        repo,
        sequencer,
    );

    if (
        TEST_EDIT_VIEW || 
        TEST_GAMEPLAY ||
        TEST_CHART_SELECT_VIEW ||
        TEST_COPY_MODAL
    ) {

        loadChartMetadataList(repo).then((charts) => {
            const idx = charts.findIndex(c => c.name === TEST_CHART);
            const metadata = getCurrentChartMetadata(ctx.ui.chartSelect);
            assert(!!metadata);
            ctx.ui.chartSelect.availableCharts = charts;
            setCurrentChartIdx(ctx, idx)?.then((chart) => {
                if (TEST_EDIT_VIEW) {
                    setViewEditChart(ctx);
                    if (TEST_LOAD_SAVE) {
                        setLoadSaveModalOpen(ctx, chart, true);
                    }
                } else if (TEST_GAMEPLAY) {
                    setViewPlayCurrentChart(ctx);
                } else if (TEST_CHART_SELECT_VIEW) {
                    setViewChartSelect(ctx);
                } else if (TEST_COPY_MODAL) {
                    openChartUpdateModal(ctx, chart, NAME_OPERATION_COPY, "This is a test modal");
                }
            });
        });
    }

    return ctx;
});

function imMainInner(c: ImCache) {
    const globalContext = programState.data;

    if (imIf(c) && globalContext) {
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
        } catch (err) {
            imCatch(c, tryState, err);
            console.error("An error in the render loop:", err);
        } imTryEnd(c, tryState);

        fpsMarkRenderingEnd(fps);
    } else {
        imIfElse(c);

        imLayout(c, BLOCK); imStr(c, "Loading..."); imLayoutEnd(c);
    } imEndIf(c);
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
