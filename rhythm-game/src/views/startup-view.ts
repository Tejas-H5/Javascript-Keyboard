import { Button } from "src/components/button";
import { div, RenderGroup, cn } from "src/utils/dom-utils";
import { GlobalContext, setViewChartSelect } from "./app";

export function StartupView(rg: RenderGroup<GlobalContext>) {
    // TODO: better game name
    const gameName = "Rhythm Keyboard!!"

    let fontSize = 64;
    let animateScale = 13;
    let fontSizeAnimated = 0;
    let t = 0;

    let currentView = 0;

    rg.preRenderFn((s) => {
        t += s.dt;
        if (t > 1) {
            t = 0;
        }

        fontSizeAnimated = fontSize + animateScale * Math.sin(t * 2 * Math.PI);
    });

    function onClickPlay() {
        const s = rg.s;
        setViewChartSelect(s);
    }

    const views: [string, () => void][] = [
        ["Play", onClickPlay]
    ];

    return div({ class: [cn.flex1, cn.col, cn.alignItemsCenter, cn.relative] }, [
        div({ class: [cn.col, cn.alignItemsCenter], style: "font-size: 64px;" }, [
            rg.style("fontSize", () => fontSizeAnimated + "px"),
            gameName,

        ]),
        div({
            class: [cn.absolute],
            style: "top: 25%; bottom: 25%; font-size: 24px;"
        }, [
            rg.list(div({ class: [cn.contents] }), MenuButton, (getNext, s) => {
                for (let i = 0; i < views.length; i++) {
                    const [text, handler] = views[i];
                    getNext().render({
                        ctx: s,
                        text,
                        onClick: handler,
                        isSelected: i === currentView,
                    });
                }
            })
        ])
    ]);
}

function MenuButton(rg: RenderGroup<{
    ctx: GlobalContext;
    text: string;
    onClick(): void;
    isSelected: boolean;
}>) {

    return rg.c(Button, (c, s) => {
        c.render({
            text: s.text,
            onClick: s.onClick,
            toggled: s.isSelected,
        });
    });
}
