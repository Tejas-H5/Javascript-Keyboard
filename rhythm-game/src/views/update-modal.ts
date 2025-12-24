import { imInfiniteProgress } from "src/app-components/infinite-progress";
import { imModalBegin, imModalEnd } from "src/app-components/modal";
import { imTextInputOneLine } from "src/app-components/text-input-one-line";
import { imButtonIsClicked } from "src/components/button";
import { BLOCK, COL, imAlign, imBg, imFg, imFlex, imGap, imJustify, imLayout, imLayoutEnd, imPadding, imSize, NA, PERCENT, PX, ROW } from "src/components/core/layout";
import { cssVars } from "src/components/core/stylesheets";
import { createChart, loadChartMetadataList, saveChart } from "src/state/data-repository";
import { CHART_STATUS_SAVED, CHART_STATUS_UNSAVED, newChart } from "src/state/sequencer-chart";
import { NAME_OPERATION_COPY, NAME_OPERATION_CREATE, NAME_OPERATION_RENAME, OperationType, UpdateModalState } from "src/state/ui-state";
import { assert, unreachable } from "src/utils/assert";
import { ImCache, imIf, imIfElse, imIfEnd, isFirstishRender } from "src/utils/im-core";
import { elSetStyle, imStr } from "src/utils/im-dom";
import { waitFor } from "src/utils/promise-utils";
import { GlobalContext, setCurrentChartMeta, setLoadSaveModalClosed } from "./app";
import { cssVarsApp } from "./styling";

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

    imModalBegin(c); {
        if (isFirstishRender(c)) {
            elSetStyle(c, "zIndex", "100");
        }

        imLayout(c, COL); imBg(c, cssVars.bg); imSize(c, 70, PERCENT, 0, NA); imPadding(c,10, PX, 10, PX, 10, PX, 10, PX); {
            if (imIf(c) && !s.updateCtx.isPending()) {
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

                        if (imIf(c) && s.error) {
                            imLayout(c, ROW); imFg(c, cssVarsApp.error); {
                                imStr(c, s.error);
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
    } imModalEnd(c);

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
        handleCreateCopyOrRenameChart(ctx, s);
    } else if (escape) {
        if (!s.updateCtx.isPending()) {
            ctx.ui.updateModal = null;
        } else {
            // Shouldn't abort this operation mid-way through.
        }
    } 

    // Block other UI while open
    ctx.handled = true;
}

function handleCreateCopyOrRenameChart(ctx: GlobalContext, s: UpdateModalState) {
    if (s.updateCtx.isPending()) return;

    s.error = null;

    s.newName = s.newName.trim();
    if (!s.newName) {
        throw new Error("Your name is empty");
    }

    const charts = ctx.repo.charts.allChartMetadata;
    const existing = charts.find(c => c.name === s.newName);
    if (existing) {
        throw new Error("A chart with this name already exists");
    }

    const a = s.updateCtx;

    let updated;
    let updatedId: number | undefined;
    let loadedMetadata = false;
    let shouldCloseLoadSaveModal = false;

    switch (s.operation) {
        case NAME_OPERATION_RENAME: {
            s.message = "Renaming [" + s.chartToUpdate.name + " -> " + s.newName + "] ...";

            const toRename = { ...s.chartToUpdate };
            toRename.name = s.newName;
            if (toRename._savedStatus === CHART_STATUS_SAVED) {
                toRename._savedStatus = CHART_STATUS_UNSAVED;
            }

            updatedId = toRename.id;

            updated = saveChart(a, ctx.repo, toRename);
        } break;
        case NAME_OPERATION_CREATE: {
            s.message = "Creating " + s.newName + "] ...";

            const toCreate = newChart(s.newName);

            const created = createChart(a, ctx.repo, toCreate);

            const idAssigned = waitFor(a, [created], ([newId]) => updatedId = newId);

            updated = waitFor(a, [idAssigned], () => loadChartMetadataList(ctx.repo));

            shouldCloseLoadSaveModal = true;
        } break;
        case NAME_OPERATION_COPY: {
            s.message = "Copying [" + s.chartToUpdate.name + " -> " + s.newName + "] ...";

            const toCopy = { ...s.chartToUpdate };
            toCopy.id = -1;
            toCopy.name = s.newName;
            toCopy._savedStatus = CHART_STATUS_UNSAVED;

            const created = createChart(a, ctx.repo, toCopy);

            const idAssigned = waitFor(a, [created], ([newId]) => updatedId = newId);

            updated = idAssigned;
        } break;
        default: unreachable(s.operation);
    }
    // I bet your async await can't do that
    // (this happens instantly)
    a.name = s.message;

    if (!loadedMetadata) {
        updated = waitFor(a, [updated], () => loadChartMetadataList(ctx.repo));
    }

    const updatedChartSelected = waitFor(a, [updated], () => {
        assert(updatedId !== undefined);

        const charts = ctx.repo.charts.allChartMetadata;
        const chart = charts.find(c => c.id === updatedId);
        if (!chart) {
            throw new Error("Chart wasn't created");
        }

        return setCurrentChartMeta(ctx, chart)
    });

    waitFor(a, [updatedChartSelected], () => {
        if (shouldCloseLoadSaveModal) {
            setLoadSaveModalClosed(ctx);
        }

        ctx.ui.updateModal = null;
    });


    return true;
}

