import { COL, imAbsolute, imFixed, imJustify, imLayout, imLayoutEnd, imZIndex, NA, PX, ROW } from "src/components/core/layout";
import { cssVars } from "src/components/core/stylesheets";
import { ImCache, imIf, imIfEnd, isFirstishRender } from "src/utils/im-core";
import { elHasMousePress, elSetStyle, getGlobalEventSystem } from "src/utils/im-dom";

export type ContextMenuState = {
    position: { x: number; y: number; };
    distanceToClose: number;
    open: boolean;
    item: unknown | null;
    field: unknown | null;
};

export function newContextMenuState(): ContextMenuState {
    return {
        position: { x: 0, y: 0 },
        open: false,
        item: null,
        field: null,
        distanceToClose: 50,
    };
}

export function imContextMenuBegin(c: ImCache, s: ContextMenuState): number | null {
    let result = null;

    const x = s.position.x;
    const y = s.position.y;

    if (imIf(c) && s.open) {
        imLayout(c, COL); imFixed(c, 0, PX, 0, PX, 0, PX, 0, PX); imZIndex(c, 10000); {
            const root = imLayout(c, COL); imAbsolute(c, y, PX, 0, NA, 0, NA, x, PX); {
                if (s.open) {
                    const mouse = getGlobalEventSystem().mouse;
                    const rect = root.getBoundingClientRect();

                    if (Math.abs(rect.x - rect.y) > 10) {
                        let mouseDistanceFromBorder = 0;
                        mouseDistanceFromBorder = Math.max(mouseDistanceFromBorder, rect.left - mouse.X);
                        mouseDistanceFromBorder = Math.max(mouseDistanceFromBorder, mouse.X - rect.right);
                        mouseDistanceFromBorder = Math.max(mouseDistanceFromBorder, rect.top - mouse.Y);
                        mouseDistanceFromBorder = Math.max(mouseDistanceFromBorder, mouse.Y - rect.bottom);

                        if (mouseDistanceFromBorder > s.distanceToClose) {
                            closeContextMenu(s);
                        }
                    }

                    if (s.position.y + rect.height > window.innerHeight) {
                        const wantedTop = s.position.y - rect.height;
                        s.position.y = wantedTop;
                    }
                }

                if (isFirstishRender(c)) {
                    elSetStyle(c, "padding", "3px");
                    elSetStyle(c, "userSelect", "none");
                    elSetStyle(c, "backgroundColor", cssVars.bg);
                    elSetStyle(c, "boxShadow", "4px 4px 5px 0px rgba(0,0,0,0.37)");
                    elSetStyle(c, "border", "1px solid rgba(0,0,0,0.37)");
                }

            } // imLayoutEnd(c);
        } // imLayoutEnd(c);
    } // imIfEnd(c);

    return result;
}

export function imContextMenuEnd(c: ImCache, s: ContextMenuState) {
    // imIf
    {
        // imLayout
        {
            // imLayout
            {
            } imLayoutEnd(c);

            if (elHasMousePress(c)) {
                closeContextMenu(s);
            }
        } imLayoutEnd(c);
    } imIfEnd(c);
}

// This is not as important as imContextMenuBegin/End, and can be changed for something else.
export function imContextMenuItemBegin(c: ImCache) {
    imLayout(c, ROW); imJustify(c); {
        if (isFirstishRender(c)) {
            elSetStyle(c, "borderBottom", "1px solid rgba(0,0,0,0.37)");
        }
    } // imLayoutEnd
}

export function imContextMenuItemEnd(c: ImCache) {
    // imLayout
    {
    } imLayoutEnd(c);
}

export function openContextMenu(s: ContextMenuState, x: number, y: number, item: unknown, field: unknown) {
    s.open = true;
    s.position.x = x;
    s.position.y = y;
    s.item = item;
    s.field = field;
}

export function closeContextMenu(s: ContextMenuState) {
    s.open = false;
    s.item = null;
    s.field = null;
}

export function openContextMenuAtMouse(s: ContextMenuState, item: unknown, field: unknown) {
    const mouse = getGlobalEventSystem().mouse;
    openContextMenu(s, mouse.X, mouse.Y, item, field);
}


export function contextMenuIsOpen(s: ContextMenuState, item: unknown, field: unknown) {
    return s.open && s.item === item && s.field === field;
}
