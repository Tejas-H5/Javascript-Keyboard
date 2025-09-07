import { BLOCK, COL, imAlign, imFlex, imGap, imLayout, imLayoutEnd, imSize, NA, PERCENT, PX, ROW, STRETCH } from "src/components/core/layout";
import { imTextInputBegin, imTextInputEnd } from "src/components/text-input";
import { stopPlaying, } from "src/state/playing-pausing";
import { getPlaybackDuration } from "src/state/sequencer-chart";
import {
    getCurrentPlayingTimeRelative,
    recomputeState
} from "src/state/sequencer-state";
import { assert } from "src/utils/assert";
import { ImCache, imElse, imEndFor, imEndIf, imFor, imIf, imIfEnd, imMemo, isFirstishRender } from "src/utils/im-core";
import { EL_B, EL_I, elHasMousePress, elSetStyle, EV_INPUT, EV_KEYDOWN, imEl, imElEnd, imOn, imStr } from "src/utils/im-dom";
import { imSequencer } from "src/views/sequencer";
import { GlobalContext, setViewTestCurrentChart } from "./app";
import { cssVarsApp } from "./styling";
import { imButtonIsClicked } from "src/components/button";

export function imEditView(c: ImCache, ctx: GlobalContext) {
    const { sequencer, ui } = ctx;

    const loadSaveModal = ui.loadSave.modal;

    recomputeState(sequencer);

    const currentTime = getCurrentPlayingTimeRelative(sequencer);
    const duration = getPlaybackDuration(sequencer._currentChart);
    if (currentTime > duration) {
        stopPlaying(ctx);
    }

    imLayout(c, ROW); imFlex(c); {
        imSequencer(c, ctx);

        if (imIf(c) && loadSaveModal.open) {
            // Load save panel

            imLayout(c, COL); imSize(c, 33, PERCENT, 0, NA); imAlign(c, STRETCH); {
                imFor(c); for (let i = 0; i <= ctx.savedState.userCharts.length; i++) {
                    imLayout(c, ROW); {
                        const chart = i < ctx.savedState.userCharts.length ? ctx.savedState.userCharts[i] : null;
                        const isFocused = i === loadSaveModal.idx;

                        const shouldRename = isFocused && loadSaveModal.isRenaming && chart;
                        const shouldRenameChanged = imMemo(c, shouldRename);

                        elSetStyle(c,"backgroundColor", isFocused ? cssVarsApp.bg2 : "");

                        if (imIf(c) && shouldRename) {
                            const input = imTextInputBegin(c, {
                                value: chart.name,
                                placeholder: "enter new name",
                            }); {
                                if (imMemo(c, true)) {
                                    setTimeout(() => {
                                        input.root.focus();
                                        input.root.select();
                                    }, 1);
                                }

                                if (isFirstishRender(c)) {
                                    elSetStyle(c,"width", "100%");
                                }

                                if (shouldRenameChanged) {
                                    input.root.focus();
                                    input.root.selectionStart = 0;
                                    input.root.selectionEnd = chart.name.length;
                                }

                                const inputEvent = imOn(c, EV_INPUT);
                                if (inputEvent) {
                                    chart.name = input.root.value;
                                }

                                const keyDown = imOn(c, EV_KEYDOWN);
                                if (keyDown) {
                                    if (keyDown.key === "Enter" || keyDown.key === "Escape") {
                                        loadSaveModal.isRenaming = false;
                                    }
                                }
                            } imTextInputEnd(c);
                        } else {
                            imElse(c);

                            imLayout(c, BLOCK); {
                                let name;
                                if (chart === null) {
                                    name = "[+ new chart]";
                                } else {
                                    name = chart.name || "untitled"
                                }

                                imStr(c, name);

                                if (elHasMousePress(c)) {
                                    // TODO: fix up mouse interactions
                                    // if (chart) {
                                    //     setCurrentChart(ctx, chart);
                                    // } else {
                                    //     const newChart = addNewUserChart(ctx);
                                    //     setCurrentChart(ctx, newChart);
                                    // }
                                }
                            } imLayoutEnd(c);
                        } imEndIf(c);
                    } imLayoutEnd(c);
                } imEndFor(c);

                imLayout(c, BLOCK); imFlex(c); imLayoutEnd(c);

                imLayout(c, BLOCK); {
                    imStr(c, "[R] to rename");
                } imLayoutEnd(c);
            } imLayoutEnd(c);
        } imEndIf(c);
    } imLayoutEnd(c);
}
