import { Button } from "src/components/button";
import { loadChart } from "src/state/loading-saving-charts";
import { div, RenderGroup } from "src/utils/dom-utils";
import { GlobalContext, setViewEditChart, setViewPlayCurrentChart, setViewStartScreen } from "./app";
import { cn } from "src/dom-root";

export function ChartSelect(rg: RenderGroup<GlobalContext>) {
    function onClickBack() {
        setViewStartScreen(rg.s);
    }

    function onClickEdit() {
        setViewEditChart(rg.s);
    }

    function onClickPlay() {
        setViewPlayCurrentChart(rg.s);
    }

    return div({ class: cn.flex1 + cn.col }, [
        div({ class: cn.flex1 + cn.row }, [
            div({ class: cn.flex1 + cn.col }, [
                div({ style: "font-size: 64px;" }, [
                    "Charts"
                ])
            ]),
            div({ class: cn.col, style: "width: 35%" }, [
                rg.list(div({ class: cn.contents }), ChartSelectButton, (getNext, s) => {
                    for (const chartName in s.savedState.allSavedSongs) {
                        const chartJson = s.savedState.allSavedSongs[chartName];
                        getNext().render({ ctx: s, chartName, chartJson});
                    }
                }),
                rg.else(
                    rg => rg && div({}, [
                        "No songs yet! You'll need to make some yourself"
                    ])
                )
            ]),
        ]),
        div({ class: cn.row, style: "gap: 5px" }, [
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
