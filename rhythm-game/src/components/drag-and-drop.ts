import { arrayAt, arraySwap, filterInPlace } from "src/utils/array-utils";
import { ImCache, imGet, imMemo, imSet, isFirstishRender } from "src/utils/im-core";
import { elHasMouseOver, elHasMousePress, elSetStyle, getGlobalEventSystem } from "src/utils/im-dom";
import { cssVars } from "./core/stylesheets";
import { imBg } from "./core/layout";

/**
 * Your non-drag-and-drop list-component-having ahh:
 *
 * ```ts
 * imLayout(c, COL); {
 *      const listState = imState(newListState);
 *      imFor(c); listState.items.forEach((item, idx) => imItem(c, listState, item, idx)); imForEnd(c);
 *      if (listState.remove) filterInPlace(listState.items, item => item !== listSTate.remove);
 *      if (listState.add) {
 *          const [itemAfter, newItem] = listState.add;
 *          const idx = listState.indexOf(itemAfter); assert(idx !== -1);
 *          listState.list.splice(idx + 1, 0, newItem);
 *      }
 *      if (listState.swap) {
 *          const [a, b] = listState.swap;
 *          if (a >= 0 && a < listState.length && b >= 0 && b < listStbte.length) {
 *              const temp = listState.items[a];
 *              listState[a] = listState[b];
 *              listState[b] = temp;
 *          }
 *      }
 * } imLayoutEnd(c);
 *
 * function imItem(c, listState, i, idx) {
 *      imLayout(c, ROW); {
 *          imStrFmt(c, i, itemToString); 
 *          if (imButtonClicked(c, "Add"))       listState.add = [i, newItem()];
 *          if (imButtonClicked(c, "Remove"))    listState.remove = i;
 *          if (imButtonClicked(c, "Move up"))   listState.swap = [idx, idx - 1]
 *          if (imButtonClicked(c, "Move down")) listState.swap = [idx, idx + 1];
 *      } imLayoutEnd(c);
 * }
 *
 * ```
 *
 * Let's rewrite it to use Drag&Drop instead:
 *
 * ```ts
 * imLayout(c, COL); {
 *      const listState = imState(newListState);
 *      const dnd = imDragAndDrop(listState.items);
 *
 *      // TODO: 
 *      // const dnd = imDragAndDrop(listState.items, DND_AUTOMOVE | DND_AUTODELETE);
 *
 *      imFor(c); listState.items.forEach((item, idx) => imItem(c, listState, item, idx, dnd)); imForEnd(c);
 *      if (dnd.insert) {
 *          // you'll always need to decide how to make new items
 *          const { idx } = dnd.insert;
 *          listState.list.splice(idx + 1, 0, newItem());
 *      }
 *      if (dnd.remove) { // Never hit if you specified DND_AUTODELETE
 *          // could be handled automatically.
 *          filterInPlace(listState.items, item => item !== listState.remove);
 *      }
 *      if (dnd.move) { // Never hit if you specified DND_AUTOMOVE
 *          const { a, b } = listState.move;
 *          if (a >= 0 && a < listState.length && b >= 0 && b < listStbte.length) {
 *              const temp = listState.items[a];
 *              listState[a] = listState[b];
 *              listState[b] = temp;
 *          }
 *      }
 * } imLayoutEnd(c);
 *
 * function imItem(c, listState, i, idx, dnd) {
 *      imDropZoneBegin(c, dnd, idx, PLACEMENT_COLUMN); {
 *          // drag-handle could also have been a little handle thing on the side, 
 *          // or can have multiple of them, but fk it let's make the whole thing draggable.
 *          imDragHandle(c, dnd, idx);
 *          imLayout(c, ROW); {
 *              imStrFmt(c, i, itemToString); 
 *
 *              if (imButtonClicked(c, "Remove")) dnd.remove = { idx };
 *              if (imButtonClicked(c, "Add"))    dnd.insert = { idx };
 *              // Funnily enough, there is nothing stopping you from still having these, even 
 *              // though the drop-zone and drag-zone will already allow a user to move things.
 *              if (imButtonClicked(c, "Move up"))   dnd.move = { a: idx, b: idx - 1 };
 *              if (imButtonClicked(c, "Move down")) dnd.move = { a: idx, b: idx + 1 };
 *          } imLayoutEnd(c);
 *      } imDropZoneEnd(c, dnd, idx);
 * }
 *
 * ```
 *
 * - Consistent API for CRUD ops on lists
 * - Items can now be dragged around with mouse
 * - All list items should now animate (?)
 *     - I'm still not sure if it needs cooperation from the parent list component.
 *
 * TODO: let's see if we can actually code it tho xDDD looks too hard.
 * TODO: figure out how to get rid of the add/remove as well. 
 *
 */

export type DragAndDropState =  {
    delete: { idx: number; } | null;
    insert: { idx: number; } | null;
    move: { a: number; b: number; } | null;

    drag: {
        startX: number;
        startY: number;
        startIdx: number;
        hoveringOverIdx: number;
    } | null;
};

export const DND_AUTOMOVE = 1 << 0;
export const DND_AUTODELETE = 2 << 0;

export function imDragAndDrop(c: ImCache, list: unknown[], flags = 0): DragAndDropState {
    const dnd = imGet(c, imDragAndDrop) ?? imSet<DragAndDropState>(c, {
        delete: null,
        insert: null,
        move: null,

        drag: null,
    });

    // consume events if we didn't consume them last frame
    if (dnd.delete) {
        if (flags & DND_AUTODELETE) {
            const toDelete = arrayAt(list, dnd.delete.idx);
            filterInPlace(list, val => val !== toDelete);
        }

        dnd.delete = null;
    }

    if (dnd.insert) {
        // We cant fill in the blanks ...
        dnd.insert = null;
    }

    if (dnd.move) {
        if (flags & DND_AUTOMOVE) {
            const a = dnd.move.a;
            const b = dnd.move.b;

            if (a >= 0 && a < list.length && b >= 0 && b < list.length) {
                arraySwap(list, a, b);
            }
        }

        dnd.move = null;
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
    if (dXChanged || dYChanged) {
        elSetStyle(c, "transform", `translate(${dX}px, ${dY}px)`);
    }

    if (imMemo(c, isDragging)) {
        elSetStyle(c, "pointerEvents", isDragging ? "none" : "all");
        elSetStyle(c, "zIndex", isDragging ? "100000" : "");
        elSetStyle(c, "boxShadow", isDragging ? "4px 4px 5px 0px rgba(0,0,0,0.37)" : "");
    }
}
