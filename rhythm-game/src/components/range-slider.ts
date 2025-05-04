import { elementHasMouseClick, elementHasMouseDown, getCurrentRoot, getMouse, imEnd, imInit, imMemo, imMemoObjectVals, setStyle } from "src/utils/im-dom-utils";
import { clamp, inverseLerp, lerp, } from "src/utils/math-utils";
import { ABSOLUTE, EM, imBeginSpace, NOT_SET, PERCENT, PX, RELATIVE, ROW } from "src/views/layout";
import { cssVars } from "src/views/styling";

export type RangeSliderState = {
    min: number;
    max: number;
    minRangeSize: number;

    lastStartValue: number;
    lastEndValue: number;

    startValue: number;
    endValue: number;
    mouseStartX: number;
    dragDeltaX: number;
    dragStartStart: number;
    dragEndStart: number;
};


function clampRangeSliderEndpoints(s: RangeSliderState) {
    const lastRangeSize = s.lastEndValue - s.lastStartValue;

    if (s.startValue < s.min) {
        s.startValue = s.min;
        s.endValue = s.min + lastRangeSize;
    } else if (s.endValue > s.max) {
        s.endValue = s.max;
        s.startValue = s.endValue - lastRangeSize;
    }
}

export function newRangeSliderState(): RangeSliderState {
    return {
        min: 0,
        max: 0,
        minRangeSize: 0,

        lastStartValue: 0,
        lastEndValue: 0,

        startValue: 0,
        endValue: 0,
        mouseStartX: 0,
        dragDeltaX: 0,
        dragStartStart: 0,
        dragEndStart: 0,
    };
}

