import { imInfiniteProgress } from "src/app-components/infinite-progress";
import { imModalBegin, imModalEnd } from "src/app-components/modal";
import { imTextInputOneLine } from "src/app-components/text-input-one-line";
import { imButtonIsClicked } from "src/components/button";
import { BLOCK, COL, cssVars, imui, NA, PERCENT, PX, ROW } from "src/utils/im-js/im-ui";
import { createChart, saveChart } from "src/state/data-repository";
import { CHART_STATUS_SAVED, CHART_STATUS_UNSAVED, newChart } from "src/state/sequencer-chart";
import { NAME_OPERATION_COPY, NAME_OPERATION_CREATE, NAME_OPERATION_RENAME, OperationType, UpdateModalState } from "src/state/ui-state";
import { unreachable } from "src/utils/assert";
import { im, ImCache, imdom } from "src/utils/im-js";
import { GlobalContext } from "./app";
import { cssVarsApp } from "./styling";
import { CANCELLED, Done, DONE, Result, Then, trackTask } from "src/utils/async-utils";

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
        if (im.isFirstishRender(c)) {
            imdom.setStyle(c, "zIndex", "100");
        }

        imui.Begin(c, COL); imui.Bg(c, cssVars.bg); imui.Size(c, 70, PERCENT, 0, NA); imui.Padding(c,10, PX, 10, PX, 10, PX, 10, PX); {
            if (im.If(c) && !s.isUpdating) {
                imui.Begin(c, ROW); imui.Justify(c); {
                    imdom.Str(c, s.message);
                } imui.End(c);

                imui.Begin(c, ROW); imui.Align(c); imui.Gap(c, 10, PX); {
                    imui.Begin(c, BLOCK); {
                        imdom.Str(c, "Enter new name: ");
                    } imui.End(c);

                    imui.Begin(c, BLOCK); imui.Flex(c); {
                        const ev = imTextInputOneLine(c, s.newName ?? "")
                        if (ev) {
                            if (ev.newName !== undefined) {
                                s.newName = ev.newName;
                            }
                            if (ev.submit || ev.cancel) {
                                ctx.handled = true;
                            }
                        }

                        if (im.If(c) && s.error) {
                            imui.Begin(c, ROW); imui.Fg(c, cssVarsApp.error); {
                                imdom.Str(c, s.error);
                            } imui.End(c);
                        } im.IfEnd(c);
                    } imui.End(c);

                    if (imButtonIsClicked(c, getButtonText(s.operation))) {
                        copy = true;
                    }

                    if (imButtonIsClicked(c, "Cancel")) {
                        escape = true;
                    }
                } imui.End(c);
            } else {
                im.IfElse(c);

                imui.Begin(c, ROW); imui.Justify(c); {
                    imdom.Str(c, s.message);
                } imui.End(c);

                imInfiniteProgress(c);
            } im.IfEnd(c);
        } imui.End(c);
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
        handleCreateCopyOrRenameChart(ctx, s, () => DONE);
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

function handleCreateCopyOrRenameChart(ctx: GlobalContext, s: UpdateModalState, cbIn: Then<Result<boolean>>): Done {
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

    let cb = (val: Result<boolean>) => {
        s.message = "";
        ctx.ui.updateModal = null;
        return cbIn(val);
    };

    cb = trackTask("handleCreateCopyOrRenameChart " + s.message, cb);

    s.error = null;

    s.newName = s.newName.trim();
    if (!s.newName) {
        return cb({ error: "Your name is empty" });
    }

    const charts = ctx.repo.charts.allChartMetadata;
    const existing = charts.find(c => c.name === s.newName);
    if (existing) {
        return cb({ error: "A chart with this name already exists" });
    }

    switch (s.operation) {
        case NAME_OPERATION_RENAME:
            s.chartToUpdate.name = s.newName;
            if (s.chartToUpdate._savedStatus === CHART_STATUS_SAVED) {
                s.chartToUpdate._savedStatus = CHART_STATUS_UNSAVED;
            }

            return saveChart(ctx.repo, s.chartToUpdate, cb);
        case NAME_OPERATION_CREATE:
            const toCreate = newChart(s.newName);

            return createChart(ctx.repo, toCreate, (created) => {
                if (!created) {
                    return cb({ error: "Failed to create chart" });
                }

                ctx.ui.updateModal = null;
                return cb({ value: true });
            });
        case NAME_OPERATION_COPY:
            const toCopy = { ...s.chartToUpdate };
            toCopy.id = -1;
            toCopy.name = s.newName;
            toCopy._savedStatus = CHART_STATUS_UNSAVED;

            return createChart(ctx.repo, toCopy, (created) => {
                if (!created) {
                    return cb({ error: "Failed to copy chart" });
                }

                ctx.ui.updateModal = null;
                return cb({ value: true });
            });
        default: unreachable(s.operation);
    }
}

