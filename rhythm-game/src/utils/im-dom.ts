// IM-DOM 1.35

import { assert } from "src/utils/assert";
import {
    CACHE_RERENDER_FN,
    cacheEntriesAddDestructor,
    getEntriesParent,
    globalStateStackGet,
    globalStateStackPop,
    globalStateStackPush,
    imBlockBegin,
    imBlockEnd,
    ImCache,
    imGet,
    imMemo,
    imSet,
    inlineTypeId,
} from "./im-core";

export type ValidElement = HTMLElement | SVGElement;
export type AppendableElement = (ValidElement | Text);
export type DomAppender<E extends AppendableElement> = {
    root: E;
    ref: unknown;
    idx: number;
    lastIdx: number;
    // Set this to true manually when you want to manage the DOM children yourself.
    // Hopefully that isn't all the time. If it is, then the framework isn't doing you too many favours.
    // Good use case: You have to manage hundreds of thousands of DOM nodes. 
    // From my experimentation, it is etiher MUCH faster to do this yourself instead of relying on the framework, or about the same,
    // depending on how the browser has implemented DOM node rendering.
    manualDom: boolean;
    // if null, root is a text node. else, it can be appended to.
    children: (DomAppender<any>[] | null);
    rendered: boolean;
    parentIdx: number;
    childrenChanged: boolean;
};

export function newDomAppender<E extends AppendableElement>(root: E, children: (DomAppender<any>[] | null)): DomAppender<E> {
    return {
        root,
        ref: null,
        idx: -1,
        children,
        lastIdx: -1,
        manualDom: false,
        rendered: false,
        parentIdx: -1,
        childrenChanged: false,
    };
}

export function appendToDomRoot(appender: DomAppender<any>, child: DomAppender<any>) {
    assert(appender.children !== null);

    const idx = ++appender.idx;

    if (idx === appender.children.length) {
        appender.children.push(child);
        child.parentIdx = idx;

        appender.childrenChanged = true;
    } else if (idx < appender.children.length) {
        if (appender.children[idx] !== child) {
            if (child.parentIdx === -1) {
                // Adding a new item to the list. Push watever was at idx onto the end, put child at idx.
                const a = appender.children[idx];
                a.parentIdx = appender.children.length
                appender.children.push(a);
                appender.children[idx] = child;
                child.parentIdx = idx;
            } else {
                // swap two existing children
                assert(appender.children[child.parentIdx] === child);
                appender.children[child.parentIdx] = appender.children[idx];
                appender.children[child.parentIdx].parentIdx = child.parentIdx;
                appender.children[idx] = child;
                appender.children[idx].parentIdx = idx;
            }

            assert(appender.children[idx].parentIdx === idx);
            assert(appender.children[child.parentIdx] === child);

            appender.childrenChanged = true;
        }
    } else {
        throw new Error("Unreachable");
    }
}

export function finalizeDomAppender(appender: DomAppender<ValidElement>) {
    if (
        appender.children !== null &&
        (appender.childrenChanged || appender.lastIdx !== appender.idx)
    )  {
        appender.childrenChanged = false;

        // TODO: optimize
        for (let i = 0; i <= appender.idx; i++) {
            const val = appender.children[i];

            const realChildren = appender.root.children;
            if (i >= realChildren.length) {
                appender.root.append(val.root);
            } else if (realChildren[i] !== val.root) {
                appender.root.insertBefore(val.root, realChildren[i]);
            }
        }

        for (let i = appender.idx + 1; i < appender.children.length; i++) {
            appender.children[i].root.remove();
        }

        appender.lastIdx = appender.idx;
    }


    // TODO: by now everthing that wasnt rendered should be after idx. so we jsut remove those. all g. ?

    // if (
    //     (appender.childrenChanged === true || appender.idx !== appender.lastIdx) &&
    //     appender.manualDom === false
    // ) {
    //     for (let i = 0; i < appender.lastIdx; i++) {
    //         const child = appender.children[i];
    //         if (child.rendered === false) {
    //             child.root.remove();
    //         }
    //     }
    //
    //     appender.childrenChanged = false;
    //     appender.lastIdx = appender.idx;
    // }
}



export function imEl<K extends keyof HTMLElementTagNameMap>(
    c: ImCache,
    r: KeyRef<K>
): DomAppender<HTMLElementTagNameMap[K]> {
    // Make this entry in the current entry list, so we can delete it easily
    const appender = getEntriesParent(c, newDomAppender);

    let childAppender: DomAppender<HTMLElementTagNameMap[K]> | undefined = imGet(c, newDomAppender);
    if (childAppender === undefined) {
        const element = document.createElement(r.val);
        childAppender = imSet(c, newDomAppender(element, []));
        childAppender.ref = r;
    }

    appendToDomRoot(appender, childAppender);

    imBlockBegin(c, newDomAppender, childAppender);

    childAppender.idx = -1;

    return childAppender;
}

