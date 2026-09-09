import { getDspInfo, initDspLoopInterface } from "src/dsp/dsp-loop-interface.ts";
import { el, im, ImCache, imdom } from "src/utils/im-js";
import { debugFlags } from "./debug-flags.ts";
import { cleanupChartRepo, DataRepository, loadAllEffectRackPresets, loadChartMetadataList, newDataRepository } from "./state/data-repository.ts";
import { getCurrentChart, newSequencerState, syncPlayback } from "./state/sequencer-state.ts";
import { NAME_OPERATION_COPY } from "./state/ui-state.ts";
import { assert } from "./utils/assert.ts";
import { BLOCK, imui } from "src/utils/im-js/im-ui/im-ui.ts";
import { Done, DONE, PARALLELISM, Then, trackTask } from "./utils/async-utils.ts";
import { GlobalContext, imApp, imDiagnosticInfo, newGlobalContext, openChartUpdateModal, setCurrentChartMeta, setLoadSaveModalOpen, setViewChartSelect, setViewEditChart, setViewPlayCurrentChart, setViewSoundLab } from "./views/app.ts";

"use strict"

let globalContext: GlobalContext | undefined;

function initGlobalContext(cb: Then<void>): Done {
    cb = trackTask("Initializing state", cb);

    // Our code only works after we've established a connection with our
    // IndexedDB instance, and the audio context has loaded.

    let dspInitialized = false;
    let repo: DataRepository | undefined;

    initDspLoopInterface(() => {
        dspInitialized = true;
        return onSubsystemsInitialized();
    }, () => {
        if (!globalContext) return;

        const sequencer = globalContext.sequencer;
        const dspInfo = getDspInfo();
        syncPlayback(sequencer, dspInfo);
    });

    newDataRepository(repoLoaded => { 
        repo = repoLoaded;
        return onSubsystemsInitialized();
    });

    return PARALLELISM;

    function onSubsystemsInitialized(): Done {
        if (!dspInitialized || !repo) return PARALLELISM;

        const newSequencer = newSequencerState();
        const ctx = newGlobalContext(repo, newSequencer);
        globalContext = ctx;

        if (debugFlags.testFixDatabase) {
            return cleanupChartRepo(ctx.repo, () => setupDebugScenario(ctx));
        }

        return setupDebugScenario(ctx);
    }

    function setupDebugScenario(ctx: GlobalContext): Done {
        if (debugFlags.testSoundLab) {
            setViewSoundLab(ctx);

            if (debugFlags.testSoundLabLoadPreset) {
                return loadAllEffectRackPresets(ctx.repo, (presetMetadatas) => {
                    const presetMeta = presetMetadatas.find(p => p.name === debugFlags.testSoundLabLoadPreset);
                    if (presetMeta) {
                        throw new Error("fix this debug scenario");
                        // TODO: The debug scenario hasn't been updated
                        // loadEffectRackPreset(ctx.repo, presetMeta, preset => {
                        //     const playSetings = getCurrentPlaySettings();
                        //     playSetings.parameters
                        // });
                    }

                    return cb();
                });
            }

            return cb();
        }

        if (
            debugFlags.testEditView ||
            debugFlags.testGameplay ||
            debugFlags.testChartSelectView ||
            debugFlags.testCopyModal
        ) {
            return loadChartMetadataList(ctx.repo, (charts) => {
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
                        openChartUpdateModal(ctx, chart, NAME_OPERATION_COPY);
                    }

                    return cb();
                });
            });
        }

        return cb();
    }
}

initGlobalContext(() => DONE);

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

imui.init();

imMain([]);
