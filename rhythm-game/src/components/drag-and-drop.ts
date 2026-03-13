import { im, ImCache, imdom } from "src/utils/im-js";

import { COL, imBg, imFlex, imLayoutBegin, imLayoutEnd } from "./core/layout.ts";
import { cssVars } from "./core/stylesheets.ts";

export type DragAndDropState =  {
    move: { a: number; b: number; } | null;
    moved: { a: number; b: number; } | null;

    drag: {
        startX: number;
        startXOffset: number;
        startY: number;
        startYOffset: number;
        startIdx: number;
        hoveringOverIdx: number;
    } | null;
};

// NOTE: API not complete - it works well enough for lists, but we don't know how it will handle Kanban style dnd
// TODO: animate inserts and removes. not easy and we really dont need it most of the time so I may never get around to it.
export function imDragAndDrop(c: ImCache): DragAndDropState {
    const dnd = im.Get(c, imDragAndDrop) ?? im.Set<DragAndDropState>(c, {
        move: null,
        moved: null,
        drag: null,
    });

    if (dnd.moved) {
        dnd.moved = null;
    }

    if (dnd.move) {
        dnd.moved = dnd.move;
        dnd.move = null;
        // If we just moved something, dragging should be cleared out as well. 
        dnd.drag = null;
    }

    const mouse = imdom.getMouse();

    // TODO: escape to cancel the drag

    const drag = dnd.drag;
    if (drag) {
        if (!mouse.leftMouseButton) {
            if (drag.startIdx !== drag.hoveringOverIdx && drag.hoveringOverIdx !== -1) {
                dnd.move = { a: drag.startIdx, b: drag.hoveringOverIdx };
                if (dnd.move.b > dnd.move.a) {
                    dnd.move.b--;
                }
            }

            dnd.drag = null;
        }

        // needs to be set ever frame
        drag.hoveringOverIdx = -1;
    }


    return dnd;
}

// Put this on any UI element to make it a drop-zone
export function imDropZone(c: ImCache, dnd: DragAndDropState, idx: number) {
    if (imdom.hasMouseOver(c) && dnd.drag) {
        dnd.drag.hoveringOverIdx = idx;
    }
}

// Just some basic outlining to make sure that it works. Switch to your own custom feedback as needed
export function imDropZoneForPrototyping(c: ImCache, dnd: DragAndDropState, idx: number) {
    imDropZone(c, dnd, idx);
    const isHovering = dnd.drag && dnd.drag.hoveringOverIdx === idx;
    if (im.Memo(c, isHovering)) {
        imdom.setStyle(c, "borderTop", isHovering ? `solid 4px ${cssVars.fg}` : "");
    }
}

export function imDragHandle(c: ImCache, dnd: DragAndDropState, idx: number) {
    if (im.isFirstishRender(c)) {
        imdom.setStyle(c, "userSelect", "none");
        imdom.setStyle(c, "cursor", "move");
    }

    const mouse = imdom.getMouse();

    if (imdom.hasMousePress(c) && mouse.leftMouseButton) {
        if (!dnd.drag) {
            const elRect = imdom.getElement(c).getBoundingClientRect();

            dnd.drag = {
                startX: mouse.X,
                startXOffset: mouse.X - elRect.left,
                startY: mouse.Y,
                startYOffset: mouse.Y - elRect.top,
                startIdx: idx,
                hoveringOverIdx: idx,
            };
        }
    }
}

export type DragZoneState = {
    startWidth: number;
    startHeight: number;
    dnd: DragAndDropState;
};

export function imDragZoneBegin(c: ImCache, dnd: DragAndDropState, idx: number): DragZoneState {
    const s = im.Get(c, imDragZoneBegin) ?? im.Set<DragZoneState>(c, {
        dnd, 
        startWidth: 0,
        startHeight: 0,
    });

    let dX = 0, dY = 0;
    let isDragging = false;
    if (dnd.drag && dnd.drag.startIdx === idx) {
        const mouse = imdom.getMouse();
        dX = mouse.X - dnd.drag.startX - dnd.drag.startXOffset;
        dY = mouse.Y - dnd.drag.startY - dnd.drag.startYOffset;
        isDragging = true;
    }

    const outer = imLayoutBegin(c, COL); {
        const isDraggingChanged = im.Memo(c, isDragging);
        if (isDraggingChanged) {
            if (isDragging) {
                s.startWidth = outer.clientWidth;
                s.startHeight = outer.clientHeight;
            }
        }

        imLayoutBegin(c, COL); imFlex(c); {
            imBg(c, cssVars.bg);

            const dXChanged = im.Memo(c, dX);
            const dYChanged = im.Memo(c, dY);
            if (dXChanged || dYChanged || isDraggingChanged) {
                if (dnd.drag && isDragging) {
                    const x = dnd.drag.startX + dX;
                    const y = dnd.drag.startY + dY;
                    imdom.setStyle(c, "transform", `translate(${x}px, ${y}px)`);
                } else {
                    // Needed to not break the context menu absolute positioning, for now
                    imdom.setStyle(c, "transform", ``);
                }
            }

            if (isDraggingChanged) {
                imdom.setStyle(c, "pointerEvents", isDragging ? "none" : "all");
                imdom.setStyle(c, "zIndex", isDragging ? "100000" : "");
                imdom.setStyle(c, "boxShadow", isDragging ? "4px 4px 5px 0px rgba(0,0,0,0.37)" : "");
                imdom.setStyle(c, "position", isDragging ? "fixed" : "");
                imdom.setStyle(c, "top", isDragging ? "0" : "");
                imdom.setStyle(c, "left", isDragging ? "0" : "");

                imdom.setStyle(c, "width", isDragging ? (s.startWidth + "px") : "", outer);
                imdom.setStyle(c, "height", isDragging ? (s.startHeight + "px") : "", outer);
            }
        } // imLayoutEnd(c);
    } // imLayoutEnd(c);

    return s;
}

export function imDragZoneEnd(c: ImCache, z: DragZoneState, idx: number) {
    // imLayout
    {
        // imLayout
        {
        } imLayoutEnd(c);
    } imLayoutEnd(c);
}

function setMoveToEvent(dnd: DragAndDropState, idx: number, moveTo: number) {
}

export function imMoveButton(c: ImCache, dnd: DragAndDropState, idx: number, moveTo: number) {
    if (imdom.hasMousePress(c)) {
        dnd.move = { a:  idx, b: moveTo };
    }
}
