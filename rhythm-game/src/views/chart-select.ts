import { elementHasMouseClick, imBeginList, imEnd, imEndList, imTextSpan, nextListRoot, setInnerText } from "src/utils/im-dom-utils";
import { GlobalContext, setCurrentChart, setViewEditChart, setViewPlayCurrentChart, setViewStartScreen } from "./app";
import { imButton } from "./button";
import { COL, EM, FLEX1, GAP5, H1, imBeginLayout, imBeginSpace, NOT_SET, PERCENT, ROW } from "./layout";

export function ChartSelect(ctx: GlobalContext) {
    imBeginLayout(FLEX1 | COL); {
        imBeginLayout(FLEX1 | ROW); {
            imBeginLayout(FLEX1 | COL | H1); {
                setInnerText("Charts");
            } imEnd();

            imBeginSpace(35, PERCENT, 0, NOT_SET, COL); {
                imBeginList();
                if (nextListRoot() && ctx.savedState.userCharts.length > 0) {
                    imBeginList();
                    for (const chart of ctx.savedState.userCharts) {
                        nextListRoot();
                        imBeginSpace(100, PERCENT, 2, EM); {
                            imTextSpan(chart.name);
                            if (elementHasMouseClick()) {
                                setCurrentChart(ctx, chart);
                                setViewPlayCurrentChart(ctx);
                            }
                        } imEnd();
                    }
                    imEndList();
                } else {
                    nextListRoot();
                    imBeginLayout(); {
                        imTextSpan("No songs yet! You'll need to make some yourself");
                    } imEnd();
                }
                imEndList();
            } imEnd();
        } imEnd();
        imBeginLayout(ROW | GAP5); {
            if (imButton("Back")) {
                setViewStartScreen(ctx);
            }

            if (imButton("Play")) {
                setViewPlayCurrentChart(ctx);
            }

            if (imButton("Edit")) {
                setViewEditChart(ctx);
            }

            if (imButton("The lab")) {
                setViewEditChart(ctx);
            }
        } imEnd();
    } imEnd();
}

