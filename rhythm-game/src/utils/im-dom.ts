// IM-DOM 1.63

import { imFixedXY, imSize, PX } from "src/components/core/layout";
import { assert } from "src/utils/assert";
import {
    __GetEntries,
    CACHE_RERENDER_FN,
    cacheEntriesAddDestructor,
    getEntriesParent,
    getEntriesParentFromEntries,
    globalStateStackGet,
    globalStateStackPop,
    globalStateStackPush,
    imBlockBegin,
    imBlockEnd,
    ImCache,
    ImCacheEntries,
    imGet,
    imMemo,
    imSet,
    inlineTypeId,
    recursivelyEnumerateEntries,
    rerenderImCache
} from "./im-core";
import { KeysState, newKeysState, updateKeysState } from "./key-state";

export type ValidElement = HTMLElement | SVGElement;
export type AppendableElement = (ValidElement | Text);

// The children of this dom node get diffed and inserted as soon as you call `imEndEl`
export const FINALIZE_IMMEDIATELY = 0;
// The diffing and inserting will be deferred to when we do `imDomRootEnd` instead. Useful for portal-like rendering.
// BTW. wouldn't deferring a region just break all finalize_immediately code anyway though? We should just remove this and
// defer everything. Some code migration will be required.
export const FINALIZE_DEFERRED = 1;

export type FinalizationType 
 = typeof FINALIZE_IMMEDIATELY
 | typeof FINALIZE_DEFERRED;

// NOTE: This dom appender is true immediate mode. No control-flow annotations are required for the elements to show up at the right place.
// However, you do need to store your dom appender children somewhere beforehand for stable references. 
// That is what the ImCache helps with - but the ImCache does need control-flow annotations to work. eh, It is what it is
export type DomAppender<E extends AppendableElement> = {
    label?: string; // purely for debug

    root: E;
    keyRef: unknown; // Could be a key, or a dom element. Used to check pairs are linining up corectly.

    // Set this to true manually when you want to manage the DOM children yourself.
    // Hopefully that isn't all the time. If it is, then the framework isn't doing you too many favours.
    // Good use case: You have to manage hundreds of thousands of DOM nodes. 
    // From my experimentation, it is etiher MUCH faster to do this yourself instead of relying on the framework, or about the same,
    // depending on how the browser has implemented DOM node rendering.
    manualDom: boolean;

    idx: number;     // Used to iterate the list

    // if null, root is a text node. else, it can be appended to.
    parent: DomAppender<ValidElement> | null;
    children: (DomAppender<AppendableElement>[] | null);
    selfIdx: number; // index of this node in it's own array

    finalizeType: FinalizationType; // if true, the final pass can ignore this.
};

export function newDomAppender<E extends AppendableElement>(root: E, children: (DomAppender<any>[] | null)): DomAppender<E> {
    return {
        root,
        keyRef: null,
        idx: -1,

        parent: null,
        children,
        selfIdx: 0,
        manualDom: false,
        finalizeType: FINALIZE_IMMEDIATELY,
    };
}

function domAppenderDetatch(
    parent: DomAppender<ValidElement>,
    child: DomAppender<AppendableElement>
) {
    domAppenderClearParentAndShift(parent, child);
    child.root.remove();
}

function domAppenderClearParentAndShift(
    parent: DomAppender<ValidElement>,
    child: DomAppender<AppendableElement>
) {
    assert(parent.children !== null);
    assert(parent.children[child.selfIdx] === child);
    assert(parent.idx <= child.selfIdx); // Dont move a DOM node that has already been appended
    for (let i = child.selfIdx; i < parent.children.length - 1; i++) {
        parent.children[i] = parent.children[i + 1];
        parent.children[i].selfIdx = i;
    }
    parent.children.pop();
    child.parent = null;
}

