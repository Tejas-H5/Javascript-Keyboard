import { imTextInputOneLine } from "src/app-components/text-input-one-line";
import { BLOCK, COL, imAlign, imFg, imFlex, imLayout, imLayoutEnd, imSize, INLINE, NA, PERCENT, ROW, STRETCH } from "src/components/core/layout";
import { deleteChart, getChartAtIndex, } from "src/state/chart-repository";
import {
    playAll,
    stopPlayback
} from "src/state/playing-pausing";
import {
    CHART_STATUS_READONLY,
    isBundledChartId,
    newChart
} from "src/state/sequencer-chart";
import { getCurrentChartMetadata, NAME_OPERATION_COPY, NAME_OPERATION_CREATE, NAME_OPERATION_RENAME } from "src/state/ui-state";
import {
    ImCache,
    imElse,
    imEndFor,
    imEndIf,
    imFor,
    imIf,
    imIfElse,
    imIfEnd,
    imMemo
} from "src/utils/im-core";
import {
    elSetStyle,
    imStr
} from "src/utils/im-dom";
import {
    GlobalContext,
    openChartUpdateModal,
    setCurrentChartMeta,
    setLoadSaveModalClosed
} from "./app";
import { cssVarsApp } from "./styling";
import { moveChartSelection } from "./chart-select";
import { getCurrentChart } from "src/state/sequencer-state";


export function imLoadSaveSidebar(c: ImCache, ctx: GlobalContext) {
    const { ui } = ctx;

    const s = ui.loadSave.modal;
    const chartSelect = ui.chartSelect;
    const currentChart = getCurrentChart(ctx);

    imLayout(c, COL); imSize(c, 25, PERCENT, 0, NA); imAlign(c, STRETCH); {
        const allAvailableCharts = ctx.repo.allChartMetadata;
        imFor(c); for (let i = 0; i < allAvailableCharts.length; i++) {
            imLayout(c, ROW); {
                const chart = allAvailableCharts[i];
                const isFocused = chart === chartSelect.currentChartMeta;

                const shouldRename = isFocused && s.isRenaming && chart;

                if (imMemo(c, isFocused)) {
                    elSetStyle(c, "backgroundColor", isFocused ? cssVarsApp.bg2 : "");
                }

                if (imIf(c) && shouldRename) {
                    const ev = imTextInputOneLine(c, chart.name);
                    if (ev) {
                        if (ev.newName !== undefined) {
                            chart.name = ev.newName;
                        } else if (ev.submit || ev.cancel) {
                            s.isRenaming = false;
                        }
                    }
                } else {
                    imElse(c);

                    imLayout(c, BLOCK); {
                        let name = chart.name || "untitled"
                        imStr(c, name);
                        if (imIf(c) && isBundledChartId(chart.id)) {
                            imLayout(c, INLINE); imFg(c, cssVarsApp.error); {
                                imStr(c, " (readonly)");
                            } imLayoutEnd(c);
                        } imIfEnd(c);
                    } imLayoutEnd(c);
                } imEndIf(c);
            } imLayoutEnd(c);
        } imEndFor(c);

        imLayout(c, BLOCK); imFlex(c); imLayoutEnd(c);

        imLayout(c, BLOCK); {
            if (!ctx.handled && ctx.keyPressState?.keyUpper === "H") {
                s.helpEnabled = !s.helpEnabled;
                ctx.handled = true;
            }

            if (imIf(c) && s.helpEnabled) {
                imLayout(c, BLOCK); imStr(c, "[Up/Down] -> move, preview"); imLayoutEnd(c);
                imLayout(c, BLOCK); imStr(c, "[Enter] -> start editing"); imLayoutEnd(c);
                imLayout(c, BLOCK); imStr(c, "[R] -> rename"); imLayoutEnd(c);
                imLayout(c, BLOCK); imStr(c, "[N] -> new"); imLayoutEnd(c);
                if (imIf(c) && currentChart) {
                    imLayout(c, BLOCK); imStr(c, "[C] -> copy"); imLayoutEnd(c);
                } imIfEnd(c);
                imLayout(c, BLOCK); imStr(c, "[X] -> delete"); imLayoutEnd(c);
            } else {
                imIfElse(c);

                imStr(c, "[H] to toggle help");
            } imIfEnd(c);


        } imLayoutEnd(c);
    } imLayoutEnd(c);

    // handle keys
    if (!ctx.handled && ctx.keyPressState) {
        let handled = false;

        const { key, keyUpper, listNavAxis, isLoadSavePressed, shiftPressed } = ctx.keyPressState;

        if (s.isRenaming) {
            // the input component over there will handle these.
        } else {
            if (listNavAxis !== 0) {
                moveChartSelection(ctx, listNavAxis)?.then(() => {
                    playAll(ctx);
                });
                handled = true;
            } else if (key === "Enter") {
                if (shiftPressed) {
                    // TODO: create new chart here
                    // const chart = addNewUserChart(ctx);
                } else {
                    // The current chart has already been selected. We just need to close this modal
                    setLoadSaveModalClosed(ctx);
                }

                handled = true;
            } else if (key === "Escape" || isLoadSavePressed) {
                if (ctx.sequencer.isPlaying) {
                    stopPlayback(ctx, true);
                } else if (
                    s.chartBeforeOpenMeta &&
                    s.chartBeforeOpenMeta.id !== currentChart?.id
                ) {
                    setCurrentChartMeta(ctx, s.chartBeforeOpenMeta);
                } else {
                    setLoadSaveModalClosed(ctx);
                }

                handled = true;
            } else if (
                currentChart && 
                currentChart._savedStatus !== CHART_STATUS_READONLY &&
                (key === "Delete" || keyUpper === "X")
            ) {
                const meta = getCurrentChartMetadata(ctx);
                if (meta) {
                    setCurrentChartMeta(ctx, getChartAtIndex(ctx.repo, meta._index));
                    deleteChart(ctx.repo, currentChart);
                    chartSelect.currentChartMeta
                }
                handled = true;
            } else if (currentChart && keyUpper === "R") {
                openChartUpdateModal(ctx, currentChart, NAME_OPERATION_RENAME, "Rename chart");
                handled = true;
            } else if (keyUpper === "N") {
                openChartUpdateModal(ctx, newChart(""), NAME_OPERATION_CREATE, "Create new chart");
                handled = true;
            } else if (currentChart && keyUpper === "C") {
                openChartUpdateModal(ctx, currentChart, NAME_OPERATION_COPY , "Copy this chart");
                handled = true;
            }
        }

        ctx.handled = handled;
    }
}
