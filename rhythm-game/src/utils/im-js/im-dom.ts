// IM-DOM 1.73

import { assert } from "./assert";
import { im, ImCache, ImCacheEntries } from "./im-core";

///////////////////////////
// DOM-node management

export type ValidElement = HTMLElement | SVGElement;
export type AppendableElement = (ValidElement | Text);

// The children of this dom node get diffed and inserted as soon as you call `EndEl`
const FINALIZE_IMMEDIATELY = 0;
// The diffing and inserting will be deferred to when we do `DomRootEnd` instead. Useful for portal-like rendering.
// BTW. wouldn't deferring a region just break all finalize_immediately code anyway though? We should just remove this and
// defer everything. Some code migration will be required.
const FINALIZE_DEFERRED = 1; // TOOD: finalize_manually

export type FinalizationType
    = typeof FINALIZE_IMMEDIATELY
    | typeof FINALIZE_DEFERRED;

// NOTE: This dom appender is true immediate mode. No control-flow annotations are required for the elements to show up at the right place.
// However, you do need to store your dom appender children somewhere beforehand for stable references. 
// That is what the im.Cache helps with - but the im.Cache does need control-flow annotations to work. eh, It is what it is
export type DomAppender<E extends AppendableElement = AppendableElement> = {
    label?: string; // purely for debug

    root: E;
    keyRef: unknown; // Could be a key, or a dom element. Used to check pairs are linining up corectly.

    // Set this to true manually when you want to manage the DOM children yourself.
    // Hopefully that isn't all the time. If it is, then the framework isn't doing you too many favours.
    // Good use case: You have to manage hundreds of thousands of DOM nodes. 
    // From my experimentation, it is etiher MUCH faster to do this yourself instead of relying on the framework, or about the same,
    // depending on how the browser has implemented DOM node rendering.
    // Also will be needed for 3rd party lib integrations.
    manualDom: boolean;

    idx: number;     // Used to iterate the list

    // if null, root is a text node. else, it can be appended to.
    parent: DomAppender<ValidElement> | null;
    domRoot: DomAppender<ValidElement> | null;
    children: (DomAppender<AppendableElement>[] | null);
    selfIdx: number; // index of this node in it's own array

    // if true, the final pass can ignore this.
    finalizeType: FinalizationType; 

    // Dedicated finalization list instead of recursing through every element at the end.
    // This is because deferring the finalization of an element is very uncommon, so I don't
    // want to eat the performance penalty of the recursion just to finalize 2 things
    deferList: DomAppender<ValidElement>[] | undefined;
};

