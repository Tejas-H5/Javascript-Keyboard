import { DomAppender, elsvg, im, ImCache, imdom } from "src/utils/im-js";
import { imui, PX } from "src/utils/im-js/im-ui";

export type SvgContext = {
    root: DomAppender<SVGSVGElement>;
    svg: SVGSVGElement;
    x0: number;
    y0: number;
    width: number; 
    height: number;
    resized: boolean;
}


/**
 * An alternative to {@link el.SVG} for larger svg-based components/scenes.
 * Use this with {@link imElBeginExisting/imElEndExisting}
 *
 * For one off icons, this is probably not as ideal.
 *
 * NOTE: large svg-based scenes are very hard and cumbersone to code. 
 * This could very well be because this SvgContext isnt fully formed.
 */
export function imSvgContext(c: ImCache, zIndex = 1000000): SvgContext {
    const el = imdom.getElement(c);
    const elRect = el.getBoundingClientRect();

    const svgRoot = imdom.ElSvgBegin(c, elsvg.SVG); imdom.FinalizeDeferred(c); 
    imui.ZIndex(c, zIndex);
    let ctx = im.Get(c, imSvgContext);
    if (ctx === undefined) {
        ctx = { 
            root: svgRoot,
            svg: svgRoot.root,
            x0: 0,
            y0: 0,
            width: 0,
            height: 0,
            resized: false,
        };
        im.Set(c, ctx);
    }


    {
        ctx.x0 = elRect.left;
        ctx.width = elRect.width;
        ctx.y0 = elRect.top;
        ctx.height = elRect.height;

        imui.FixedXY(c, ctx.x0, PX, ctx.y0, PX);
        imui.Size(c, ctx.width, PX, ctx.height, PX);

        const x0Changed = im.Memo(c, ctx.x0);
        const widthChanged = im.Memo(c, ctx.width);
        const y0Changed = im.Memo(c, ctx.y0);
        const heightChanged = im.Memo(c, ctx.height);

        // Allows us to render our SVGs using screen coordinates, which 
        // is usually what we want when we're drawing lines between two divs or whatever.
        if (x0Changed || widthChanged || y0Changed || heightChanged) {
            imdom.setAttr(c, "viewBox", `${ctx.x0} ${ctx.y0} ${ctx.width}, ${ctx.height}`);
        }

        // users to render their stuff here by re-pushing
    } imdom.ElSvgEnd(c, elsvg.SVG);


    return ctx;
}

