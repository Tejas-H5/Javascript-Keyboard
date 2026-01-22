import { imTextInputOneLine } from "src/app-components/text-input-one-line";
import { BLOCK, COL, imAlign, imBg, imFg, imFlex, imLayoutBegin, imLayoutEnd, imSize, INLINE, NA, PERCENT, ROW, STRETCH } from "src/components/core/layout";
import { deleteChart } from "src/state/data-repository";
import {
    playAll,
    stopPlayback
} from "src/state/playing-pausing";
import {
    CHART_STATUS_READONLY,
    isBundledChartId,
    newChart
} from "src/state/sequencer-chart";
import { getCurrentChart } from "src/state/sequencer-state";
import { getCurrentChartMetadata, NAME_OPERATION_COPY, NAME_OPERATION_CREATE, NAME_OPERATION_RENAME } from "src/state/ui-state";
import {
    ImCache,
    imElse,
    imEndFor,
    imEndIf,
    imFor,
    imIf,
    imIfElse,
    imIfEnd
} from "src/utils/im-core";
import {
    imStr
} from "src/utils/im-dom";
import { newAsyncContext } from "src/utils/promise-utils";
import {
    GlobalContext,
    openChartUpdateModal,
    setCurrentChartMeta,
    setLoadSaveModalClosed
} from "./app";
import { moveChartSelection } from "./chart-select";
import { cssVarsApp } from "./styling";


export function imLoadSaveSidebar(c: ImCache, ctx: GlobalContext) {
    const { ui } = ctx;

    const s = ui.loadSave.modal;
    const chartSelect = ui.chartSelect;
    const currentChart = getCurrentChart(ctx);

    imLayoutBegin(c, COL); imSize(c, 25, PERCENT, 0, NA); imAlign(c, STRETCH); {
        const allAvailableCharts = ctx.repo.charts.allChartMetadata;
        imFor(c); for (let i = 0; i < allAvailableCharts.length; i++) {
            const chart = allAvailableCharts[i];
            const isFocused = chart === chartSelect.currentChartMeta;
            const shouldRename = isFocused && s.isRenaming && chart;

            imLayoutBegin(c, ROW); imBg(c, isFocused ? cssVarsApp.bg2 : ""); {
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

                    imLayoutBegin(c, BLOCK); {
                        let name = chart.name || "untitled"
                        imStr(c, name);
                        if (imIf(c) && isBundledChartId(chart.id)) {
                            imLayoutBegin(c, INLINE); imFg(c, cssVarsApp.error); {
                                imStr(c, " (readonly)");
                            } imLayoutEnd(c);
                        } imIfEnd(c);
                    } imLayoutEnd(c);
                } imEndIf(c);
            } imLayoutEnd(c);
        } imEndFor(c);

        imLayoutBegin(c, BLOCK); imFlex(c); imLayoutEnd(c);

        imLayoutBegin(c, BLOCK); {
            if (!ctx.handled && ctx.keyPressState?.keyUpper === "H") {
                s.helpEnabled = !s.helpEnabled;
                ctx.handled = true;
            }

            if (imIf(c) && s.helpEnabled) {
                imLayoutBegin(c, BLOCK); imStr(c, "[Up/Down] -> move, preview"); imLayoutEnd(c);
                imLayoutBegin(c, BLOCK); imStr(c, "[Enter] -> start editing"); imLayoutEnd(c);
                imLayoutBegin(c, BLOCK); imStr(c, "[R] -> rename"); imLayoutEnd(c);
                imLayoutBegin(c, BLOCK); imStr(c, "[N] -> new"); imLayoutEnd(c);
                if (imIf(c) && currentChart) {
                    imLayoutBegin(c, BLOCK); imStr(c, "[C] -> copy"); imLayoutEnd(c);
                } imIfEnd(c);
                imLayoutBegin(c, BLOCK); imStr(c, "[X] -> delete"); imLayoutEnd(c);
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
                    deleteChart(newAsyncContext("Deleting chart"), ctx.repo, currentChart);
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
