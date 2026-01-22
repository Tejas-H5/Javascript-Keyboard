import { ImCache, imGet, imMemo, imSet } from "src/utils/im-core";
import { EL_CANVAS, elSetStyle, imEl, imElEnd, imTrackSize } from "src/utils/im-dom";
import { BLOCK, imFlex, imLayoutBegin, imLayoutEnd, imRelative, imSize, PERCENT } from "./core/layout";

type ImCanvasRenderingContext = [
    canvas: HTMLCanvasElement,
    context: CanvasRenderingContext2D,
    width: number,
    height: number,
    dpi: number
];

export function imBeginCanvasRenderingContext2D(c: ImCache): ImCanvasRenderingContext {
    // When I set the canvas to the size of it's offset width, this in turn
    // causes the parent to get larger, which causes the canvas to get larger, and so on.
    // This relative -> absolute pattern is being used here to fix this.

    imLayoutBegin(c, BLOCK); imRelative(c); imFlex(c);
    const { size } = imTrackSize(c);

    const canvas = imEl(c, EL_CANVAS).root;

    let ctx = imGet(c, imBeginCanvasRenderingContext2D);
    if (!ctx) {
        const context = canvas.getContext("2d");
        if (!context) {
            throw new Error("Canvas 2d isn't supported by your browser!!! I'd suggest _not_ plotting anything.");
        }

        elSetStyle(c, "position", "absolute");
        elSetStyle(c, "top", "0");
        elSetStyle(c, "left", "0");

        ctx = imSet(c, [canvas, context, 0, 0, 0]);
    }

    const w = size.width;
    const h = size.height;
    // const sf = window.devicePixelRatio ?? 1;
    const dpi = 2; // TODO: revert
    const wC   = imMemo(c, w);
    const hC   = imMemo(c, h);
    const dpiC = imMemo(c, dpi);
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

export function imEndCanvasRenderingContext2D(c: ImCache) {
    imElEnd(c, EL_CANVAS);
    imLayoutEnd(c);
}
