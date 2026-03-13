import { COL, imAbsolute, imFixed, imLayoutBegin, imLayoutEnd, imZIndex, NA, PX, ROW } from "src/components/core/layout.ts";
import { cssVars } from "src/components/core/stylesheets.ts";
import { imLine, LINE_HORIZONTAL } from "src/components/im-line.ts";
import { im, ImCache, imdom, el, ev, } from "src/utils/im-js";


export type ContextMenuState = {
    open: boolean;
    position: { x: number; y: number; };
    distanceToClose: number;
};

export function newContextMenuState(): ContextMenuState {
    return {
        open: false,
        position: { x: 0, y: 0 },
        distanceToClose: 50,
    };
}

export function imContextMenu(c: ImCache) {
    return im.State(c, newContextMenuState);
}

export function imContextMenuBegin(c: ImCache, s: ContextMenuState) {
    const x = s.position.x;
    const y = s.position.y;

    imLayoutBegin(c, COL); imFixed(c, 0, PX, 0, PX, 0, PX, 0, PX); imZIndex(c, 10000); {
        const root = imLayoutBegin(c, COL); imAbsolute(c, y, PX, 0, NA, 0, NA, x, PX); {
            const mouse = imdom.getMouse();
            const rect = root.getBoundingClientRect();

            if (Math.abs(rect.x - rect.y) > 10) {
                let mouseDistanceFromBorder = 0;
                mouseDistanceFromBorder = Math.max(mouseDistanceFromBorder, rect.left - mouse.X);
                mouseDistanceFromBorder = Math.max(mouseDistanceFromBorder, mouse.X - rect.right);
                mouseDistanceFromBorder = Math.max(mouseDistanceFromBorder, rect.top - mouse.Y);
                mouseDistanceFromBorder = Math.max(mouseDistanceFromBorder, mouse.Y - rect.bottom);

                if (mouseDistanceFromBorder > s.distanceToClose) {
                    s.open = false;
                }
            }

            if (s.position.y + rect.height > window.innerHeight) {
                const wantedTop = s.position.y - rect.height;
                s.position.y = wantedTop;
            }

            if (im.isFirstishRender(c)) {
                imdom.setStyle(c, "padding", "3px");
                imdom.setStyle(c, "userSelect", "none");
                imdom.setStyle(c, "backgroundColor", cssVars.bg);
                imdom.setStyle(c, "boxShadow", "4px 4px 5px 0px rgba(0,0,0,0.37)");
                imdom.setStyle(c, "border", "1px solid rgba(0,0,0,0.37)");
            }

        } // imLayoutEnd(c);
    } // imLayoutEnd(c);
}

export function imContextMenuEnd(c: ImCache, s: ContextMenuState) {
    // imLayout
    {
        // imLayout
        {
            if (imdom.hasMousePress(c)) {
                const mouse = imdom.getMouse();
                mouse.mouseDownElements.clear();
                mouse.mouseClickElements.clear();
            }
        } imLayoutEnd(c);

        if (imdom.hasMousePress(c)) {
            s.open = false;
        }
    } imLayoutEnd(c);
}

// This is not as important as imContextMenuBegin/End, and can be changed for something else.
export function imContextMenuItemBegin(c: ImCache) {
    imLayoutBegin(c, ROW); {
    } // imLayoutEnd
}

export function imContextMenuDivider(c: ImCache) {
    imLine(c, LINE_HORIZONTAL, 1);
}

export function imContextMenuItemEnd(c: ImCache) {
    // imLayout
    {
    } imLayoutEnd(c);
}

export function openContextMenu(c: ImCache, s: ContextMenuState, x: number, y: number) {
    s.open = true;
    s.position.x = x;
    s.position.y = y;

    // Allows the context menu to measure and reposition itself if it's overflowing the window, 
    // without the  1 frame delay. TODO: think of a better way to achieve this.
    im.rerenderCache(c);
}

export function openContextMenuAtMouse(c: ImCache, s: ContextMenuState) {
    const mouse = imdom.getMouse();
    openContextMenu(c, s, mouse.X, mouse.Y);
}

