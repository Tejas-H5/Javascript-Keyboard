import { ImCache, imGetInline, imSet, isFirstishRender } from "src/utils/im-core";
import { elHasMousePress, elSetStyle, getGlobalEventSystem } from "src/utils/im-dom";
import { clamp } from "src/utils/math-utils";

export function imCompactDragSlider(
    c: ImCache,
    pixelsPerUnit: number,
    value: number,
    min: number,
    max: number,
): number {
    const s = imGetInline(c, imCompactDragSlider) ?? imSet(c, {
        isDragging: false,
        lastMouseX: 0,
        // Track our own copy of the value being dragged, so that
        // clamping can be implemented userside properly
        draggedValue: 0,
    });

    if (isFirstishRender(c)) {
        elSetStyle(c, "cursor", "ew-resize");
    }

    const { mouse, blur } = getGlobalEventSystem();

    let startedDragging = false;

    if (blur || !mouse.leftMouseButton) {
        s.isDragging = false;
    } else if (elHasMousePress(c) && mouse.leftMouseButton) {
        startedDragging = true;
    }

    if (startedDragging) {
        s.isDragging = true;
        s.lastMouseX = mouse.X;
        s.draggedValue = value;
    }

    // I'm usually not keen on delta-based drag, since it is incapable of properly tracking the mouse position.
    // But for this specific case I think it is the better option, since there is no visual to track, like how there is on 
    // the slider, for example.
    if (s.isDragging) {
        mouse.ev?.preventDefault();
        const dragDistance = mouse.X - s.lastMouseX;
        s.lastMouseX = mouse.X;

        if (Math.abs(dragDistance) > 0.000001) {
            let pixelsPerUnitActual = pixelsPerUnit;
            const shift = mouse.ev?.shiftKey;
            const ctrl = mouse.ev?.ctrlKey || mouse.ev?.metaKey;
            if (shift) {
                pixelsPerUnitActual /= 10;
            }

            // Pausing a drag allows us to reposition our cursor more appropriately to continue the drag action. 
            // A native program doesn't need to do this, because it has access to APIs that simply reposition the mouse cursor as it pleases xD
            let dragPaused = ctrl;
            if (!dragPaused) {
                s.draggedValue += dragDistance / pixelsPerUnitActual;
            }
        }

        s.draggedValue = clamp(s.draggedValue, min, max);

        value = s.draggedValue;
    }

    return value;
}

