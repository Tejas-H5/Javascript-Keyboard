import { div, el, RenderGroup, newStyleGenerator } from "src/utils/dom-utils";

const sg = newStyleGenerator();
const cnSlider = sg.cn("slider", [
    " {}"
]);

export function Slider(rg: RenderGroup<{
    label: string;
    value: number;
    min: number;
    max: number;
    step: number;
    onChange: (value: number) => void;
}>) {
    return div({ style: "display: flex; flex-direction: row;" }, [
        div({}, [ 
            rg.text((s) => s.label)
        ]),
        el<HTMLInputElement>("INPUT", { type: "range", class: cnSlider, }, [
            rg.attr("min", (s) => "" + s.min),
            rg.attr("max", (s) => "" + s.max),
            rg.attr("step", (s) => "" + s.step),
            rg.attr("value", (s) => "" + s.value),
            rg.on("input", (s, e) => {
                s.onChange((e.target! as HTMLInputElement).value as unknown as number);
            })
        ]),
    ]);
}

