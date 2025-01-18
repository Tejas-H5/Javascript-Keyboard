import { el, newCssBuilder, RenderGroup } from "src/utils/dom-utils";
import { cssVars } from "src/views/styling";

const BG_COLOR = cssVars.bg;
const FG_COLOR = cssVars.fg;
const BG2_COLOR = cssVars.bg2;

const cssb = newCssBuilder();
const cnButton = cssb.cn("button", [
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
    return el("BUTTON", { type: "button", class: [cnButton] }, [
        rg.style("flex", s => s.flex1 ? "1" : ""),
        rg.style("backgroundColor", s => s.toggled ? FG_COLOR : ""),
        rg.style("color", s => s.toggled ? BG_COLOR : ""),
        rg.on("click", (s, e) => s.onClick(e)),
        rg.text(s => s.text),
    ]);
}

