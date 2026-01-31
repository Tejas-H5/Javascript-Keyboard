import { imCompactCircularDragSlideInteraction, imCompactCircularDragSlideInteractionFeedback, imCompactLinearDragSlideInteraction } from "src/app-components/drag-slider-interaction";
import {ImCache, imElse, imEndIf, imIf} from "src/utils/im-core";
import { elHasMousePress, getGlobalEventSystem } from "src/utils/im-dom";
import { isKeyHeld, KEY_MOD, KEY_SHIFT } from "src/utils/key-state";
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

    const { mouse, keyboard } = getGlobalEventSystem();

    const shiftHeld = isKeyHeld(keyboard.keys, KEY_SHIFT);
    const modHeld   = isKeyHeld(keyboard.keys, KEY_MOD);

    let pixelsPerUnit = 100;

    let isDragging = false;

    if (imIf(c) && dragType === DRAG_TYPE_CIRCULAR) {
        const lockRing = shiftHeld;
        const state = imCompactCircularDragSlideInteraction(c, val, min, max, 30, 1.6, lockRing);
        imCompactCircularDragSlideInteractionFeedback(c, state);

        if (state.isDragging) {
            isDragging = true;
            val = state.value;
        }
    } else {
        imElse(c);

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
