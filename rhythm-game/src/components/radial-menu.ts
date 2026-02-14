import { newCssBuilder } from "src/utils/cssb.ts";
import { ImCache, isFirstishRender } from "src/utils/im-core.ts";
import { elSetClass, elSetStyle } from "src/utils/im-dom.ts";
import { BLOCK, DisplayType, EM, imFixed, imLayoutBegin, imLayoutEnd, imRelative, imSize, NA, PX } from "./core/layout.ts";

// NOTE: This work is incomplete. We might not even need this. Circle back around to it

export type RadialMenuState = {
    angle: number;
    itemIdx: number;
    root: HTMLElement | null;
    position: { x: number; y: number };
    size: { x: number; y: number; };
    sizeChanged: boolean;
};

export function newRadialMenuState(): RadialMenuState {
    return {
        position: { x: 0, y: 0 },
        angle: 0,
        itemIdx: 0,
        root: null,
        size: { x: 0, y: 0 },
        sizeChanged: false,
    };
}


const cssb = newCssBuilder();

const cnRadialMenuCenter = cssb.cn("radialMenuCenter", [
    ` { border-radius: 1000px; opacity: 0.5; }`,
]);

const cnRadialMenuItem = cssb.cn("radialMenuItem", [
    ` { border-radius: 1000px; opacity: 0.5; }`,
]);

export function imRadialMenuBegin(c: ImCache, s: RadialMenuState) {
    s.angle = 0;
    s.itemIdx = 0;

    s.root = imLayoutBegin(c, BLOCK); imSize(c, 3, EM, 3, EM); imRelative(c); {
        imFixed(c, s.position.y, PX, 0, NA, 0, NA, s.position.x, PX);
        if (isFirstishRender(c)) {
            elSetClass(c, cnRadialMenuCenter);
            elSetStyle(c, "transform", "translate(-50%, -50%)");
        }
    } imLayoutEnd(c);
}

export function imRadialMenuEnd(c: ImCache, s: RadialMenuState) {
    {
    }
}

export function imRadialMenuItemBegin(c: ImCache, s: RadialMenuState, type: DisplayType) {
    const item = imLayoutBegin(c, type);
    imFixed(c, s.position.y, PX, 0, NA, 0, NA, s.position.x, PX); {
        if (isFirstishRender(c)) {
            elSetClass(c, "item");
        }
    } // imLayoutEnd(c);
}

export function imRadialMenuItemEnd(c: ImCache, s: RadialMenuState) {
    s.itemIdx++;
    {
    } imLayoutEnd(c);
}
