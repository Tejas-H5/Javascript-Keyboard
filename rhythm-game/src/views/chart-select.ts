import { Button } from "src/components/button";
import { loadChart } from "src/state/loading-saving-charts";
import { div, getState, RenderGroup } from "src/utils/dom-utils";
import { GlobalContext, setViewEditChart, setViewPlayCurrentChart, setViewStartScreen } from "./app";

export function ChartSelect(rg: RenderGroup<GlobalContext>) {
    function onClickBack() {
        const s = getState(rg);
        setViewStartScreen(s);
    }

    function onClickEdit() {
        const s = getState(rg);
        setViewEditChart(s, s.ui.loadSave.selectedChartName);
    }

    function onClickPlay() {
        const s = getState(rg);
        setViewPlayCurrentChart(s);
    }

    return div({ class: "flex-1 col" }, [
        div({ class: "flex-1 row" }, [
            div({ class: "flex-1 col" }, [
                div({ style: "font-size: 64px;" }, [
                    "Charts"
                ])
            ]),
            div({ class: "col", style: "width: 35%" }, [
                rg.list(div({ class: "contents" }), ChartSelectButton, (getNext, s) => {
                    for (const chartName in s.savedState.allSavedSongs) {
                        const chartJson = s.savedState.allSavedSongs[chartName];
                        getNext().render({ ctx: s, chartName, chartJson});
                    }
                }),
                rg.else(
                    rg => div({}, [
                        "No songs yet! You'll need to make some yourself"
                    ])
                )
            ]),
        ]),
        div({ class: "row", style: "gap: 5px" }, [
            rg.c(Button, c => c.render({
                text: "Back",
                onClick: onClickBack
            })),
            rg.c(Button, c => c.render({
                text: "Play",
                onClick: onClickPlay
            })),
            rg.c(Button, c => c.render({
                text: "Edit",
                onClick: onClickEdit
            })),
        ])
    ]);
}

function ChartSelectButton(rg: RenderGroup<{
    ctx: GlobalContext;
    chartName: string;
    chartJson: string;
}>) {
    return div({
    }, [
        rg.c(Button, (c, s) => {
            c.render({
                text: s.chartName,
                onClick() {
                    loadChart(s.ctx, s.chartName);
                    setViewPlayCurrentChart(s.ctx);

                    s.ctx.render();
                }
            });
        }),
    ]);
}
