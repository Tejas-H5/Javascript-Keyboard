import "src/css/layout.css";
import "src/main.css";
import {
    getCurrentSelectedChartName,
    loadChart
} from "src/state/loading-saving-charts";
import { stopPlaying, } from "src/state/playing-pausing";
import { getChart } from "src/state/saved-state";
import {
    getCurrentPlayingTimeRelative,
    recomputeState
} from "src/state/sequencer-state";
import { elementHasMouseClick, imBeginEl, imBeginList, imEnd, imEndList, imInit, imMemo, imTextDiv, nextListRoot, setInnerText, setInputValue, setStyle } from "src/utils/im-dom-utils";
import { imSequencer } from "src/views/sequencer";
import { GlobalContext, resetSequencer, setViewTestCurrentChart } from "./app";
import { imButton } from "./button";
import { getPlaybackDuration } from "./chart";
import { BOLD, COL, FIXED, FLEX1, GAP10, GAP5, imBeginLayout, imBeginSpace, NOT_SET, PERCENT, ROW, setStyleFlags } from "./layout";
import { cssVars } from "./styling";

export function EditView(ctx: GlobalContext) {
    const { sequencer, ui } = ctx;
    const editView = ui.editView;

    recomputeState(sequencer);

    const currentTime = getCurrentPlayingTimeRelative(sequencer);
    const duration = getPlaybackDuration(sequencer._currentChart);
    if (currentTime > duration) {
        stopPlaying(ctx);
    }

    imBeginLayout(FIXED | ROW); {
        imBeginLayout(COL | GAP5 | FLEX1); {
            imBeginLayout(ROW | GAP5); {
                imBeginLayout(FLEX1); imEnd();

                imBeginLayout(BOLD); { setInnerText("Sequencer"); } imEnd();

                // TODO: put this in a better place
                imBeginList();
                const numCopied = ui.copied.items.length;
                if (nextListRoot() && numCopied > 0) {
                    imTextDiv(numCopied + " items copied");
                }
                imEndList();

                imBeginLayout(FLEX1); imEnd();

                if (imButton("Test")) {
                    setViewTestCurrentChart(ctx);
                }

                if (imButton("Clear All")) {
                    resetSequencer(ctx);
                }

                if (imButton((editView.sidebarOpen ? ">" : "<") + "Load/Save")) {
                    editView.sidebarOpen = !editView.sidebarOpen;
                }
            } imEnd();

            imSequencer(ctx);
        } imEnd();
        imBeginList();
        if (nextListRoot() && editView.sidebarOpen) {
            // Load save panel
            const name = getCurrentSelectedChartName(ctx);
            const chart = getChart(ctx.savedState, name)

            let input: HTMLInputElement;

            imBeginSpace(33, PERCENT, 0, NOT_SET); {
                imBeginLayout(ROW | GAP10); {
                    imBeginLayout(FLEX1); {
                        input = imBeginEl(newInput).root; {
                            if (imInit()) {
                                setStyle("width", "100%");
                                setStyle("height", "100%");
                            }

                            if (imMemo(input.value)) {
                                ui.loadSave.selectedChartName = input.value;
                            }
                        } imEnd();
                    } imEnd();

                    imBeginList();
                    if (nextListRoot() && chart) {
                        if (imButton("Load")) {
                            loadChart(ctx, name);
                        }
                    }
                    if (nextListRoot()) {
                        if (imButton("Save")) {
                            // TODO: add saving back. lmao. 
                        }
                    }
                    imEndList();
                } imEnd();

                imBeginList();
                for (const chart of ctx.savedState.userCharts) {
                    nextListRoot();
                    imBeginLayout(); {
                        setInnerText(chart.name);
                        setStyle("backgroundColor", chart.name === name ? cssVars.bg2 : "");

                        if (elementHasMouseClick()) {
                            setInputValue(input, chart.name);
                        }
                    } imEnd();
                }
                imEndList();
            } imEnd();
        }
        imEndList();
    } imEnd();
}

function newInput() {
    return document.createElement("input");
}
