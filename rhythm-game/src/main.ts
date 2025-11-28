import { getDspInfo, initDspLoopInterface } from "src/dsp/dsp-loop-interface";
import { BLOCK, imLayout, imLayoutEnd } from "./components/core/layout";
import { fpsMarkRenderingEnd, fpsMarkRenderingStart, newFpsCounterState } from "./components/fps-counter";
import { debugFlags } from "./debug-flags";
import { cleanupChartRepo, loadChartMetadataList, newChartRepository } from "./state/chart-repository";
import { loadSaveState } from "./state/loading-saving-charts";
import { getCurrentChart, newSequencerState, syncPlayback } from "./state/sequencer-state";
import { NAME_OPERATION_COPY } from "./state/ui-state";
import { assert } from "./utils/assert";
import { initCssbStyles } from "./utils/cssb";
import { getDeltaTimeSeconds, ImCache, imCacheBegin, imCacheEnd, imCatch, imEndIf, imIf, imIfElse, imIfEnd, imState, imTry, imTryEnd, isFirstishRender, USE_ANIMATION_FRAME } from "./utils/im-core";
import { EL_H2, elSetStyle, imDomRootBegin, imDomRootEnd, imEl, imElEnd, imGlobalEventSystemBegin, imGlobalEventSystemEnd, imStr } from "./utils/im-dom";
import { imApp, newGlobalContext, openChartUpdateModal, setCurrentChartMeta, setLoadSaveModalOpen, setViewChartSelect, setViewEditChart, setViewPlayCurrentChart, setViewSoundLab } from "./views/app";
import { TrackedPromise } from "./utils/promise-utils";

"use strict"

const programState = new TrackedPromise(async () => {
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

    const [repo, _dspVoid] = await Promise.all([repoPromise, dspPromise]);

    const ctx = newGlobalContext(
        saveState,
        repo,
        sequencer,
    );

    if (debugFlags.testFixDatabase) {
        await cleanupChartRepo(repo);
    }

    if (debugFlags.testSoundLab) {
        setViewSoundLab(ctx);
    } else if (
        debugFlags.testEditView ||
        debugFlags.testGameplay ||
        debugFlags.testChartSelectView ||
        debugFlags.testCopyModal
    ) {
        loadChartMetadataList(ctx.repo).then(() => {
            const charts = ctx.repo.allChartMetadata;
            const meta = charts.find(c => c.name === debugFlags.testChart);
            assert(!!meta);
            setCurrentChartMeta(ctx, meta).then(() => {
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
            });
        });
    }

    return ctx;
}, "Entrypoint");

function imMainInner(c: ImCache) {
    const globalContext = programState.value;


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
