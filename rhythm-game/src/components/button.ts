import { el, newStyleGenerator, RenderGroup } from "src/utils/dom-utils";

import { cn } from "src/dom-root";

const BG_COLOR = cn.bg;
const FG_COLOR = cn.fg;
const BG2_COLOR = cn.bg2;

const sg = newStyleGenerator();
const cnButton = sg.cn("button", [
    `{
        all: unset; background-color: ${BG_COLOR}; user-select: none; cursor: pointer; padding: 2px; text-align: center; 
        border: 1px solid ${FG_COLOR}; 
     }`,
    `:hover { background-color: ${BG2_COLOR};  } `,
    `:active { background-color: ${FG_COLOR}; color: ${BG_COLOR};  } `,
]);

export function Button(rg: RenderGroup<{ 
    text: string; 
    onClick(e: MouseEvent): void; 
    flex1?: boolean; 
    toggled?: boolean; 
}>) {
    return el("BUTTON", { type: "button", class: cnButton }, [
        rg.style("flex", s => s.flex1 ? "1" : ""),
        rg.style("backgroundColor", s => s.toggled ? FG_COLOR : ""),
        rg.style("color", s => s.toggled ? BG_COLOR : ""),
        rg.on("click", (s, e) => s.onClick(e)),
        rg.text(s => s.text),
    ]);
}