export function appendToDomRoot(a: DomAppender<ValidElement>, child: DomAppender<AppendableElement>) {
    if (a.children !== null) {
        a.idx++;
        const idx = a.idx;

        if (child.parent !== null && child.parent !== a) {
            const parent = child.parent;
            domAppenderDetatch(parent, child);
        }

        if (idx === a.children.length) {
            // Simply append this element
            child.parent = a;
            child.selfIdx = a.children.length;
            a.children.push(child);
            a.root.appendChild(child.root);
        } else if (idx < a.children.length) {
            const last = a.children[idx];
            assert(last.parent === a);

            if (last === child) {
                // no action required. Hopefull, this is the HOT path
            } else {
                if (child.parent === a) {
                    // If child is already here, we'll need to remove it beforehand
                    domAppenderClearParentAndShift(child.parent, child);
                }
                a.root.replaceChild(child.root, last.root);
                a.children[idx] = child;
                last.parent = null;
                child.selfIdx = idx;
                child.parent = a;
            }
        } else {
            assert(false); // unreachable
        }
    }

    assert(child.parent === a);
    assert(child.selfIdx === a.idx);
    assert(child.root.parentNode === a.root);
}

// Useful for debugging. Should be unused in prod.
function assertInvariants(appender: DomAppender<ValidElement>) {
    if (!appender.children) return;

    for (let i = 0; i <= appender.idx; i++) {
        const child = appender.children[i];

        assert(appender.children[child.selfIdx] === child);

        let count = 0;
        for (let i = 0; i <= appender.idx; i++) {
            const c2 = appender.children[i];
            if (c2 === child) count++;
        }
        assert(count <= 1);

        assert(child.parent === appender);
    }
}

/**

let useDiv1 = false;
export function imGraphMappingsEditorView(c: ImCache) {
    imLayoutBegin(c, BLOCK); imButton(c); {
        imStr(c, "toggle");
        if (elHasMousePress(c)) useDiv1 = !useDiv1;
    } imLayoutEnd(c);

    imLayoutBegin(c, COL); imFlex(c); {
        let div1, div2
        imLayoutBegin(c, ROW); imFlex(c); {
            imLayoutBegin(c, COL); imFlex(c); {
                imStr(c, "Div 1");

                div1 = imLayoutBeginInternal(c, COL); imFinalizeDeferred(c); imLayoutEnd(c);

                imStr(c, "Div 1 end");
            } imLayoutEnd(c);
            imLayoutBegin(c, COL); imFlex(c); {
                imStr(c, "Div 2");

                div2 = imLayoutBeginInternal(c, COL); imFinalizeDeferred(c); imLayoutEnd(c);

                imStr(c, "Div 2 end");
            } imLayoutEnd(c);
        } imLayoutEnd(c);

        const s = imGetInline(c, imGraphMappingsEditorView) ?? imSet(c, {
            choices: [],
        }) as any;

        const num = 10;
        if (useDiv1) {
            // useDiv1 = false;
            for (let i = 0; i < num; i++) {
                s.choices[i] = Math.random() < 0.5;
            }
        }

        imFor(c); for (let i = 0; i < num; i++) {
            const randomChoice = s.choices[i] ? div1 : div2;

            imDomRootExistingBegin(c, randomChoice); {
                imLayoutBegin(c, COL); {
                    addDebugLabelToAppender(c, "bruv " + i);
                    imStr(c, "Naww: " + i);
                } imLayoutEnd(c);
            } imDomRootExistingEnd(c, randomChoice);
        } imForEnd(c);
    } imLayoutEnd(c);
}

*/

function finalizeDomAppender(a: DomAppender<ValidElement>) {
    // by the time we get here, the dom nodes we want have already been appended in the right order, and
    // `a.children` should be pretty much identical to what is in the DOM. 
    // We just need to remove the children we didn't render this time
    if (a.children !== null && (a.idx + 1 !== a.children.length)) {
        // Remove remaining children. do so backwards, might be faster
        for (let i = a.children.length - 1; i >= a.idx + 1; i--) {
            a.children[i].root.remove();
            a.children[i].parent = null;
        }

        a.children.length = a.idx + 1;
    }
}


/**
 * NOTE: SVG elements are actually different from normal HTML elements, and 
 * will need to be created wtih {@link imElSvgBegin}
 */
export function imElBegin<K extends keyof HTMLElementTagNameMap>(
    c: ImCache,
    r: KeyRef<K>
): DomAppender<HTMLElementTagNameMap[K]> {
    // Make this entry in the current entry list, so we can delete it easily
    const appender = getEntriesParent(c, newDomAppender);

    let childAppender: DomAppender<HTMLElementTagNameMap[K]> | undefined = imGet(c, newDomAppender);
    if (childAppender === undefined) {
        const element = document.createElement(r.val);
        childAppender = imSet(c, newDomAppender(element, []));
        childAppender.keyRef = r;
    }

    imBeginDomAppender(c, appender, childAppender);

    return childAppender;
}

