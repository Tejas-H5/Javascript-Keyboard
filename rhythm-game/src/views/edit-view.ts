import "src/css/layout.css";
import "src/main.css";
import { stopPlaying, } from "src/state/playing-pausing";
import {
    getCurrentPlayingTimeRelative,
    recomputeState
} from "src/state/sequencer-state";
import { assert } from "src/utils/assert";
import { elementHasMouseClick, imBeginList, imEnd, imEndList, imInit, imMemo, imOn, imTextDiv, imTextSpan, nextListRoot, setInnerText, setStyle } from "src/utils/im-dom-utils";
import { imSequencer } from "src/views/sequencer";
import { GlobalContext, resetSequencer, setViewTestCurrentChart } from "./app";
import { imButton } from "./button";
import { getPlaybackDuration } from "./chart";
import { ALIGN_STRETCH, BOLD, COL, FIXED, FLEX1, GAP5, imBeginLayout, imBeginSpace, NOT_SET, PERCENT, ROW } from "./layout";
import { cssVars } from "./styling";
import { imBeginInput } from "src/components/text-input";

export function EditView(ctx: GlobalContext) {
    const { sequencer, ui } = ctx;

    const loadSaveModal = ui.loadSave.modal;

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

                imBeginLayout(BOLD); { 
                    imTextSpan("Currently editing [");
                    imTextSpan(sequencer._currentChart.name);
                    imTextSpan("]");

                    assert(ctx.savedState.userCharts.indexOf(sequencer._currentChart) !== -1);
                } imEnd();

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

                if (imButton((loadSaveModal.open ? ">" : "<") + "Load/Save")) {
                    loadSaveModal.open = !loadSaveModal.open;
                }
            } imEnd();

            imSequencer(ctx);
        } imEnd();
        imBeginList();
        if (nextListRoot() && loadSaveModal.open) {
            // Load save panel

            imBeginSpace(33, PERCENT, 0, NOT_SET, COL | ALIGN_STRETCH); {
                imBeginList();
                for (let i = 0; i <= ctx.savedState.userCharts.length; i++) {
                    nextListRoot();
                    imBeginLayout(ROW); {
                        const chart = i < ctx.savedState.userCharts.length ? ctx.savedState.userCharts[i] : null;
                        const isFocused = i === loadSaveModal.idx;

                        const shouldRename = isFocused && loadSaveModal.isRenaming && chart;
                        const shouldRenameChanged = imMemo(shouldRename);

                        setStyle("backgroundColor", isFocused ? cssVars.bg2 : "");

                        imBeginList();
                        if (nextListRoot() && shouldRename) {
                            const input = imBeginInput({
                                value: chart.name,
                                placeholder: "enter new name",
                                autoSize: false,
                            }); {
                                if (imInit()) {
                                    setStyle("width", "100%");
                                }

                                if (shouldRenameChanged) {
                                    input.root.focus();
                                    input.root.selectionStart = 0;
                                    input.root.selectionEnd = chart.name.length;
                                }

                                const inputEvent = imOn("input");
                                if (inputEvent) {
                                    chart.name = input.root.value;
                                }

                                const keyDown = imOn("keydown");
                                if (keyDown) {
                                    if (keyDown.key === "Enter" || keyDown.key === "Escape") {
                                        loadSaveModal.isRenaming = false;
                                    }
                                }
                            } imEnd();
                        } else {
                            nextListRoot()
                            imBeginLayout(); {
                                let name;
                                if (chart === null) {
                                    name = "[+ new chart]";
                                } else {
                                    name = chart.name || "untitled"
                                }

                                setInnerText(name);

                                if (elementHasMouseClick()) {
                                    // TODO: fix up mouse interactions
                                    // if (chart) {
                                    //     setCurrentChart(ctx, chart);
                                    // } else {
                                    //     const newChart = addNewUserChart(ctx);
                                    //     setCurrentChart(ctx, newChart);
                                    // }
                                }
                            } imEnd();
                        }
                        imEndList();
                    } imEnd();
                }
                imEndList();

                imBeginLayout(FLEX1); imEnd();

                imBeginLayout(); {
                    setInnerText("[R] to rename");
                } imEnd();
            } imEnd();
        }
        imEndList();
    } imEnd();
}

function newInput() {
    return document.createElement("input");
}
