import { BLOCK, COL, EM, imFlex, imGap, imLayout, imLayoutEnd, imSize, NA, PERCENT, PX, ROW } from "src/components/core/layout";
import { GlobalContext, setCurrentChart, setViewEditChart, setViewPlayCurrentChart, setViewStartScreen } from "./app";
import { EL_H1, elHasMousePress, imEl, imElEnd, imStr } from "src/utils/im-dom";
import { ImCache, imFor, imForEnd, imIf, imIfElse, imIfEnd } from "src/utils/im-core";
import { imButtonIsClicked } from "src/components/button";

export function ChartSelect(c: ImCache, ctx: GlobalContext) {
    imLayout(c, COL); imFlex(c); {
        imLayout(c, ROW); imFlex(c); {
            imLayout(c, BLOCK); imFlex(c); {
                imEl(c, EL_H1); imStr(c, "Charts"); imElEnd(c, EL_H1);
            } imLayoutEnd(c);

            imLayout(c, COL); imSize(c, 35, PERCENT, 0, NA); {
                if (imIf(c) && ctx.savedState.userCharts.length > 0) {
                    imFor(c); for (const chart of ctx.savedState.userCharts) {
                        imLayout(c, BLOCK); imSize(c, 100, PERCENT, 2, EM); {
                            imStr(c, chart.name);
                            if (elHasMousePress(c)) {
                                setCurrentChart(ctx, chart);
                                setViewPlayCurrentChart(ctx);
                            }
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

            if (imButtonIsClicked(c, "Play")) {
                setViewPlayCurrentChart(ctx);
            }

            if (imButtonIsClicked(c, "Edit")) {
                setViewEditChart(ctx);
            }

            if (imButtonIsClicked(c, "The lab")) {
                setViewEditChart(ctx);
            }
        } imLayoutEnd(c);
    } imLayoutEnd(c);
}