function imBeginDomAppender(c: ImCache, appender: DomAppender<ValidElement>, childAppender: DomAppender<ValidElement>) {
    appendToDomRoot(appender, childAppender);

    imBlockBegin(c, newDomAppender, childAppender);

    childAppender.idx = -1;
}

export type SvgContext = {
    root: DomAppender<SVGSVGElement>;
    svg: SVGSVGElement;
    x0: number;
    y0: number;
    width: number; 
    height: number;
    resized: boolean;
}


/**
 * An alternative to {@link EL_SVG} for larger svg-based components/scenes.
 * Use this with {@link imElBeginExisting/imElEndExisting}
 *
 * For one off icons, this is probably not as ideal.
 *
 * NOTE: large svg-based scenes are very hard and cumbersone to code. 
 * This could very well be because this SvgContext isnt fully formed.
 */
export function imSvgContext(c: ImCache): SvgContext {
    const el = elGet(c);
    const elRect = el.getBoundingClientRect();

    const svgRoot = imElSvgBegin(c, EL_SVG); imFinalizeDeferred(c); 
    let ctx = imGet(c, imSvgContext);
    if (ctx === undefined) {
        ctx = { 
            root: svgRoot,
            svg: svgRoot.root,
            x0: 0,
            y0: 0,
            width: 0,
            height: 0,
            resized: false,
        };
        imSet(c, ctx);
    }


    {
        ctx.x0 = elRect.left;
        ctx.width = elRect.width;
        ctx.y0 = elRect.top;
        ctx.height = elRect.height;

        imFixedXY(c, ctx.x0, PX, ctx.y0, PX);
        imSize(c, ctx.width, PX, ctx.height, PX);

        const x0Changed = imMemo(c, ctx.x0);
        const widthChanged = imMemo(c, ctx.width);
        const y0Changed = imMemo(c, ctx.y0);
        const heightChanged = imMemo(c, ctx.height);

        // Allows us to render our SVGs using screen coordinates, which 
        // is usually what we want when we're drawing lines between two divs or whatever.
        if (x0Changed || widthChanged || y0Changed || heightChanged) {
            elSetAttr(c, "viewBox", `${ctx.x0} ${ctx.y0} ${ctx.width}, ${ctx.height}`);
        }

        // users to render their stuff here.
    
    } imElSvgEnd(c, EL_SVG);


    return ctx;
}

export function imSvgContextEnd(c: ImCache) {
    imElSvgEnd(c, EL_SVG);
}

/**
 * Svg nodes are different from normal DOM nodes, so you'll need to use this function to create them instead.
 */
export function imElSvgBegin<K extends keyof SVGElementTagNameMap>(
    c: ImCache,
    r: KeyRef<K>
): DomAppender<SVGElementTagNameMap[K]> {
    // Make this entry in the current entry list, so we can delete it easily
    const appender = getEntriesParent(c, newDomAppender);

    let childAppender: DomAppender<SVGElementTagNameMap[K]> | undefined = imGet(c, newDomAppender);
    if (childAppender === undefined) {
        const svgElement = document.createElementNS("http://www.w3.org/2000/svg", r.val);
        // Seems unnecessary. 
        // svgElement.setAttributeNS("http://www.w3.org/2000/xmlns/", "xmlns:xlink", "http://www.w3.org/1999/xlink");
        childAppender = imSet(c, newDomAppender(svgElement, []));
        childAppender.keyRef = r;
    }

    imBeginDomAppender(c, appender, childAppender);

    return childAppender;
}


export function imElEnd(c: ImCache, r: KeyRef<keyof HTMLElementTagNameMap | keyof SVGElementTagNameMap>) {
    const appender = getEntriesParent(c, newDomAppender);
    assert(appender.keyRef === r) // make sure we're popping the right thing

    if (appender.finalizeType === FINALIZE_IMMEDIATELY) {
        finalizeDomAppender(appender);
    }

    imBlockEnd(c);
}

export const imElSvgEnd = imElEnd;


