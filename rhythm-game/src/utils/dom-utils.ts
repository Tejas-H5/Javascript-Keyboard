// DOM-utils v1.0

/** Sets an input's value while retaining it's selection */
export function setInputValue(el: HTMLInputElement | HTMLTextAreaElement, text: string) {
    if (
        // performance speedup, and required to be able to select text
        el.value !== text
    ) {
        const { selectionStart, selectionEnd } = el;

        el.value = text;

        el.selectionStart = selectionStart;
        el.selectionEnd = selectionEnd;
    }
}

export function isEditingTextSomewhereInDocument(): boolean {
    const type = document.activeElement?.nodeName;
    if (type) {
        return stringsAreEqual2Versions(type, "textarea", "TEXTAREA") ||
            stringsAreEqual2Versions(type, "input", "INPUT");
    }
    return false;
}


function stringsAreEqual2Versions(val: string, lowercase: string, uppercase: string) {
    if (val.length !== lowercase.length) return false;
        for (let i = 0; i < lowercase.length; i++) {
            if (val[i] !== lowercase[i] && val[i] !== uppercase[i]) return false;
    }
    return true;
}


// Flags vastly reduces the need for boolean flags, and look nicer in code compared to  booleans. They also don't allocate memory like args objects
export const EXTENT_HORIZONTAL = 1 << 1;
export const EXTENT_VERTICAL   = 1 << 2;
export const EXTENT_START      = 1 << 3;
export const EXTENT_END        = 1 << 4;

/**
 * Get the amount you will need to scroll along the horizontal and vertical axes to get the element into view,
 * It is a simplified version of {@link getScrollVHEx}.
 */
export function getScrollVH(
    scrollParent: HTMLElement,
    scrollTo: HTMLElement,
    verticalOffset: number | null = null,
    horizontalOffset: number | null = null,
) {
    return getScrollVHEx(
        scrollParent, scrollTo,
        verticalOffset, verticalOffset,
        horizontalOffset, horizontalOffset
    );
}

/**
 * Get the amount you will need to scroll along the horizontal and vertical axes to get the element into view.
 * Specify which point on the item needs to scroll to which point on the viewport.
 *
 *
 * +----------------0
 * |                |
 * |            -   | <--- B
 * |            ^   |
 * |  +----0    | C |
 * |  |    |<-A |   |
 * |  |    |        |
 * |  +----1        |
 * +----------------1
 * 
 * A - the item offset 
 * B - the viewport offset
 * C - this is the scrolling that needs to take place to line up A with B.
 *     the scrollTop and scrollLeft returned by this method will make this happen,
 *     when assigned to the scrollTop and scrollLeft of the scrollParent.
 *
 */
export function getScrollVHEx(
    scrollParent: HTMLElement,
    scrollTo: HTMLElement,
    verticalOffsetViewport: number | null,
    verticalOffsetItem: number | null,
    horizontalOffsetViewport: number | null,
    horizontalOffsetItem: number | null,
) {
    let scrollLeft = scrollParent.scrollLeft;
    let scrollTop = scrollParent.scrollTop;

    if (horizontalOffsetViewport !== null && horizontalOffsetItem !== null) {
        const scrollOffset = horizontalOffsetViewport * scrollParent.offsetWidth;
        const elementWidthOffset = horizontalOffsetItem * scrollTo.getBoundingClientRect().width;

        // offsetLeft is relative to the document, not the scroll parent. lmao
        const scrollToElOffsetLeft = scrollTo.offsetLeft - scrollParent.offsetLeft;

        scrollLeft = scrollToElOffsetLeft - scrollOffset + elementWidthOffset;
    }

    if (verticalOffsetItem !== null && verticalOffsetViewport !== null) {
        // NOTE: just a copy paste from above
        
        const scrollOffset = verticalOffsetViewport * scrollParent.offsetHeight;
        const elementHeightOffset = verticalOffsetItem * scrollTo.getBoundingClientRect().height;

        // offsetTop is relative to the document, not the scroll parent. lmao
        const scrollToElOffsetTop = scrollTo.offsetTop - scrollParent.offsetTop;

        scrollTop = scrollToElOffsetTop - scrollOffset + elementHeightOffset;
    }

    return { scrollTop, scrollLeft };
}


/**
 * Scrolls {@link scrollParent} to bring scrollTo into view.
 * {@link scrollToRelativeOffset} specifies where to to scroll to. 0 = bring it to the top of the scroll container, 1 = bring it to the bottom
 */
export function scrollIntoViewVH(
    scrollParent: HTMLElement,
    scrollTo: HTMLElement,
    verticalOffset: number | null = null,
    horizontalOffset: number | null = null,
) {
    const { scrollLeft, scrollTop } = getScrollVH(
        scrollParent,
        scrollTo,
        verticalOffset,
        horizontalOffset
    );

    scrollParent.scrollLeft = scrollLeft;
    scrollParent.scrollTop = scrollTop;
}

export function scrollIntoViewRect(
    scrollParent: HTMLElement,
    scrollTo: HTMLElement,
    x0: number, y0: number, 
    x1: number, y1: number
) {
    let scrollH: number | null = null;
    let scrollV: number | null = null;

    if (getElementExtentNormalized(scrollParent, scrollTo, EXTENT_VERTICAL | EXTENT_START) < y0) {
        scrollV = y0;
    } else if (getElementExtentNormalized(scrollParent, scrollTo, EXTENT_VERTICAL | EXTENT_END) > y1) {
        scrollV = y1
    }

    if (getElementExtentNormalized(scrollParent, scrollTo, EXTENT_HORIZONTAL | EXTENT_START) < x0) {
        scrollH = x0;
    } else if (getElementExtentNormalized(scrollParent, scrollTo, EXTENT_HORIZONTAL | EXTENT_END) > x1) {
        scrollH = x1;
    }

    scrollIntoViewVH(scrollParent, scrollTo, scrollV, scrollH);
}

// Useful for scrolling.
// numbers < 0 indicate offscreen in the negative direction, and > 1 in the positive. kind-of - just hte top or bottom edge, not whole thing
export function getElementExtentNormalized(scrollParent: HTMLElement, scrollTo: HTMLElement, flags = EXTENT_VERTICAL | EXTENT_START) {
    let result;

    if ((flags & EXTENT_VERTICAL) !== 0) {
        const scrollOffset = scrollTo.offsetTop - scrollParent.scrollTop - scrollParent.offsetTop;

        if (flags & EXTENT_END) {
            result = (scrollOffset + scrollTo.getBoundingClientRect().height) / scrollParent.offsetHeight;
        } else {
            result = scrollOffset / scrollParent.offsetHeight;
        }
    } else {
        // NOTE: This is just a copy-paste from above. 
        // I would paste a vim-macro here, but it causes all sorts of linting errors.

        const scrollOffset = scrollTo.offsetLeft - scrollParent.scrollLeft - scrollParent.offsetLeft;

        if ((flags & EXTENT_END) !== 0) {
            result = (scrollOffset + scrollTo.getBoundingClientRect().width) / scrollParent.offsetWidth;
        } else {
            result = scrollOffset / scrollParent.offsetWidth;
        }
    }

    return result;
}



