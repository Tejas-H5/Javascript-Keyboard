import { Button } from "src/components/button";
import { Slider } from "src/components/slider";
import "src/css/layout.css";
import "src/main.css";
import { stopPlaying, } from "src/state/playing-pausing";
import { 
    getCurrentSelectedChartName,
    loadChart,
    saveAllCharts,
} from "src/state/loading-saving-charts";
import {
    getCurrentPlayingTimeRelative,
    getPlaybackDuration,
    recomputeState
} from "src/state/sequencer-state";
import {
    div,
    el,
    RenderGroup,
    setInputValue,
    span
} from "src/utils/dom-utils";
import { Sequencer } from "src/views/sequencer";
import { recursiveShallowCopyRemovingComputedFields } from "src/utils/serialization-utils";
import { GlobalContext, resetSequencer, setViewTestCurrentChart } from "./app";
import { cn } from "src/dom-root";

export function EditView(rg: RenderGroup<GlobalContext>) {
    rg.preRenderFn((s) => {
        recomputeState(s.sequencer);

        const currentTime = getCurrentPlayingTimeRelative(s.sequencer);
        const duration = getPlaybackDuration(s.sequencer);
        if (currentTime > duration) {
            stopPlaying(s);
        }
    });

    function newSliderTemplateFn(name: string, initialValue: number, fn: (val: number) => void) {
        return rg.c(Slider, (c, s) => c.render({
            label: name,
            min: 0.01, max: 1, step: 0.01,
            value: initialValue,
            onChange(val) { fn(val); s.render(); },
        }));
    }

    function testFromHere() {
        const s = rg.s;

        setViewTestCurrentChart(s);

        s.render();
    }

    function clearSequencer() {
        if (confirm("Are you sure you want to clear your progress?")) {
            const s = rg.s;
            resetSequencer(s);
            s.render();
        }
    }

    function toggleLoadSaveSiderbar() {
        const s = rg.s;
        const ui = s.ui.editView;
        ui.sidebarOpen = !ui.sidebarOpen;
        // needs it twice for some reason...
        s.render();
        s.render();
    }

    return div({ class: cn.absoluteFill + cn.row + cn.fixed }, [
        div({ class: cn.col + cn.flex1 }, [
            div({ class: cn.col + cn.flex1 }, [
                div({ class: cn.row + cn.gap5 }, [
                    div({ class: cn.flex1 }),
                    span({ class: cn.b }, [
                        "Sequencer"
                    ]),

                    // TODO: put this in a better place
                    rg.if(
                        s => s.ui.copied.items.length > 0,
                        rg => rg.text(s => s.ui.copied.items.length + " items copied")
                    ),

                    div({ class: cn.flex1 }),
                    rg.c(Button, c => c.render({
                        text: "Test",
                        onClick: testFromHere
                    })),
                    rg.c(Button, c => c.render({
                        text: "Clear All",
                        onClick: clearSequencer
                    })),
                    rg.c(Button, (c, s) => c.render({
                        text: (s.ui.editView.sidebarOpen ? ">" : "<") + "Load/Save",
                        onClick: toggleLoadSaveSiderbar
                    }))
                ]),
                rg.c(Sequencer, (c, s) => c.render(s)),
            ])
        ]),
        rg.if(
            s => s.ui.editView.sidebarOpen,
            rg => div({ class: cn.col }, [
                rg.c(LoadSavePanel, (c, s) => c.render(s))
            ])
        )
    ])
}

function LoadSavePanel(rg: RenderGroup<GlobalContext>) {
    function Item(rg: RenderGroup<{ ctx: GlobalContext; name: string; }>) {
        return div({}, [
            rg.text(s => s.name),
            rg.style("backgroundColor", s => s.name === getCurrentSelectedChartName(s.ctx) ? cn.bg2 : ""),
            rg.on("click", s => {
                setInputValue(input, s.name);
                s.ctx.render();
            })
        ]);
    }

    const input = el<HTMLInputElement>("INPUT", { style: "width: 100%", placeholder: "enter name here" }, [
        rg.on("input", (s) => {
            s.ui.loadSave.selectedChartName = input.el.value;
            s.render();
        })
    ]);

    rg.preRenderFn(s => {
        setInputValue(input, getCurrentSelectedChartName(s));
    });

    return div({ style: "width: 33vw" }, [
        div({ class: cn.row, style: "gap: 10px" }, [
            // dont want to accidentally load over my work. smh.
            rg.if(
                s => (getCurrentSelectedChartName(s) in s.savedState.allSavedSongs),
                rg => rg.c(Button, (c, s) => c.render({
                    text: "Load",
                    onClick() {
                        loadChart(s, s.ui.loadSave.selectedChartName);
                        s.render();
                    }
                })),
            ),
            input,
            rg.if(
                s => !!getCurrentSelectedChartName(s),
                rg => rg.c(Button, (c, s) => c.render({
                    text: "Save",
                    onClick() {
                        const key = getCurrentSelectedChartName(s);
                        const timelineSerialized = recursiveShallowCopyRemovingComputedFields(s.sequencer.timeline);
                        s.savedState.allSavedSongs[key] = JSON.stringify(timelineSerialized);
                        saveAllCharts(s);
                        s.render();
                    }
                })),
            )
        ]),
        rg.list(div(), Item, (getNext, s) => {
            for (const key in s.savedState.allSavedSongs) {
                getNext().render({ ctx: s, name: key });
            }
        })
    ]);
}

