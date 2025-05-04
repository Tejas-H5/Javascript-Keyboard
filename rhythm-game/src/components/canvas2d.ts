import { imBeginEl, imEnd, imMemo, imRef, imTrackSize, setStyle, UIRoot } from "src/utils/im-dom-utils";
import { imBeginSpace, PERCENT, RELATIVE } from "src/views/layout";

function newCanvasElement() {
    return document.createElement("canvas");
}

export function imBeginCanvasRenderingContext2D() {
    // When I set the canvas to the size of it's offset width, this in turn
    // causes the parent to get larger, which causes the canvas to get larger, and so on.
    // This relative -> absolute pattern is being used here to fix this.

    imBeginSpace(100, PERCENT, 100, PERCENT, RELATIVE);

    const { size: rect } = imTrackSize();
    const canvasRoot = imBeginEl(newCanvasElement);

    const canvas = canvasRoot.root;
    let ctxRef = imRef<[UIRoot<HTMLCanvasElement>, CanvasRenderingContext2D, number, number, number] | null>();
    if (!ctxRef.val) {
        const context = canvas.getContext("2d");
        if (!context) {
            throw new Error("Canvas 2d isn't supported by your browser!!! I'd suggest _not_ plotting anything.");
        }
        ctxRef.val = [canvasRoot, context, 0, 0, 0];

        setStyle("position", "absolute");
        setStyle("top", "0");
        setStyle("left", "0");
    }
    const ctx = ctxRef.val;

    const w = rect.width;
    const h = rect.height;
    // const sf = window.devicePixelRatio ?? 1;
    const dpi = 2; // TODO: revert
    const wC = imMemo(w);
    const hC = imMemo(h);
    const dpiC = imMemo(dpi);
    if (wC || hC || dpiC) {
        canvas.style.width = w + "px";
        canvas.style.height = h + "px";
        canvas.width = dpi * w;
        canvas.height = dpi * h;
        ctx[2] = dpi * w;
        ctx[3] = dpi * h;
        ctx[4] = dpi;
    } 

    return ctx;
}

export function imEndCanvasRenderingContext2D() {
    imEnd();
    imEnd();
}
