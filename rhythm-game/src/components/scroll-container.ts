import { getDeltaTimeSeconds, ImCache } from "src/utils/im-core.ts";
import { COL, imFlex, imLayoutBegin, imLayoutEnd, imRelative, imScrollOverflow, ROW } from "./core/layout.ts";
import { getScrollVHEx } from "src/utils/dom-utils.ts";


// NOTE: if all we need is idx, let's just inline it.
export type ScrollContainer = {
    root: HTMLElement | null;
    isScrolling:     boolean;
    smoothScroll:    boolean;

    wantedScrollOffsetViewport: number; 
    wantedScrollOffsetItem: number; 

    _scrollTopLast:   number;
    _scrollTopStableFramesLast: number;
    _wantedScrollOffsetViewportLast: number; 
    _wantedScrollOffsetItemLast: number; 
};

export function newScrollContainer(): ScrollContainer {
    return {
        root:         null,
        isScrolling:  false,
        smoothScroll: false,
        wantedScrollOffsetViewport: 0.5,
        wantedScrollOffsetItem: 0.5,

        _scrollTopLast: -1,
        _scrollTopStableFramesLast: 0,
        _wantedScrollOffsetViewportLast: 0.5,
        _wantedScrollOffsetItemLast: 0.5,
    };
}

export function scrollParamsChanged(sc: ScrollContainer) {
    let result = false;

    if (
        sc.wantedScrollOffsetItem !== sc._wantedScrollOffsetItemLast ||
        sc.wantedScrollOffsetViewport !== sc._wantedScrollOffsetViewportLast
    ) {
        result = true;
        sc._wantedScrollOffsetItemLast = sc.wantedScrollOffsetItem;
        sc._wantedScrollOffsetViewportLast = sc.wantedScrollOffsetViewport;
    }

    return result;
}

export function startScrolling(sc: ScrollContainer, smoothScroll: boolean) {
    sc.isScrolling = true;
    sc.smoothScroll = smoothScroll;
    sc._scrollTopStableFramesLast = 0;
    sc._scrollTopLast = -1;
}

export function imScrollContainerBegin(
    c: ImCache,
    sc: ScrollContainer,
    orientation: typeof ROW | typeof COL = COL
): HTMLElement {
    const scrollParent = imLayoutBegin(c, orientation); 
    imFlex(c); 
    imScrollOverflow(c, orientation === COL, orientation === ROW); 
    imRelative(c);
    sc.root = scrollParent;
    return scrollParent;
}

export function imScrollContainerEnd(c: ImCache) {
    imLayoutEnd(c);
}

// NOTE: it's up to you to only ever call this on one item at a time
// TODO: move this into ScrollContainer, make this a side-effect of ending the container
export function scrollToItem(c: ImCache, sc: ScrollContainer, root: HTMLElement) {
    const scrollParent = sc.root;
    if (!scrollParent)  return;
    if (!sc.isScrolling) return;
    if (root.parentNode === null) return;
    if (sc._scrollTopStableFramesLast > 10) {
        sc.isScrolling = false;
        return;
    }

    const { scrollTop } = getScrollVHEx(
        scrollParent, root,
        sc.wantedScrollOffsetViewport, sc.wantedScrollOffsetItem,
        null, null,
    );

    const currentScrollTop = scrollParent.scrollTop;

    if (Math.abs(scrollTop - scrollParent.scrollTop) < 0.1) {
        sc.isScrolling = false;
    } else {
        if (sc.smoothScroll) {
            scrollParent.scrollTop = lerp(currentScrollTop, scrollTop, 20 * getDeltaTimeSeconds(c));
        } else {
            scrollParent.scrollTop = scrollTop;
        }
    }

    if (sc._scrollTopLast !== currentScrollTop) {
        sc._scrollTopLast = currentScrollTop;
        sc._scrollTopStableFramesLast = 0;
    }
    sc._scrollTopStableFramesLast += 1;

}

function lerp(a: number, b: number, t: number): number {
    if (t > 1) t = 1;
    if (t < 0) t = 0;
    return a + (b - a) * t;
}