/**
 * Typicaly just used at the very root of the program:
 *
 * const globalImCache: ImCache = [];
 * main(globalImCache);
 *
 * function main(c: ImCache) {
 *      imCacheBegin(c); {
 *          imDomRootBegin(c, document.body); {
 *          }
 *      } imCacheEnd(c);
 * }
 */
export function imDomRootBegin(c: ImCache, root: ValidElement) {
    let appender = imGet(c, newDomAppender);
    if (appender === undefined) {
        appender = imSet(c, newDomAppender(root, []));
        appender.keyRef = root;
    }

    imBlockBegin(c, newDomAppender, appender);

    // well we kinda have to. imDomRootEnd will only finalize things with finalizeType === FINALIZE_DEFERRED
    imFinalizeDeferred(c); 

    appender.idx = -1;

    return appender;
}

export function addDebugLabelToAppender(c: ImCache, str: string | undefined) {
    const appender = elGetAppender(c);
    appender.label = str;
}

export function imDomRootExistingBegin(c: ImCache, existing: DomAppender<any>) {
    // If you want to re-push this DOM node to the immediate mode stack, use imFinalizeDeferred(c).
    // I.e imElBegin(c, EL_BLAH); imFinalizeDeferred(c); ...
    // This allows the 'diff' to happen at the _end_ of the render pass instead of immediately after we close the element.
    // This isn't the default, because it breaks some code that expects the node to have been inserted - 
    // calls to textInput.focus() for example, won't work till the next frame, for example.
    assert(existing.finalizeType === FINALIZE_DEFERRED);

    imBlockBegin(c, newDomAppender, existing);
}

export function imDomRootExistingEnd(c: ImCache, existing: DomAppender<any>) {
    let appender = getEntriesParent(c, newDomAppender);
    assert(appender === existing);
    imBlockEnd(c);
}

export function imFinalizeDeferred(c: ImCache) {
    elGetAppender(c).finalizeType = FINALIZE_DEFERRED;
}


export function imDomRootEnd(c: ImCache, root: ValidElement) {
    let appender = getEntriesParent(c, newDomAppender);
    assert(appender.keyRef === root);

    // By finalizing at the very end, we get two things:
    // - Opportunity to make a 'global key' - a component that can be instantiated anywhere but reuses the same cache entries. 
    //      a context menu is a good example of a usecase. Every component wants to instantiate it as if it were it's own, but really, 
    //      only one can be open at a time - there is an opportunity to save resources here and reuse the same context menu every time.
    // - Allows existing dom appenders to be re-pushed onto the stack, and appended to. 
    //      Useful for creating 'layers' that exist in another part of the DOM tree that other components might want to render to.
    //      For example, if I am making a node editor with SVG paths as edges, it is best to just have a single SVG layer to render everything into
    //      but then organising the components becomes a bit annoying.

    const entries = __GetEntries(c);

    // deferred finalization.
    // NOTE: could be optimized later - since majority of nodes won't have finalization deferred.
    recursivelyEnumerateEntries(entries, domFinalizeEnumerator);

    imBlockEnd(c);
}

