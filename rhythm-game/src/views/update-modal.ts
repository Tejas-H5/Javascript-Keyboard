import { imInfiniteProgress } from "src/app-components/infinite-progress";
import { imTextInputOneLine } from "src/app-components/text-input-one-line";
import { imButtonIsClicked } from "src/components/button";
import { BLOCK, COL, imAbsolute, imAlign, imBg, imFg, imFlex, imGap, imJustify, imLayout, imLayoutEnd, imPadding, imSize, NA, PERCENT, PX, ROW } from "src/components/core/layout";
import { cssVars } from "src/components/core/stylesheets";
import { createChart, saveChart } from "src/state/chart-repository";
import { CHART_STATUS_SAVED, CHART_STATUS_UNSAVED, newChart } from "src/state/sequencer-chart";
import { NAME_OPERATION_COPY, NAME_OPERATION_CREATE, NAME_OPERATION_RENAME, OperationType, UpdateModalState } from "src/state/ui-state";
import { unreachable } from "src/utils/assert";
import { ImCache, imIf, imIfElse, imIfEnd, isFirstishRender } from "src/utils/im-core";
import { elSetStyle, imStr } from "src/utils/im-dom";
import { getAllCharts as getAllChartMetadatas, GlobalContext, setCurrentChartMeta } from "./app";
import { cssVarsApp } from "./styling";
import { newAsyncData } from "src/utils/promise-utils";
import { loadAvailableCharts } from "./background-tasks";

function getButtonText(o: OperationType): string {
    switch(o) {
        case NAME_OPERATION_CREATE: return "Create";
        case NAME_OPERATION_COPY:   return "Copy";
        case NAME_OPERATION_RENAME: return "Rename";
    }
}

// TODO: retest

export function imUpdateModal(c: ImCache, ctx: GlobalContext, s: UpdateModalState) {
    let copy = false;
    let escape = false;

    imLayout(c, ROW); imAlign(c); imJustify(c); imAbsolute(c, 0, PX, 0, PX, 0, PX, 0, PX); imBg(c, `rgba(0, 0, 0, 0.3)`); {
        if (isFirstishRender(c)) {
            elSetStyle(c, "zIndex", "100");
        }

        imLayout(c, COL); imBg(c, cssVars.bg); imSize(c, 70, PERCENT, 0, NA); imPadding(c,10, PX, 10, PX, 10, PX, 10, PX); {
            if (imIf(c) && !s.updateResult.isLoading()) {
                imLayout(c, ROW); imJustify(c); {
                    imStr(c, s.message);
                } imLayoutEnd(c);

                imLayout(c, ROW); imAlign(c); imGap(c, 10, PX); {
                    imLayout(c, BLOCK); {
                        imStr(c, "Enter new name: ");
                    } imLayoutEnd(c);

                    imLayout(c, BLOCK); imFlex(c); {
                        const ev = imTextInputOneLine(c, s.newName ?? "")
                        if (ev) {
                            if (ev.newName !== undefined) {
                                s.newName = ev.newName;
                            }
                        }

                        if (imIf(c) && s.updateResult.err) {
                            imLayout(c, ROW); imFg(c, cssVarsApp.error); {
                                imStr(c, s.updateResult.err);
                            } imLayoutEnd(c);
                        } imIfEnd(c);
                    } imLayoutEnd(c);

                    if (imButtonIsClicked(c, getButtonText(s.operation))) {
                        copy = true;
                    }

                    if (imButtonIsClicked(c, "Cancel")) {
                        escape = true;
                    }
                } imLayoutEnd(c);
            } else {
                imIfElse(c);

                imLayout(c, ROW); imJustify(c); {
                    imStr(c, s.message);
                } imLayoutEnd(c);

                imInfiniteProgress(c);
            } imIfEnd(c);
        } imLayoutEnd(c);
    } imLayoutEnd(c);

    if (!ctx.handled && ctx.keyPressState) {
        if (ctx.keyPressState.key === "Enter") {
            copy = true;
            ctx.handled = true;
        } else if (ctx.keyPressState.key === "Escape") {
            escape = true;
            ctx.handled = true;
        }
    }

    if (copy) {
        handleCopyChart(ctx, s);
    } else if (escape) {
        if (!s.updateResult.isLoading()) {
            ctx.ui.updateModal = null;
        } else {
            s.updateResult.cancel();
            s.message = "Aborted.";
        }
    } 

    // Block other UI while open
    ctx.handled = true;
}

function handleCopyChart(ctx: GlobalContext, s: UpdateModalState) {
    if (s.updateResult.isLoading()) {
        return;
    }

    s.updateResult = newAsyncData(handleCopyChart.name, async () => {
        if (!s.newName) {
            throw new Error("Your name is empty");
        }

        const existing = ctx.repo.allCharts.data?.find(c => c.name === s.newName);
        if (existing) {
            throw new Error("A chart with this name already exists");
        }

        let updatedId;

        switch (s.operation) {
            case NAME_OPERATION_RENAME: {
                s.message = "Renaming [" + s.chartToUpdate.name + " -> " + s.newName + "] ...";

                const toRename = { ...s.chartToUpdate };
                toRename.name = s.newName;
                if (toRename._savedStatus === CHART_STATUS_SAVED) {
                    toRename._savedStatus = CHART_STATUS_UNSAVED;
                }

                updatedId = toRename.id;

                await saveChart(ctx.repo, toRename);
                await loadAvailableCharts(ctx);
            } break;
            case NAME_OPERATION_CREATE: {
                s.message = "Creating " + s.newName + "] ...";

                const toCreate = newChart(s.newName);

                updatedId = await createChart(ctx.repo, toCreate);
                await loadAvailableCharts(ctx);
            } break;
            case NAME_OPERATION_COPY: {
                s.message = "Copying [" + s.chartToUpdate.name + " -> " + s.newName + "] ...";

                const toCopy = { ...s.chartToUpdate };
                toCopy.id = -1;
                toCopy.name = s.newName;
                toCopy._savedStatus = CHART_STATUS_UNSAVED;

                updatedId = await createChart(ctx.repo, toCopy);
            } break;
            default: unreachable(s.operation);
        }

        await loadAvailableCharts(ctx);
        const availableCharts = getAllChartMetadatas(ctx);
        const created = availableCharts.find(c => c.id === updatedId);
        if (created) {
            setCurrentChartMeta(ctx, created);
        }

        ctx.ui.updateModal = null;

        return true;
    });
}

