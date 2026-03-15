import { im, ImCache, imdom, el, } from "src/utils/im-js";
import { BLOCK, imui } from "src/utils/im-js/im-ui";

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

    imui.Begin(c, BLOCK); imui.Relative(c); imui.Flex(c);
    const { size } = imdom.TrackSize(c);

    const canvas = imdom.ElBegin(c, el.CANVAS).root;

    let ctx = im.Get(c, imBeginCanvasRenderingContext2D);
    if (!ctx) {
        const context = canvas.getContext("2d");
        if (!context) {
            throw new Error("Canvas 2d isn't supported by your browser!!! I'd suggest _not_ plotting anything.");
        }

        imdom.setStyle(c, "position", "absolute");
        imdom.setStyle(c, "top", "0");
        imdom.setStyle(c, "left", "0");

        ctx = im.Set(c, [canvas, context, 0, 0, 0]);
    }

    const w = size.width;
    const h = size.height;
    const dpi = window.devicePixelRatio ?? 1;
    const wC   = im.Memo(c, w);
    const hC   = im.Memo(c, h);
    const dpiC = im.Memo(c, dpi);
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
    imdom.ElEnd(c, el.CANVAS);
    imui.End(c);
}