function domFinalizeEnumerator(entries: ImCacheEntries): boolean {
    // TODO: only if any mutations
    // TODO: handle global keyed elements

    const domAppender = getEntriesParentFromEntries(entries, newDomAppender);
    if (domAppender !== undefined) {
        if (domAppender.finalizeType === FINALIZE_DEFERRED) {
            finalizeDomAppender(domAppender);
        }
        return true;
    }

    return false;
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
        if (Array.isArray(val) === true) val = val.join(" ");
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
                // NOTE: Some of you coming from a non-web background may be puzzled as to why
                // we are re-rendering the entire app for EVERY event. This is because we always want
                // the ability to call e.preventDefault() while the event is occuring for any event.
                // Buffering the events means that we will miss the opportunity to prevent the default event.

                val.eventValue = e;
                rerenderImCache(c);
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

    keys: KeysState;
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
        keys: newKeysState(),
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

    function handleMouseMove(e: MouseEvent) {
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

    function updateMouseButtons(e: MouseEvent) {
        mouse.leftMouseButton   = Boolean(e.buttons & (1 << 0));
        mouse.rightMouseButton  = Boolean(e.buttons & (2 << 0));
        mouse.middleMouseButton = Boolean(e.buttons & (3 << 0));
    }

    const eventSystem: ImGlobalEventSystem = {
        rerender: rerenderFn,
        keyboard,
        mouse,
        blur: false,
        // stored, so we can dispose them later if needed.
        globalEventHandlers: {
            mousedown: (e: MouseEvent) => {
                updateMouseButtons(e);

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
                updateMouseButtons(e);

                if (handleMouseMove(e) === true) {
                    eventSystem.rerender();
                    mouse.ev = null;
                }
            },
            mouseenter: (e) => {
                if (handleMouseMove(e) === true) {
                    eventSystem.rerender();
                    mouse.ev = null;
                }
            },
            mouseup: (e: MouseEvent) => {
                updateMouseButtons(e);

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
                if (!handleMouseMove(e) === true) {
                    // rerender anwyway
                    eventSystem.rerender();
                }
            },
            keydown: (e: KeyboardEvent) => {
                keyboard.keyDown = e;
                updateKeysState(keyboard.keys, e, null, false);
                eventSystem.rerender();
            },
            keyup: (e: KeyboardEvent) => {
                keyboard.keyUp = e;
                updateKeysState(keyboard.keys, null, e, false);
                eventSystem.rerender();
            },
            blur: () => {
                resetImMouseState(mouse);
                resetImKeyboardState(keyboard);
                eventSystem.blur = true;
                updateKeysState(keyboard.keys, null, null, true);
                eventSystem.rerender();
            }
        },
    };

    return eventSystem;
}

function resetImKeyboardState(keyboard: ImKeyboardState) {
    keyboard.keyDown = null
    keyboard.keyUp = null

    const keys = keyboard.keys;
    updateKeysState(keys, null, null, true);
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

export function imGlobalEventSystemEnd(_c: ImCache, eventSystem: ImGlobalEventSystem) {
    updateMouseState(eventSystem.mouse);
    updateKeysState(eventSystem.keyboard.keys, null, null, false);

    eventSystem.keyboard.keyDown = null
    eventSystem.keyboard.keyUp = null
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

                if (self.resized === true) {
                    rerenderImCache(c);
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

export function updateMouseState(mouse: ImMouseState) {
    mouse.dX = 0;
    mouse.dY = 0;
    mouse.lastX = mouse.X;
    mouse.lastY = mouse.Y;

    mouse.scrollWheel = 0;
}

export function resetImMouseState(mouse: ImMouseState) {
    mouse.dX = 0;
    mouse.dY = 0;
    mouse.lastX = mouse.X;
    mouse.lastY = mouse.Y;

    mouse.scrollWheel = 0;

    mouse.leftMouseButton = false;
    mouse.middleMouseButton = false;
    mouse.rightMouseButton = false;
}

export function addDocumentAndWindowEventListeners(eventSystem: ImGlobalEventSystem) {
    document.addEventListener("mousedown", eventSystem.globalEventHandlers.mousedown);
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

// We can now memoize on an object reference instead of a string. This improves performance.
// You shouldn't be creating these every frame - just reusing these constants below
type KeyRef<K> = { val: K };

// HTML elements
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

// HTML svg elements
export const EL_SVG_A = { val: "a" } as const;
export const EL_SVG_ANIMATE = { val: "animate" } as const;
export const EL_SVG_ANIMATEMOTION = { val: "animateMotion" } as const;
export const EL_SVG_ANIMATETRANSFORM = { val: "animateTransform" } as const;
export const EL_SVG_CIRCLE = { val: "circle" } as const;
export const EL_SVG_CLIPPATH = { val: "clipPath" } as const;
export const EL_SVG_DEFS = { val: "defs" } as const;
export const EL_SVG_DESC = { val: "desc" } as const;
export const EL_SVG_ELLIPSE = { val: "ellipse" } as const;
export const EL_SVG_FEBLEND = { val: "feBlend" } as const;
export const EL_SVG_FECOLORMATRIX = { val: "feColorMatrix" } as const;
export const EL_SVG_FECOMPONENTTRANSFER = { val: "feComponentTransfer" } as const;
export const EL_SVG_FECOMPOSITE = { val: "feComposite" } as const;
export const EL_SVG_FECONVOLVEMATRIX = { val: "feConvolveMatrix" } as const;
export const EL_SVG_FEDIFFUSELIGHTING = { val: "feDiffuseLighting" } as const;
export const EL_SVG_FEDISPLACEMENTMAP = { val: "feDisplacementMap" } as const;
export const EL_SVG_FEDISTANTLIGHT = { val: "feDistantLight" } as const;
export const EL_SVG_FEDROPSHADOW = { val: "feDropShadow" } as const;
export const EL_SVG_FEFLOOD = { val: "feFlood" } as const;
export const EL_SVG_FEFUNCA = { val: "feFuncA" } as const;
export const EL_SVG_FEFUNCB = { val: "feFuncB" } as const;
export const EL_SVG_FEFUNCG = { val: "feFuncG" } as const;
export const EL_SVG_FEFUNCR = { val: "feFuncR" } as const;
export const EL_SVG_FEGAUSSIANBLUR = { val: "feGaussianBlur" } as const;
export const EL_SVG_FEIMAGE = { val: "feImage" } as const;
export const EL_SVG_FEMERGE = { val: "feMerge" } as const;
export const EL_SVG_FEMERGENODE = { val: "feMergeNode" } as const;
export const EL_SVG_FEMORPHOLOGY = { val: "feMorphology" } as const;
export const EL_SVG_FEOFFSET = { val: "feOffset" } as const;
export const EL_SVG_FEPOINTLIGHT = { val: "fePointLight" } as const;
export const EL_SVG_FESPECULARLIGHTING = { val: "feSpecularLighting" } as const;
export const EL_SVG_FESPOTLIGHT = { val: "feSpotLight" } as const;
export const EL_SVG_FETILE = { val: "feTile" } as const;
export const EL_SVG_FETURBULENCE = { val: "feTurbulence" } as const;
export const EL_SVG_FILTER = { val: "filter" } as const;
export const EL_SVG_FOREIGNOBJECT = { val: "foreignObject" } as const;
export const EL_SVG_G = { val: "g" } as const;
export const EL_SVG_IMAGE = { val: "image" } as const;
export const EL_SVG_LINE = { val: "line" } as const;
export const EL_SVG_LINEARGRADIENT = { val: "linearGradient" } as const;
export const EL_SVG_MARKER = { val: "marker" } as const;
export const EL_SVG_MASK = { val: "mask" } as const;
export const EL_SVG_METADATA = { val: "metadata" } as const;
export const EL_SVG_MPATH = { val: "mpath" } as const;
export const EL_SVG_PATH = { val: "path" } as const;
export const EL_SVG_PATTERN = { val: "pattern" } as const;
export const EL_SVG_POLYGON = { val: "polygon" } as const;
export const EL_SVG_POLYLINE = { val: "polyline" } as const;
export const EL_SVG_RADIALGRADIENT = { val: "radialGradient" } as const;
export const EL_SVG_RECT = { val: "rect" } as const;
export const EL_SVG_SCRIPT = { val: "script" } as const;
export const EL_SVG_SET = { val: "set" } as const;
export const EL_SVG_STOP = { val: "stop" } as const;
export const EL_SVG_STYLE = { val: "style" } as const;
/**
 * For larger svg-based components with lots of moving parts, 
 * consider {@link imSvgContext}, or creating something on your end that is similar.
 */
export const EL_SVG = { val: "svg" } as const;; 
export const EL_SVG_SWITCH = { val: "switch" } as const;
export const EL_SVG_SYMBOL = { val: "symbol" } as const;
export const EL_SVG_TEXT = { val: "text" } as const;
export const EL_SVG_TEXTPATH = { val: "textPath" } as const;
export const EL_SVG_TITLE = { val: "title" } as const;
export const EL_SVG_TSPAN = { val: "tspan" } as const;
export const EL_SVG_USE = { val: "use" } as const;
export const EL_SVG_VIEW = { val: "view" } as const;


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
/** 
 * NOTE: You may want to use {@link getGlobalEventSystem}.keyboard instead of this 
 * TODO: fix
 **/
export const EV_KEYDOWN = { val: "keydown" } as const;
export const EV_KEYPRESS = { val: "keypress" } as const;
/** 
 * NOTE: You may want to use {@link getGlobalEventSystem}.keyboard instead of this 
 * TODO: fix
 **/
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
