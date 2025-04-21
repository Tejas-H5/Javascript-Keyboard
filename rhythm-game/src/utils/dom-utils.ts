// DOM-utils v0.1.21 - @Tejas-H5

//////////
// initialize the 'framework'

export function initializeDomUtils(root: Insertable, {
    errorHandler = defaultErrorHandler,
}: {
    errorHandler?: DomUtilsErrorHandler;
} = {}) {
    // Insert some CSS styles that this framework uses for error handling and debugging.

    domUtilsGlobalErrorHandler = errorHandler;

    if (stlyeStringBuilder.length > 0) {
        const text = stlyeStringBuilder.join("");
        stlyeStringBuilder.length = 0;

        const styleNode = el<HTMLStyleElement>("style", { type: "text/css" }, "\n\n" + text + "\n\n");
        appendChild(root, styleNode);
    }
}

export type DomUtilsErrorHandler = (c: DomUtilsErrorContext) => void;
export type DomUtilsErrorContext = {
    isError: boolean;
    err: Error | undefined;
    message: string | undefined;
    componentName: string | undefined;
    root: Component<any, ValidElement>;
    avoidErrorHandler: boolean;

    // The default handler uses this to avoid clearing the error class over and over again, but 
    // you can use this however you want when you override the error handler
    _hasErrorClass: boolean;
};

export const defaultErrorHandler : DomUtilsErrorHandler = (c: DomUtilsErrorContext) => {
    if (c.avoidErrorHandler) {
        return;
    }

    if (!c.isError) {
        if (!c._hasErrorClass) {
            return;
        }

        c._hasErrorClass = false;
        c.root.el.style.removeProperty("--error-text");
        setClass(c.root, "catastrophic---error", false);
        return;
    }

    setClass(c.root, "catastrophic---error", true);
    c._hasErrorClass = true;

    // We could include the actual error message here if we wanted to. But I'm not sure that's a good idea.
    // Also if we want to do that, we need to remove the guard at the top there
    const message = `An error occured while updating the ${c.componentName ?? "???"} component`;
    const fullMessage = `${message}. You've found a bug!`;
    c.root.el.style.setProperty("--error-text", JSON.stringify(fullMessage));

    console.error(fullMessage, c);

    return;
}

let domUtilsGlobalErrorHandler = defaultErrorHandler;

//////////
// Styling API - this actually needs to happen before the framework is initialized, so it's been moved to the top.

const stlyeStringBuilder: string[] = [];
const allClassNames = new Set<string>();

/**
 * A util allowing components to register styles that they need to an inline stylesheet.
 * All styles in the entire bundle are string-built and appended in a `<style />` node as soon as
 * dom-utils is initialized. See {@link initializeDomUtils}
 *
 * The object approach allows us to add a prefix to all the class names we make.
 */
export function newCssBuilder(prefix: string = "") {
    return {
        /** Appends a CSS style to the builder. The prefix is not used. */
        s(string: string) {
            stlyeStringBuilder.push(string);
        },
        /** Returns `prefix + className`. Throws if it somehow clashes with an existing class someone else made. */
        newClassName(className: string) {
            let name = prefix + className;
            if (allClassNames.has(name)) {
                throw new Error("We've already made a class with this name: " + name + " - consider adding a prefix");
            }
            allClassNames.add(name);
            return name;
        },
        // makes a new class, it's variants, and returns the class name
        cn(className: string, styles: string[] | string): string {
            const name = this.newClassName(className);

            for (let style of styles) {
                const finalStyle = `.${name}${style}`;
                stlyeStringBuilder.push(finalStyle + "\n");
            }

            return name;
        },
    };
}


const sb = newCssBuilder();

sb.s(`
.catastrophic---error > * { display: none !important; }
.catastrophic---error::before {
    content: var(--error-text);
    text-align: center;
}
.debug { border: 1px solid red; }
`);

const cnHoverParent = sb.newClassName("hoverParent");
const cnHoverTarget = sb.newClassName("hoverTarget");
const cnHoverTargetInverse = sb.newClassName("hoverTargetInverse");

sb.s(`
.${cnHoverParent} .${cnHoverTarget} { display: none !important; }
.${cnHoverParent} .${cnHoverTargetInverse} { display: inherit !important; }
.${cnHoverParent}:hover .${cnHoverTarget}  { display: inherit !important; }
.${cnHoverParent}:hover .${cnHoverTargetInverse}  { display: none !important; }
`);

// Here are some common classes that are used so often that I've just put them into dom-utils.
// Shared UI components also don't need to depend on app-specific styles if those styles just come with their UI framework.
export const cn = Object.freeze({
    row: sb.cn("row", [` { display: flex; flex-direction: row; }`]),
    col: sb.cn("col", [` { display: flex; flex-direction: column; }`]),
    flexWrap: sb.cn("flexWrap", [` { display: flex; flex-flow: wrap; }`]),

    /** The min-width and min-height here is the secret sauce. Now the flex containers won't keep overflowing lmao */
    flex1: sb.cn("flex1", [` { flex: 1; min-width: 0; min-height: 0; }`]),

    alignItemsCenter: sb.cn("alignItemsCenter", [` { align-items: center; }`]),
    justifyContentLeft: sb.cn("justifyContentLeft", [` { justify-content: left; }`]),
    justifyContentRight: sb.cn("justifyContentRight", [` { justify-content: right; }`]),
    justifyContentCenter: sb.cn("justifyContentCenter", [` { justify-content: center; }`]),
    justifyContentStart: sb.cn("justifyContentStart", [` { justify-content: start; }`]),
    justifyContentEnd: sb.cn("justifyContentEnd", [` { justify-content: end; }`]),
    alignItemsEnd: sb.cn("alignItemsEnd", [` { align-items: flex-end; }`]),
    alignItemsStart: sb.cn("alignItemsStart", [` { align-items: flex-start; }`]),
    alignItemsStretch: sb.cn("alignItemsStretch", [` { align-items: stretch; }`]),

    /** positioning */
    fixed: sb.cn("fixed", [` { position: fixed; }`]),
    sticky: sb.cn("sticky", [` { position: sticky; }`]),
    absolute: sb.cn("absolute", [` { position: absolute; }`]),
    relative: sb.cn("relative", [` { position: relative; }`]),
    absoluteFill: sb.cn("absoluteFill", [` { position: absolute; top: 0; right: 0; left: 0; bottom: 0; width: 100%; height: 100%; }`]),
    borderBox: sb.cn("borderBox", [` { box-sizing: border-box; }`]),

    /** displays */

    inlineBlock: sb.cn("inlineBlock", [` { display: inline-block; }`]),
    inline: sb.cn("inline", [` { display: inline; }`]),
    flex: sb.cn("flex", [` { display: flex; }`]),
    pointerEventsNone: sb.cn("pointerEventsNone", [` { pointer-events: none; }`]),
    pointerEventsAll: sb.cn("pointerEventsAll", [` { pointer-events: all; }`]),

    table: sb.cn("table", [` { display: table; }`]),
    tableRow: sb.cn("tableRow", [` { display: table-row; }`]),
    tableCell: sb.cn("tableCell", [` { display: table-cell; }`]),

    /** we have React.Fragment at home */
    contents: sb.cn("contents", [` { display: contents; }`]),

    /** text and text layouting */

    textAlignCenter: sb.cn("textAlignCenter", [` { text-align: center; }`]),
    textAlignRight: sb.cn("textAlignRight", [` { text-align: right; }`]),
    textAlignLeft: sb.cn("textAlignLeft", [` { text-align: left; }`]),
    pre: sb.cn("pre", [` { white-space: pre; }`]),
    preWrap: sb.cn("preWrap", [` { white-space: pre-wrap; }`]),
    noWrap: sb.cn("noWrap", [` { white-space: nowrap; }`]),
    handleLongWords: sb.cn("handleLongWords", [` { overflow-wrap: anywhere; word-break: normal; }`]),
    strikethrough: sb.cn("strikethrough", [` { text-decoration: line-through; text-decoration-color: currentColor; }`]),

    /** common spacings */

    w100: sb.cn("w100", [` { width: 100%; }`]),
    mw100: sb.cn("mw100", [` { max-width: 100%; }`]),
    h100: sb.cn("h100", [` { height: 100%; }`]),
    mh100: sb.cn("mh100", [` { max-height: 100%; }`]),
    
    wFitContent: sb.cn("wFitContent", [` { width: fit-content; }`]),
    hFitContent: sb.cn("hFitContent", [` { height: fit-content; }`]),

    /** overflow management */

    overflowXAuto: sb.cn("overflowXAuto", [` { overflow-x: auto; }`]),
    overflowYAuto: sb.cn("overflowYAuto", [` { overflow-y: auto; }`]),
    overflowAuto: sb.cn("overflowAuto", [` { overflow: auto; }`]),
    overflowHidden: sb.cn("overflowHidden", [` { overflow: hidden; }`]),

    /** hover utils */
    hoverParent: cnHoverParent,
    hoverTarget: cnHoverTarget,
    hoverTargetInverse: cnHoverTargetInverse,

    /** debug utils */
    debug1pxSolidRed: sb.cn("debug1pxSolidRed", [` { border: 1px solid red; }`]),
});