export function imElEnd(c: ImCache, r: KeyRef<keyof HTMLElementTagNameMap>) {
    const appender = getEntriesParent(c, newDomAppender);
    assert(appender.ref === r) // make sure we're popping the right thing
    finalizeDomAppender(appender);
    imBlockEnd(c);
}


export function imDomRootBegin(c: ImCache, root: ValidElement) {
    let appender = imGet(c, newDomAppender);
    if (appender === undefined) {
        appender = imSet(c, newDomAppender(root, []));
        appender.ref = root;
    }

    imBlockBegin(c, newDomAppender, appender);

    appender.idx = -1;

    return appender;
}

export function imDomRootEnd(c: ImCache, root: ValidElement) {
    let appender = getEntriesParent(c, newDomAppender);
    assert(appender.ref === root);
    finalizeDomAppender(appender);

    imBlockEnd(c);
}


export interface Stringifyable {
    // Allows you to memoize the text on the object reference, and not the literal string itself, as needed.
    // Also, most objects in JavaScript already implement this.
    toString(): string;
}

/**
 * This method manages a HTML Text node. So of course, we named it
 * `imStr`.
 */
export function imStr(c: ImCache, value: Stringifyable): Text {
    let textNodeLeafAppender; textNodeLeafAppender = imGet(c, inlineTypeId(imStr));
    if (textNodeLeafAppender === undefined) textNodeLeafAppender = imSet(c, newDomAppender(document.createTextNode(""), null));

    // The user can't select this text node if we're constantly setting it, so it's behind a cache
    let lastValue = imGet(c, inlineTypeId(document.createTextNode));
    if (lastValue !== value) {
        imSet(c, value);
        textNodeLeafAppender.root.nodeValue = value.toString();
    }

    const domAppender = getEntriesParent(c, newDomAppender);
    appendToDomRoot(domAppender, textNodeLeafAppender);

    return textNodeLeafAppender.root;
}

// TODO: not scaleable for the same reason imState isn't scaleable. we gotta think of something better that lets us have more dependencies/arguments to the formatter
export function imStrFmt<T>(c: ImCache, value: T, formatter: (val: T) => string): Text {
    let textNodeLeafAppender; textNodeLeafAppender = imGet(c, inlineTypeId(imStr));
    if (textNodeLeafAppender === undefined) textNodeLeafAppender = imSet(c, newDomAppender(document.createTextNode(""), null));

    const formatterChanged = imMemo(c, formatter);

    // The user can't select this text node if we're constantly setting it, so it's behind a cache
    let lastValue = imGet(c, inlineTypeId(document.createTextNode));
    if (lastValue !== value || formatterChanged !== 0) {
        imSet(c, value);
        textNodeLeafAppender.root.nodeValue = formatter(value);
    }

    const domAppender = getEntriesParent(c, newDomAppender);
    appendToDomRoot(domAppender, textNodeLeafAppender);

    return textNodeLeafAppender.root;
}

export let stylesSet = 0;
export let classesSet = 0;
export let attrsSet = 0;

export function elSetStyle<K extends (keyof ValidElement["style"])>(
    c: ImCache,
    key: K,
    value: string,
    root = elGet(c),
) {
    // @ts-expect-error its fine tho
    root.style[key] = value;
    stylesSet++;
}

export function elSetTextSafetyRemoved(c: ImCache, val: string) {
    let el = elGet(c);
    el.textContent = val;
}


export function elSetClass(
    c: ImCache,
    className: string,
    enabled: boolean | number = true,
): boolean {
    const domAppender = getEntriesParent(c, newDomAppender);

    if (enabled !== false && enabled !== 0) {
        domAppender.root.classList.add(className);
    } else {
        domAppender.root.classList.remove(className);
    }

    classesSet++;

    return !!enabled;
}

export function elSetAttr(
    c: ImCache,
    attr: string,
    val: string | null
) {
    const domAppender = getEntriesParent(c, newDomAppender);

    if (val !== null) {
        domAppender.root.setAttribute(attr, val);
    } else {
        domAppender.root.removeAttribute(attr);
    }

    attrsSet++;
}

// Nicer API, but generating the attributes dict is expensive. Don't call this every frame!
export function elSetAttributes(c: ImCache, attrs: Record<string, string | string[]>) {
    const el = elGet(c);
    for (const key in attrs) {
        let val = attrs[key];
        if (Array.isArray(val)) val = val.join(" ");
        el.setAttribute(key, val);
    }
}


