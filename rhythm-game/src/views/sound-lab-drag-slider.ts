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

    if (mouse.ev?.shiftKey) {
        step = 0.1
    }

    if (imIf(c) && dragType === DRAG_TYPE_CIRCULAR) {
        const state = imCompactCircularDragSlideInteraction(c, val, min, max, 100, 1);
        imCompactCircularDragSlideInteractionFeedback(c, state);

        val = state.value;
    } else {
        imElse(c);
        val = imCompactLinearDragSlideInteraction(c, 100, val, min, max);
    } imEndIf(c);

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

    return null;
}