export function setCssVars(vars: Record<string, string | Color>, cssRoot?: HTMLElement) {
    if (!cssRoot) {
        cssRoot = document.querySelector(":root") as HTMLElement;
    }

    for (const k in vars) {
        setCssVar(cssRoot, k, vars[k]);
    }
}

export function setCssVar(cssRoot: HTMLElement, varName: string, value: string | Color) {
    const fullVarName = `--${varName}`;
    cssRoot.style.setProperty(fullVarName, "" + value);
}

export type Color = {
    r: number; g: number; b: number; a: number;
    toCssString(): string;
    toString(): string;
}

export function newColor(r: number, g: number, b: number, a: number): Color {
    return {
        r, g, b, a,
        toCssString() {
            const { r, g, b, a} = this;
            return `rgba(${Math.floor(r * 255)}, ${Math.floor(g * 255)}, ${Math.floor(b * 255)}, ${a})`;
        },
        toString() {
            return this.toCssString();
        },
    };
}

export function newColorFromHex(hex: string): Color {
    if (hex.startsWith("#")) {
        hex = hex.substring(1);
    }

    if (hex.length === 3 || hex.length === 4) {
        const r = hex[0];
        const g = hex[1];
        const b = hex[2];
        const a = hex[3] as string | undefined;

        return newColor(
            parseInt("0x" + r + r) / 255,
            parseInt("0x" + g + g) / 255,
            parseInt("0x" + b + b) / 255,
            a ? parseInt("0x" + a + a) / 255 : 1,
        );
    }

    if (hex.length === 6 || hex.length === 8) {
        const r = hex.substring(0, 2);
        const g = hex.substring(2, 4);
        const b = hex.substring(4, 6);
        const a = hex.substring(6);

        return newColor( 
            parseInt("0x" + r) / 255,
            parseInt("0x" + g) / 255,
            parseInt("0x" + b)/ 255,
            a ? parseInt("0x" + a) / 255 : 1,
        );
    }

    throw new Error("invalid hex: " + hex);
}

/**
 * Taken from https://gist.github.com/mjackson/5311256
 */
export function newColorFromHsv(h: number, s: number, v: number): Color {
    let r = 0, g = 0, b = 0;

    if (s === 0) {
        r = g = b = v; // achromatic
        return newColor(r, g, b, 1);
    }

    function hue2rgb(p: number, q: number, t: number) {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
    }

    var q = v < 0.5 ? v * (1 + s) : v + s - v * s;
    var p = 2 * v - q;

    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);

    return newColor(r, g, b, 1);
}

function lerp(a: number, b: number, factor: number) {
    if (factor < 0) {
        return a;
    }

    if (factor > 1) {
        return b;
    }

    return a + (b - a) * factor;
}

/**
 * NOTE to self: try to use a CSS transition on the colour style before you reach for this!
 **/
export function lerpColor(c1: Color, c2: Color, factor: number, dst: Color) {
    dst.r = lerp(c1.r, c2.r, factor);
    dst.g = lerp(c1.g, c2.g, factor);
    dst.b = lerp(c1.b, c2.b, factor);
    dst.a = lerp(c1.a, c2.a, factor);
}

//////////
// DOM node and Insertable<T> creation

export type ValidElement = HTMLElement | SVGElement;
export interface Insertable<T extends ValidElement = HTMLElement> {
    el: T;
    _isHidden: number;
};

export function newInsertable<T extends ValidElement>(el: T): Insertable<T> {
    return { el, _isHidden: -1 };
}

/**
 * Creates an HTML element with the given attributes, and adds chldren.
 * NOTE: For svg elements, you'll need to use `elSvg`
 */
export function el<T extends HTMLElement>(
    type: string,
    attrs?: Attrs,
    children?: DomUtilsChildrenOrChild<T>,
): Insertable<T> {
    const element = document.createElement(type) as T;
    return elInternal(element, attrs, children);
}

function elInternal<T extends ValidElement>(
    element: T,
    attrs?: Attrs,
    children?: DomUtilsChildrenOrChild<T>,
): Insertable<T> {
    const insertable = newInsertable<T>(element);

    if (attrs) {
        setAttrs(insertable, attrs);
    }

    if (children) {
        addChildren(insertable, children);
    }

    return insertable;
}

/**
 * Used to create svg elements, since {@link el} won't work for those.
 * {@link type} needs to be lowercase for this to work as well.
 *
 * Hint: the `g` element can be used to group SVG elements under 1 DOM node. It's basically the `div` of the SVG world, and
 * defers me from having to implement something like React fragments for 1 more day...
 */
export function elSvg<T extends SVGElement>(type: string, attrs?: Attrs, children?: DomUtilsChildrenOrChild<T>) {
    const xmlNamespace = "http://www.w3.org/2000/svg";
    const svgEl = document.createElementNS(xmlNamespace, type) as T;
    if (type === "svg") {
        // Took this from https://stackoverflow.com/questions/8215021/create-svg-tag-with-javascript
        // Not sure if actually needed
        svgEl.setAttributeNS("http://www.w3.org/2000/xmlns/", "xmlns:xlink", "http://www.w3.org/1999/xlink");
        svgEl.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    }
    return elInternal<T>(svgEl, attrs, children);
}


/**
 * Creates a div, gives it some attributes, and then appends some children. 
 * It was so common to use el("div", ... that I've just made this it's own method.
 *
 * I use this instead of {@link el} 90% of the time
 *
 * NOTE: For svg elements, you'll need to use `elSvg`
 */
export function div(attrs?: Attrs, children?: DomUtilsChildrenOrChild<HTMLDivElement>) {
    return el<HTMLDivElement>("DIV", attrs, children);
}

export function contentsDiv(attrs?: Attrs, children?: DomUtilsChildrenOrChild<HTMLDivElement>) {
    return div({ ...attrs, style: (attrs?.style ?? "") + ";display: contents !important;" }, children);
}

