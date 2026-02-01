import { imInfiniteProgress } from "src/app-components/infinite-progress";
import { imModalBegin, imModalEnd } from "src/app-components/modal";
import { imTextInputOneLine } from "src/app-components/text-input-one-line";
import { imButtonIsClicked } from "src/components/button";
import { BLOCK, COL, imAlign, imBg, imFg, imFlex, imGap, imJustify, imLayoutBegin, imLayoutEnd, imPadding, imSize, NA, PERCENT, PX, ROW } from "src/components/core/layout";
import { cssVars } from "src/components/core/stylesheets";
import { createChart, saveChart } from "src/state/data-repository";
import { CHART_STATUS_SAVED, CHART_STATUS_UNSAVED, newChart } from "src/state/sequencer-chart";
import { NAME_OPERATION_COPY, NAME_OPERATION_CREATE, NAME_OPERATION_RENAME, OperationType, UpdateModalState } from "src/state/ui-state";
import { unreachable } from "src/utils/assert";
import { ACB, ACR, CANCELLED, done, newError, toTrackedCallback } from "src/utils/async-utils";
import { ImCache, imIf, imIfElse, imIfEnd, isFirstishRender } from "src/utils/im-core";
import { elSetStyle, imStr } from "src/utils/im-dom";
import { GlobalContext } from "./app";
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

        imLayoutBegin(c, COL); imBg(c, cssVars.bg); imSize(c, 70, PERCENT, 0, NA); imPadding(c,10, PX, 10, PX, 10, PX, 10, PX); {
            if (imIf(c) && !s.isUpdating) {
                imLayoutBegin(c, ROW); imJustify(c); {
                    imStr(c, s.message);
                } imLayoutEnd(c);

                imLayoutBegin(c, ROW); imAlign(c); imGap(c, 10, PX); {
                    imLayoutBegin(c, BLOCK); {
                        imStr(c, "Enter new name: ");
                    } imLayoutEnd(c);

                    imLayoutBegin(c, BLOCK); imFlex(c); {
                        const ev = imTextInputOneLine(c, s.newName ?? "")
                        if (ev) {
                            if (ev.newName !== undefined) {
                                s.newName = ev.newName;
                            }
                        }

                        if (imIf(c) && s.error) {
                            imLayoutBegin(c, ROW); imFg(c, cssVarsApp.error); {
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

                imLayoutBegin(c, ROW); imJustify(c); {
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
        handleCreateCopyOrRenameChart(ctx, s, done);
    } else if (escape) {
        if (!s.isUpdating) {
            ctx.ui.updateModal = null;
        } else {
            // Shouldn't abort this operation mid-way through.
        }
    } 

    // Block other UI while open
    ctx.handled = true;
}

function handleCreateCopyOrRenameChart(ctx: GlobalContext, s: UpdateModalState, cbIn: ACB<boolean>): ACR {
    if (s.isUpdating) return CANCELLED;

    // Figure out the message, clear the message
    {
        switch (s.operation) {
            case NAME_OPERATION_RENAME:
                s.message = "Renaming [" + s.chartToUpdate.name + " -> " + s.newName + "] ...";
                break;
            case NAME_OPERATION_CREATE:
                s.message = "Creating " + s.newName + "] ...";
                break;
            case NAME_OPERATION_COPY:
                s.message = "Copying [" + s.chartToUpdate.name + " -> " + s.newName + "] ...";
                break;
            default: unreachable(s.operation);
        }
    }

    let cb: ACB<boolean> = (val, err) => {
        s.message = "";
        ctx.ui.updateModal = null;
        return cbIn(val, err);
    };

    cb = toTrackedCallback(cb, "handleCreateCopyOrRenameChart " + s.message);

    s.error = null;

    s.newName = s.newName.trim();
    if (!s.newName) return cb(undefined, newError("Your name is empty"));

    const charts = ctx.repo.charts.allChartMetadata;
    const existing = charts.find(c => c.name === s.newName);
    if (existing) return cb(undefined, newError("A chart with this name already exists"));

    switch (s.operation) {
        case NAME_OPERATION_RENAME:
            s.chartToUpdate.name = s.newName;
            if (s.chartToUpdate._savedStatus === CHART_STATUS_SAVED) {
                s.chartToUpdate._savedStatus = CHART_STATUS_UNSAVED;
            }

            return saveChart(ctx.repo, s.chartToUpdate, cb);
        case NAME_OPERATION_CREATE:
            const toCreate = newChart(s.newName);

            return createChart(ctx.repo, toCreate, (created, error) => {
                if (!created) return cb(false, error);

                ctx.ui.updateModal = null;
                return cb(true);
            });
        case NAME_OPERATION_COPY:
            const toCopy = { ...s.chartToUpdate };
            toCopy.id = -1;
            toCopy.name = s.newName;
            toCopy._savedStatus = CHART_STATUS_UNSAVED;

            return createChart(ctx.repo, toCopy, (created, error) => {
                if (!created) return cb(false, error);

                ctx.ui.updateModal = null;
                return cb(created, error);
            });
        default: unreachable(s.operation);
    }
}

