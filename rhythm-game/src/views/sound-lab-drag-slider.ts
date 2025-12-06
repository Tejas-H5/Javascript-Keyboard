import { imCompactCircularDragSlideInteraction, imCompactCircularDragSlideInteractionFeedback, imCompactLinearDragSlideInteraction } from "src/app-components/drag-slider-interaction";
import {
    ImCache,
    imElse,
    imEndIf,
    imIf
} from "src/utils/im-core";
import { elHasMousePress, getGlobalEventSystem } from "src/utils/im-dom";
import { clamp, gridsnapRound } from "src/utils/math-utils";


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

    const { mouse } = getGlobalEventSystem();

    let shift = false;

    if (mouse.ev?.shiftKey) {
        step = 0.1
        shift = true;
    }

    let pixelsPerUnit = 100;

    if (mouse.ev?.ctrlKey) {
        pixelsPerUnit = 1000;
        if (shift) {
            step = 0.001;
        }
    }

    let isDragging = false;

    if (imIf(c) && dragType === DRAG_TYPE_CIRCULAR) {
        const state = imCompactCircularDragSlideInteraction(c, val, min, max, pixelsPerUnit, 1);
        imCompactCircularDragSlideInteractionFeedback(c, state);

        if (state.isDragging) {
            isDragging = true;
            val = state.value;
        }
    } else {
        imElse(c);

        const state = imCompactLinearDragSlideInteraction(c, 100, val, min, max);
        if (state.isDragging) {
            isDragging = true;
            val = state.draggedValue;
        }
    } imEndIf(c);


    if (isDragging) {
        val = gridsnapRound(val, step);
        val = clamp(val, min, max);

        if (elHasMousePress(c) && mouse.rightMouseButton) {
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
