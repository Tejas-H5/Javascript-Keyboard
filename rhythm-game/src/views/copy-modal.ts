import { imInfiniteProgress } from "src/app-components/infinite-progress";
import { imTextInputOneLine } from "src/app-components/text-input-one-line";
import { imButtonIsClicked } from "src/components/button";
import { BLOCK, COL, imAbsolute, imAlign, imBg, imFg, imFlex, imGap, imJustify, imLayout, imLayoutEnd, imPadding, imSize, NA, PERCENT, PX, ROW } from "src/components/core/layout";
import { cssVars } from "src/components/core/stylesheets";
import { getChartRepository, saveChart } from "src/state/chart-repository";
import { CHART_STATUS_UNSAVED } from "src/state/sequencer-chart";
import { CopyModalState } from "src/state/ui-state";
import { ImCache, imIf, imIfElse, imIfEnd, isFirstishRender } from "src/utils/im-core";
import { elSetStyle, imStr } from "src/utils/im-dom";
import { cancelAsyncFn, runCancellableAsyncFn } from "src/utils/promise-utils";
import { GlobalContext, loadAvailableChartsAsync, setCurrentChartIdxByName } from "./app";
import { cssVarsApp } from "./styling";

export function imCopyModal(c: ImCache, ctx: GlobalContext, s: CopyModalState) {
    let copy = false;
    let escape = false;

    imLayout(c, ROW); imAlign(c); imJustify(c); imAbsolute(c, 0, PX, 0, PX, 0, PX, 0, PX); imBg(c, `rgba(0, 0, 0, 0.3)`); {
        if (isFirstishRender(c)) {
            elSetStyle(c, "zIndex", "100");
        }

        imLayout(c, COL); imBg(c, cssVars.bg); imSize(c, 70, PERCENT, 0, NA); imPadding(c,10, PX, 10, PX, 10, PX, 10, PX); {
            if (imIf(c) && !s.initiated) {
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

                    if (imButtonIsClicked(c, "Copy")) {
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
        if (!s.initiated) {
            handleCopyChart(ctx, s);
        }
    } else if (escape) {
        if (!s.initiated) {
            ctx.ui.copyModal = null;
        } else {
            cancelAsyncFn(handleCopyChart);
            s.initiated = false;
            s.message = "Aborted.";
        }
    } 

    // Block other UI while open
    ctx.handled = true;
}

function handleCopyChart(ctx: GlobalContext, s: CopyModalState) {
    s.error = "";
    if (!s.newName) {
        s.error = "Your name is empty";
        return;
    } 

    const availableCharts = ctx.ui.chartSelect.availableCharts;
    if (availableCharts.find(c => c.name === s.newName)) {
        s.error = "A chart with this name already exists";
        return;
    }

    s.initiated = true;
    s.message = "Copying [" + s.chartToCopy.name + " -> " + s.newName + "] ...";

    runCancellableAsyncFn(
        handleCopyChart,
        async (task) => {
            const repo = await getChartRepository();
            if (task.done) {
                return;
            }

            // NOTE: we can avoid name collisions here instead, potentially

            const shallowCopy = { ...s.chartToCopy };
            shallowCopy.id = -1;
            shallowCopy.name = s.newName;
            shallowCopy._savedStatus = CHART_STATUS_UNSAVED;

            await saveChart(repo, shallowCopy);
            if (task.done) {
                return;
            }

            await loadAvailableChartsAsync(ctx);
            if (task.done) {
                return;
            }

            setCurrentChartIdxByName(ctx, s.newName);
        }, 
        err => {
            s.error = "Unexpected error: " + err;
            s.initiated = false;
        }
    ).finally(() => ctx.ui.copyModal = null);
}

