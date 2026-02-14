import { ImCache, imFor, imForEnd, imMemo, imState, isFirstishRender } from 'src/utils/im-core.ts';
import { elHasMouseOver, elSetStyle, getGlobalEventSystem, imTrackSize } from 'src/utils/im-dom.ts';
import { clamp, inverseLerp, lerp } from 'src/utils/math-utils.ts';
import { BLOCK, imLayoutBegin, imLayoutEnd } from './core/layout.ts';
import { cssVars } from './core/stylesheets.ts';

const MIN_STEP = 0.0001;

function newSliderState() {
    return { startedDragging: false, }
}

export function imSliderInput(
    c: ImCache,
    start: number, end: number, step: number | null, 
    value: number = start,
): number {
    const s = imState(c, newSliderState);

    if (end < start) {
        [start, end] = [end, start];
    }
    value = clamp(value, start, end);

    const valueChanged = imMemo(c, value);
    const sliderStartChanged = imMemo(c, start);
    const sliderEndChanged = imMemo(c, end);
    const width = end - start;

    const sliderBody = imLayoutBegin(c, BLOCK); {
        const { size } = imTrackSize(c);

        const widthChanged = imMemo(c, size.width);

        if (isFirstishRender(c)) {
            elSetStyle(c, "display", "flex");
            elSetStyle(c, "flex", "1");
            elSetStyle(c, "position", "relative");
            elSetStyle(c, "backgroundColor", cssVars.bg2);
            elSetStyle(c, "borderRadius", "1000px");
            elSetStyle(c, "cursor", "ew-resize");
            elSetStyle(c, "userSelect", "none");
        }

        const sliderHandleSize = size.height;

        // little dots for every step
        imFor(c); if (step) {
            const count = Math.floor(width / step);
            if (count < 50) {
                for (let i = 0; i < count - 1; i++) {
                    let t = (i + 1) / count;
                    const sliderPos = lerp(0, size.width - sliderHandleSize, t);

                    imLayoutBegin(c, BLOCK); {
                        if (isFirstishRender(c)) {
                            elSetStyle(c, "position", "absolute");
                            elSetStyle(c, "aspectRatio", "1 / 1");
                            elSetStyle(c, "height", "100%");
                            elSetStyle(c, "backgroundColor", cssVars.mg);
                            elSetStyle(c, "transformOrigin", "center");
                            elSetStyle(c, "transform", "scale(0.4) rotate(45deg)");
                        }

                        elSetStyle(c, "left", sliderPos + "px");
                    } imLayoutEnd(c);
                }
            }
        } imForEnd(c);

        // slider handle
        imLayoutBegin(c, BLOCK); {
            if (isFirstishRender(c)) {
                elSetStyle(c, "position", "absolute");
                elSetStyle(c, "backgroundColor", cssVars.fg);
                elSetStyle(c, "borderRadius", "1000px");
                elSetStyle(c, "aspectRatio", "1 / 1");
                elSetStyle(c, "height", "100%");
                elSetStyle(c, "userSelect", "none");
                elSetStyle(c, "cursor", "ew-resize");
            }

            if (valueChanged || sliderStartChanged || sliderEndChanged || widthChanged) {
                const t = inverseLerp(value, start, end);
                const sliderPos = lerp(0, size.width - sliderHandleSize, t);
                elSetStyle(c, "left", sliderPos + "px");
            }
        } imLayoutEnd(c);

        const { mouse }  = getGlobalEventSystem();

        if (imMemo(c, mouse.leftMouseButton)) {
            if (elHasMouseOver(c, sliderBody) && mouse.leftMouseButton) {
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
    } imLayoutEnd(c);

    return value;
}
