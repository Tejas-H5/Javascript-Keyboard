import { BLOCK, imAbsolute, imBg, imFg, imFixed, imFixedXY, imLayoutBegin, imLayoutEnd, imOpacity, imSize, NA, PX } from "src/components/core/layout";
import { cssVars } from "src/components/core/stylesheets";
import { ImCache, imFor, imForEnd, imGet, imIf, imIfEnd, imMemo, imSet, imState, isFirstishRender } from "src/utils/im-core";
import { elHasMousePress, elSetStyle, EV_CONTEXTMENU, getGlobalEventSystem, imOn } from "src/utils/im-dom";
import { clamp, deltaAngle, lerp, lerp01 } from "src/utils/math-utils";

export type CompactLinearDragSlideInteractionState = {
    isDragging: boolean;
    lastMouseX: number;
    // Track our own copy of the value being dragged, so that
    // clamping can be implemented userside properly
    draggedValue: number;
};

export function imCompactLinearDragSlideInteraction(
    c: ImCache,
    pixelsPerUnit: number,
    value: number,
    min: number,
    max: number,
): CompactLinearDragSlideInteractionState {
    const s = imGet(c, imCompactLinearDragSlideInteraction) ?? imSet(c, {
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
            s.draggedValue += dragDistance / pixelsPerUnit;
            s.draggedValue = clamp(s.draggedValue, min, max);
        }
    }

    return s;
}


// cursorMatrix array contains the cursor 
// we want for these angles from S -> mouse pos.
//
//            2           
//      3     |      1    
//            |           
//            |           
//---4--------S----------0
//            |          
//      5     |      7   
//            6          
const cursorsPerSector = [
    "ns-resize",
    "nesw-resize",
    "ew-resize",
    "nwse-resize",
    "ns-resize",
    "nesw-resize",
    "ew-resize",
    "nwse-resize",
];

type CompactCircularDragSlideInteractionState = {
    isDragging: boolean;

    startMouseX: number;
    startMouseY: number;
    startAngle: number;

    lastAngle: number;
    angle: number;
    distance: number;
    ringSize: number;
    deadzone: number;
    ringIdx: number;
    ringDistance: number;

    // Track our own copy of the value being dragged, so that
    // clamping can be implemented userside properly
    draggedValue: number;
    value: number;
};

function newCompactCircularDragSlideInteractionState(): CompactCircularDragSlideInteractionState {
    return {
        isDragging: false,

        startMouseX: 0,
        startMouseY: 0,
        startAngle: 0,

        lastAngle: 0,
        angle: 0,
        distance: 0,
        ringSize: 0,
        deadzone: 0,
        ringIdx: 0,
        ringDistance: 0,

        // Track our own copy of the value being dragged, so that
        // clamping can be implemented userside properly
        draggedValue: 0,
        value: 0,
    };
}

// Actually a better idea than I thought. Haven't seen it other people do it yet for some reason.
// As a side-effect of the implementation, you can right-click to reposition the centerpoint in the middle of the interaction.
// I kinda just dont want to fix this bug for now xD
// It is no longer a bug but a heavily relied upon feature.
export function imCompactCircularDragSlideInteraction(
    c: ImCache,
    value: number,
    min: number,
    max: number,
    ringSize: number,
    ringSizeExp: number,
    lockRing: boolean,
): CompactCircularDragSlideInteractionState {
    const s = imState(c, newCompactCircularDragSlideInteractionState);
    s.value = value;

    const { mouse, blur } = getGlobalEventSystem();

    let startedDragging = false;

    if (blur || !mouse.leftMouseButton) {
        s.isDragging = false;
    } else if (elHasMousePress(c) && mouse.leftMouseButton) {
        startedDragging = true;
    }

    if (startedDragging) {
        s.isDragging = true;
        s.startMouseX = mouse.X;
        s.startMouseY = mouse.Y;
        s.lastAngle = 0;
        s.draggedValue = value;
    }

    if (s.isDragging) {
        mouse.ev?.preventDefault();

        const startToMouseX = mouse.X - s.startMouseX;
        const startToMouseY = mouse.Y - s.startMouseY;
        s.angle = Math.atan2(startToMouseY, startToMouseX) - Math.PI / 2;
        s.distance = Math.sqrt(startToMouseX * startToMouseX + startToMouseY * startToMouseY);

        if (startedDragging) {
            s.startAngle = s.angle;
        }

        s.ringSize = ringSize;
        s.deadzone = ringSize;

        s.ringIdx = 0;
        s.ringDistance = s.deadzone;

        // Each segment outwards will be a bit larger (at least, when ringSizeExp a bit larget than 1)
        let segmentSize = ringSize;
        let nextRingDist = s.ringDistance;
        let dist = s.distance - s.deadzone;
        while (dist > 0) {
            s.ringIdx += 1;
            s.ringDistance = nextRingDist;
            nextRingDist += segmentSize;
            s.ringSize = segmentSize;
            dist -= segmentSize;
            segmentSize *= ringSizeExp;

            if (lockRing && s.ringIdx >= 2) break;
        } 

        // Clockwise     -> positive
        // Anticlockwise -> negative
        const angleDelta = -deltaAngle(s.lastAngle, s.angle);
        s.lastAngle = s.angle;

        if (s.ringIdx >= 0 && Math.abs(angleDelta) > 0.000001 && !startedDragging) {
            s.draggedValue += Math.pow(10, -5 + s.ringIdx) * Math.sign(angleDelta);
            s.draggedValue = clamp(s.draggedValue, min, max);
            s.value = s.draggedValue;
        }
    }

    return s;
}


