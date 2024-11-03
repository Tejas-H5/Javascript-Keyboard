import { el, newStyleGenerator, RenderGroup } from "src/utils/dom-utils";

const sg = newStyleGenerator();
const cnButton = sg.makeClass("button", [
    `{
        all: unset; background-color: var(--bg); user-select: none; cursor: pointer; padding: 2px; text-align: center; 
        border: 1px solid var(--fg); 
     }`,
    `:hover { background-color: var(--bg2);  } `,
    `:active { background-color: var(--fg); color: var(--bg);  } `,
]);

export function Button(rg: RenderGroup<{ 
    text: string; 
    onClick(e: MouseEvent): void; 
    flex1?: boolean; 
    toggled?: boolean; 
}>) {
    return el("BUTTON", { type: "button", class: cnButton }, [
        rg.class("flex-1", s => !!s.flex1),
        rg.style("backgroundColor", s => s.toggled ? "var(--fg)" : ""),
        rg.style("color", s => s.toggled ? "var(--bg)" : ""),
        rg.on("click", (s, e) => s.onClick(e)),
        rg.text(s => s.text),
    ]);
}