export function span(attrs?: Attrs, children?: DomUtilsChildrenOrChild<HTMLSpanElement>) {
    return el<HTMLSpanElement>("SPAN", attrs, children);
}

/**
 * A function passed as a 'child' will be invoked on the parent once when it's being constructed.
 * This function will have access to the current parent, so it may hook up various event handlers.
 * It may also return an Insertable, which can be useful in some scenarios.
 */
type Functionality<T extends ValidElement> = (parent: Insertable<T>) => void | Insertable<any>;
type InsertableInitializerListItem<T extends ValidElement> = Insertable<ValidElement> | string | false | Functionality<T>;
export type DomUtilsChildren<T extends ValidElement = HTMLElement> = InsertableInitializerListItem<T>[];
type DomUtilsChildrenOrChild<T extends ValidElement = HTMLElement> = DomUtilsChildren<T> | InsertableInitializerListItem<T>;

/** Use this to initialize an element's children later. Don't call it after a component has been rendered */
export function addChildren<T extends ValidElement>(
    ins: Insertable<T>, 
    children: DomUtilsChildrenOrChild<T>
): Insertable<T> {
    const element = ins.el;

    if (!Array.isArray(children)) {
        children = [children];
    }

    for (let c of children) {
        if (c === false) {
            continue;
        }

        if (typeof c === "function") {
            const res = c(ins);
            if (!res) {
                continue;
            }
            c = res;
        }

        if (typeof c === "string") {
            element.appendChild(document.createTextNode(c));
        } else {
            element.appendChild(c.el);
        }
    }

    return ins;
}

//////////
// DOM node child management

export type InsertableList = (Insertable<any> | undefined)[];

export function replaceChildren(comp: Insertable<any>, children: InsertableList) {
    replaceChildrenEl(comp.el, children);
};

/**
 * Attemps to replace all of the children under a component in such a way that
 * if comp.el.children[i] === children[i].el, no actions are performed.
 *
 * This way, the code path where no data has changed can remain reasonably performant
 */
export function replaceChildrenEl(el: Element, children: InsertableList) {
    let iToSet = 0;
    for (let i = 0; i < children.length; i++) {
        const child = children[i];
        if (!child) {
            continue;
        }

        setChildAtEl(el, child, iToSet);
        iToSet++;
    }

    while (el.children.length > iToSet) {
        el.children[el.children.length - 1].remove();
    }
}

/**
 * Appends {@link child} to the end of {@link mountPoints}'s child list. If it's already there, 
 * no actions are performed.
 */
export function appendChild(mountPoint: Insertable<any>, child: Insertable<any>) {
    const el = mountPoint.el;
    appendChildEl(el, child);
};

export function appendChildEl(mountPointEl: Element, child: Insertable<any>) {
    const children = mountPointEl.children;
    if (children.length > 0 && children[children.length - 1] === child.el) {
        // This has surprisingly been found to improve performance and actually do something.
        // Components that were previously flickering their scrollbar every reder no longer do so with this change.
        return;
    }

    mountPointEl.appendChild(child.el);
}

/**
 * Sets {@link mountPoint}'s ith child to {@link child}.
 * Does nothing if it's already there.
 */
export function setChildAt(mountPoint: Insertable<any>, i: number, child: Insertable<any>) {
    setChildAtEl(mountPoint.el, child, i);
}

export function setChildAtEl(mountPointEl: Element, child: Insertable<any>, i: number) {
    const children = mountPointEl.children;
    if (children[i] === child.el) {
        /** Same performance reasons as {@link appendChildEl} */
        return;
    }

    if (i === children.length) {
        appendChildEl(mountPointEl, child);
        return;
    }

    mountPointEl.replaceChild(child.el, children[i]);
}

/**
 * Removes {@link child} from {@link mountPoint}.
 * Will also assert that {@link mountPoint} is in fact the parent of {@link child}.
 *
 * NOTE: I've never used this method in practice, so there may be glaring flaws...
 */
export function removeChild(mountPoint: Insertable<any>, child: Insertable) {
    removeChildEl(mountPoint.el, child)
};

export function removeChildEl(mountPointEl: Element, child: Insertable) {
    const childParent = child.el.parentElement;
    if (!childParent) {
        return;
    }

    if (childParent !== mountPointEl) {
        throw new Error("This component is not attached to this parent");
    }

    child.el.remove();
}

/**
 * Clears all children under {@link mountPoint}.
 */
export function clearChildren(mountPoint: Insertable<any>) {
    mountPoint.el.replaceChildren();
};

//////////
// DOM node attribute management, and various seemingly random/arbitrary functions that actually end up being very useful

type StyleObject<U extends ValidElement> = (U extends HTMLElement ? keyof HTMLElement["style"] : keyof SVGElement["style"]);

/** 
 * Sets a style for a component. Does nothing if it is already the same style. 
 */
export function setStyle<U extends ValidElement, K extends StyleObject<U>>(root: Insertable<U>, val: K, style: U["style"][K]) {
    if (root.el.style[val] !== style) {
        /** Same performance reasons as {@link setClass} */
        root.el.style[val] = style;
    }
}

/** 
 * Enables/disables a class on a component. Does nothing if already enabled/disabled.
 */
export function setClass<T extends ValidElement>(component: Insertable<T>, cssClass: string, state: boolean): boolean {
    const contains = component.el.classList.contains(cssClass);
    if (state === contains) {
        // This was profiled and found to provide a noticeable performance gain at the time of writing it.
        // However, it may be ever-so-slightly faster to memoize the `state` argument on your end and set this directly.
        return state;
    }

    if (state) {
        component.el.classList.add(cssClass);
    } else {
        component.el.classList.remove(cssClass);
    }

    return state;
};

/**
 * Since it is so common to do, this is a util to set the display of a component to "None".
 * Also does some type narrowing.
 */
export function setVisible<U extends ValidElement, T>(
    component: Insertable<U>, 
    visibleState: T | null | undefined | false | "" | 0
): visibleState is T {
    const hiddenState = visibleState ? 0 : 1;
    if (component._isHidden === hiddenState) {
        return !!visibleState;
    }

    component._isHidden = hiddenState;
    if (visibleState) {
        component.el.style.setProperty("display", "", "")
    } else {
        component.el.style.setProperty("display", "none", "important")
    }
    return !!visibleState;
}

/** 
 * This jQuery code is taken from: https://stackoverflow.com/questions/19669786/check-if-element-is-visible-in-dom
 * This method is mainly used in gobal event handlers to early-return when a UI component isn't visble yet, so
 * it will also return false if the component hasn't been rendered for the first time. 
 */
export function isVisible(component: Component<unknown, HTMLElement> | Insertable<HTMLElement>): boolean {
    if (wasHiddenOrUninserted(component)) {
        // if _isHidden is set, then the component is guaranteed to be hidden via CSS, assuming
        // that we are only showing/hiding elements using `setVisible`
        return true;
    }

    // If _isHidden is false, we need to perform additional checking to determine if a component is visible or not.
    // This is why we don't call isVisible to disable rendering when a component is hidden.

    if ("s" in component && component._s === undefined) {
        // Not visible if no state is present.
        return false;
    }

    return isVisibleEl(component.el);
}

export function isVisibleEl(el: HTMLElement) {
    return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
}

/** 
 * Any name and string is fine, but I've hardcoded a few for autocomplete. 
 * A common bug is to type 'styles' instead of 'style' and wonder why the layout isn't working, for example.
 */
