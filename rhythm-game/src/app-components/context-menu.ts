import { imLine, LINE_HORIZONTAL } from "components/im-line.ts";
import { im, ImCache, imdom } from "imcf";
import { imui, COL, PX, NA, cssVars, ROW } from "imcf/im-ui";

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

    imui.Begin(c, COL); imui.Fixed(c, 0, PX, 0, PX, 0, PX, 0, PX); imui.ZIndex(c, 10000); {
        const root = imui.Begin(c, COL); imui.Absolute(c, y, PX, 0, NA, 0, NA, x, PX); {
            const mouse = imdom.getMouse();
            const rect = root.getBoundingClientRect();

            if (Math.abs(rect.x - rect.y) > 10) {
                let mouseDistanceFromBorder = 0;
                mouseDistanceFromBorder = Math.max(mouseDistanceFromBorder, rect.left - mouse.x);
                mouseDistanceFromBorder = Math.max(mouseDistanceFromBorder, mouse.x - rect.right);
                mouseDistanceFromBorder = Math.max(mouseDistanceFromBorder, rect.top - mouse.y);
                mouseDistanceFromBorder = Math.max(mouseDistanceFromBorder, mouse.y - rect.bottom);

                if (mouseDistanceFromBorder > s.distanceToClose) {
                    s.open = false;
                }
            }

            if (s.position.y + rect.height > window.innerHeight) {
                const wantedTop = s.position.y - rect.height;
                s.position.y = wantedTop;
            }

            if (im.IsFirstRender(c)) {
                imdom.setStyle(c, "padding", "3px");
                imdom.setStyle(c, "userSelect", "none");
                imdom.setStyle(c, "backgroundColor", cssVars.bg);
                imdom.setStyle(c, "boxShadow", "4px 4px 5px 0px rgba(0,0,0,0.37)");
                imdom.setStyle(c, "border", "1px solid rgba(0,0,0,0.37)");
            }

        } // imui.End(c);
    } // imui.End(c);
}

export function imContextMenuEnd(c: ImCache, s: ContextMenuState) {
    // imui.Layout
    {
        // imui.Layout
        {
            if (imdom.hasMousePress(c)) {
                const mouse = imdom.getMouse();
                mouse.mouseDownElements.clear();
                mouse.mouseClickElements.clear();
            }
        } imui.End(c);

        if (imdom.hasMousePress(c)) {
            s.open = false;
        }
    } imui.End(c);
}

// This is not as important as imContextMenuBegin/End, and can be changed for something else.
export function imContextMenuItemBegin(c: ImCache) {
    imui.Begin(c, ROW); {
    } // imui.End
}

export function imContextMenuDivider(c: ImCache) {
    imLine(c, LINE_HORIZONTAL, 1);
}

export function imContextMenuItemEnd(c: ImCache) {
    // imui.Layout
    {
    } imui.End(c);
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
    openContextMenu(c, s, mouse.x, mouse.y);
}