export function imCompactCircularDragSlideInteractionFeedback(c: ImCache, s: CompactCircularDragSlideInteractionState) {
    let wantedCursor = "move";

    if (imIf(c) && s.isDragging) {
        // Cursor handles
        imLayoutBegin(c, BLOCK); imFixed(c, 0, PX, 0, PX, 0, PX, 0, PX); {
            if (isFirstishRender(c)) elSetStyle(c, "zIndex", "100000");

            const ctxEv = imOn(c, EV_CONTEXTMENU);
            if (ctxEv) {
                // used to re-center the rotation in a more comfortable position on the screen.
                ctxEv.preventDefault();
            }

            const sectorSize = 2 * Math.PI / cursorsPerSector.length;
            const sectorStart = -sectorSize / 2;
            let positiveAngle = s.angle;
            if (positiveAngle < 0) positiveAngle += 2 * Math.PI;
            const wantedCursorIdx = Math.floor((positiveAngle - sectorStart) / sectorSize);

            wantedCursor = cursorsPerSector[wantedCursorIdx];
        } imLayoutEnd(c);

        const angleChanged = imMemo(c, s.angle);
        const ringDistanceChanged = imMemo(c, s.ringDistance);

        // centerpoint
        imLayoutBegin(c, BLOCK); {
            imSize(c, 20, PX, 20, PX);
            imOpacity(c, lerp01(0, 0.5, s.distance / s.ringSize));
            imFixedXY(c, s.startMouseX, PX, s.startMouseY, PX);
            if (isFirstishRender(c)) elSetStyle(c, "border", "2px solid " + cssVars.fg);

            if (angleChanged) {
                elSetStyle(c, "transform", `translate(-50%, -50%) rotateZ(${s.angle - Math.PI / 2}rad)`);
            }
        } imLayoutEnd(c);


        // dynamic dials
        if (imIf(c) && s.ringIdx >= 0) {
            imFor(c); for (let i = 0; i <= 10; i++) {
                const width = 5;
                const height = s.ringSize;

                const isSolid = i === 10
                const tickAngle = isSolid ? s.angle : i * 2 * Math.PI / 10 + s.startAngle;

                imLayoutBegin(c, BLOCK); {
                    imSize(c, width, PX, height, PX);
                    imOpacity(c, isSolid ? 1 : 0.3); imFg(c, cssVars.bg); imBg(c, cssVars.fg);
                    imFixedXY(c, s.startMouseX, PX, s.startMouseY, PX);

                    if (ringDistanceChanged || angleChanged) {
                        elSetStyle(c, "transform", `translate(-50%, -50%) rotateZ(${tickAngle}rad) translate(0, calc(50% + ${s.ringDistance}px)`);
                    }
                } imLayoutEnd(c);
            } imForEnd(c);
        } imIfEnd(c);

    } imIfEnd(c);

    if (imMemo(c, wantedCursor)) elSetStyle(c, "cursor", wantedCursor);
}
