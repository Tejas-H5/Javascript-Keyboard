import { DomUtilsChildren, RenderGroup, div, newCssBuilder } from "src/utils/dom-utils";
import { cssVars } from "src/views/styling";

const BG_COLOR = cssVars.bg;
const UNDERLAY_COLOR = "rgba(0, 0, 0, 0.5)";

const sg = newCssBuilder();
const cnModal = sg.cn("cnModal", [` { 
    top: 0; left: 0; right: 0; bottom: 0; z-index: 9999; 
    background-color: ${UNDERLAY_COLOR}; pointer-events: all; 
    position: fixed;
    display: flex; flex-direction: row; align-items: center; justify-content: center;
}`]);

export function Modal(rg: RenderGroup<{ onClose(): void; }>, children: DomUtilsChildren) {
    const bgRect = div({ style: `background-color: ${BG_COLOR}` }, [
        ...children,
    ]);

    const root = div({ class: [cnModal], }, [bgRect]);

    let blockMouseDown = false;

    // Clicking outside the modal should close it
    root.el.addEventListener("mousedown", () => {
        if (!blockMouseDown) {
            rg.s.onClose()
        }
        blockMouseDown = false;
    });

    // Clicking inside the modal shouldn't close it.
    // We can't simply stop propagation of this event to the nodes inside though, so we're doing it like this.
    bgRect.el.addEventListener("mousedown", () => {
        blockMouseDown = true;
    });

    return root;
}

