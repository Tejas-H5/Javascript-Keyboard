import { getDspInfo, initDspLoopInterface } from "src/dsp/dsp-loop-interface.ts";
import { BLOCK, imLayoutBegin, imLayoutEnd } from "./components/core/layout.ts";
import { debugFlags } from "./debug-flags.ts";
import { cleanupChartRepo, loadAllEffectRackPresets, loadChartMetadataList, newDataRepository } from "./state/data-repository.ts";
import { getCurrentChart, newSequencerState, syncPlayback } from "./state/sequencer-state.ts";
import { NAME_OPERATION_COPY } from "./state/ui-state.ts";
import { assert } from "./utils/assert.ts";
import { AsyncCb, Done, done, toAsyncCallback } from "./utils/async-utils.ts";
import { getDeltaTimeSeconds, ImCache, imCacheBegin, imCacheEnd, imCatch, imEndIf, imIf, imIfElse, imIfEnd, imTry, imTryEnd, isFirstishRender, USE_REQUEST_ANIMATION_FRAME } from "./utils/im-core.ts";
import { EL_H2, elSetStyle, imDomRootBegin, imDomRootEnd, imElBegin, imElEnd, imGlobalEventSystemBegin, imGlobalEventSystemEnd, imStr } from "./utils/im-dom.ts";
import { GlobalContext, imApp, imDiagnosticInfo, newGlobalContext, openChartUpdateModal, setCurrentChartMeta, setLoadSaveModalOpen, setViewChartSelect, setViewEditChart, setViewPlayCurrentChart, setViewSoundLab } from "./views/app.ts";

"use strict"

let globalContext: GlobalContext | undefined;

function initGlobalContext(cb: AsyncCb<void>): Done {
    // Our code only works after we've established a connection with our
    // IndexedDB instance, and the audio context has loaded.

    const dspInitialized = initDspLoopInterface({
        onDspMessage: () => {
            const ctx = globalContext;
            if (!ctx) return;

            const sequencer = ctx.sequencer;
            const dspInfo = getDspInfo();

            syncPlayback(sequencer, dspInfo);
        }
    });

    return toAsyncCallback(dspInitialized, () => {
        return newDataRepository((repo, err) => {
            if (!repo) return cb(undefined, err);

            const newSequencer = newSequencerState();
            const ctx = newGlobalContext(repo, newSequencer);
            globalContext = ctx;

            if (debugFlags.testFixDatabase) {
                return cleanupChartRepo(ctx.repo, () => onDatabaseCleaned(ctx));
            }

            return onDatabaseCleaned(ctx);
        });

        function onDatabaseCleaned(ctx: GlobalContext): Done {
            if (debugFlags.testSoundLab) {
                setViewSoundLab(ctx);

                if (!debugFlags.testSoundLabLoadPreset) return cb();

                return loadAllEffectRackPresets(ctx.repo, (presets) => {
                    if (!presets) return cb();

                    // const preset = presets.find(p => p.name === debugFlags.testSoundLabLoadPreset);
                    // if (preset) {
                    //     const playSetings = getCurrentPlaySettings();
                    //     playSetings.parameters.rack = deserializeEffectRack(preset.serialized);
                    // }

                    return cb();
                });
            }

            if (
                debugFlags.testEditView ||
                debugFlags.testGameplay ||
                debugFlags.testChartSelectView ||
                debugFlags.testCopyModal
            ) {
                return loadChartMetadataList(ctx.repo, (charts, err) => {
                    if (!charts) return cb(undefined, err);

                    const meta = charts.find(c => c.name === debugFlags.testChart);
                    assert(!!meta);

                    return setCurrentChartMeta(ctx, meta, () => {
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

                        return cb();
                    });
                });
            }

            return cb();
        }
    });
}

initGlobalContext(done);

function imMainInner(c: ImCache) {
    if (imIf(c) && globalContext) {
        globalContext.deltaTime = getDeltaTimeSeconds(c);

        const tryState = imTry(c); try {
            const { err } = tryState;
            if (imIf(c) && !err) {
                imApp(c, globalContext); // imMainInnerInner. xd
            } else {
                imIfElse(c);

                imLayoutBegin(c, BLOCK); {
                    imElBegin(c, EL_H2); imStr(c, "An error occured..."); imElEnd(c, EL_H2);
                    imLayoutBegin(c, BLOCK); {
                        imStr(c, err);
                    } imLayoutEnd(c);

                    if (imIf(c) && err instanceof Error && err.stack) {
                        imLayoutBegin(c, BLOCK); {
                            if (isFirstishRender(c)) {
                                elSetStyle(c, "fontFamily", "monospace");
                                elSetStyle(c, "whiteSpace", "pre");
                            }

                            imStr(c, err.stack);
                        } imLayoutEnd(c);
                    } imIfEnd(c);
                } imLayoutEnd(c);
            } imIfEnd(c);

            imDiagnosticInfo(c, globalContext);
        } catch (err) {
            imCatch(c, tryState, err);
            console.error("An error in the render loop:", err);
        } imTryEnd(c, tryState);
    } else {
        imIfElse(c);

        imLayoutBegin(c, BLOCK); imStr(c, "Loading..."); imLayoutEnd(c);
    } imEndIf(c);
}

export function imMain(c: ImCache) {
    imCacheBegin(c, imMain, USE_REQUEST_ANIMATION_FRAME); {
        imDomRootBegin(c, document.body); {
            const ev = imGlobalEventSystemBegin(c); {
                imMainInner(c);
            } imGlobalEventSystemEnd(c, ev);
        } imDomRootEnd(c, document.body);
    } imCacheEnd(c);
}