type Attrs = Record<string, string | string[] | undefined> & {
    style?: string | Record<keyof HTMLElement["style"], string | null>;
    class?: string[];
};

export function setAttr<T extends ValidElement>(el: Insertable<T>, key: string, val: string | undefined, wrap = false) {
    if (val === undefined) {
        el.el.removeAttribute(key);
        return;
    }

    if (wrap) {
        el.el.setAttribute(key, (getAttr(el, key) || "") + val);
        return;
    }

    if (getAttr(el, key) === val) {
        /**
         * NOTE: I've not actually checked if this has performance gains,
         * just assumed based on the other functions, which I have checked
         */
        return;
    }

    el.el.setAttribute(key, val);
}

export function getAttr<T extends ValidElement>(el: Insertable<T>, key: string) {
    return el.el.getAttribute(key);
}

export function setAttrs<T extends ValidElement, C extends Insertable<T>>(ins: C, attrs: Attrs, wrap = false): C {
    for (const attr in attrs) {
        let val = attrs[attr];
        if (Array.isArray(val)) {
            // I would have liked for this to only happen to the `class` attribute, but I 
            // couldn't figure out the correct typescript type. AI was no help either btw.
            // Also add a space, so that we can call `setAttrs` on the same component multiple times without breaking the class defs
            val = val.join(" ") + " ";
        }

        if (attr === "style" && typeof val === "object") {
            const styles = val as Record<keyof HTMLElement["style"], string | null>;
            for (const s in styles) {
                // @ts-expect-error trust me bro
                setStyle(ins, s, styles[s]);
            }
        }

        setAttr(ins, attr, val, wrap);
    }

    return ins;
}


/** 
 * `on` and `off` exist, because a) `c.el.addEventListener` was a very common operation, and
 * b) It should allow for a couple of characters to be saved in the final HTML...
 *
 * TODO: extend to SVG element
 */
export function on<K extends keyof HTMLElementEventMap>(
    ins: Insertable<HTMLElement>,
    type: K,
    listener: (this: HTMLElement, ev: HTMLElementEventMap[K]) => any,
    options?: boolean | AddEventListenerOptions
) {
    ins.el.addEventListener(type, listener, options);
    return ins;
}

/** 
 * shorthand for `removeEventListener`. I never use this tbh - I've just never found a reason to remove an event handler - 
 * I find it much easier to just write code that adds the handler once, and either early-returns out of events as needed,
 * or throws away the entire component when I'm done with it, which should in theory garbage collect the component and it's events.
 * This allows me to sidestep all the bugs where handlers get added multiple times, or get removed but not re-added, etc. 
 */
export function off<K extends keyof HTMLElementEventMap>(
    ins: Insertable<HTMLElement>,
    type: K,
    listener: (this: HTMLElement, ev: HTMLElementEventMap[K]) => any,
    options?: boolean | EventListenerOptions,
) {
    ins.el.removeEventListener(type, listener, options);
    return ins;
}

/** 
 * A LOT faster than just setting the text content manually.
 *
 * However, there are some niche use cases (100,000+ components) where you might need even more performance. 
 * In those cases, you will want to avoid calling this function if you know the text hasn't changed.
 */
export function setText(component: Insertable, text: string) {
    if ("rerender" in component) {
        console.warn("You might be overwriting a component's internal contents by setting it's text");
    };

    if (component.el.textContent === text) {
        // Actually a huge performance speedup!
        return;
    }

    component.el.textContent = text;
}

export function isEditingInput(component: Insertable): boolean {
    return document.activeElement === component.el;
}


type TextElement = HTMLTextAreaElement | HTMLInputElement;

export function setInputValueAndResize<T extends TextElement>(inputComponent: Insertable<T>, text: string) {
    setInputValue(inputComponent, text);
    resizeInputToValue(inputComponent);
}

/** 
 * This is how I know to make an input that auto-sizes to it's text.
 * NOTE: this only appears to work for monospace text, and is inconsistent for everything else.
 * */
export function resizeInputToValue<T extends TextElement>(inputComponent: Insertable<T>) {
    setAttr(inputComponent, "size", "" + inputComponent.el.value.length);
}

/** NOTE: assumes that component.el is an HTMLInputElement */
export function setInputValue<T extends TextElement>(component: Insertable<T>, text: string) {
    const inputElement = component.el;

    if (inputElement.value === text) {
        // performance speedup
        return;
    }

    const { selectionStart, selectionEnd } = inputElement;

    inputElement.value = text;

    inputElement.selectionStart = selectionStart;
    inputElement.selectionEnd = selectionEnd;
}

export function isEditingTextSomewhereInDocument(): boolean {
    const type = document.activeElement?.nodeName?.toLowerCase();
    return type === "textarea" || type === "input";
}

/**
 * Scrolls {@link scrollParent} to bring scrollTo into view.
 * {@link scrollToRelativeOffset} specifies where to to scroll to. 0 = bring it to the top of the scroll container, 1 = bring it to the bottom
 */
export function scrollIntoView(
    scrollParent: HTMLElement,
    scrollTo: Insertable<HTMLElement>,
    scrollToRelativeOffset: number,
    scrollToItemOffset: number,
    horizontal = false,
) {
    if (horizontal) {
        // NOTE: this is a copy-paste from below

        const scrollOffset = scrollToRelativeOffset * scrollParent.offsetWidth;
        const elementWidthOffset = scrollToItemOffset * scrollTo.el.getBoundingClientRect().width;

        // offsetLeft is relative to the document, not the scroll parent. lmao
        const scrollToElOffsetLeft = scrollTo.el.offsetLeft - scrollParent.offsetLeft;

        scrollParent.scrollLeft = scrollToElOffsetLeft - scrollOffset + elementWidthOffset;

        return;
    }

    const scrollOffset = scrollToRelativeOffset * scrollParent.offsetHeight;
    const elementHeightOffset = scrollToItemOffset * scrollTo.el.getBoundingClientRect().height;

    // offsetTop is relative to the document, not the scroll parent. lmao
    const scrollToElOffsetTop = scrollTo.el.offsetTop - scrollParent.offsetTop;

    scrollParent.scrollTop = scrollToElOffsetTop - scrollOffset + elementHeightOffset;
}


//////////
// Render group API


/**
 * Render groups are the foundation of this 'framework'.
 * Fundamentally, a 'render group' is an array of functions that are called in the 
 * same order that they were appended. They can all be invoked with one render call. 
 * Sounds a lot like an 'event' from C#. And it probably is tbh.
 *
 * It is now an internal implementation detail, and you don't really ever need to create them yourself.
 */
export class RenderGroup<S = null> {
    readonly preRenderFnList: RenderFn<S>[] = [];
    readonly domRenderFnList: RenderFn<S>[] = [];
    readonly postRenderFnList: RenderFn<S>[] = [];

    readonly animationsList: RenderPersistentAnimationFn<S>[] = [];

    /**
     * The current state of this render group, passed to every render function.
     */
    _s: S | undefined;
    /** 
     * The name of the template function this render group has been passed into. Mainly used for debugging and error reporting.
     */
    readonly templateName: string;
    /**
     * Internal variable that allows getting the root of the component a render group is attached to
     * without having the root itthis. 
     */
    instantiatedRoot: Component<S, ValidElement> | undefined = undefined;
    /* 
     * Has this component rendered once? 
     * Used to detect bugs where a render function may continue to add more handlers during the render part
     */
    instantiated = false;
    /** 
     * Internal variable used to check if an 'if' statement is currently open to any 'else' statement that follows it.
     */
    ifStatementOpen = false;

