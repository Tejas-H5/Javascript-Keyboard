import { Insertable, RenderGroup, div, setChildAt, newCssBuilder } from "src/utils/dom-utils";
import { cssVars } from "src/views/styling";

const BG_COLOR = cssVars.bg;
const UNDERLAY_COLOR = "rgba(0, 0, 0, 0.5)";

const cssb = newCssBuilder("modal");

const cnModal = cssb.cn("cnModal", [` { 
    top: 0vh; left: 0vw; right: 0vw; bottom: 0vh; z-index: 9999; 
    background-color: ${UNDERLAY_COLOR}; pointer-events: all; 
    position: fixed;
    display: flex; flex-direction: row; align-items: center; justify-content: center;
}`]);

export function Modal(rg: RenderGroup<{ onClose(): void; content: Insertable; }>) {
    const bgRect = div({ style: `background-color: ${BG_COLOR}` }, [
        rg.functionality((div, s) => setChildAt(div, s.content, 0)),
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