export function elGetAppender(c: ImCache): DomAppender<ValidElement> {
    return getEntriesParent(c, newDomAppender);
}

export function elGet(c: ImCache) {
    return elGetAppender(c).root;
}

// NOTE: you should only use this if you don't already have some form of global event handling set up,
// or in cases where you can't use global event handling.
export function imOn<K extends keyof HTMLElementEventMap>(
    c: ImCache,
    type: KeyRef<K>,
): HTMLElementEventMap[K] | null {
    let state; state = imGet(c, inlineTypeId(imOn));
    if (state === undefined) {
        const val: {
            el: ValidElement;
            eventType: KeyRef<keyof HTMLElementEventMap> | null;
            eventValue: Event | null;
            eventListener: (e: HTMLElementEventMap[K]) => void;
        } = {
            el: elGet(c),
            eventType: null,
            eventValue: null,
            eventListener: (e: HTMLElementEventMap[K]) => {
                val.eventValue = e;
                c[CACHE_RERENDER_FN]();
            },
        };
        state = imSet(c, val);
    }

    let result: HTMLElementEventMap[K] | null = null;

    if (state.eventValue !== null) {
        result = state.eventValue as HTMLElementEventMap[K];
        state.eventValue = null;
    }

    if (state.eventType !== type) {
        const el = elGet(c);
        if (state.eventType !== null) {
            el.removeEventListener(state.eventType.val, state.eventListener as EventListener);
        }

        state.eventType = type;
        el.addEventListener(state.eventType.val, state.eventListener as EventListener);
    }

    return result;
}

export function getGlobalEventSystem() {
    return globalStateStackGet(gssEventSystems);
}

export function elHasMousePress(c: ImCache, el = elGet(c)): boolean {
    const ev = getGlobalEventSystem();
    return elIsInSetThisFrame(el, ev.mouse.mouseDownElements)
}

export function elHasMouseUp(c: ImCache, el = elGet(c)): boolean {
    const ev = getGlobalEventSystem();
    return elIsInSetThisFrame(el, ev.mouse.mouseUpElements)
}

export function elHasMouseClick(c: ImCache, el = elGet(c)): boolean {
    const ev = getGlobalEventSystem();
    return elIsInSetThisFrame(el, ev.mouse.mouseClickElements)
}

export function elHasMouseOver(c: ImCache, el = elGet(c)): boolean {
    const ev = getGlobalEventSystem();
    return ev.mouse.mouseOverElements.has(el);
}

function elIsInSetThisFrame(el: ValidElement, set: Set<ValidElement>) {
    const result = set.has(el);
    set.delete(el);
    return result;
}

export type SizeState = {
    width: number;
    height: number;
}

export type ImKeyboardState = {
    // We need to use this approach instead of a buffered approach like `keysPressed: string[]`, so that a user
    // may call `preventDefault` on the html event as needed.
    // NOTE: another idea is to do `keys.keyDown = null` to prevent other handlers in this framework
    // from knowing about this event.
    keyDown: KeyboardEvent | null;
    keyUp: KeyboardEvent | null;
};


export type ImMouseState = {
    lastX: number;
    lastY: number;

    ev: MouseEvent | null;

    leftMouseButton: boolean;
    middleMouseButton: boolean;
    rightMouseButton: boolean;

    dX: number;
    dY: number;
    X: number;
    Y: number;

    /**
     * NOTE: if you want to use this, you'll have to prevent scroll event propagation.
     * See {@link imPreventScrollEventPropagation}
     */
    scrollWheel: number;

    mouseDownElements: Set<ValidElement>;
    mouseUpElements: Set<ValidElement>;
    mouseClickElements: Set<ValidElement>;
    mouseOverElements: Set<ValidElement>;
    lastMouseOverElement: ValidElement | null;
};

export type ImGlobalEventSystem = {
    rerender: () => void;
    keyboard: ImKeyboardState;
    mouse:    ImMouseState;
    blur:     boolean;
    globalEventHandlers: {
        mousedown:  (e: MouseEvent) => void;
        mousemove:  (e: MouseEvent) => void;
        mouseenter: (e: MouseEvent) => void;
        mouseup:    (e: MouseEvent) => void;
        mouseclick: (e: MouseEvent) => void;
        wheel:      (e: WheelEvent) => void;
        keydown:    (e: KeyboardEvent) => void;
        keyup:      (e: KeyboardEvent) => void;
        blur:       () => void;
    };
}