    /**
     * Enable debug mode to see what this does!
     * Or you can also read the code... that works too...
     */
    debugAnimation: RealtimeAnimation;
    tDebugAnimation = 0;

    constructor(
        initialState: S | undefined,
        templateName: string = "unknown",
    ) {
        for (const k in this) {
            const v = this[k];
            if (typeof v === "function") {
                this[k] = v.bind(this);
            }
        }

        this._s = initialState;
        this.templateName = templateName;

        this.debugAnimation = this.newAnimation((dt) => {
            if (
                // complex components made of thousands of small parts 
                // will hopefully this to true on those smaller parts, so that they don't lag
                // in debug mode
                this.root.errorContext.avoidErrorHandler ||
                this.tDebugAnimation >= 1 ||
                !isDebugging()
            ) {
                setStyle(this.root, "outline", "");
                return false;
            }

            this.tDebugAnimation += dt * 3;
            setStyle(this.root, "outline", "1px solid rgba(255, 0, 0, " + Math.max(0, 1 - this.tDebugAnimation) + ")");
            return true;
        });
    }

    get s(): S {
        if (this._s === undefined) {
            throw new Error("Can't access the state before the first render!");
        }
        return this._s;
    }

    get root() {
        const root = this.instantiatedRoot;
        if (root === undefined) {
            throw new Error(`This render group does not have a root!`);
        }

        return root;
    }

    /**
     * Sets the current state of this render group, and 
     * then immediately calls {@link RenderGroup.renderWithCurrentState}.
     */
    readonly render = (s: S) => {
        this.ifStatementOpen = false;
        this._s = s;
        this.renderWithCurrentState();
    }

    readonly restartAnimations = () => {
        if (this.animationsList.length === 0 || this.persistentAnimationInstance.isInQueue) {
            return;
        }

        startAnimation(this.persistentAnimationInstance);
    }

    /**
     * Calls every render function in the order they were appended to the array using the current state {@link RenderGroup._s}.
     * If this value is undefined, this function will throw.
     */
    readonly renderWithCurrentState = () => {
        this.instantiated = true;

        if (isDebugging()) {
            this.tDebugAnimation = 0;
            startAnimation(this.debugAnimation);
        }

        // NOTE: Order matters!
        this.renderFunctions(this.preRenderFnList);
        this.renderFunctions(this.domRenderFnList);
        this.restartAnimations();
        this.renderFunctions(this.postRenderFnList);
    }

    readonly canAnimate = (): boolean => {
        const root = this.instantiatedRoot;
        if (!root) {
            return false;
        }
        if (root._isHidden === 1) {
            return false;
        }
        if (!root.el.isConnected) {
            return false;
        }

        return true;
    }

    readonly persistentAnimationInstance = newAnimation((dt: number): boolean => {
        if (!this.canAnimate()) {
            return false;
        }

        const s = this.s;
        for (let i = 0; i < this.animationsList.length; i++) {
            this.animationsList[i](dt, s);
        }

        return true;
    });

    /**
     * Returns a span which will update it's text with {@link fn} each render.
     */
    readonly text = (fn: (s: S) => string): Insertable<HTMLSpanElement> => {
        const e = span();
        let lastText: string | undefined;
        this.pushRenderFn(this.domRenderFnList, (s) => {
            // we can just do that direct memoization thing that I have assumed the browser devs expected us to do (as I've mentioned in another comment somewhere here), rather
            // that calling `setText, which will first query what the text was with e.el.textContent. same for all the other methods here.
            const text = fn(s);
            if (lastText !== text) {
                lastText = text;
                e.el.textContent = text;
            }
        }, e);
        return e;
    }

    /**
     * Instantiates and returns the new component that was instantiated.
     * The component rerenders with {@link renderFn} each render.
     *
     * @example
     * ```ts
     * function CExample(rg: RenderGroup<{ state: State }>) {
     *      return div({
     *          class: ....
     *      }, [ 
     *          rg.c(TopBar, c => c.render(null)),
     *          rg.c(MainContentView, (c, s) => c.render(s)),
     *          rg.c(ProgressBar, (c, s) => c.render({
     *              percentage: s.loadingProgress,
     *          }),
     *      ]);
     * }
     * ```
     */
    readonly c = <T, U extends ValidElement>(templateFn: TemplateFn<T, U>, renderFn: (c: Component<T, U>, s: S) => void): Component<T, U> => {
        const component = newComponent(templateFn);
        return this.inlineFn(component, (c, s) => renderFn(c, s));
    }

    /**
     * Kinda like c, but you can pass additional static content to the template
     * at initialisation time after the render function. 
     * The most common use case for this is to initialize a container component with 
     * children.
     *
     * ```
     *
     * function Modal(rg: RenderGroup<{ ... }>, children: InsertableInitializerList) {
     *      return div({ ... }, [
     *          ...,
     *          ...children,
     *      ]);
     * }
     *
     * function Consumer(rg: RenderGroup<App>) {
     *      return div({ ... }, [
     *          rg.cArgs(Modal, (c, s) => c.render({
     *              ...
     *          }, [        // remaining static arguments go here
     *              div([cn.flex1], {}, "Inner content")
     *          ]);
     *      ]);
     * }
     *
     * ```
     */
    readonly cArgs = <T, U extends ValidElement, A extends unknown[]>(
        templateFn: TemplateFnVariadic<T, U, A>, 
        renderFn: (c: Component<T, U>, s: S) => void,
        ...args: A
    ): Component<T, U> => {
        const component = newComponent<T, U, T>(rg => templateFn(rg, ...args));
        return this.inlineFn(component, (c, s) => renderFn(c, s));
    }

    /**
     * Returns what you passed in, and will 'rerender' it with {@link renderFn} each render.
     */
    readonly inlineFn = <T extends Insertable<U>, U extends ValidElement>(component: T, renderFn: (c: T, s: S) => void): T => {
        this.pushRenderFn(this.domRenderFnList, (s) => renderFn(component, s), component);
        return component;
    }

    /** 
     * Same as `else_if(() => true, ...)`,
     */
    readonly else = <U extends ValidElement> (templateFn: TemplateFn<S, U>): Component<S, U> => {
        return this.else_if(() => true, templateFn);
    }

    /**
     * Display a specific component based on a string value.
     * Doesn't have to be exhaustive.
     **/
    readonly switch = <R extends ValidElement, U extends ValidElement, K extends string | number>(
        root: Insertable<R>,
        predicate: (s: S) => K,
        dispatchTable: Record<K, TemplateFn<S, U>>,
    ): Component<S, R> => {
        return this.partial_switch(root, predicate, dispatchTable);
    }

    /**
     * Display a specific component based on a string value.
     **/
    readonly partial_switch = <R extends ValidElement, U extends ValidElement, K extends string | number>(
        root: Insertable<R>,
        predicate: (s: S) => K,
        dispatchTable: Partial<Record<K, TemplateFn<S, U>>>,
    ): Component<S, R> => {
        return this.c((rg: RenderGroup<S>) => {
            // @ts-ignore trust me bro
            const cache: Record<K, Component<S, U>> = {};
            for (const k in dispatchTable) {
                const templateFn = dispatchTable[k];
                if (templateFn) {
                    cache[k] = newComponent(templateFn);
                }
            }

            return rg.inlineFn(root, (root, s) => {
                const res = predicate(s);
                const component = cache[res];
                if (!component) {
                    this.ifStatementOpen = true;
                    clearChildren(root);
                    return;
                }

                setChildAt(root, 0, component);
                component.render(s);
            })
        }, (c, s) => c.render(s));
    }

