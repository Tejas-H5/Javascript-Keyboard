import { arrayMove } from "src/utils/array-utils";
import { ImCache, imGet, imMemo, imSet, isFirstishRender } from "src/utils/im-core";
import { elHasMouseOver, elHasMousePress, elSetStyle, getGlobalEventSystem } from "src/utils/im-dom";
import { imBg } from "./core/layout";
import { cssVars } from "./core/stylesheets";

export type DragAndDropState =  {
    move: { a: number; b: number; } | null;

    drag: {
        startX: number;
        startY: number;
        startIdx: number;
        hoveringOverIdx: number;
    } | null;
};

export const DND_AUTOMOVE = 1 << 0;

export function imDragAndDrop(c: ImCache, list: unknown[], flags = 0): DragAndDropState {
    const dnd = imGet(c, imDragAndDrop) ?? imSet<DragAndDropState>(c, {
        move: null,

        drag: null,
    });

    if (dnd.move) {
        if (flags & DND_AUTOMOVE) {
            const a = dnd.move.a;
            const b = dnd.move.b;

            if (a >= 0 && a < list.length && b >= 0 && b < list.length) {
                arrayMove(list, a, b);
            }
        }

        dnd.move = null;
        // If we just moved something, dragging should be cleared out as well. 
        dnd.drag = null;
    }

    const ev = getGlobalEventSystem();
    const mouse = ev.mouse;

    // TODO: escape to cancel the drag

    const drag = dnd.drag;
    if (drag) {
        if (!mouse.leftMouseButton) {
            if (drag.startIdx !== drag.hoveringOverIdx) {
                dnd.move = { a: drag.startIdx, b: drag.hoveringOverIdx };
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
    if (elHasMouseOver(c) && dnd.drag) {
        dnd.drag.hoveringOverIdx = idx;
    }
}

// Just some basic outlining to make sure that it works. Switch to your own custom feedback as needed
export function imDropZoneForPrototyping(c: ImCache, dnd: DragAndDropState, idx: number) {
    imDropZone(c, dnd, idx);
    const isHovering = dnd.drag && dnd.drag.hoveringOverIdx === idx;
    if (imMemo(c, isHovering)) {
        elSetStyle(c, "outline", isHovering ? `solid 4px ${cssVars.fg}` : "");
    }
}

export function imDragHandle(c: ImCache, dnd: DragAndDropState, idx: number) {
    if (isFirstishRender(c)) {
        elSetStyle(c, "userSelect", "none");
        elSetStyle(c, "cursor", "move");
    }

    const mouse = getGlobalEventSystem().mouse;

    if (elHasMousePress(c) && mouse.leftMouseButton) {
        if (!dnd.drag) {
            dnd.drag = {
                startX: mouse.X,
                startY: mouse.Y,
                startIdx: idx,
                hoveringOverIdx: idx,
            };
        }
    }
}

export function imDragCssTransform(c: ImCache, dnd: DragAndDropState, idx: number) {
    let isDragging = false;
    let dX = 0, dY = 0;
    if (dnd.drag && dnd.drag.startIdx === idx) {
        const mouse = getGlobalEventSystem().mouse;
        dX = mouse.X - dnd.drag.startX;
        dY = mouse.Y - dnd.drag.startY;
        isDragging = true;
    }

    imBg(c, cssVars.bg);

    const dXChanged = imMemo(c, dX);
    const dYChanged = imMemo(c, dY);
    const isDraggingChanged = imMemo(c, isDragging);
    if (dXChanged || dYChanged || isDraggingChanged) {
        if (isDragging) {
            elSetStyle(c, "transform", `translate(${dX}px, ${dY}px)`);
        } else {
            // Needed to not break the context menu absolute positioning, for now
            elSetStyle(c, "transform", ``);
        }
    }

    if (isDraggingChanged) {
        elSetStyle(c, "pointerEvents", isDragging ? "none" : "all");
        elSetStyle(c, "zIndex", isDragging ? "100000" : "");
        elSetStyle(c, "boxShadow", isDragging ? "4px 4px 5px 0px rgba(0,0,0,0.37)" : "");
    }
}

export function imMoveButton(c: ImCache, dnd: DragAndDropState, idx: number, moveTo: number) {
    if (elHasMousePress(c)) {
        dnd.move = { a:  idx, b: moveTo };
    }
}