function findParents(el: ValidElement, elements: Set<ValidElement>) {
    elements.clear();
    let current: ValidElement | null = el;
    while (current !== null) {
        elements.add(current);
        current = current.parentElement;
    }
}


export function newImGlobalEventSystem(rerenderFn: () => void): ImGlobalEventSystem {
    const keyboard: ImKeyboardState = {
        keyDown: null,
        keyUp: null,
    };

    const mouse: ImMouseState = {
        lastX: 0,
        lastY: 0,

        ev: null,

        leftMouseButton: false,
        middleMouseButton: false,
        rightMouseButton: false,

        dX: 0,
        dY: 0,
        X: 0,
        Y: 0,

        scrollWheel: 0,

        mouseDownElements: new Set<ValidElement>(),
        mouseUpElements: new Set<ValidElement>(),
        mouseClickElements: new Set<ValidElement>(),
        mouseOverElements: new Set<ValidElement>(),
        lastMouseOverElement: null,
    };

    const handleMouseMove = (e: MouseEvent) => {
        mouse.ev = e;
        mouse.lastX = mouse.X;
        mouse.lastY = mouse.Y;
        mouse.X = e.clientX;
        mouse.Y = e.clientY;
        mouse.dX += mouse.X - mouse.lastX;
        mouse.dY += mouse.Y - mouse.lastY;

        if (mouse.lastMouseOverElement !== e.target) {
            mouse.lastMouseOverElement = e.target as ValidElement;
            findParents(e.target as ValidElement, mouse.mouseOverElements);
            return true;
        }

        return false
    };

    const eventSystem: ImGlobalEventSystem = {
        rerender: rerenderFn,
        keyboard,
        mouse,
        blur: false,
        // stored, so we can dispose them later if needed.
        globalEventHandlers: {
            mousedown: (e: MouseEvent) => {
                if (e.button === 0) {
                    mouse.leftMouseButton = true;
                } else if (e.button === 1) {
                    mouse.middleMouseButton = true;
                } else if (e.button === 2) {
                    mouse.rightMouseButton = true;
                }

                findParents(e.target as ValidElement, mouse.mouseDownElements);
                try {
                    mouse.ev = e;
                    eventSystem.rerender();
                } finally {
                    mouse.mouseDownElements.clear();
                    mouse.ev = null;
                }
            },
            mouseclick: (e) => {
                findParents(e.target as ValidElement, mouse.mouseClickElements);
                try {
                    mouse.ev = e;
                    eventSystem.rerender();
                } finally {
                    mouse.mouseClickElements.clear();
                    mouse.ev = null;
                }
            },
            mousemove: (e) => {
                if (handleMouseMove(e)) {
                    eventSystem.rerender();
                    mouse.ev = null;
                }
            },
            mouseenter: (e) => {
                if (handleMouseMove(e)) {
                    eventSystem.rerender();
                    mouse.ev = null;
                }
            },
            mouseup: (e: MouseEvent) => {
                if (e.button === 0) {
                    mouse.leftMouseButton = false;
                } else if (e.button === 1) {
                    mouse.middleMouseButton = false;
                } else if (e.button === 2) {
                    mouse.rightMouseButton = false;
                }

                findParents(e.target as ValidElement, mouse.mouseUpElements);
                try {
                    mouse.ev = e;
                    eventSystem.rerender();
                } finally {
                    mouse.mouseUpElements.clear();
                    mouse.ev = null;
                }
            },
            wheel: (e: WheelEvent) => {
                mouse.scrollWheel += e.deltaX + e.deltaY + e.deltaZ;
                e.preventDefault();
                if (!handleMouseMove(e)) {
                    // rerender anwyway
                    eventSystem.rerender();
                }
            },
            keydown: (e: KeyboardEvent) => {
                keyboard.keyDown = e;
                eventSystem.rerender();
            },
            keyup: (e: KeyboardEvent) => {
                keyboard.keyUp = e;
                eventSystem.rerender();
            },
            blur: () => {
                resetMouseState(mouse, true);
                resetKeyboardState(keyboard);
                eventSystem.blur = true;
                eventSystem.rerender();
            }
        },
    };

    return eventSystem;
}

function resetKeyboardState(keyboard: ImKeyboardState) {
    keyboard.keyDown = null
    keyboard.keyUp = null
}

/**
 * See the decision matrix above {@link globalStateStackPush}
 */
const gssEventSystems: ImGlobalEventSystem[] = [];

