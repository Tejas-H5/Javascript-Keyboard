import { imTextInputOneLine } from "src/app-components/text-input-one-line.ts";
import {imui, BLOCK, COL, INLINE, NA, PERCENT, ROW, STRETCH,} from "src/utils/im-js/im-ui";
import { deleteChart } from "src/state/data-repository.ts";
import {
    playAll,
    stopPlayback
} from "src/state/playing-pausing.ts";
import {
    CHART_STATUS_READONLY,
    isBundledChartId,
    newChart
} from "src/state/sequencer-chart.ts";
import { getCurrentChart } from "src/state/sequencer-state.ts";
import { getCurrentChartMetadata, NAME_OPERATION_COPY, NAME_OPERATION_CREATE, NAME_OPERATION_DELETE, NAME_OPERATION_RENAME } from "src/state/ui-state.ts";
import { im, ImCache, imdom } from "src/utils/im-js";
import { arrayAt } from "src/utils/array-utils.ts";
import { assert } from "src/utils/assert.ts";
import {
    GlobalContext,
    openChartUpdateModal,
    setCurrentChartMeta,
    setLoadSaveModalClosed
} from "./app.ts";
import { moveChartSelection } from "./chart-select.ts";
import { cssVarsApp } from "./styling.ts";
import { DONE } from "src/utils/async-utils.ts";


export function imLoadSaveSidebar(c: ImCache, ctx: GlobalContext) {
    const { ui } = ctx;

    const s = ui.loadSave.modal;
    const chartSelect = ui.chartSelect;
    const currentChart = getCurrentChart(ctx);

    imui.Begin(c, COL); imui.Size(c, 25, PERCENT, 0, NA); imui.Align(c, STRETCH); {
        const allAvailableCharts = ctx.repo.charts.allChartMetadata;
        im.For(c); for (let i = 0; i < allAvailableCharts.length; i++) {
            const chart = allAvailableCharts[i];
            const isFocused = chart === chartSelect.currentChartMeta;
            const shouldRename = isFocused && s.isRenaming && chart;

            imui.Begin(c, ROW); imui.Bg(c, isFocused ? cssVarsApp.bg2 : ""); {
                if (im.If(c) && shouldRename) {
                    const ev = imTextInputOneLine(c, chart.name);
                    if (ev) {
                        if (ev.newName !== undefined) {
                            chart.name = ev.newName;
                        } 
                        if (ev.submit || ev.cancel) {
                            s.isRenaming = false;
                            ctx.handled = true;
                        }
                    }
                } else {
                    im.Else(c);

                    imui.Begin(c, BLOCK); {
                        let name = chart.name || "untitled"
                        imdom.Str(c, name);
                        if (im.If(c) && isBundledChartId(chart.id)) {
                            imui.Begin(c, INLINE); imui.Fg(c, cssVarsApp.error); {
                                imdom.Str(c, " (readonly)");
                            } imui.End(c);
                        } im.IfEnd(c);
                    } imui.End(c);
                } im.IfEnd(c);
            } imui.End(c);
        } im.ForEnd(c);

        imui.Begin(c, BLOCK); imui.Flex(c); imui.End(c);

        imui.Begin(c, BLOCK); {
            if (!ctx.handled && ctx.keyPressState?.keyUpper === "H") {
                s.helpEnabled = !s.helpEnabled;
                ctx.handled = true;
            }

            if (im.If(c) && s.helpEnabled) {
                imui.Begin(c, BLOCK); imdom.Str(c, "[Up/Down] -> move, preview"); imui.End(c);
                imui.Begin(c, BLOCK); imdom.Str(c, "[Enter] -> start editing"); imui.End(c);
                imui.Begin(c, BLOCK); imdom.Str(c, "[R] -> rename"); imui.End(c);
                imui.Begin(c, BLOCK); imdom.Str(c, "[N] -> new"); imui.End(c);
                if (im.If(c) && currentChart) {
                    imui.Begin(c, BLOCK); imdom.Str(c, "[C] -> copy"); imui.End(c);
                } im.IfEnd(c);
                imui.Begin(c, BLOCK); imdom.Str(c, "[X] -> delete"); imui.End(c);
            } else {
                im.IfElse(c);

                imdom.Str(c, "[H] to toggle help");
            } im.IfEnd(c);


        } imui.End(c);
    } imui.End(c);

    // handle keys
    if (!ctx.handled && ctx.keyPressState) {
        let handled = false;

        const { key, keyUpper, listNavAxis, isLoadSavePressed, shiftPressed } = ctx.keyPressState;

        if (s.isRenaming) {
            // the input component over there will handle these.
        } else {
            if (listNavAxis !== 0) {
                moveChartSelection(ctx, listNavAxis, () => {
                    playAll(ctx);
                    return DONE;
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
                if (ctx.sequencer.playingId) {
                    stopPlayback(ctx, true);
                } else if (
                    s.chartBeforeOpenMeta &&
                    s.chartBeforeOpenMeta.id !== currentChart?.id
                ) {
                    setCurrentChartMeta(ctx, s.chartBeforeOpenMeta, () => DONE);
                } else {
                    setLoadSaveModalClosed(ctx);
                }

                handled = true;
            } else if (
                currentChart && 
                currentChart._savedStatus !== CHART_STATUS_READONLY &&
                (key === "Delete" || keyUpper === "X")
            ) {
                // TODO: move name into openChartUpdateModal lmao.
                openChartUpdateModal(ctx, currentChart, NAME_OPERATION_DELETE);
                handled = true;
            } else if (currentChart && keyUpper === "R") {
                openChartUpdateModal(ctx, currentChart, NAME_OPERATION_RENAME);
                handled = true;
            } else if (keyUpper === "N") {
                openChartUpdateModal(ctx, newChart(), NAME_OPERATION_CREATE);
                handled = true;
            } else if (currentChart && keyUpper === "C") {
                openChartUpdateModal(ctx, currentChart, NAME_OPERATION_COPY);
                handled = true;
            }
        }

        ctx.handled = handled;
    }
}