function newDomAppender<E extends AppendableElement>(
    root: E,
    domRoot: DomAppender<ValidElement> | null,
    children: (DomAppender<any>[] | null)
): DomAppender<E> {
    return {
        root,
        keyRef: null,
        idx: -1,

        parent: null,
        children,
        selfIdx: 0,
        manualDom: false,
        finalizeType: FINALIZE_IMMEDIATELY,

        // If null, it will get set to itself later.
        domRoot: domRoot,
        deferList: domRoot === null ? [] : undefined,
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

function appendToDomRoot(a: DomAppender<ValidElement>, child: DomAppender<AppendableElement>) {
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

        assert(child.parent === a);
        assert(child.selfIdx === a.idx);

        // turns out to be quite an expensive assertion, so I've commented it out for now
        // assert(child.root.parentNode === a.root);
    }
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
 TODO: test case

let useDiv1 = false;
function GraphMappingsEditorView(c: im.Cache) {
    LayoutBegin(c, BLOCK); imButton(c); {
        Str(c, "toggle");
        if (elHasMousePress(c)) useDiv1 = !useDiv1;
    } LayoutEnd(c);

    LayoutBegin(c, COL); imFlex(c); {
        let div1, div2
        LayoutBegin(c, ROW); imFlex(c); {
            LayoutBegin(c, COL); imFlex(c); {
                Str(c, "Div 1");

                div1 = LayoutBeginInternal(c, COL); imFinalizeDeferred(c); imLayoutEnd(c);

                Str(c, "Div 1 end");
            } LayoutEnd(c);
            LayoutBegin(c, COL); imFlex(c); {
                Str(c, "Div 2");

                div2 = LayoutBeginInternal(c, COL); imFinalizeDeferred(c); imLayoutEnd(c);

                Str(c, "Div 2 end");
            } LayoutEnd(c);
        } LayoutEnd(c);

        const s = GetInline(c, imGraphMappingsEditorView) ?? imSet(c, {
            choices: [],
        }) as any;

        const num = 10;
        if (useDiv1) {
            // useDiv1 = false;
            for (let i = 0; i < num; i++) {
                s.choices[i] = Math.random() < 0.5;
            }
        }

        For(c); for (let i = 0; i < num; i++) {
            const randomChoice = s.choices[i] ? div1 : div2;

            DomRootExistingBegin(c, randomChoice); {
                LayoutBegin(c, COL); {
                    addDebugLabelToAppender(c, "bruv " + i);
                    Str(c, "Naww: " + i);
                } LayoutEnd(c);
            } DomRootExistingEnd(c, randomChoice);
        } ForEnd(c);
    } LayoutEnd(c);
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
function imElBegin<K extends keyof HTMLElementTagNameMap>(
    c: ImCache,
    r: KeyRef<K>
): DomAppender<HTMLElementTagNameMap[K]> {
    // TODO: support changing tne type
    // Make this entry in the current entry list, so we can delete it easily
    const appender = im.getEntriesParent(c, newDomAppender);

    let childAppender: DomAppender<HTMLElementTagNameMap[K]> | undefined = im.Get(c, newDomAppender);
    if (childAppender === undefined) {
        const element = document.createElement(r.val);
        childAppender = im.Set(c, newDomAppender(element, appender.domRoot, []));
        childAppender.keyRef = r;
    }

    BeginDomAppender(c, appender, childAppender);

    return childAppender;
}

function BeginDomAppender(c: ImCache, appender: DomAppender<ValidElement>, childAppender: DomAppender<ValidElement>) {
    appendToDomRoot(appender, childAppender);

    im.ImmediateModeBlockBegin(c, newDomAppender, childAppender);

    childAppender.idx = -1;
}

/**
 * Svg nodes are different from normal DOM nodes, so you'll need to use this function to create them instead.
 */
function imElSvgBegin<K extends keyof SVGElementTagNameMap>(
    c: ImCache,
    r: KeyRef<K>
): DomAppender<SVGElementTagNameMap[K]> {
    // Make this entry in the current entry list, so we can delete it easily
    const appender = im.getEntriesParent(c, newDomAppender);

    let childAppender: DomAppender<SVGElementTagNameMap[K]> | undefined = im.Get(c, newDomAppender);
    if (childAppender === undefined) {
        const svgElement = document.createElementNS("http://www.w3.org/2000/svg", r.val);
        // Seems unnecessary. 
        // svgElement.setAttributeNS("http://www.w3.org/2000/xmlns/", "xmlns:xlink", "http://www.w3.org/1999/xlink");
        childAppender = im.Set(c, newDomAppender(svgElement, appender.domRoot, []));
        childAppender.keyRef = r;
    }

    BeginDomAppender(c, appender, childAppender);

    return childAppender;
}


function imElEnd(c: ImCache, r: KeyRef<keyof HTMLElementTagNameMap | keyof SVGElementTagNameMap>) {
    const appender = im.getEntriesParent(c, newDomAppender);
    assert(appender.keyRef === r) // make sure we're popping the right thing

    if (appender.finalizeType === FINALIZE_IMMEDIATELY) {
        finalizeDomAppender(appender);
    } else if (appender.finalizeType === FINALIZE_DEFERRED) {
        const deferList = appender.domRoot!.deferList;
        assert(!!deferList);
        deferList.push(appender);
    }

    im.ImmediateModeBlockEnd(c);
}

const imElSvgEnd = imElEnd;


/**
 * Typicaly just used at the very root of the program:
 *
 * const globalim.Cache: im.Cache = [];
 * main(globalim.Cache);
 *
 * function main(c: im.Cache) {
 *      CacheBegin(c); {
 *          DomRootBegin(c, document.body); {
 *          }
 *      } CacheEnd(c);
 * }
 */
function imRootBegin(c: ImCache, root: ValidElement) {
    let appender = im.Get(c, newDomAppender);
    if (appender === undefined) {
        appender = im.Set(c, newDomAppender(root, null, []));
        appender.domRoot = appender;
        appender.keyRef = root;
    }

    im.ImmediateModeBlockBegin(c, newDomAppender, appender);

    // well we kinda have to. DomRootEnd will only finalize things with finalizeType === FINALIZE_DEFERRED
    imFinalizeDeferred(c);

    appender.idx = -1;
    
    assert(!!appender.deferList);
    appender.deferList.length = 0;

    return appender;
}

function addDebugLabelToAppender(c: ImCache, str: string | undefined) {
    const appender = getAppender(c);
    appender.label = str;
}

// Use this whenever you expect to render to a particular dom node from a place in the code that
// would otherwise not have access to this dom node.
function imRootExistingBegin(c: ImCache, existing: DomAppender<any>) {
    // If you want to re-push this DOM node to the immediate mode stack, use imdom.FinalizeDeferred(c).
    // I.e ElBegin(c, EL_BLAH); imFinalizeDeferred(c); {
    // This allows the 'diff' to happen at the _end_ of the render pass instead of immediately after we close the element.
    // This isn't the default, because it breaks some code that expects the node to have been inserted - 
    // calls to textInput.focus() for example, won't work till the next frame, for example.
    assert(existing.finalizeType === FINALIZE_DEFERRED);

    im.ImmediateModeBlockBegin(c, newDomAppender, existing);
}

function imRootExistingEnd(c: ImCache, existing: DomAppender<any>) {
    let appender = im.getEntriesParent(c, newDomAppender);
    assert(appender === existing);
    im.ImmediateModeBlockEnd(c);
}

/** @deprecated TODO: remove this method in favour of explicitly finalizing */
function imFinalizeDeferred(c: ImCache) {
    getAppender(c).finalizeType = FINALIZE_DEFERRED;
}


function imRootEnd(c: ImCache, root: ValidElement) {
    let appender = im.getEntriesParent(c, newDomAppender);
    assert(appender.keyRef === root);

    // By finalizing at the very end, we get two things:
    // - Opportunity to make a 'global key' - a component that can be instantiated anywhere but reuses the same cache entries. 
    //      a context menu is a good example of a usecase. Every component wants to instantiate it as if it were it's own, but really, 
    //      only one can be open at a time - there is an opportunity to save resources here and reuse the same context menu every time.
    // - Allows existing dom appenders to be re-pushed onto the stack, and appended to. 
    //      Useful for creating 'layers' that exist in another part of the DOM tree that other components might want to render to.
    //      For example, if I am making a node editor with SVG paths as edges, it is best to just have a single SVG layer to render everything into
    //      but then organising the components becomes a bit annoying.

    // deferred finalization.
    const deferList = appender.domRoot!.deferList;
    assert(!!deferList);
    for (let i = 0; i < deferList.length; i++) {
        const item = deferList[i];
        finalizeDomAppender(item);
    }

    // Finally, finalize the root
    finalizeDomAppender(appender);

    im.ImmediateModeBlockEnd(c);
}

function domFinalizeEnumerator(entries: ImCacheEntries): boolean {
    // TODO: only if any mutations
    // TODO: handle global keyed elements

    const domAppender = im.getEntriesParentFromEntries(entries, newDomAppender);
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
 * This method manages a HTML Text node. So of course, I named it
 * `Str`. 
 */
function imStr(c: ImCache, value: Stringifyable): Text {
    const domAppender = im.getEntriesParent(c, newDomAppender);

    let textNodeLeafAppender; textNodeLeafAppender = im.GetInline(c, imStr);
    if (textNodeLeafAppender === undefined) textNodeLeafAppender = im.Set(c, newDomAppender(
        document.createTextNode(""),
        domAppender,
        null
    ));

    // The user can't select this text node if we're constantly setting it, so it's behind a cache
    let lastValue = im.GetInline(c, document.createTextNode);
    if (im.isSetRequired(c) === true || lastValue !== value) {
        im.Set(c, value);
        textNodeLeafAppender.root.nodeValue = (value != null && value.toString) ? value.toString() : "<couldn't stringify>";
    }

    appendToDomRoot(domAppender, textNodeLeafAppender);

    return textNodeLeafAppender.root;
}

// TODO: not scaleable for the same reason State isn't scaleable. we gotta think of something better that lets us have more dependencies/arguments to the formatter
function imStrFmt<T>(c: ImCache, value: T, formatter: (val: T) => string): Text {
    const domAppender = im.getEntriesParent(c, newDomAppender);

    let textNodeLeafAppender; textNodeLeafAppender = im.GetInline(c, imStr);
    if (textNodeLeafAppender === undefined) textNodeLeafAppender = im.Set(c, newDomAppender(
        document.createTextNode(""),
        domAppender.domRoot,
        null
    ));

    const formatterChanged = im.Memo(c, formatter);

    // The user can't select this text node if we're constantly setting it, so it's behind a cache
    let lastValue = im.GetInline(c, document.createTextNode);
    if (lastValue !== value || formatterChanged !== 0) {
        im.Set(c, value);
        textNodeLeafAppender.root.nodeValue = formatter(value);
    }

    appendToDomRoot(domAppender, textNodeLeafAppender);

    return textNodeLeafAppender.root;
}

function setStyle<K extends (keyof ValidElement["style"])>(
    c: ImCache,
    key: K,
    value: string,
    root = getElement(c),
) {
    // @ts-expect-error its fine tho
    root.style[key] = value;
}

function setTextUnsafe(c: ImCache, val: string) {
    let el = getElement(c);
    el.textContent = val;
}


function setClass(
    c: ImCache,
    className: string,
    enabled: boolean | number = true,
    el = getElement(c)
): boolean {
    if (enabled !== false && enabled !== 0) {
        el.classList.add(className);
    } else {
        el.classList.remove(className);
    }

    return !!enabled;
}

function setAttr(
    c: ImCache,
    attr: string,
    val: string | null,
    root = getElement(c),
) {
    if (val !== null) {
        root.setAttribute(attr, val);
    } else {
        root.removeAttribute(attr);
    }
}

function getAppender(c: ImCache): DomAppender<ValidElement> {
    return im.getEntriesParent(c, newDomAppender);
}

function getElement(c: ImCache) {
    return getAppender(c).root;
}

// NOTE: you should only use this if you don't already have some form of global event handling set up,
// or in cases where you can't use global event handling.
function imOn<K extends keyof HTMLElementEventMap>(
    c: ImCache,
    type: KeyRef<K>,
): HTMLElementEventMap[K] | null {
    let state; state = im.GetInline(c, imOn);
    if (state === undefined) {
        const val: {
            el: ValidElement;
            eventType: KeyRef<keyof HTMLElementEventMap> | null;
            eventValue: Event | null;
            eventListener: (e: HTMLElementEventMap[K]) => void;
        } = {
            el: getElement(c),
            eventType: null,
            eventValue: null,
            eventListener: (e: HTMLElementEventMap[K]) => {
                // NOTE: Some of you coming from a non-web background may be puzzled as to why
                // we are re-rendering the entire app for EVERY event. This is because we always want
                // the ability to call e.preventDefault() while the event is occuring for any event.
                // Buffering the events means that we will miss the opportunity to prevent the default event.

                val.eventValue = e;
                im.rerenderCache(c);
            },
        };
        state = im.Set(c, val);
    }

    let result: HTMLElementEventMap[K] | null = null;

    if (state.eventValue !== null) {
        result = state.eventValue as HTMLElementEventMap[K];
        state.eventValue = null;
    }

    if (state.eventType !== type) {
        const el = getElement(c);
        if (state.eventType !== null) {
            el.removeEventListener(state.eventType.val, state.eventListener as EventListener);
        }

        state.eventType = type;
        el.addEventListener(state.eventType.val, state.eventListener as EventListener);
    }

    return result;
}

///////////////////////////
// Global event system

function getMouse(): MouseState {
    // You need to initialize a global event system before you go getting it
    assert(globalEventSystem !== undefined);
    return globalEventSystem.mouse;
}

function getKeyboard(): KeyboardState {
    // You need to initialize a global event system before you go getting it
    assert(globalEventSystem !== undefined);
    return globalEventSystem.keyboard;
}

function getBlur(): boolean {
    // You need to initialize a global event system before you go getting it
    assert(globalEventSystem !== undefined);
    return globalEventSystem.blur;
}

function hasMousePress(c: ImCache, el = getElement(c)): boolean {
    const mouse = getMouse();
    return elIsInSetThisFrame(el, mouse.mouseDownElements)
}

function hasMouseUp(c: ImCache, el = getElement(c)): boolean {
    const mouse = getMouse();
    return elIsInSetThisFrame(el, mouse.mouseUpElements)
}

function hasMouseClick(c: ImCache, el = getElement(c)): boolean {
    const mouse = getMouse();
    return elIsInSetThisFrame(el, mouse.mouseClickElements)
}

function hasMouseOver(c: ImCache, el = getElement(c)): boolean {
    const mouse = getMouse();
    return mouse.mouseOverElements.has(el);
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

export type KeyboardState = {
    // We need to use this approach instead of a buffered approach like `keysPressed: string[]`, so that a user
    // may call `preventDefault` on the html event as needed.
    // NOTE: another idea is to do `keys.keyDown = null` to prevent other handlers in this framework
    // from knowing about this event.
    keyDown: KeyboardEvent | null;
    keyUp: KeyboardEvent | null;

    keys: KeysState;
};


export type MouseState = {
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

export type GlobalEventSystem = {
    rerender: () => void;
    keyboard: KeyboardState;
    mouse: MouseState;
    blur:  boolean;
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

function newImGlobalEventSystem(c: ImCache): GlobalEventSystem {
    const keyboard: KeyboardState = {
        keyDown: null,
        keyUp: null,
        keys: newKeysState(),
    };

    const mouse: MouseState = {
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
        mouse.leftMouseButton = Boolean(e.buttons & (1 << 0));
        mouse.rightMouseButton = Boolean(e.buttons & (2 << 0));
        mouse.middleMouseButton = Boolean(e.buttons & (3 << 0));
    }

    const eventSystem: GlobalEventSystem = {
        rerender: () => im.rerenderCache(c),
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

function resetImKeyboardState(keyboard: KeyboardState) {
    keyboard.keyDown = null
    keyboard.keyUp = null

    const keys = keyboard.keys;
    updateKeysState(keys, null, null, true);
}

/**
 * See the decision matrix above {@link globalStateStackPush}
 */
let globalEventSystem: GlobalEventSystem | undefined;

// TODO: is there any point in separating this from DomRoot ?
function imGlobalEventSystemBegin(c: ImCache): GlobalEventSystem {
    let state = im.Get(c, newImGlobalEventSystem);
    if (state === undefined) {
        // Can't make two of these
        assert(globalEventSystem === undefined);

        const eventSystem = newImGlobalEventSystem(c);
        addDocumentAndWindowEventListeners(eventSystem);
        im.onImmediateModeBlockDestroyed(c, () => removeDocumentAndWindowEventListeners(eventSystem));
        state = im.Set(c, eventSystem);

        globalEventSystem = state;
    }

    return state;
}

function imGlobalEventSystemEnd(_c: ImCache, eventSystem: GlobalEventSystem) {
    updateMouseState(eventSystem.mouse);
    updateKeysState(eventSystem.keyboard.keys, null, null, false);

    eventSystem.keyboard.keyDown = null
    eventSystem.keyboard.keyUp = null
    eventSystem.blur = false;
}

function imTrackSize(c: ImCache, rerender = false) {
    let state; state = im.GetInline(c, imTrackSize);
    if (state === undefined) {
        const root = getElement(c);

        const self = {
            size: { width: 0, height: 0, },
            resized: false,
            shouldRerender: false,
            observer: new ResizeObserver((entries) => {
                for (const entry of entries) {
                    // NOTE: resize-observer cannot track the top, right, left, bottom of a rect. Sad.
                    self.size.width = entry.contentRect.width;
                    self.size.height = entry.contentRect.height;
                    self.resized = true;
                    break;
                }

                if (self.resized === true) {
                    if (self.shouldRerender) im.rerenderCache(c);
                    self.resized = false;
                }
            })
        };

        self.observer.observe(root);
        im.onImmediateModeBlockDestroyed(c, () => {
            self.observer.disconnect()
        });

        state = im.Set(c, self);
    }

    state.shouldRerender = rerender;

    return state;
}

function imTrackVisibility(c: ImCache, threshold: number) {
    let state; state = im.GetInline(c, imTrackVisibility);
    if (state === undefined) {
        const root = getElement(c);

        const self = {
            isVisible: false,
            initialThreshold: threshold,
            // TODO: add properties as we discover they are actually useful

            observer: new IntersectionObserver((entries) => {
                let isIntersecting = false;

                self.isVisible = false;
                for (const entry of entries) {
                    if (entry.isIntersecting) {
                        isIntersecting = true;
                    }
                }

                if (self.isVisible !== isIntersecting) {
                    self.isVisible = isIntersecting;
                    im.rerenderCache(c);
                }
            }, {
                threshold: threshold,
            })
        };

        self.observer.observe(root);
        im.onImmediateModeBlockDestroyed(c, () => {
            self.observer.disconnect()
        });

        state = im.Set(c, self);
    }


    if (state.initialThreshold !== threshold) {
        throw new Error("Can't change the threhsold after the fact");
    }

    return state;
}

function newPreventScrollEventPropagationState() {
    return {
        isBlocking: true,
        scrollY: 0,
    };
}

function imPreventScrollEventPropagation(c: ImCache, isBlocking = true): number {
    const wheel = imOn(c, ev.WHEEL);
    if (wheel && isBlocking) {
        wheel.preventDefault();
    }

    let result = 0;

    const mouse = getMouse();
    if (isBlocking === true && hasMouseOver(c) && mouse.scrollWheel !== 0) {
        result += mouse.scrollWheel;
        mouse.scrollWheel = 0;
    } 

    return result;
}

function updateMouseState(mouse: MouseState) {
    mouse.dX = 0;
    mouse.dY = 0;
    mouse.lastX = mouse.X;
    mouse.lastY = mouse.Y;

    mouse.scrollWheel = 0;
}

function resetImMouseState(mouse: MouseState) {
    mouse.dX = 0;
    mouse.dY = 0;
    mouse.lastX = mouse.X;
    mouse.lastY = mouse.Y;

    mouse.scrollWheel = 0;

    mouse.leftMouseButton = false;
    mouse.middleMouseButton = false;
    mouse.rightMouseButton = false;
}

function addDocumentAndWindowEventListeners(eventSystem: GlobalEventSystem) {
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

function removeDocumentAndWindowEventListeners(eventSystem: GlobalEventSystem) {
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

///////////////////////////
// Various KeyRef entries

// We can now memoize on an object reference instead of a string. This improves performance.
// You shouldn't be creating these every frame - just reusing these constants below
export type KeyRef<K> = { val: K };


///////////////////////////
// Keyboard input tracking

function filterInPlace<T>(arr: T[], predicate: (v: T, i: number) => boolean) {
    let i2 = 0;
    for (let i = 0; i < arr.length; i++) {
        if (predicate(arr[i], i)) arr[i2++] = arr[i];
    }
    arr.length = i2;
}

// TODO: use keycode if supported

type PressedSymbols<T extends string> = {
    pressed: T[];
    held: T[];
    repeated: T[];
    released: T[];
};

export type KeysState = {
    keys: PressedSymbols<NormalizedKey>;
    letters: PressedSymbols<string>;
};

function newKeysState(): KeysState {
    return {
        keys: {
            pressed: [],
            held: [],
            released: [],
            repeated: [],
        },
        letters: {
            pressed: [],
            held: [],
            released: [],
            repeated: [],
        }
    };
}

const KEY_EVENT_NOTHING = 0;
const KEY_EVENT_PRESSED = 1;
const KEY_EVENT_RELEASED = 2;
const KEY_EVENT_REPEATED = 3;
const KEY_EVENT_BLUR = 4;


// https://developer.mozilla.org/en-US/docs/Web/API/UI_Events/Keyboard_event_key_values
// There are a LOT of them. So I won't bother holding state for every possible key like usual
// TODO: try using keyCode if available, then fall back on key
export type NormalizedKey = string & { __Key: void };

function getNormalizedKey(key: string): NormalizedKey {
    if (key.length === 1) {
        key = key.toUpperCase();

        switch (key) {
            case "!": key = "1"; break;
            case "@": key = "2"; break;
            case "#": key = "3"; break;
            case "$": key = "4"; break;
            case "%": key = "5"; break;
            case "^": key = "6"; break;
            case "&": key = "7"; break;
            case "*": key = "8"; break;
            case "(": key = "9"; break;
            case ")": key = "0"; break;
            case "_": key = "-"; break;
            case "+": key = "+"; break;
            case "{": key = "["; break;
            case "}": key = "]"; break;
            case "|": key = "\\"; break;
            case ":": key = ";"; break;
            case "\"": key = "'"; break;
            case "<": key = ","; break;
            case ">": key = "."; break;
            case "?": key = "/"; break;
            case "~": key = "`"; break;
        }
    }

    return key as NormalizedKey;
}

function updatePressedSymbols<T extends string>(
    s: PressedSymbols<T>,
    ev: number,
    key: T,
) {
    for (let i = 0; i < s.pressed.length; i++) {
        s.held.push(s.pressed[i]);
    }
    s.pressed.length = 0;
    s.repeated.length = 0;
    s.released.length = 0;

    switch (ev) {
        case KEY_EVENT_PRESSED: {
            // NOTE: the main issue with this input mechanism, is that 
            // Shift + Click on some browsers will open a context menu that can't be detected. (or at least, I don't know how to detect it).
            // This can result in KEY_EVENT_RELEASED never being sent. 
            // The compromise made here is that we only ever have one of any key in these arrays.
            // The keys _may_ get stuck down, but if the user does the natural thing, press this key again,
            // it will get released, and all is good.

            if (s.pressed.indexOf(key) === -1) {
                s.pressed.push(key);
            }
        } break;
        case KEY_EVENT_REPEATED: {
            if (s.repeated.indexOf(key) === -1) {
                s.repeated.push(key);
            }
        } break;
        case KEY_EVENT_RELEASED: {
            filterInPlace(s.held, heldKey => heldKey !== key);
            if (s.released.indexOf(key) !== -1) {
                s.released.push(key);
            }
        } break;
        case KEY_EVENT_BLUR: {
            s.pressed.length = 0;
            s.released.length = 0;
            s.repeated.length = 0;
            s.held.length = 0;
        } break;
        case KEY_EVENT_NOTHING: {
        } break;
    }
}

function updateKeysStateInternal(
    keysState: KeysState,
    ev: number,
    key: string,
) {
    updatePressedSymbols(keysState.keys, ev, getNormalizedKey(key));
    updatePressedSymbols(keysState.letters, ev, key);
}

function updateKeysState(
    keysState: KeysState,
    keyDown: KeyboardEvent | null,
    keyUp: KeyboardEvent | null,
    blur: boolean,
) {
    let key = "";
    let ev = KEY_EVENT_NOTHING
    if (keyDown !== null) {
        key = keyDown.key;
        if (keyDown.repeat === true) {
            ev = KEY_EVENT_REPEATED;
        } else {
            ev = KEY_EVENT_PRESSED;
        }
    } else if (keyUp !== null) {
        key = keyUp.key;
        ev = KEY_EVENT_RELEASED;
    } else if (blur === true) {
        ev = KEY_EVENT_BLUR;
        key = "";
    } else {
        ev = KEY_EVENT_NOTHING;
        key = "";
    }

    updateKeysStateInternal(keysState, ev, key);

    if (key === "Control" || key === "Meta") {
        updateKeysStateInternal(keysState, ev, "Modifier");
    }
}

function isKeyPressed(keysState: KeyboardState, key: NormalizedKey): boolean {
    const keys = keysState.keys.keys;
    for (let i = 0; i < keys.pressed.length; i++) {
        if (keys.pressed[i] === key) return true;
    }
    return false;
}

function isKeyRepeated(keysState: KeyboardState, key: NormalizedKey): boolean {
    const keys = keysState.keys.keys;
    for (let i = 0; i < keys.repeated.length; i++) {
        if (keys.repeated[i] === key) return true;
    }
    return false;
}

function isKeyPressedOrRepeated(keysState: KeyboardState, key: NormalizedKey): boolean {
    if (isKeyPressed(keysState, key)) return true;
    if (isKeyRepeated(keysState, key)) return true;
    return false;
}

function isKeyReleased(keysState: KeyboardState, key: NormalizedKey): boolean {
    const keys = keysState.keys.keys;
    for (let i = 0; i < keys.released.length; i++) {
        if (keys.released[i] === key) return true;
    }
    return false;
}

function isKeyHeld(keysState: KeyboardState, key: NormalizedKey): boolean {
    const keys = keysState.keys.keys;
    for (let i = 0; i < keys.held.length; i++) {
        if (keys.held[i] === key) return true;
    }
    return false;
}


function isLetterPressed(keysState: KeyboardState, letter: string): boolean {
    const letters = keysState.keys.letters;
    for (let i = 0; i < letters.pressed.length; i++) {
        if (letters.pressed[i] === letter) return true;
    }
    return false;
}

function isLetterRepeated(keysState: KeyboardState, letter: string): boolean {
    const letters = keysState.keys.letters;
    for (let i = 0; i < letters.repeated.length; i++) {
        if (letters.repeated[i] === letter) return true;
    }
    return false;
}

function isLetterPressedOrRepeated(keysState: KeyboardState, letter: string): boolean {
    if (isLetterPressed(keysState, letter)) return true;
    if (isLetterRepeated(keysState, letter)) return true;
    return false;
}

function isLetterReleased(keysState: KeyboardState, letter: string): boolean {
    const letters = keysState.keys.letters;
    for (let i = 0; i < letters.released.length; i++) {
        if (letters.released[i] === letter) return true;
    }
    return false;
}

function isLetterHeld(keysState: KeyboardState, letter: string): boolean {
    const letters = keysState.keys.letters;
    for (let i = 0; i < letters.held.length; i++) {
        if (letters.held[i] === letter) return true;
    }
    return false;
}



/** HTML elements */
export const el = {
    A: { val: "a" },
    ABBR: { val: "abbr" },
    ADDRESS: { val: "address" },
    AREA: { val: "area" },
    ARTICLE: { val: "article" },
    ASIDE: { val: "aside" },
    AUDIO: { val: "audio" },
    B: { val: "b" },
    BASE: { val: "base" },
    BDI: { val: "bdi" },
    BDO: { val: "bdo" },
    BLOCKQUOTE: { val: "blockquote" },
    BODY: { val: "body" },
    BR: { val: "br" },
    BUTTON: { val: "button" },
    CANVAS: { val: "canvas" },
    CAPTION: { val: "caption" },
    CITE: { val: "cite" },
    CODE: { val: "code" },
    COL: { val: "col" },
    COLGROUP: { val: "colgroup" },
    DATA: { val: "data" },
    DATALIST: { val: "datalist" },
    DD: { val: "dd" },
    DEL: { val: "del" },
    DETAILS: { val: "details" },
    DFN: { val: "dfn" },
    DIALOG: { val: "dialog" },
    DIV: { val: "div" },
    DL: { val: "dl" },
    DT: { val: "dt" },
    EM: { val: "em" },
    EMBED: { val: "embed" },
    FIELDSET: { val: "fieldset" },
    FIGCAPTION: { val: "figcaption" },
    FIGURE: { val: "figure" },
    FOOTER: { val: "footer" },
    FORM: { val: "form" },
    H1: { val: "h1" },
    H2: { val: "h2" },
    H3: { val: "h3" },
    H4: { val: "h4" },
    H5: { val: "h5" },
    H6: { val: "h6" },
    HEAD: { val: "head" },
    HEADER: { val: "header" },
    HGROUP: { val: "hgroup" },
    HR: { val: "hr" },
    HTML: { val: "html" },
    I: { val: "i" },
    IFRAME: { val: "iframe" },
    IMG: { val: "img" },
    INPUT: { val: "input" },
    INS: { val: "ins" },
    KBD: { val: "kbd" },
    LABEL: { val: "label" },
    LEGEND: { val: "legend" },
    LI: { val: "li" },
    LINK: { val: "link" },
    MAIN: { val: "main" },
    MAP: { val: "map" },
    MARK: { val: "mark" },
    MENU: { val: "menu" },
    META: { val: "meta" },
    METER: { val: "meter" },
    NAV: { val: "nav" },
    NOSCRIPT: { val: "noscript" },
    OBJECT: { val: "object" },
    OL: { val: "ol" },
    OPTGROUP: { val: "optgroup" },
    OPTION: { val: "option" },
    OUTPUT: { val: "output" },
    P: { val: "p" },
    PICTURE: { val: "picture" },
    PRE: { val: "pre" },
    PROGRESS: { val: "progress" },
    Q: { val: "q" },
    RP: { val: "rp" },
    RT: { val: "rt" },
    RUBY: { val: "ruby" },
    S: { val: "s" },
    SAMP: { val: "samp" },
    SCRIPT: { val: "script" },
    SEARCH: { val: "search" },
    SECTION: { val: "section" },
    SELECT: { val: "select" },
    SLOT: { val: "slot" },
    SMALL: { val: "small" },
    SOURCE: { val: "source" },
    SPAN: { val: "span" },
    STRONG: { val: "strong" },
    STYLE: { val: "style" },
    SUB: { val: "sub" },
    SUMMARY: { val: "summary" },
    SUP: { val: "sup" },
    TABLE: { val: "table" },
    TBODY: { val: "tbody" },
    TD: { val: "td" },
    TEMPLATE: { val: "template" },
    TEXTAREA: { val: "textarea" },
    TFOOT: { val: "tfoot" },
    TH: { val: "th" },
    THEAD: { val: "thead" },
    TIME: { val: "time" },
    TITLE: { val: "title" },
    TR: { val: "tr" },
    TRACK: { val: "track" },
    U: { val: "u" },
    UL: { val: "ul" },
    VAR: { val: "var" },
    VIDEO: { val: "video" },
    WBR: { val: "wbr" },
} as const;

/** Keyboard keys */
export const key = {
    // 1 to 9,0 - main numbers
    A1: getNormalizedKey("1"),
    A2: getNormalizedKey("2"),
    A3: getNormalizedKey("3"),
    A4: getNormalizedKey("4"),
    A5: getNormalizedKey("5"),
    A6: getNormalizedKey("6"),
    A7: getNormalizedKey("7"),
    A8: getNormalizedKey("8"),
    A9: getNormalizedKey("9"),
    A0: getNormalizedKey("0"),
    MINUS: getNormalizedKey("-"),
    EQUALS: getNormalizedKey("="),

    Q: getNormalizedKey("Q"),
    W: getNormalizedKey("W"),
    E: getNormalizedKey("E"),
    R: getNormalizedKey("R"),
    T: getNormalizedKey("T"),
    Y: getNormalizedKey("Y"),
    U: getNormalizedKey("U"),
    I: getNormalizedKey("I"),
    O: getNormalizedKey("O"),
    P: getNormalizedKey("P"),
    OPEN_BRACKET: getNormalizedKey("["),
    CLOSE_BRACKET: getNormalizedKey("]"),
    BACKSLASH: getNormalizedKey("\\"),

    A: getNormalizedKey("A"),
    S: getNormalizedKey("S"),
    D: getNormalizedKey("D"),
    F: getNormalizedKey("F"),
    G: getNormalizedKey("G"),
    H: getNormalizedKey("H"),
    J: getNormalizedKey("J"),
    K: getNormalizedKey("K"),
    L: getNormalizedKey("L"),
    SEMICOLON: getNormalizedKey(","),
    QUOTE: getNormalizedKey("'"),
    ENTER: getNormalizedKey("Enter"),

    Z: getNormalizedKey("Z"),
    X: getNormalizedKey("X"),
    C: getNormalizedKey("C"),
    V: getNormalizedKey("V"),
    B: getNormalizedKey("B"),
    N: getNormalizedKey("N"),
    M: getNormalizedKey("M"),
    COMMA: getNormalizedKey(","),
    PERIOD: getNormalizedKey("."),
    FORWAR_SLASH: getNormalizedKey("/"),

    SHIFT: getNormalizedKey("Shift"),
    CTRL: getNormalizedKey("Control"),
    META: getNormalizedKey("Meta"),
    ALT: getNormalizedKey("Alt"),
    MOD: getNormalizedKey("Modifier"), // Either CTRL or META

    SPACE: getNormalizedKey(" "),
    BACKSPACE: getNormalizedKey("Backspace"),
    ARROW_UP: getNormalizedKey("ArrowUp"),
    ARROW_DOWN: getNormalizedKey("ArrowDown"),
    ARROW_LEFT: getNormalizedKey("ArrowLeft"),
    ARROW_RIGHT: getNormalizedKey("ArrowRight"),
} as const;
export const KEY = key;

/** Events (the most common ones, at least) */
export const ev = {
    ABORT: { val: "abort" },
    ANIMATIONCANCEL: { val: "animationcancel" },
    ANIMATIONEND: { val: "animationend" },
    ANIMATIONITERATION: { val: "animationiteration" },
    ANIMATIONSTART: { val: "animationstart" },
    AUXCLICK: { val: "auxclick" },
    BEFOREINPUT: { val: "beforeinput" },
    BEFORETOGGLE: { val: "beforetoggle" },
    BLUR: { val: "blur" },
    CANCEL: { val: "cancel" },
    CANPLAY: { val: "canplay" },
    CANPLAYTHROUGH: { val: "canplaythrough" },
    CHANGE: { val: "change" },
    CLICK: { val: "click" },
    CLOSE: { val: "close" },
    COMPOSITIONEND: { val: "compositionend" },
    COMPOSITIONSTART: { val: "compositionstart" },
    COMPOSITIONUPDATE: { val: "compositionupdate" },
    CONTEXTLOST: { val: "contextlost" },
    CONTEXTMENU: { val: "contextmenu" },
    CONTEXTRESTORED: { val: "contextrestored" },
    COPY: { val: "copy" },
    CUECHANGE: { val: "cuechange" },
    CUT: { val: "cut" },
    DBLCLICK: { val: "dblclick" },
    DRAG: { val: "drag" },
    DRAGEND: { val: "dragend" },
    DRAGENTER: { val: "dragenter" },
    DRAGLEAVE: { val: "dragleave" },
    DRAGOVER: { val: "dragover" },
    DRAGSTART: { val: "dragstart" },
    DROP: { val: "drop" },
    DURATIONCHANGE: { val: "durationchange" },
    EMPTIED: { val: "emptied" },
    ENDED: { val: "ended" },
    ERROR: { val: "error" },
    FOCUS: { val: "focus" },
    FOCUSIN: { val: "focusin" },
    FOCUSOUT: { val: "focusout" },
    FORMDATA: { val: "formdata" },
    GOTPOINTERCAPTURE: { val: "gotpointercapture" },
    INPUT: { val: "input" },
    INVALID: { val: "invalid" },
    /** 
     * NOTE: You may want to use {@link getGlobalEventSystem}.keyboard instead of this 
     * TODO: fix
     **/
    KEYDOWN: { val: "keydown" },
    KEYPRESS: { val: "keypress" },
    /** 
     * NOTE: You may want to use {@link getGlobalEventSystem}.keyboard instead of this 
     * TODO: fix
     **/
    KEYUP: { val: "keyup" },
    LOAD: { val: "load" },
    LOADEDDATA: { val: "loadeddata" },
    LOADEDMETADATA: { val: "loadedmetadata" },
    LOADSTART: { val: "loadstart" },
    LOSTPOINTERCAPTURE: { val: "lostpointercapture" },
    MOUSEDOWN: { val: "mousedown" },
    MOUSEENTER: { val: "mouseenter" },
    MOUSELEAVE: { val: "mouseleave" },
    MOUSEMOVE: { val: "mousemove" },
    MOUSEOUT: { val: "mouseout" },
    MOUSEOVER: { val: "mouseover" },
    MOUSEUP: { val: "mouseup" },
    PASTE: { val: "paste" },
    PAUSE: { val: "pause" },
    PLAY: { val: "play" },
    PLAYING: { val: "playing" },
    POINTERCANCEL: { val: "pointercancel" },
    POINTERDOWN: { val: "pointerdown" },
    POINTERENTER: { val: "pointerenter" },
    POINTERLEAVE: { val: "pointerleave" },
    POINTERMOVE: { val: "pointermove" },
    POINTEROUT: { val: "pointerout" },
    POINTEROVER: { val: "pointerover" },
    POINTERUP: { val: "pointerup" },
    PROGRESS: { val: "progress" },
    RATECHANGE: { val: "ratechange" },
    RESET: { val: "reset" },
    RESIZE: { val: "resize" },
    SCROLL: { val: "scroll" },
    SCROLLEND: { val: "scrollend" },
    SECURITYPOLICYVIOLATION: { val: "securitypolicyviolation" },
    SEEKED: { val: "seeked" },
    SEEKING: { val: "seeking" },
    SELECT: { val: "select" },
    SELECTIONCHANGE: { val: "selectionchange" },
    SELECTSTART: { val: "selectstart" },
    SLOTCHANGE: { val: "slotchange" },
    STALLED: { val: "stalled" },
    SUBMIT: { val: "submit" },
    SUSPEND: { val: "suspend" },
    TIMEUPDATE: { val: "timeupdate" },
    TOGGLE: { val: "toggle" },
    TOUCHCANCEL: { val: "touchcancel" },
    TOUCHEND: { val: "touchend" },
    TOUCHMOVE: { val: "touchmove" },
    TOUCHSTART: { val: "touchstart" },
    TRANSITIONCANCEL: { val: "transitioncancel" },
    TRANSITIONEND: { val: "transitionend" },
    TRANSITIONRUN: { val: "transitionrun" },
    TRANSITIONSTART: { val: "transitionstart" },
    VOLUMECHANGE: { val: "volumechange" },
    WAITING: { val: "waiting" },
    WEBKITANIMATIONEND: { val: "webkitanimationend" },
    WEBKITANIMATIONITERATION: { val: "webkitanimationiteration" },
    WEBKITANIMATIONSTART: { val: "webkitanimationstart" },
    WEBKITTRANSITIONEND: { val: "webkittransitionend" },
    WHEEL: { val: "wheel" },
    FULLSCREENCHANGE: { val: "fullscreenchange" },
    FULLSCREENERROR: { val: "fullscreenerror" },
} as const;
export const EV = ev;


/** HTML svg elements */
export const elsvg = {
    A: { val: "a" }, // Yep, its actually an SVG
    ANIMATE: { val: "animate" },
    ANIMATEMOTION: { val: "animateMotion" },
    ANIMATETRANSFORM: { val: "animateTransform" },
    CIRCLE: { val: "circle" },
    CLIPPATH: { val: "clipPath" },
    DEFS: { val: "defs" },
    DESC: { val: "desc" },
    ELLIPSE: { val: "ellipse" },
    FEBLEND: { val: "feBlend" },
    FECOLORMATRIX: { val: "feColorMatrix" },
    FECOMPONENTTRANSFER: { val: "feComponentTransfer" },
    FECOMPOSITE: { val: "feComposite" },
    FECONVOLVEMATRIX: { val: "feConvolveMatrix" },
    FEDIFFUSELIGHTING: { val: "feDiffuseLighting" },
    FEDISPLACEMENTMAP: { val: "feDisplacementMap" },
    FEDISTANTLIGHT: { val: "feDistantLight" },
    FEDROPSHADOW: { val: "feDropShadow" },
    FEFLOOD: { val: "feFlood" },
    FEFUNCA: { val: "feFuncA" },
    FEFUNCB: { val: "feFuncB" },
    FEFUNCG: { val: "feFuncG" },
    FEFUNCR: { val: "feFuncR" },
    FEGAUSSIANBLUR: { val: "feGaussianBlur" },
    FEIMAGE: { val: "feImage" },
    FEMERGE: { val: "feMerge" },
    FEMERGENODE: { val: "feMergeNode" },
    FEMORPHOLOGY: { val: "feMorphology" },
    FEOFFSET: { val: "feOffset" },
    FEPOINTLIGHT: { val: "fePointLight" },
    FESPECULARLIGHTING: { val: "feSpecularLighting" },
    FESPOTLIGHT: { val: "feSpotLight" },
    FETILE: { val: "feTile" },
    FETURBULENCE: { val: "feTurbulence" },
    FILTER: { val: "filter" },
    FOREIGNOBJECT: { val: "foreignObject" },
    G: { val: "g" },
    IMAGE: { val: "image" },
    LINE: { val: "line" },
    LINEARGRADIENT: { val: "linearGradient" },
    MARKER: { val: "marker" },
    MASK: { val: "mask" },
    METADATA: { val: "metadata" },
    MPATH: { val: "mpath" },
    PATH: { val: "path" },
    PATTERN: { val: "pattern" },
    POLYGON: { val: "polygon" },
    POLYLINE: { val: "polyline" },
    RADIALGRADIENT: { val: "radialGradient" },
    RECT: { val: "rect" },
    SCRIPT: { val: "script" },
    SET: { val: "set" },
    STOP: { val: "stop" },
    STYLE: { val: "style" },
    /**
     * For larger svg-based components with lots of moving parts, 
     * consider {@link SvgContext}, or creating something on your end that is similar.
     */
    SVG: { val: "svg" },
    SWITCH: { val: "switch" },
    SYMBOL: { val: "symbol" },
    TEXT: { val: "text" },
    TEXTPATH: { val: "textPath" },
    TITLE: { val: "title" },
    TSPAN: { val: "tspan" },
    USE: { val: "use" },
    VIEW: { val: "view" },
} as const;
export const ELSVG = elsvg;

export const imdom = {
    /** Internal methods */
    newDomAppender,  // This is the typeId of a Dom Appender.
    getAppender,     // Gets the current DOM appender. Very useful for utils
    getElement,      // Short for getAppender().root

    /** Begin DOM root. Required before any calls to {@link imdom.ElBegin} */
    RootBegin: imRootBegin, RootEnd: imRootEnd,

    /** DOM-node creation */

    ElBegin:    imElBegin,    ElEnd: imElEnd,          // DOM nodes
    ElSvgBegin: imElSvgBegin, ElSvgEnd: imElSvgEnd,    // SVG Dom nodes (technically different :nerd-emoji:)
    Str:    imStr,       // Text node
    StrFmt: imStrFmt,    // Text node, custom formatter for arbitrary object. Try to make formatter a constant! Otherwise, expect terrible performance
    Text:   imStr,
    TextFmt: imStrFmt,

    /** 
     * These methods allow re-pushing a node we created somewhere else in the DOM to the immediate-mode stack.
     * You can now append more things under that node from here. Useful in certain specific situations. 
     * Not useful without FinalizeDeferred. Although maybe there should be the option to explicitly finalize the node yourself, instead of having
     * deferred finalization at all...
     **/
    RootExistingBegin: imRootExistingBegin,
    RootExistingEnd:   imRootExistingEnd,
    FinalizeDeferred:  imFinalizeDeferred,
    FINALIZE_IMMEDIATELY,
    FINALIZE_DEFERRED,

    /** Setting properties on DOM node */
    setStyle,
    setClass,
    setAttr,
    setTextUnsafe, // Don't call this on an element that has non-text children! You'll delete them.

    /** Utility hooks */
    On:                            imOn, // Wrapper for .addEventListener. No, there is no corresponding Off - it doesn't make sense here
    TrackSize:                     imTrackSize,          // Wrapper for ResizeObserver. Not comprehensive
    TrackVisibility:               imTrackVisibility,    // Wrapper for IntersectionObserver. Not comprehensive
    PreventScrollEventPropagation: imPreventScrollEventPropagation, // Allows you to block the default scrolling action, and use the scroll delta for yourself. Probably didn't need to write this method actually

    /** Global event system */

    // These must be called at the root of the program for the global event system to work
    GlobalEventSystemBegin: imGlobalEventSystemBegin, GlobalEventSystemEnd: imGlobalEventSystemEnd, 

    getMouse,
    getKeyboard,
    getBlur,
    hasMousePress,
    hasMouseUp,
    hasMouseClick,
    hasMouseOver,
    isKeyPressed, isKeyRepeated, isKeyPressedOrRepeated, isKeyReleased, isKeyHeld,
    isLetterPressed, isLetterRepeated, isLetterPressedOrRepeated, isLetterReleased, isLetterHeld,

    /** Global event system - internal methods */
    newImGlobalEventSystem,
    newKeysState,
    getNormalizedKey,
} as const;
