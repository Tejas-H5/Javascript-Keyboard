import { im, ImCache, imdom, el, ev, } from "src/utils/im-js";

import { clamp } from "src/utils/math-utils.ts";
import { cssVarsApp } from "src/views/styling.ts";
import { BLOCK, imLayoutBegin, imLayoutEnd } from "./core/layout.ts";


type RangeSliderHandle = {
    pos: number;
    dragging: boolean;
    dragStartPos: number;
}

type RangeSliderState = {
    start: RangeSliderHandle;
    end:   RangeSliderHandle;

    dragStarted: boolean;
    dragStartPos: number;

    value: [
        start: number,
        end: number,
        userDraggingStart: boolean,
        userDraggingEnd: boolean,
    ];
}

function newRangeSliderHandle(pos: number): RangeSliderHandle {
    return {
        pos: pos,
        dragStartPos: 0,
        dragging: false,
    };
}

const VERY_SMALL_NUMBER = 0.0000001;

// TODO: an invalid state when start==end
export function imRangeSlider(
    c: ImCache,
    lowerBound: number, upperBound: number, 
    start: number, end: number, step: number, 
    minWidth?: number, 
): RangeSliderState {
    let min = Math.min(lowerBound, upperBound);
    let max = Math.max(lowerBound, upperBound);

    let s = im.Get(c, imRangeSlider);
    if (!s) {
        s = im.Set(c, {
            start: newRangeSliderHandle(0),
            end:   newRangeSliderHandle(1),

            dragStarted:   false,
            dragStartPos:  0,
            draggingStart: false,
            draggingEnd:   false,

            value: [start, end, false, false],
        });
    }

    const body = imLayoutBegin(c, BLOCK); 
    const bodySize = imdom.TrackSize(c);
        const sliderMiddle = imLayoutBegin(c, BLOCK); imLayoutEnd(c);
        const startHandle = imLayoutBegin(c, BLOCK); imLayoutEnd(c);
        const endHandle = imLayoutBegin(c, BLOCK); imLayoutEnd(c);
    imLayoutEnd(c);

    if (im.isFirstishRender(c)) {
        const handleBodyColor = cssVarsApp.mg;
        const handeColor = cssVarsApp.fg;
        const bgColor = cssVarsApp.bg2;

        imdom.setStyle(c, "height", "1em", body);
        imdom.setStyle(c, "backgroundColor", bgColor, body);
        imdom.setStyle(c, "position", "relative", body);
        imdom.setStyle(c, "borderRadius", "1000px", body);

        imdom.setStyle(c, "position", "absolute", startHandle);
        imdom.setStyle(c, "top", "0", startHandle);
        imdom.setStyle(c, "height", "100%", startHandle);
        imdom.setStyle(c, "aspectRatio", "1 / 1", startHandle);
        imdom.setStyle(c, "backgroundColor", handeColor, startHandle);
        imdom.setStyle(c, "borderRadius", "1000px", startHandle);
        imdom.setStyle(c, "cursor", "ew-resize", startHandle);

        imdom.setStyle(c, "position", "absolute", sliderMiddle);
        imdom.setStyle(c, "top", "0", sliderMiddle);
        imdom.setStyle(c, "height", "100%", sliderMiddle);
        imdom.setStyle(c, "backgroundColor", handleBodyColor, sliderMiddle);
        imdom.setStyle(c, "cursor", "ew-resize", sliderMiddle);

        imdom.setStyle(c, "position", "absolute", endHandle);
        imdom.setStyle(c, "top", "0", endHandle);
        imdom.setStyle(c, "height", "100%", endHandle);
        imdom.setStyle(c, "aspectRatio", "1 / 1", endHandle);
        imdom.setStyle(c, "backgroundColor", handeColor, endHandle);
        imdom.setStyle(c, "borderRadius", "1000px", endHandle);
        imdom.setStyle(c, "cursor", "ew-resize", endHandle);
    }

    // Respond to pos change _after_ user has handled and set new drag values

    const domain = max - min;
    s.start.pos = domain < VERY_SMALL_NUMBER ? 0 : clamp((start - min) / domain, 0, 1);
    s.end.pos   = domain < VERY_SMALL_NUMBER ? 1 : clamp((end - min) / domain, 0, 1);

    const startPosChanged    = im.Memo(c, s.start.pos);
    const endPosChanged      = im.Memo(c, s.end.pos);
    const sliderWidthChanged = im.Memo(c, bodySize.size.width);
    if (startPosChanged || endPosChanged || sliderWidthChanged) {
        const bodyRect = body.getBoundingClientRect(); 
        const startRect = startHandle.getBoundingClientRect();
        const endRect = endHandle.getBoundingClientRect();
        const sliderScreenStart  = bodyRect.left + startRect.width;
        const sliderScreenEnd    = bodyRect.right - endRect.width;
        const sliderScreenLength = sliderScreenEnd - sliderScreenStart;

        const startPosPx = sliderScreenLength * s.start.pos;
        const endPosPx   = sliderScreenLength * s.end.pos;
        imdom.setStyle(c, "left",  startPosPx + "px",                     startHandle);
        imdom.setStyle(c, "left",  (startRect.width + endPosPx) + "px",   endHandle);
        imdom.setStyle(c, "left",  (startPosPx + startRect.width / 2) + "px", sliderMiddle);
        imdom.setStyle(c, "width", (endPosPx - startPosPx + startRect.width / 2 + endRect.width / 2) + "px",        sliderMiddle);
    }

    const mouse = imdom.getMouse();
    if (s.dragStarted && !mouse.leftMouseButton) {
        s.dragStarted = false;
        s.start.dragging = false;
        s.end.dragging = false;
    } 

    let middleDragStarted = mouse.leftMouseButton && imdom.hasMousePress(c, sliderMiddle);
    let startDragStarted  = mouse.leftMouseButton && imdom.hasMousePress(c, startHandle);
    let endDragStarted    = mouse.leftMouseButton && imdom.hasMousePress(c, endHandle);
    let bodyDragStarted   = mouse.leftMouseButton && imdom.hasMousePress(c, body);
    const dragStarted = middleDragStarted || startDragStarted || endDragStarted || bodyDragStarted;
    if (s.dragStarted || dragStarted) {
        s.dragStarted = true;
        mouse.ev?.preventDefault();

        const bodyRect = body.getBoundingClientRect(); 
        const startRect = startHandle.getBoundingClientRect();
        const endRect = endHandle.getBoundingClientRect();

        const sliderScreenStart  = bodyRect.left + startRect.width / 2;
        const sliderScreenEnd    = bodyRect.right - endRect.width / 2;
        const sliderScreenLength = sliderScreenEnd - sliderScreenStart;
        const mousePos = (mouse.X - sliderScreenStart) / sliderScreenLength;

        // NOTE: order  matters - if middleDragStarted, then bodyDragStarted is always true
        if (middleDragStarted) {
            startDragStarted = true;
            endDragStarted = true;
        } else if (bodyDragStarted) {
            const lengthToStart = Math.abs(mousePos - s.start.pos);
            const lengthToEnd = Math.abs(mousePos - s.end.pos);
            if (lengthToStart < lengthToEnd) {
                startDragStarted = true;
            } else {
                endDragStarted = true;
            }
        }

        if (startDragStarted) {
            s.start.dragging = true;
            s.start.dragStartPos = s.start.pos;
        }
        if (endDragStarted) {
            s.end.dragging = true;
            s.end.dragStartPos = s.end.pos;
        }

        let deltaPos = 0;
        if (dragStarted) {
            s.dragStartPos = mousePos;
        } else {
            deltaPos = mousePos - s.dragStartPos;
        }

        if (s.start.dragging) {
            s.start.pos = clamp(s.start.dragStartPos + deltaPos, 0, 1);
            if (!s.end.dragging) {
                if (s.start.pos > s.end.pos) {
                    // s.start.pos = s.end.pos; // clamp
                    s.end.pos = s.start.pos; // physics
                }
            }
        } 

        if (s.end.dragging) {
            s.end.pos = clamp(s.end.dragStartPos + deltaPos, 0, 1);
            if (!s.start.dragging) {
                if (s.start.pos > s.end.pos) {
                    // s.end.pos = s.start.pos;
                    s.start.pos = s.end.pos;
                }
            }
        }
    }

    let a = min + s.start.pos * domain;
    let b = min + s.end.pos * domain;

    let minWidthActual = 0;
    if (s.start.dragging === s.end.dragging) {
        minWidthActual = end - start;
    }

    if (minWidth !== undefined) {
        minWidthActual = Math.max(minWidth, minWidthActual);
    }

    if (minWidthActual !== undefined) {
        if (b - a < minWidthActual) {
            b = a + minWidthActual;
        }

        if (b > upperBound) {
            b = upperBound;
            a = upperBound - minWidthActual;

            if (a < lowerBound) {
                a = lowerBound;
            }
        }
    }

    if (step > VERY_SMALL_NUMBER) {
        if (step !== 1) {
            a /= step;
            b /= step;
        }

        a = Math.floor(a);
        b = Math.floor(b);

        if (step !== 1) {
            a *= step;
            b *= step;
        } 
    }

    s.value[0] = a;
    s.value[1] = b;
    s.value[2] = s.start.dragging;
    s.value[3] = s.end.dragging;

    return s;
}