    /** 
     * Sets a component visible based on a predicate, and only renders it if it is visible 
     **/
    readonly if = <U extends ValidElement> (predicate: (s: S) => boolean, templateFn: TemplateFn<S, U>): Component<S, U> => {
        return this.c(templateFn, (c, s) => {
            this.ifStatementOpen = true;
            if (setVisible(c, this.ifStatementOpen && predicate(s))) {
                this.ifStatementOpen = false;
                c.render(s);
            }
        });
    }

    /** 
     * Same as `if`, but it will hide your component when value returned by the predicate is `undefined`.
     * If it wasn't undefined, it's used as an input into the template instance component.
     * This is mainly useful for type narrowing: 
     *
     * ```ts
     * rg.with(s => thing && ({ s, thing }), rg => 
     *     div({}, [
     *        rg.c(SomeComponentThatNeedsThing, (c, { s, thing }) => c.render({
     *          ... some stuff from s,
     *          thing
     *        }))
     *     ])
     * )
     *
     * ```
     */
    readonly with = <U extends ValidElement, T> (predicate: (s: S) => T | undefined, templateFn: TemplateFn<T, U>): Component<T, U> => {
        return this.c(templateFn, (c, s) => {
            this.ifStatementOpen = true;
            const val = predicate(s);
            if (setVisible(c, val)) {
                this.ifStatementOpen = false;
                c.render(val);
            }
        });
    }

    /** 
     * Same as `if`, but only runs it's predicate if previous predicates were false.
     */
    readonly else_if = <U extends ValidElement> (predicate: (s: S) => boolean, templateFn: TemplateFn<S, U>): Component<S, U> => {
        return this.c(templateFn, (c, s) => {
            if (setVisible(c, this.ifStatementOpen && predicate(s))) {
                this.ifStatementOpen = false;
                c.render(s);
            }
        });
    }
    
    /** 
     * The {@link with} equivelant of {@link else_if}
     */
    readonly else_with = <U extends ValidElement, T> (predicate: (s: S) => T | undefined, templateFn: TemplateFn<T, U>): Component<T, U> => {
        return this.c(templateFn, (c, s) => {
            const val = this.ifStatementOpen ? predicate(s) : undefined;
            if (setVisible(c, val !== undefined)) {
                this.ifStatementOpen = false;
                c.render(val!);
            }
        });
    }

    /**
     * Returns functionality that will append an event to the parent component.
     * TODO: (ME) - extend to SVGElement as well. it will still work - you'll be fighting with TypeScript
     */
    readonly on = <K extends keyof HTMLElementEventMap>(
        type: K,
        listener: (s: S, ev: HTMLElementEventMap[K]) => any,
        options?: boolean | AddEventListenerOptions
    ): Functionality<HTMLElement> => {
        return (parent) => {
            on(parent, type, (e) => {
                listener(this.s, e);
            }, options);
        }
    }

    /** 
     * Returns functionality that will set attributes on the parent component each render.
     */
    readonly attr = <U extends ValidElement>(attrName: string, valueFn: (s: S) => string): Functionality<U> => {
        return (parent) => {
            this.pushRenderFn(this.domRenderFnList, (s) => setAttr(parent, attrName, valueFn(s)), parent);
        }
    }

    // So far, every attempt of mine at making this keyed has only led to a worse API with more complex code 
    // and more bugs in the usage code. For that reason, I've decided to just not make one.
    // Your UI should just be a function of your state anyway - if there is state that you aren't
    // setting when you rerender your component, like selectionStart and selectionEnd on a text input for example, 
    // if you care about this then you should make selectionStart and selectionEnd a part of your TextInput's UI state. 

    /** 
     * Returns a new {@link ListRenderer} rooted with {@link root}, and {@link templateFn} as the repeating component.
     * It will rerender with {@link renderFn} each render.
     *
     * @example
     * ```ts
     * function CExample(rg: RenderGroup<{ state: State }>) {
     *      return div({
     *          class: ....
     *      }, [ 
     *          div({ class: cn.displayContents }, TodoItem, (getNext, s) => {
     *              for (const item of s.todoList) {
     *                  getNext().render(item);
     *              }
     *          }),
     *      ]);
     * }
     * ```
     *
     * Hint: you can make a `div({ style: "display: contents" })` div to get a similar effect to React.fragment as far as layout is concerned.
     * You can also use `el("g")` for SVGs.
     */
    readonly list = <R extends ValidElement, T, U extends ValidElement>(
        root: Insertable<R>,
        templateFn: TemplateFn<T, U>,
        renderFn: (getNext: () => Component<T, U>, s: S, listRenderer: ListRenderer<R, T, U>) => void,
    ): ListRenderer<R, T, U> => {
        const listRenderer = newListRenderer(root, () => newComponent(templateFn));
        this.pushRenderFn(this.domRenderFnList, (s) => {
            listRenderer.startRendering();
            renderFn(listRenderer.__getNext, s, listRenderer);
            listRenderer.finishRendering();
            this.ifStatementOpen = listRenderer.lastIdx === 0;
        }, root);
        return listRenderer;
    }

    /** 
     * Returns functionality that will enable/disable a particular class in the classList each render.
     */
    readonly class = <U extends ValidElement>(cssClass: string, predicate: (s: S) => boolean): Functionality<U> => {
        return (parent) => {
            let hadClass: boolean | undefined;
            this.pushRenderFn(this.domRenderFnList, (s) => {
                const state = predicate(s);
                if (hadClass !== state) {
                    hadClass = state;
                    if (state) {
                        parent.el.classList.add(cssClass);
                    } else {
                        parent.el.classList.remove(cssClass);
                    }
                }
            }, parent);
        }
    }

    /** 
     * Returns functionality that will sets the current value of an element's style each render.
     */
    readonly style = <U extends ValidElement, K extends StyleObject<U>>(val: K, valueFn: (s: S) => U["style"][K]): Functionality<U> => {
        return (parent) => {
            const initialStyle = parent.el.style[val];
            let lastValue = initialStyle;
            this.pushRenderFn(this.domRenderFnList, (s) => {
                const newValue = valueFn(s) || initialStyle;
                if (lastValue !== newValue) {
                    lastValue = newValue;
                    parent.el.style[val] = newValue;
                }
            }, parent);
        };
    }

    /**
     * Returns custom functionality, allowing for declaratively specifying a component's behaviour.
     * See the documentation for {@link el} for info on how that works.
     */
    readonly functionality = <U extends ValidElement> (fn: (val: Insertable<U>, s: S) => void): Functionality<U> => {
        return (parent) => {
            this.pushRenderFn(this.domRenderFnList, (s) => fn(parent, s), parent);
        };
    }

    /**
     * Appends a custom function to this render group that runs before all the DOM render functions.
     * Use this to pre-compute state, and do other imperative things (most real JS UI frameworks suck at 
     * or don't allow or look down upon imperative code, which is what prompted me to make a custom framework that embraces it).
     * 
     * Code here always runs before DOM render functions, and postRenderFunctions on this component.
     *
     * Also note that setting a component's visibility here will prevent it's DOM functions from running.
     *
     * ```ts
     * function App(rg: RenderGroup<GameState>) {
     *      let x = 0;
     *      let alpha = 0;
     *
     *      rg.preRenderFn((s) => {
     *          x += s.dt;
     *          if (x > 1) {
     *              x = 0;
     *          }
     *
     *          alpha = Math.sin(x * 2 * Math.PI);
     *      });
     *
     *      return div({}, [
     *          rg.style("backgroundColor", () => `rgba(0, 0, 0, ${alpha})`),
     *      ]);
     * }
     * ```
     */
    readonly preRenderFn = (fn: (s: S) => void, errorRoot?: Insertable<any>) => {
        this.pushRenderFn(this.preRenderFnList, fn, errorRoot);
    }

