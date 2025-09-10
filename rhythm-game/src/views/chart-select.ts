import { imButton, imButtonIsClicked } from "src/components/button";
import { BLOCK, COL, imAlign, imBg, imFlex, imGap, imJustify, imLayout, imLayoutEnd, imPadding, imScrollOverflow, imSize, NA, PERCENT, PX, ROW, STRETCH } from "src/components/core/layout";
import { cssVars } from "src/components/core/stylesheets";
import { ImCache, imFor, imForEnd, imIf, imIfElse, imIfEnd, isFirstishRender } from "src/utils/im-core";
import { EL_H2, elHasMouseOver, elHasMousePress, elSetStyle, imEl, imElEnd, imStr } from "src/utils/im-dom";
import { GlobalContext, setCurrentChart, setViewEditChart, setViewPlayCurrentChart, setViewSoundLab, setViewStartScreen } from "./app";

export function ChartSelect(c: ImCache, ctx: GlobalContext) {
    imLayout(c, COL); imFlex(c); {
        imLayout(c, ROW); imJustify(c); imPadding(c, 20, PX, 0, NA, 0, NA, 0, NA); {
            imEl(c, EL_H2); imStr(c, "Chart select"); imElEnd(c, EL_H2);
        } imLayoutEnd(c);

        imLayout(c, COL); imFlex(c); imAlign(c, STRETCH); imJustify(c); { 
            imLayout(c, COL); imSize(c, 0, NA, 70, PERCENT); imGap(c, 10, PX); 
            imScrollOverflow(c, true); {
                if (imIf(c) && ctx.savedState.userCharts.length > 0) {
                    const ui = ctx.ui.loadSave.modal;

                    imFor(c); for (
                        let i = 0; 
                        i < ctx.savedState.userCharts.length;
                        i++
                    ) {
                        const chart = ctx.savedState.userCharts[i];

                        imLayout(c, ROW); imGap(c, 5, PX); imJustify(c); imAlign(c); {
                            if (elHasMouseOver(c)) {
                                ui.idx = i;
                            }

                            const chartSelected = ui.idx === i;

                            if (chartSelected) {
                                setCurrentChart(ctx, chart);
                            }


                            imLayout(c, BLOCK); {
                                if (isFirstishRender(c)) {
                                    elSetStyle(c, "transition", "background-color .1s ease, width .1s ease");
                                }

                                imBg(c, chartSelected ? cssVars.mg : cssVars.bg);
                                imSize(c, chartSelected ? 100 : 30, PERCENT, 0, NA);

                                imLayout(c, ROW); imGap(c, 5, PX); imJustify(c); imAlign(c); {


                                    if (imIf(c) && chartSelected) {
                                        if (imIf(c) && chart.timeline.length === 0) {
                                            imStr(c, "Empty chart");
                                        } else {
                                            imIfElse(c);

                                            if (imButtonIsClicked(c, "Play")) {
                                                setViewPlayCurrentChart(ctx);
                                            }
                                        } imIfEnd(c);
                                    } imIfEnd(c);

                                    imLayout(c, BLOCK); imButton(c); {
                                        imStr(c, chart.name);
                                        if (elHasMousePress(c)) {
                                            setCurrentChart(ctx, chart);
                                            setViewPlayCurrentChart(ctx);
                                        }
                                    } imLayoutEnd(c);

                                    if (imIf(c) && chartSelected) {
                                        if (imButtonIsClicked(c, "Edit")) {
                                            setViewEditChart(ctx);
                                        }
                                    } imIfEnd(c);
                                } imLayoutEnd(c);
                            } imLayoutEnd(c);
                        } imLayoutEnd(c);
                    } imForEnd(c);
                } else {
                    imIfElse(c);
                    imLayout(c, BLOCK); {
                        imStr(c, "No songs yet! You'll need to make some yourself");
                    } imLayoutEnd(c);
                } imIfEnd(c);
            } imLayoutEnd(c);
        } imLayoutEnd(c);
        imLayout(c, ROW); imGap(c, 5, PX); {
            if (imButtonIsClicked(c, "Back")) {
                setViewStartScreen(ctx);
            }

            if (imButtonIsClicked(c, "The lab")) {
                setViewSoundLab(ctx);
            }
        } imLayoutEnd(c);
    } imLayoutEnd(c);
}