// TODO: is there any point in separating this from imDomRoot ?
export function imGlobalEventSystemBegin(c: ImCache): ImGlobalEventSystem {
    let state = imGet(c, newImGlobalEventSystem);
    if (state === undefined) {
        const eventSystem = newImGlobalEventSystem(c[CACHE_RERENDER_FN]);
        addDocumentAndWindowEventListeners(eventSystem);
        cacheEntriesAddDestructor(c, () => removeDocumentAndWindowEventListeners(eventSystem));
        state = imSet(c, eventSystem);
    }

    globalStateStackPush(gssEventSystems, state);

    return state;
}

export function imGlobalEventSystemEnd(c: ImCache, eventSystem: ImGlobalEventSystem) {
    resetKeyboardState(eventSystem.keyboard);
    resetMouseState(eventSystem.mouse, false);
    eventSystem.blur = false;

    globalStateStackPop(gssEventSystems, eventSystem);
}

export function imTrackSize(c: ImCache) {
    let state; state = imGet(c, inlineTypeId(imTrackSize));
    if (state === undefined) {
        const root = elGet(c);

        const self = {
            size: { width: 0, height: 0, },
            resized: false,
            observer: new ResizeObserver((entries) => {
                for (const entry of entries) {
                    // NOTE: resize-observer cannot track the top, right, left, bottom of a rect. Sad.
                    self.size.width = entry.contentRect.width;
                    self.size.height = entry.contentRect.height;
                    self.resized = true;
                    break;
                }

                if (self.resized) {
                    c[CACHE_RERENDER_FN]();
                    self.resized = false;
                }
            })
        };

        self.observer.observe(root);
        cacheEntriesAddDestructor(c, () => {
            self.observer.disconnect()
        });

        state = imSet(c, self);
    }

    return state;

}

function newPreventScrollEventPropagationState() {
    return { 
        isBlocking: true,
        scrollY: 0,
    };
}

export function imPreventScrollEventPropagation(c: ImCache) {
    let state = imGet(c, newPreventScrollEventPropagationState);
    if (state === undefined) {
        const val = newPreventScrollEventPropagationState();

        let el = elGet(c);
        const handler = (e: Event) => {
            if (val.isBlocking === true) {
                e.preventDefault();
            }
        };

        el.addEventListener("wheel", handler);
        cacheEntriesAddDestructor(c, () =>  el.removeEventListener("wheel", handler));

        state = imSet(c, val);
    }

    const { mouse } = getGlobalEventSystem();
    if (state.isBlocking === true && elHasMouseOver(c) && mouse.scrollWheel !== 0) {
        state.scrollY += mouse.scrollWheel;
        mouse.scrollWheel = 0;
    } else {
        state.scrollY = 0;
    }

    return state;
}

export function resetMouseState(mouse: ImMouseState, clearPersistedStateAsWell: boolean) {
    mouse.dX = 0;
    mouse.dY = 0;
    mouse.lastX = mouse.X;
    mouse.lastY = mouse.Y;

    mouse.scrollWheel = 0;

    if (clearPersistedStateAsWell === true) {
        mouse.leftMouseButton = false;
        mouse.middleMouseButton = false;
        mouse.rightMouseButton = false;
    }
}

export function addDocumentAndWindowEventListeners(eventSystem: ImGlobalEventSystem) {
    document.addEventListener("mousedown", eventSystem.globalEventHandlers.mousedown);
    document.addEventListener("contextmenu", eventSystem.globalEventHandlers.mousedown);
    document.addEventListener("mousemove", eventSystem.globalEventHandlers.mousemove);
    document.addEventListener("mouseenter", eventSystem.globalEventHandlers.mouseenter);
    document.addEventListener("mouseup", eventSystem.globalEventHandlers.mouseup);
    document.addEventListener("click", eventSystem.globalEventHandlers.mouseclick);
    document.addEventListener("wheel", eventSystem.globalEventHandlers.wheel);
    document.addEventListener("keydown", eventSystem.globalEventHandlers.keydown);
    document.addEventListener("keyup", eventSystem.globalEventHandlers.keyup);
    window.addEventListener("blur", eventSystem.globalEventHandlers.blur);
}

export function removeDocumentAndWindowEventListeners(eventSystem: ImGlobalEventSystem) {
    document.removeEventListener("mousedown", eventSystem.globalEventHandlers.mousedown);
    document.removeEventListener("contextmenu", eventSystem.globalEventHandlers.mousedown);
    document.removeEventListener("mousemove", eventSystem.globalEventHandlers.mousemove);
    document.removeEventListener("mouseenter", eventSystem.globalEventHandlers.mouseenter);
    document.removeEventListener("mouseup", eventSystem.globalEventHandlers.mouseup);
    document.removeEventListener("click", eventSystem.globalEventHandlers.mouseclick);
    document.removeEventListener("wheel", eventSystem.globalEventHandlers.wheel);
    document.removeEventListener("keydown", eventSystem.globalEventHandlers.keydown);
    document.removeEventListener("keyup", eventSystem.globalEventHandlers.keyup);
    window.removeEventListener("blur", eventSystem.globalEventHandlers.blur);
}