    /** 
     * Similar to {@link RenderGroup.preRenderFn}, but this function will be run _after_ the dom rendering functions.
     *
     * function App(rg: RenderGroup<GameState>) {
     *      let t0 = 0;
     *      rg.preRenderFn((s) => {
     *          t0 = Performance.now();
     *      });
     *
     *      rg.postRenderFn((s) => {
     *          const timeTakenMs = Performance.now() - t0;
     *          console.log(`Our app rendered in ${timeTakenMs}ms`);
     *      });
     *
     *      return div({}, [
     *          rg.style("backgroundColor", () => `rgba(0, 0, 0, ${alpha})`),
     *      ]);
     * }
     *
     */
    readonly postRenderFn = (fn: (s: S) => void, errorRoot?: Insertable<any>) => {
        this.pushRenderFn(this.postRenderFnList, fn, errorRoot);
    }

    /**
     * Pushes an animation to the realtime animation queue
     * that persists for the lifetime of this component.
     *
     * The animation is suspended when :
     * - the component's _isHidden flag is set to false 
     *      - see {@link setVisible} - every visibility toggling function here will call into that, 
     *      so this will only matter if you're doing some custom visibility code that isn't calling into it), 
     * - the component or any component above it becomes display:none via css
     * - the component is no-longer in the DOM for any reason.
     *
     * The animation gets restarted as soon as the component is rendered again.
     */
    readonly realtimeFn = (fn: RenderPersistentAnimationFn<S>) => {
        this.assertCanPushRenderFns();
        this.animationsList.push(fn);
    }


    /**
     * Instantiates a template, and places it's render function onto the realtime animation queue!
     * Some templates might do this themselves, so you should double check if it's needed before calling this.
     */
    readonly realtime = <U extends ValidElement>(templateFn: TemplateFn<S, U>) => {
        const [component, rg] = newComponent2(templateFn)

        // our component needs to render this component to restart it's animations
        this.inlineFn(component, (c, s) => c.render(s));

        rg.realtimeFn((_, s) => rg.render(s));
        return component;
    }

    /**
     * This function is actually a wrapper around {@link realtimeFn}.
     */
    readonly intermittentFn = (fn: RenderPersistentAnimationFn<S>, interval: number) => {
        this.assertCanPushRenderFns();

        let timer = 0;
        this.animationsList.push((dt, s) => {
            // game devs hate it when you use this one simple trick
            timer += dt * 1000;
            if (timer < interval) {
                return;
            }
            timer = 0;

            fn(dt, s);
        });
    }

    /**
     * This function is to {@link intermittentFn} what {@link realtime} is to {@link realtimeFn}.
     */
    readonly intermittent = <U extends ValidElement>(templateFn: TemplateFn<S, U>, interval: number) => {
        const [component, rg] = newComponent2(templateFn)

        // our component needs to render this component to restart it's animations
        this.inlineFn(component, (c, s) => c.render(s));

        rg.intermittentFn((_, s) => rg.render(s), interval);
        return component;
    }

    /**
     * Returns an animation that can be pushed to the queue as needed, that will stop animating when this component
     * is disabled.
     *
     * Although you probably wished that this function would just add the animation to the queue directly, 
     * this design avoid bugs where you add animations to the queue faster than the old animations end,
     * and allows for more control in general.
     */
    readonly newAnimation = (fn: RenderOneShotAnimationFn<S>): RealtimeAnimation => {
        const animation = newAnimation((dt) => {
            if (!this.canAnimate()) {
                return false;
            }

            return fn(dt, this.s);
        });

        return animation;
    }

    /**
     * Adds specific components to a realtime animation queue that runs animation functions at 60FPS.
     * This is really usefull for things that depend on `Date.now()` that need to stay up to date with time, for example.
     * Before this API was introduced, the only way I could do this was by rerendering the ENTIRE APP in setInterval around 10 times a second!
     * And it took a really long time for me to add this too!
     */
    private readonly renderFunctions = (renderFns: RenderFn<S>[])  => {
        const s = this.s;

        countRender(this.templateName, this, renderFns.length);

        for (let i = 0; i < renderFns.length; i++) {
            renderFns[i].fn(s);
        }
    }

    private readonly pushRenderFn = (renderFns: RenderFn<S>[], fn: (s: S) => void, root: Insertable<any> | undefined) => {
        this.assertCanPushRenderFns();
        renderFns.push({ root, fn });
    }

    private readonly assertCanPushRenderFns = () => {
        if (this.instantiated) {
            throw new Error("Can't add event handlers to this template (" + this.templateName + ") after it's been instantiated");
        }
    }
}



function wasHiddenOrUninserted<T extends ValidElement>(ins: Insertable<T>) {
    return ins._isHidden === 1 || !ins.el.parentElement;
}

function checkForRenderMistake<T extends ValidElement>(ins: Insertable<T>) {
    if (!ins.el.parentElement) {
        console.warn("A component hasn't been inserted into the DOM, but we're trying to do things with it anyway.");
    }
}

/**
 * Components encapsulate a DOM root, a render function, and internal state.
 * They existed before render groups.
 * 
 * This class is also an internal implementation detail that you never need to use - 
 * see {@link newComponent};
 */
export class Component<T, U extends ValidElement = ValidElement> implements Insertable<U> {
    root: Insertable<U>;
    el: U;
    get _isHidden() { return this.root._isHidden; }
    set _isHidden(val: number) { this.root._isHidden = val; }
    _s: T | undefined;
    get s() {
        if (this._s === undefined) {
            throw new Error(`This component does not have a root!`);
        }

        return this._s;
    }
    instantiated = false;
    /**
     * Internal variable used to catch infinite recursion bug 
     */
    rendering = false;

    renderFn: (s: T) => void;

    errorContext: DomUtilsErrorContext;

    constructor(
        root: Insertable<U>, 
        renderFn: (s: T) => void, 
        s: T | undefined, 
        templateName: string,
    ) {
        this.root = root;
        this.el = root.el;
        this._s = s;
        this.renderFn = renderFn;
        this.errorContext = {
            isError: false,
            err: undefined,
            message: undefined,
            componentName: templateName,
            root: this,

            avoidErrorHandler: false,
            _hasErrorClass: false,
        }
    }
    /**
     * Renders the component with the arguments provided.
     * 
     * if skipErrorBoundary has not been set to false (it is true by default), any exceptions are handled by 
     * adding the "catastrophic---error" css class to the root element of this component.
     */
    readonly render = (args: T) => {
        this._s = args;
        this.renderWithCurrentState();
    }
    /**
     * Renders the component with the arguments provided.
     * 
     * if skipErrorBoundary has been set to true, any exceptions are handled by 
     * adding the "catastrophic---error" css class to the root element of this component.
     */
    readonly renderWithCurrentState = () => {
        if (this.rendering) {
            throw new Error("Can't call a render method while it's already rendering");
        }

        if (this.instantiated) {
            checkForRenderMistake(this);
        }

        // Setting this value this late allows the this to render once before it's ever inserted.
        // We also get to do additional post-initialization on a component that some other function returned, for example.
        this.instantiated = true;

        this.rendering = true;

        if (this.errorContext.avoidErrorHandler) {
            try {
                this.renderFn(this.s);
            } catch(e) {
                throw e;
            } finally {
                this.rendering = false;
            }

            return;
        } 

        try {
            this.errorContext.isError = false;
            domUtilsGlobalErrorHandler(this.errorContext);
            this.renderFn(this.s);
        } catch (e) {
            this.errorContext.isError = true;
            const err = e instanceof Error ? e : undefined;;
            this.errorContext.err = err;
            this.errorContext.message = err?.message || ("" + e) || "unknown error";
            domUtilsGlobalErrorHandler(this.errorContext);
        } finally {
            this.rendering = false;
        }
    }
}

