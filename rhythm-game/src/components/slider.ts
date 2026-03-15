import { ImCache, im, imdom } from 'src/utils/im-js';
import { BLOCK, cssVars, imui } from 'src/utils/im-js/im-ui';
import { clamp, inverseLerp, lerp } from 'src/utils/math-utils.ts';

const MIN_STEP = 0.0001;

function newSliderState() {
    return { startedDragging: false, }
}

export function imSliderInput(
    c: ImCache,
    start: number, end: number, step: number | null, 
    value: number = start,
): number {
    const s = im.State(c, newSliderState);

    if (end < start) {
        [start, end] = [end, start];
    }
    value = clamp(value, start, end);

    const valueChanged = im.Memo(c, value);
    const sliderStartChanged = im.Memo(c, start);
    const sliderEndChanged = im.Memo(c, end);
    const width = end - start;

    const sliderBody = imui.Begin(c, BLOCK); {
        const { size } = imdom.TrackSize(c);

        const widthChanged = im.Memo(c, size.width);

        if (im.isFirstishRender(c)) {
            imdom.setStyle(c, "display", "flex");
            imdom.setStyle(c, "flex", "1");
            imdom.setStyle(c, "position", "relative");
            imdom.setStyle(c, "backgroundColor", cssVars.bg2);
            imdom.setStyle(c, "borderRadius", "1000px");
            imdom.setStyle(c, "cursor", "ew-resize");
            imdom.setStyle(c, "userSelect", "none");
        }

        const sliderHandleSize = size.height;

        // little dots for every step
        im.For(c); if (step) {
            const count = Math.floor(width / step);
            if (count < 50) {
                for (let i = 0; i < count - 1; i++) {
                    let t = (i + 1) / count;
                    const sliderPos = lerp(0, size.width - sliderHandleSize, t);

                    imui.Begin(c, BLOCK); {
                        if (im.isFirstishRender(c)) {
                            imdom.setStyle(c, "position", "absolute");
                            imdom.setStyle(c, "aspectRatio", "1 / 1");
                            imdom.setStyle(c, "height", "100%");
                            imdom.setStyle(c, "backgroundColor", cssVars.mg);
                            imdom.setStyle(c, "transformOrigin", "center");
                            imdom.setStyle(c, "transform", "scale(0.4) rotate(45deg)");
                        }

                        imdom.setStyle(c, "left", sliderPos + "px");
                    } imui.End(c);
                }
            }
        } im.ForEnd(c);

        // slider handle
        imui.Begin(c, BLOCK); {
            if (im.isFirstishRender(c)) {
                imdom.setStyle(c, "position", "absolute");
                imdom.setStyle(c, "backgroundColor", cssVars.fg);
                imdom.setStyle(c, "borderRadius", "1000px");
                imdom.setStyle(c, "aspectRatio", "1 / 1");
                imdom.setStyle(c, "height", "100%");
                imdom.setStyle(c, "userSelect", "none");
                imdom.setStyle(c, "cursor", "ew-resize");
            }

            if (valueChanged || sliderStartChanged || sliderEndChanged || widthChanged) {
                const t = inverseLerp(value, start, end);
                const sliderPos = lerp(0, size.width - sliderHandleSize, t);
                imdom.setStyle(c, "left", sliderPos + "px");
            }
        } imui.End(c);

        const mouse = imdom.getMouse();

        if (im.Memo(c, mouse.leftMouseButton)) {
            if (imdom.hasMouseOver(c, sliderBody) && mouse.leftMouseButton) {
                s.startedDragging = true;
            } else {
                s.startedDragging = false;
            }
        }

        if (s.startedDragging) {
            const rect = sliderBody.getBoundingClientRect();

            const x0 = rect.left + sliderHandleSize / 2;
            const x1 = rect.right - sliderHandleSize / 2;
            let t = inverseLerp(mouse.X, x0, x1);
            t = clamp(t, 0, 1);

            value = lerp(start, end, t);
            t = value;
            if (step && step > MIN_STEP) {
                value = Math.round(value / step) * step;
            }
            value = clamp(value, start, end);
        }
    } imui.End(c);

    return value;
}
