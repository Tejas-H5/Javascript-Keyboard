import { im, ImCache, imdom, el, ev, } from "imcf";
import { BLOCK, DisplayType, EM, imui, NA, PX } from "imcf/im-ui";

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


const cssb = imui.newCssBuilder();

const cnRadialMenuCenter = cssb.cn("radialMenuCenter", [
    ` { border-radius: 1000px; opacity: 0.5; }`,
]);

const cnRadialMenuItem = cssb.cn("radialMenuItem", [
    ` { border-radius: 1000px; opacity: 0.5; }`,
]);

export function imRadialMenuBegin(c: ImCache, s: RadialMenuState) {
    s.angle = 0;
    s.itemIdx = 0;

    s.root = imui.Begin(c, BLOCK); imui.Size(c, 3, EM, 3, EM); imui.Relative(c); {
        imui.Fixed(c, s.position.y, PX, 0, NA, 0, NA, s.position.x, PX);
        if (im.IsFirstRender(c)) {
            imdom.setClass(c, cnRadialMenuCenter);
            imdom.setStyle(c, "transform", "translate(-50%, -50%)");
        }
    } imui.End(c);
}

export function imRadialMenuEnd(c: ImCache, s: RadialMenuState) {
    {
    }
}

export function imRadialMenuItemBegin(c: ImCache, s: RadialMenuState, type: DisplayType) {
    const item = imui.Begin(c, type);
    imui.Fixed(c, s.position.y, PX, 0, NA, 0, NA, s.position.x, PX); {
        if (im.IsFirstRender(c)) {
            imdom.setClass(c, "item");
        }
    } // imui.End(c);
}

export function imRadialMenuItemEnd(c: ImCache, s: RadialMenuState) {
    s.itemIdx++;
    {
    } imui.End(c);
}