type RenderFn<S> = { fn: (s: S) => void; root: Insertable<any> | undefined; error?: any };
type RenderPersistentAnimationFn<S> = (dt: number, s: S) => void; 
type RenderOneShotAnimationFn<S> = (dt: number, s: S) => boolean;
type TemplateFn<T, U extends ValidElement> = (rg: RenderGroup<T>) => Insertable<U>;
type TemplateFnVariadic<T, U extends ValidElement, A extends unknown[]> = (rg: RenderGroup<T>, ...args: A) => Insertable<U>;

/**
 * Instantiates a {@link TemplateFn} into a useable component 
 * that can be inserted into the DOM and rendered one or more times.
 *
 * If {@link initialState} is specified, the component will be rendered once here itself.
 */
export function newComponent<T, U extends ValidElement, Si extends T>(
    templateFn: TemplateFn<T, U>,
    initialState?: Si,
) {
    const [component, _rg] = newComponent2(templateFn, initialState);
    return component;
}

export function newComponentArgs<T, U extends ValidElement, A extends unknown[]>(
    templateFn: TemplateFnVariadic<T, U, A>,
    args: A,
    initialState?: T,
) {
    const [component, _rg] = newComponentArgs2(templateFn, args, initialState);
    return component;
}

export function newComponentArgs2<T, U extends ValidElement, A extends unknown[]>(
    templateFn: TemplateFnVariadic<T, U, A>,
    args: A,
    initialState?: T,
) {
    return newComponent2<T, U>(rg => templateFn(rg, ...args), initialState);
}

export function newComponent2<T, U extends ValidElement>(
    templateFn: TemplateFn<T, U>,
    initialState?: T,
) {
    const rg = new RenderGroup<T>(
        initialState,
        templateFn.name ?? "",
    );

    const root = templateFn(rg);
    const component = new Component(root, rg.render, initialState, rg.templateName);
    rg.instantiatedRoot = component;
    setAttr(root, "data-template-name", rg.templateName);

    if (component._s !== undefined) {
        component.renderWithCurrentState();
    }

    return [component, rg] as const;
}

//////////
// List rendering API

export class ListRenderer<R extends ValidElement, T, U extends ValidElement> implements Insertable<R> {
    root: Insertable<R>;
    createFn: () => Component<T, U>;

    components: Component<T, U>[] = [];
    lastIdx = 0;

    get el() { return this.root.el; }
    get _isHidden() { return this.root._isHidden; }
    set _isHidden(val: number) { this.root._isHidden = val; }

    constructor(root: Insertable<R>, createFn: () => Component<T, U>) {
        this.root = root;
        this.createFn = createFn;
    }

    // You should only call this directly if you know what you're doing.
    readonly __getNext = () => {
        if (this.lastIdx > this.components.length) {
            throw new Error("Something strange happened when resizing the component pool");
        }

        if (this.lastIdx === this.components.length) {
            const component = this.createFn();
            this.components.push(component);
            appendChild(this.root, component);
        }

        return this.components[this.lastIdx++];
    }

    // If you detest callbacks, you can use startRendering and finishRendering.
    readonly startRendering = () => {
        this.lastIdx = 0;
    }

    readonly finishRendering = () => {
        while (this.components.length > this.lastIdx) {
            const component = this.components.pop()!;
            component.el.remove();
        }
    }

    readonly render = (renderFn: (getNext: () => Component<T, U>) => void) => {
        this.startRendering();

        renderFn(this.__getNext);

        this.finishRendering();
    }
};

export function newListRenderer<R extends ValidElement, T, U extends ValidElement>(
    root: Insertable<R>,
    createFn: () => Component<T, U>,
) {
    return new ListRenderer(root, createFn);
}

//////////
// animation utils. The vast majority of apps will need animation, so I figured I'd just merge this into dom-utils itself

export type AnimateFunction = (dt: number) => boolean;

export type RealtimeAnimation = {
    isRunning: boolean;
    isInQueue: boolean;
    fn: AnimateFunction;
}

const queue: RealtimeAnimation[] = [];

const MAX_DT = 100;

let lastTime = 0;
function runAnimation(time: DOMHighResTimeStamp) {
    const dtMs = time - lastTime;
    lastTime = time;

    if (dtMs < MAX_DT) {
        for (let i = 0; i < queue.length; i++) {
            const handle = queue[i];

            handle.isRunning = handle.fn(dtMs / 1000);

            if (!handle.isRunning) {
                // O(1) fast-remove
                queue[i] = queue[queue.length - 1];
                queue.pop();
                handle.isInQueue = false;
                i--;
            }
        }
    }

    if (queue.length > 0) {
        requestAnimationFrame(runAnimation);
    }
}

export function newAnimation(fn: AnimateFunction): RealtimeAnimation {
    return { fn, isRunning: false, isInQueue: false };
}

/**
 * Adds an animation to the realtime animation queue that runs with `requestAnimationFrame`.
 * See {@link newAnimation}.
 */
export function startAnimation(animation: RealtimeAnimation) {
    if (animation.isInQueue) {
        return;
    }

    const restartQueue = queue.length === 0;

    queue.push(animation);
    animation.isInQueue = true;

    if (restartQueue) {
        requestAnimationFrame(runAnimation);
    }
}

export function getCurrentNumAnimations() {
    return queue.length;
}


//////////
// debugging utils

let debug = false;
export function setDebugMode(state: boolean) {
    debug = state;
}
export function isDebugging() {
    return debug;
}

const renderCounts = new Map<string, { c: number, t: number; s: Set<RenderGroup<any>> }>();
function countRender(name: string, ref: RenderGroup<any>, num: number) {
    if (!debug) return;

    if (!renderCounts.has(name)) {
        renderCounts.set(name, { c: 0, s: new Set(), t: 0 });
    }
    const d = renderCounts.get(name)!;
    d.c += num;
    d.t++;
    d.s.add(ref);
}

export function printRenderCounts() {
    if (!debug) return;

    let totalComponents = 0;
    let totalRenderFns = 0;
    let totalRenders = 0;

    for (const v of renderCounts.values()) {
        totalRenderFns += v.c;
        totalRenders += v.t;
        totalComponents += v.s.size;
    }

    for (const [k, v] of renderCounts) {
        if (v.t === 0) {
            renderCounts.delete(k);
        }
    }

    console.log(
        ([...renderCounts].sort((a, b) => a[1].c - b[1].c))
            .map(([k, v]) => `${k} (${v.s.size} unique) rendered ${v.c} fns and ${v.t} times, av = ${(v.c / v.t).toFixed(2)}`)
            .join("\n") + "\n\n"
        + `total num components = ${totalComponents}, total render fns  ${totalRenderFns}`
    );

    for (const v of renderCounts.values()) {
        v.c = 0;
        v.t = 0;
        v.s.clear();
    }
}