// TODO: an invalid state when start==end
export function imRangeSlider(s: RangeSliderState) {
    const minimumSize = s.minRangeSize;

    s.startValue = s.lastStartValue;
    s.endValue = s.lastEndValue;

    if (s.endValue - s.startValue < minimumSize) {
        s.endValue = s.startValue + minimumSize;
    }
    if (s.startValue < s.min) {
        s.startValue = s.min;
    }
    if (s.startValue + minimumSize > s.max) {
        s.startValue = s.max - minimumSize;
        s.endValue = s.max;
    }
    if (s.endValue - minimumSize < s.min) {
        s.startValue = s.min;
        s.endValue = s.min + minimumSize;
    }

    if (s.endValue > s.max) {
        s.endValue = s.max;
    }
    if (s.startValue < s.min) {
        s.startValue = s.min;
    }

    imBeginSpace(0, NOT_SET, 1, EM, RELATIVE); {
        const rect = getCurrentRoot().root.getBoundingClientRect();

        if (imInit()) {
            setStyle("backgroundColor", cssVars.bg2);
        }

        const mouse = getMouse();

        const sliderHandleSize = 40;
        const dx = mouse.dX;
        const x0 = rect.left;
        const x1 = rect.right - 2 * sliderHandleSize;
        if (x0 < x1) {
            s.dragDeltaX += (s.max - s.min) * dx / (x1 - x0);
        }

        // Start handle
        imBeginSpace(sliderHandleSize, PX, 100, PERCENT, ABSOLUTE | ROW); {
            const x0 = rect.left;
            const x1 = rect.right - 2 * sliderHandleSize;

            if (imInit()) {
                setStyle("backgroundColor", cssVars.fg2);
                setStyle("userSelect", "none");
                setStyle("cursor", "ew-resize");
            }

            if (mouse.leftMouseButton && elementHasMouseDown()) {
                if (elementHasMouseClick()) {
                    s.dragStartStart = s.startValue;
                    s.dragDeltaX = 0;
                }

                let t = 0;
                if (x0 < x1) {
                    t = inverseLerp(s.dragStartStart + s.dragDeltaX, s.min, s.max);
                    t = clamp(t, 0, 1);
                }

                s.startValue = Math.floor(lerp(s.min, s.max, t));
                if (s.startValue > s.endValue - minimumSize) {
                    console.log("1")
                    s.endValue = s.startValue + minimumSize;
                }

                clampRangeSliderEndpoints(s);

                s.lastStartValue = s.startValue;
                s.lastEndValue = s.endValue;
            }

            const sChanged = imMemoObjectVals(s);
            const x0Changed = imMemo(x0);
            const x1Changed = imMemo(x1);
            if (sChanged || x0Changed || x1Changed) {
                const t = inverseLerp(s.startValue, s.min, s.max);
                const sliderPos = lerp(x0, x1, t);
                setStyle("left", sliderPos + "px");
            }
        } imEnd();

        // body handle
        imBeginSpace(0, NOT_SET, 100, PERCENT, ABSOLUTE); {
            if (imInit()) {
                setStyle("backgroundColor", cssVars.bg);
                setStyle("userSelect", "none");
                setStyle("cursor", "ew-resize");
            }

            const x0 = rect.left + sliderHandleSize;
            const x1 = rect.right - sliderHandleSize;

            if (mouse.leftMouseButton && elementHasMouseDown()) {
                if (elementHasMouseClick()) {
                    s.dragStartStart = s.startValue;
                    s.dragEndStart = s.endValue;
                    s.dragDeltaX = 0;
                }

                const t0 = inverseLerp(s.dragStartStart + s.dragDeltaX, s.min, s.max);
                const t1 = inverseLerp(s.dragEndStart + s.dragDeltaX, s.min, s.max);

                s.startValue = Math.floor(lerp(s.min, s.max, t0));
                s.endValue = Math.floor(lerp(s.min, s.max, t1));

                if (s.endValue - s.startValue < minimumSize) {
                    s.endValue = s.startValue + minimumSize;
                }

                const delta = s.endValue - s.startValue;
                if (s.startValue < s.min) {
                    s.startValue = s.min;
                    s.endValue = s.min + delta;
                    console.log("3")
                } else if (s.endValue > s.max) {
                    s.endValue = s.max;
                    s.startValue = s.max - delta;
                    console.log("4")
                }

                clampRangeSliderEndpoints(s);

                s.lastStartValue = s.startValue;
                s.lastEndValue = s.endValue;
            }

            const sChanged = imMemoObjectVals(s);
            const x0Changed = imMemo(x0);
            const x1Changed = imMemo(x1);
            if (sChanged || x0Changed || x1Changed) {
                const t0 = inverseLerp(s.startValue, s.min, s.max);
                const t1 = inverseLerp(s.endValue, s.min, s.max);
                const sliderStart = lerp(x0, x1, t0);
                const sliderEnd = lerp(x0, x1, t1);
                setStyle("left", sliderStart + "px");
                setStyle("width", (sliderEnd - sliderStart) + "px");
            }
        } imEnd();

        // End handle
        imBeginSpace(sliderHandleSize, PX, 100, PERCENT, ABSOLUTE); {
            const x0 = rect.left + sliderHandleSize;
            const x1 = rect.right - sliderHandleSize;

            if (imInit()) {
                setStyle("backgroundColor", cssVars.fg2);
                setStyle("userSelect", "none");
                setStyle("cursor", "ew-resize");
            }

            const mouse = getMouse();
            if (mouse.leftMouseButton && elementHasMouseDown()) {
                if (elementHasMouseClick()) {
                    s.dragEndStart = s.endValue;
                    s.dragDeltaX = 0;
                }

                let t = 0;
                if (x0 < x1) {
                    t = inverseLerp(s.dragEndStart + s.dragDeltaX, s.min, s.max);
                    t = clamp(t, 0, 1);
                }

                s.endValue = Math.floor(lerp(s.min, s.max, t));
                if (s.startValue > s.endValue - minimumSize) {
                    console.log("1")
                    s.startValue = s.endValue - minimumSize;
                }

                clampRangeSliderEndpoints(s);

                s.lastStartValue = s.startValue;
                s.lastEndValue = s.endValue;
            }

            const sChanged = imMemoObjectVals(s);
            const x0Changed = imMemo(x0);
            const x1Changed = imMemo(x1);
            if (sChanged || x0Changed || x1Changed) {
                const t = inverseLerp(s.endValue, s.min, s.max);
                const sliderPos = lerp(x0, x1, t);
                setStyle("left", sliderPos + "px");
            }

        } imEnd();
    } imEnd();
}
