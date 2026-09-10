import { imCompactCircularDragSlideInteraction, imCompactCircularDragSlideInteractionFeedback, imCompactLinearDragSlideInteraction } from "app-components/drag-slider-interaction";
import { im, ImCache, imdom, el, ev, key, } from "imcf";


import { clamp, gridsnapRound } from "utils/math-utils";

export const DRAG_TYPE_LINEAR = 1;
export const DRAG_TYPE_CIRCULAR = 2;

export function imParameterSliderInteraction(
    c: ImCache,
    min: number,
    max: number,
    step: number,
    val: number,
    defaultValue: number,
    dragType = DRAG_TYPE_LINEAR,
): { val: number } | null {
    let initialVal = val;

    const shiftHeld = imdom.isKeyHeld(key.SHIFT);
    const modHeld   = imdom.isKeyHeld(key.MOD);

    let pixelsPerUnit = 100;

    let isDragging = false;

    if (im.If(c) && dragType === DRAG_TYPE_CIRCULAR) {
        const lockRing = shiftHeld;
        const state = imCompactCircularDragSlideInteraction(c, val, min, max, 30, 1.6, lockRing);
        imCompactCircularDragSlideInteractionFeedback(c, state);

        if (state.isDragging) {
            isDragging = true;
            val = state.value;
        }
    } else {
        im.Else(c);

        if (modHeld) {
            pixelsPerUnit = 1000;
            if (shiftHeld) {
                step = 0.001;
            }
        }

        const state = imCompactLinearDragSlideInteraction(c, 100, val, min, max);
        if (state.isDragging) {
            isDragging = true;
            val = state.draggedValue;
        }
    } im.IfEnd(c);


    if (isDragging) {
        val = gridsnapRound(val, step);
        val = clamp(val, min, max);

        const mouse = imdom.getMouse();
        if (imdom.hasMousePress(c) && mouse.rightMouseButton) {
            // Reset to default value on rightclick
            mouse.ev?.preventDefault();
            val = defaultValue;
        }

        if (val !== initialVal) {
            return { val };
        }
    }

    return null;
}
