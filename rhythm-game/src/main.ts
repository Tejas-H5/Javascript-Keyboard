import { getDspInfo, initDspLoopInterface } from "src/dsp/dsp-loop-interface";
import { BLOCK, imLayout, imLayoutEnd } from "./components/core/layout";
import { fpsMarkRenderingEnd, fpsMarkRenderingStart, newFpsCounterState } from "./components/fps-counter";
import { debugFlags } from "./debug-flags";
import { cleanupChartRepo, loadChartMetadataList, newDataRepository } from "./state/data-repository";
import { getCurrentChart, newSequencerState, syncPlayback } from "./state/sequencer-state";
import { NAME_OPERATION_COPY } from "./state/ui-state";
import { assert } from "./utils/assert";
import { initCssbStyles } from "./utils/cssb";
import { getDeltaTimeSeconds, ImCache, imCacheBegin, imCacheEnd, imCatch, imEndIf, imIf, imIfElse, imIfEnd, imState, imTry, imTryEnd, isFirstishRender, USE_ANIMATION_FRAME } from "./utils/im-core";
import { EL_H2, elSetStyle, imDomRootBegin, imDomRootEnd, imEl, imElEnd, imGlobalEventSystemBegin, imGlobalEventSystemEnd, imStr } from "./utils/im-dom";
import { waitForOne, newAsyncContext, waitFor } from "./utils/promise-utils";
import { GlobalContext, imApp, imDiagnosticInfo, newGlobalContext, openChartUpdateModal, setCurrentChartMeta, setLoadSaveModalOpen, setViewChartSelect, setViewEditChart, setViewPlayCurrentChart, setViewSoundLab } from "./views/app";

"use strict"

let globalContext: GlobalContext | undefined;

function initGlobalContext() {
    // Our code only works after we've established a connection with our
    // IndexedDB instance, and the audio context has loaded.

    const a = newAsyncContext("Initializing global context");

    const newSequencer = newSequencerState();

    const dspLoaded = waitForOne(a, initDspLoopInterface({
        render: () => {
            const ctx = globalContext;
            if (!ctx) return;

            const sequencer = ctx.sequencer;
            const dspInfo = getDspInfo();

            if (sequencer.isPlaying) {
                // Allow playback to go off the end, so that downstream code may react to this.
                if (dspInfo.scheduledPlaybackTime !== -1) {
                    syncPlayback(sequencer, dspInfo.scheduledPlaybackTime, dspInfo.isPaused);
                } 
            } 
        }
    }));

    const repoConnected = waitForOne(a, newDataRepository());

    const ctxCreated = waitFor(a, [repoConnected, dspLoaded], ([repo, _]) => {
        return newGlobalContext(repo, newSequencer);
    });

    const debugScenarioSetUp = waitFor(a, [ctxCreated], async ([ctx]) => {
        // Setup debug scenario 

        if (debugFlags.testFixDatabase) {
            await cleanupChartRepo(a, ctx.repo)
        }

        if (debugFlags.testSoundLab) {
            setViewSoundLab(ctx);
            return null;
        } 

        if (
            debugFlags.testEditView ||
            debugFlags.testGameplay ||
            debugFlags.testChartSelectView ||
            debugFlags.testCopyModal
        ) {
            await loadChartMetadataList(ctx.repo);

            const charts = ctx.repo.charts.allChartMetadata;
            const meta = charts.find(c => c.name === debugFlags.testChart);
            assert(!!meta);

            await setCurrentChartMeta(ctx, meta);

            const chart = getCurrentChart(ctx);

            if (debugFlags.testEditView) {
                setViewEditChart(ctx);
                if (debugFlags.testLoadSave) {
                    setLoadSaveModalOpen(ctx);
                }
            } else if (debugFlags.testGameplay) {
                setViewPlayCurrentChart(ctx);
            } else if (debugFlags.testChartSelectView) {
                setViewChartSelect(ctx);
            }

            if (debugFlags.testCopyModal) {
                openChartUpdateModal(ctx, chart, NAME_OPERATION_COPY, "This is a test modal");
            }
        }
    });

    return waitFor(a, [ctxCreated, debugScenarioSetUp], ([ctx, _]) => {
        globalContext = ctx;
    });
}
initGlobalContext();

function imMainInner(c: ImCache) {
    if (imIf(c) && globalContext) {
        globalContext.deltaTime = getDeltaTimeSeconds(c);

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

            imDiagnosticInfo(c, fps, globalContext);
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