///////// Keys

// We can now memoize on an object reference instead of a string.
// You shouldn't be creating these every frame - just reusing these constants below
type KeyRef<K> = { val: K };

export const EL_A = { val: "a" } as const;
export const EL_ABBR = { val: "abbr" } as const;
export const EL_ADDRESS = { val: "address" } as const;
export const EL_AREA = { val: "area" } as const;
export const EL_ARTICLE = { val: "article" } as const;
export const EL_ASIDE = { val: "aside" } as const;
export const EL_AUDIO = { val: "audio" } as const;
export const EL_B = { val: "b" } as const;
export const EL_BASE = { val: "base" } as const;
export const EL_BDI = { val: "bdi" } as const;
export const EL_BDO = { val: "bdo" } as const;
export const EL_BLOCKQUOTE = { val: "blockquote" } as const;
export const EL_BODY = { val: "body" } as const;
export const EL_BR = { val: "br" } as const;
export const EL_BUTTON = { val: "button" } as const;
export const EL_CANVAS = { val: "canvas" } as const;
export const EL_CAPTION = { val: "caption" } as const;
export const EL_CITE = { val: "cite" } as const;
export const EL_CODE = { val: "code" } as const;
export const EL_COL = { val: "col" } as const;
export const EL_COLGROUP = { val: "colgroup" } as const;
export const EL_DATA = { val: "data" } as const;
export const EL_DATALIST = { val: "datalist" } as const;
export const EL_DD = { val: "dd" } as const;
export const EL_DEL = { val: "del" } as const;
export const EL_DETAILS = { val: "details" } as const;
export const EL_DFN = { val: "dfn" } as const;
export const EL_DIALOG = { val: "dialog" } as const;
export const EL_DIV = { val: "div" } as const;
export const EL_DL = { val: "dl" } as const;
export const EL_DT = { val: "dt" } as const;
export const EL_EM = { val: "em" } as const;
export const EL_EMBED = { val: "embed" } as const;
export const EL_FIELDSET = { val: "fieldset" } as const;
export const EL_FIGCAPTION = { val: "figcaption" } as const;
export const EL_FIGURE = { val: "figure" } as const;
export const EL_FOOTER = { val: "footer" } as const;
export const EL_FORM = { val: "form" } as const;
export const EL_H1 = { val: "h1" } as const;
export const EL_H2 = { val: "h2" } as const;
export const EL_H3 = { val: "h3" } as const;
export const EL_H4 = { val: "h4" } as const;
export const EL_H5 = { val: "h5" } as const;
export const EL_H6 = { val: "h6" } as const;
export const EL_HEAD = { val: "head" } as const;
export const EL_HEADER = { val: "header" } as const;
export const EL_HGROUP = { val: "hgroup" } as const;
export const EL_HR = { val: "hr" } as const;
export const EL_HTML = { val: "html" } as const;
export const EL_I = { val: "i" } as const;
export const EL_IFRAME = { val: "iframe" } as const;
export const EL_IMG = { val: "img" } as const;
export const EL_INPUT = { val: "input" } as const;
export const EL_INS = { val: "ins" } as const;
export const EL_KBD = { val: "kbd" } as const;
export const EL_LABEL = { val: "label" } as const;
export const EL_LEGEND = { val: "legend" } as const;
export const EL_LI = { val: "li" } as const;
export const EL_LINK = { val: "link" } as const;
export const EL_MAIN = { val: "main" } as const;
export const EL_MAP = { val: "map" } as const;
export const EL_MARK = { val: "mark" } as const;
export const EL_MENU = { val: "menu" } as const;
export const EL_META = { val: "meta" } as const;
export const EL_METER = { val: "meter" } as const;
export const EL_NAV = { val: "nav" } as const;
export const EL_NOSCRIPT = { val: "noscript" } as const;
export const EL_OBJECT = { val: "object" } as const;
export const EL_OL = { val: "ol" } as const;
export const EL_OPTGROUP = { val: "optgroup" } as const;
export const EL_OPTION = { val: "option" } as const;
export const EL_OUTPUT = { val: "output" } as const;
export const EL_P = { val: "p" } as const;
export const EL_PICTURE = { val: "picture" } as const;
export const EL_PRE = { val: "pre" } as const;
export const EL_PROGRESS = { val: "progress" } as const;
export const EL_Q = { val: "q" } as const;
export const EL_RP = { val: "rp" } as const;
export const EL_RT = { val: "rt" } as const;
export const EL_RUBY = { val: "ruby" } as const;
export const EL_S = { val: "s" } as const;
export const EL_SAMP = { val: "samp" } as const;
export const EL_SCRIPT = { val: "script" } as const;
export const EL_SEARCH = { val: "search" } as const;
export const EL_SECTION = { val: "section" } as const;
export const EL_SELECT = { val: "select" } as const;
export const EL_SLOT = { val: "slot" } as const;
export const EL_SMALL = { val: "small" } as const;
export const EL_SOURCE = { val: "source" } as const;
export const EL_SPAN = { val: "span" } as const;
export const EL_STRONG = { val: "strong" } as const;
export const EL_STYLE = { val: "style" } as const;
export const EL_SUB = { val: "sub" } as const;
export const EL_SUMMARY = { val: "summary" } as const;
export const EL_SUP = { val: "sup" } as const;
export const EL_TABLE = { val: "table" } as const;
export const EL_TBODY = { val: "tbody" } as const;
export const EL_TD = { val: "td" } as const;
export const EL_TEMPLATE = { val: "template" } as const;
export const EL_TEXTAREA = { val: "textarea" } as const;
export const EL_TFOOT = { val: "tfoot" } as const;
export const EL_TH = { val: "th" } as const;
export const EL_THEAD = { val: "thead" } as const;
export const EL_TIME = { val: "time" } as const;
export const EL_TITLE = { val: "title" } as const;
export const EL_TR = { val: "tr" } as const;
export const EL_TRACK = { val: "track" } as const;
export const EL_U = { val: "u" } as const;
export const EL_UL = { val: "ul" } as const;
export const EL_VAR = { val: "var" } as const;
export const EL_VIDEO = { val: "video" } as const;
export const EL_WBR = { val: "wbr" } as const;

