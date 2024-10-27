import { Button } from "src/components/button";
import { GlobalContext } from "src/global-context";
import { AppView, setScreen } from "src/state/ui-state";
import { div, RenderGroup } from "src/utils/dom-utils";

export function StartupView(rg: RenderGroup<GlobalContext>) {
    // TODO: better game name
    const gameName = "Rhythm Keyboard!!"

    let fontSize = 64;
    let animateScale = 13;
    let fontSizeAnimated = 0;
    let t = 0;

    let currentView = 0;

    // that's funny - I had intended to do way more screens, but I don't have that many 
    let views: [AppView, string][] = [
        ["chart-select", "Play"]
    ];

    rg.preRenderFn((s) => {
        t += s.dt;
        if (t > 1) {
            t = 0;
        }

        fontSizeAnimated = fontSize + animateScale * Math.sin(t * 2 * Math.PI);
    });

    return div({ class: "flex-1 col align-items-center relative" }, [
        div({ class: "col align-items-center", style: "font-size: 64px;" }, [
            rg.style("fontSize", () => fontSizeAnimated + "px"),
            gameName,

        ]),
        div({
            class: "absolute",
            style: "top: 25%; bottom: 25%; font-size: 24px;"
        }, [
            rg.list(div({ class: "contents" }), MenuButton, (getNext, s) => {
                for (let i = 0; i < views.length; i++) {
                    const [view, text] = views[i];
                    getNext().render({
                        ctx: s,
                        text,
                        onClick: () => {
                            
                        },
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
