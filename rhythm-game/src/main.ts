import { getDspInfo, initDspLoopInterface } from "src/dsp/dsp-loop-interface.ts";
import { debugFlags } from "./debug-flags.ts";
import { cleanupChartRepo, loadAllEffectRackPresets, loadChartMetadataList, newDataRepository } from "./state/data-repository.ts";
import { getCurrentChart, newSequencerState, syncPlayback } from "./state/sequencer-state.ts";
import { NAME_OPERATION_COPY } from "./state/ui-state.ts";
import { assert } from "./utils/assert.ts";
import { AsyncCb, Done, done, toAsyncCallback } from "./utils/async-utils.ts";
import { im, ImCache, imdom, el, ev, } from "src/utils/im-js";

import { GlobalContext, imApp, imDiagnosticInfo, newGlobalContext, openChartUpdateModal, setCurrentChartMeta, setLoadSaveModalOpen, setViewChartSelect, setViewEditChart, setViewPlayCurrentChart, setViewSoundLab } from "./views/app.ts";
import { BLOCK, imui } from "src/utils/im-js/im-ui/im-ui.ts";

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
    if (im.If(c) && globalContext) {
        globalContext.deltaTime = im.getDeltaTimeSeconds(c);

        const tryState = im.Try(c); try {
            const { err } = tryState;
            if (im.If(c) && !err) {
                imApp(c, globalContext); // imMainInnerInner. xd
            } else {
                im.IfElse(c);

                imui.Begin(c, BLOCK); {
                    imdom.ElBegin(c, el.H2); imdom.Str(c, "An error occured..."); imdom.ElEnd(c, el.H2);
                    imui.Begin(c, BLOCK); {
                        imdom.Str(c, err);
                    } imui.End(c);

                    if (im.If(c) && err instanceof Error && err.stack) {
                        imui.Begin(c, BLOCK); {
                            if (im.isFirstishRender(c)) {
                                imdom.setStyle(c, "fontFamily", "monospace");
                                imdom.setStyle(c, "whiteSpace", "pre");
                            }

                            imdom.Str(c, err.stack);
                        } imui.End(c);
                    } im.IfEnd(c);
                } imui.End(c);
            } im.IfEnd(c);

            imDiagnosticInfo(c, globalContext);
        } catch (err) {
            im.Catch(c, tryState, err);
            console.error("An error in the render loop:", err);
        } im.TryEnd(c, tryState);
    } else {
        im.IfElse(c);

        imui.Begin(c, BLOCK); imdom.Str(c, "Loading..."); imui.End(c);
    } im.IfEnd(c);
}

export function imMain(c: ImCache) {
    im.CacheBegin(c, imMain); {
        imdom.RootBegin(c, document.body); {
            const ev = imdom.GlobalEventSystemBegin(c); {
                imMainInner(c);
            } imdom.GlobalEventSystemEnd(c, ev);
        } imdom.RootEnd(c, document.body);
    } im.CacheEnd(c);
}