// KeyRef<keyof GlobalEventHandlersEventMap>
export const EV_ABORT = { val: "abort" } as const;
export const EV_ANIMATIONCANCEL = { val: "animationcancel" } as const;
export const EV_ANIMATIONEND = { val: "animationend" } as const;
export const EV_ANIMATIONITERATION = { val: "animationiteration" } as const;
export const EV_ANIMATIONSTART = { val: "animationstart" } as const;
export const EV_AUXCLICK = { val: "auxclick" } as const;
export const EV_BEFOREINPUT = { val: "beforeinput" } as const;
export const EV_BEFORETOGGLE = { val: "beforetoggle" } as const;
export const EV_BLUR = { val: "blur" } as const;
export const EV_CANCEL = { val: "cancel" } as const;
export const EV_CANPLAY = { val: "canplay" } as const;
export const EV_CANPLAYTHROUGH = { val: "canplaythrough" } as const;
export const EV_CHANGE = { val: "change" } as const;
export const EV_CLICK = { val: "click" } as const;
export const EV_CLOSE = { val: "close" } as const;
export const EV_COMPOSITIONEND = { val: "compositionend" } as const;
export const EV_COMPOSITIONSTART = { val: "compositionstart" } as const;
export const EV_COMPOSITIONUPDATE = { val: "compositionupdate" } as const;
export const EV_CONTEXTLOST = { val: "contextlost" } as const;
export const EV_CONTEXTMENU = { val: "contextmenu" } as const;
export const EV_CONTEXTRESTORED = { val: "contextrestored" } as const;
export const EV_COPY = { val: "copy" } as const;
export const EV_CUECHANGE = { val: "cuechange" } as const;
export const EV_CUT = { val: "cut" } as const;
export const EV_DBLCLICK = { val: "dblclick" } as const;
export const EV_DRAG = { val: "drag" } as const;
export const EV_DRAGEND = { val: "dragend" } as const;
export const EV_DRAGENTER = { val: "dragenter" } as const;
export const EV_DRAGLEAVE = { val: "dragleave" } as const;
export const EV_DRAGOVER = { val: "dragover" } as const;
export const EV_DRAGSTART = { val: "dragstart" } as const;
export const EV_DROP = { val: "drop" } as const;
export const EV_DURATIONCHANGE = { val: "durationchange" } as const;
export const EV_EMPTIED = { val: "emptied" } as const;
export const EV_ENDED = { val: "ended" } as const;
export const EV_ERROR = { val: "error" } as const;
export const EV_FOCUS = { val: "focus" } as const;
export const EV_FOCUSIN = { val: "focusin" } as const;
export const EV_FOCUSOUT = { val: "focusout" } as const;
export const EV_FORMDATA = { val: "formdata" } as const;
export const EV_GOTPOINTERCAPTURE = { val: "gotpointercapture" } as const;
export const EV_INPUT = { val: "input" } as const;
export const EV_INVALID = { val: "invalid" } as const;
export const EV_KEYDOWN = { val: "keydown" } as const;
export const EV_KEYPRESS = { val: "keypress" } as const;
export const EV_KEYUP = { val: "keyup" } as const;
export const EV_LOAD = { val: "load" } as const;
export const EV_LOADEDDATA = { val: "loadeddata" } as const;
export const EV_LOADEDMETADATA = { val: "loadedmetadata" } as const;
export const EV_LOADSTART = { val: "loadstart" } as const;
export const EV_LOSTPOINTERCAPTURE = { val: "lostpointercapture" } as const;
export const EV_MOUSEDOWN = { val: "mousedown" } as const;
export const EV_MOUSEENTER = { val: "mouseenter" } as const;
export const EV_MOUSELEAVE = { val: "mouseleave" } as const;
export const EV_MOUSEMOVE = { val: "mousemove" } as const;
export const EV_MOUSEOUT = { val: "mouseout" } as const;
export const EV_MOUSEOVER = { val: "mouseover" } as const;
export const EV_MOUSEUP = { val: "mouseup" } as const;
export const EV_PASTE = { val: "paste" } as const;
export const EV_PAUSE = { val: "pause" } as const;
export const EV_PLAY = { val: "play" } as const;
export const EV_PLAYING = { val: "playing" } as const;
export const EV_POINTERCANCEL = { val: "pointercancel" } as const;
export const EV_POINTERDOWN = { val: "pointerdown" } as const;
export const EV_POINTERENTER = { val: "pointerenter" } as const;
export const EV_POINTERLEAVE = { val: "pointerleave" } as const;
export const EV_POINTERMOVE = { val: "pointermove" } as const;
export const EV_POINTEROUT = { val: "pointerout" } as const;
export const EV_POINTEROVER = { val: "pointerover" } as const;
export const EV_POINTERUP = { val: "pointerup" } as const;
export const EV_PROGRESS = { val: "progress" } as const;
export const EV_RATECHANGE = { val: "ratechange" } as const;
export const EV_RESET = { val: "reset" } as const;
export const EV_RESIZE = { val: "resize" } as const;
export const EV_SCROLL = { val: "scroll" } as const;
export const EV_SCROLLEND = { val: "scrollend" } as const;
export const EV_SECURITYPOLICYVIOLATION = { val: "securitypolicyviolation" } as const;
export const EV_SEEKED = { val: "seeked" } as const;
export const EV_SEEKING = { val: "seeking" } as const;
export const EV_SELECT = { val: "select" } as const;
export const EV_SELECTIONCHANGE = { val: "selectionchange" } as const;
export const EV_SELECTSTART = { val: "selectstart" } as const;
export const EV_SLOTCHANGE = { val: "slotchange" } as const;
export const EV_STALLED = { val: "stalled" } as const;
export const EV_SUBMIT = { val: "submit" } as const;
export const EV_SUSPEND = { val: "suspend" } as const;
export const EV_TIMEUPDATE = { val: "timeupdate" } as const;
export const EV_TOGGLE = { val: "toggle" } as const;
export const EV_TOUCHCANCEL = { val: "touchcancel" } as const;
export const EV_TOUCHEND = { val: "touchend" } as const;
export const EV_TOUCHMOVE = { val: "touchmove" } as const;
export const EV_TOUCHSTART = { val: "touchstart" } as const;
export const EV_TRANSITIONCANCEL = { val: "transitioncancel" } as const;
export const EV_TRANSITIONEND = { val: "transitionend" } as const;
export const EV_TRANSITIONRUN = { val: "transitionrun" } as const;
export const EV_TRANSITIONSTART = { val: "transitionstart" } as const;
export const EV_VOLUMECHANGE = { val: "volumechange" } as const;
export const EV_WAITING = { val: "waiting" } as const;
export const EV_WEBKITANIMATIONEND = { val: "webkitanimationend" } as const;
export const EV_WEBKITANIMATIONITERATION = { val: "webkitanimationiteration" } as const;
export const EV_WEBKITANIMATIONSTART = { val: "webkitanimationstart" } as const;
export const EV_WEBKITTRANSITIONEND = { val: "webkittransitionend" } as const;
export const EV_WHEEL = { val: "wheel" } as const;
export const EV_FULLSCREENCHANGE = { val: "fullscreenchange" };
export const EV_FULLSCREENERROR = { val: "fullscreenerror" };
