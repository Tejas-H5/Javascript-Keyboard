// DOM-utils v0.1.0 - @elTejasodomu

// ---- Styling API - this actually needs to happen before the framework is initialized, so it's been moved to the top.

const stlyeStringBuilder: string[] = [];
const allClassNames = new Set<string>();

/**
 * A util allowing components to register styles that they need to function.
 * All styles in the entire bundle are collected into one large string as soon as the JavaScript runs,
 * and they will get added under a single DOM node when dom-utils is initialized.
 *
 * Using an object here instead of a global function, so that we can apply a prefix to every class added by a particular builder.
 */
export function newCssBuilder(prefix: string = "") {
    return {
        // makes a new style. for when you can't make a class.
        s(string: string) {
            stlyeStringBuilder.push(string);
        },
        /** Throws if this class name clashes with an existing one */
        getClassName(className: string) {
            let name = prefix + className;
            if (allClassNames.has(name)) {
                throw new Error("We've already made a class with this name: " + name + " - consider adding a prefix");
            }
            allClassNames.add(name);
            return name;
        },
        // makes a new class, it's variants, and returns the class name
        cn(className: string, styles: string[] | string): string {
            const name = this.getClassName(className);

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

const hoverParent = sb.getClassName("hoverParent");
const hoverTarget = sb.getClassName("hoverTarget");
const cnHoverTargetInverse = sb.getClassName("hoverTargetInverse");

sb.s(`
.${hoverParent} .${hoverTarget} { display: none !important; }
.${hoverParent} .${cnHoverTargetInverse} { display: inherit !important; }
.${hoverParent}:hover ${hoverTarget}  { display: inherit !important; }
.${hoverParent}:hover ${cnHoverTargetInverse}  { display: none !important; }
`);

// Some super common classes that I use in all my programs all the time.
// It becomes a bit easier to make reuseable UI components  and keep them in sync accross projects
// if their styling dependencies are all in dom-utils itself.
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

    gap5: sb.cn("gap5", [` { gap: 5px; }`]),
    w100: sb.cn("w100", [` { width: 100%; }`]),
    h100: sb.cn("h100", [` { height: 100%; }`]),

    /** overflow management */

    overflowXAuto: sb.cn("overflowXAuto", [` { overflow-x: auto; }`]),
    overflowYAuto: sb.cn("overflowYAuto", [` { overflow-y: auto; }`]),
    overflowAuto: sb.cn("overflowAuto", [` { overflow: auto; }`]),
    overflowHidden: sb.cn("overflowHidden", [` { overflow: hidden; }`]),

    /** hover utils */
    hoverParent,
    hoverTarget,
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
 *
 * Converts an HSL color value to RGB. Conversion formula
 * adapted from http://en.wikipedia.org/wiki/HSL_color_space.
 * Assumes h, s, and l are contained in the set [0, 1] and
 * returns r, g, and b in the set [0, 1].
 *
 * @param   Number  h       The hue
 * @param   Number  s       The saturation
 * @param   Number  l       The lightness
 * @return  Array           The RGB representation
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
 * NOTE: try to use a css transition on the colour style before you reach for this!
 **/
export function lerpColor(c1: Color, c2: Color, factor: number, dst: Color) {
    dst.r = lerp(c1.r, c2.r, factor);
    dst.g = lerp(c1.g, c2.g, factor);
    dst.b = lerp(c1.b, c2.b, factor);
    dst.a = lerp(c1.a, c2.a, factor);
}



// ---- initialize the 'framework'

export function initializeDomUtils(root: Insertable) {
    // Insert some CSS styles that this framework uses for error handling and debugging.

    if (stlyeStringBuilder.length > 0) {
        const text = stlyeStringBuilder.join("");
        stlyeStringBuilder.length = 0;

        const styleNode = el<HTMLStyleElement>("style", { type: "text/css" }, "\n\n" + text + "\n\n");
        appendChild(root, styleNode);
    }
}

// ---- DOM node and Insertable<T> creation

type ValidElement = HTMLElement | SVGElement;
export interface Insertable<T extends ValidElement = HTMLElement> {
    el: T;
    _isHidden: boolean;
};

export function newInsertable<T extends ValidElement>(el: T): Insertable<T> {
    return { el, _isHidden: false };
}

/**
 * Creates an HTML element with the given attributes, and adds chldren.
 * NOTE: For svg elements, you'll need to use `elSvg`
 */
export function el<T extends HTMLElement>(
    type: string,
    attrs?: Attrs,
    children?: InsertableInitializerListOrItem<T>,
): Insertable<T> {
    const element = document.createElement(type) as T;
    return elInternal(element, attrs, children);
}

function elInternal<T extends ValidElement>(
    element: T,
    attrs?: Attrs,
    children?: InsertableInitializerListOrItem<T>,
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
export function elSvg<T extends SVGElement>(type: string, attrs?: Attrs, children?: InsertableInitializerListOrItem<T>) {
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
export function div(attrs?: Attrs, children?: InsertableInitializerListOrItem<HTMLDivElement>) {
    return el<HTMLDivElement>("DIV", attrs, children);
}

export function contentsDiv() {
    return div({ style: "display: contents !important;" });
}

export function span(attrs?: Attrs, children?: InsertableInitializerListOrItem<HTMLSpanElement>) {
    return el<HTMLSpanElement>("SPAN", attrs, children);
}

/**
 * A function passed as a 'child' will be invoked on the parent once when it's being constructed.
 * This function will have access to the current parent, so it may hook up various event handlers.
 * It may also return an Insertable, which can be useful in some scenarios.
 */
type Functionality<T extends ValidElement> = (parent: Insertable<T>) => void | Insertable<any>;
type InsertableInitializerListItem<T extends ValidElement> = Insertable<ValidElement> | string | false | Functionality<T>;
export type InsertableInitializerList<T extends ValidElement = HTMLElement> = InsertableInitializerListItem<T>[];
export type InsertableInitializerListOrItem<T extends ValidElement = HTMLElement> = InsertableInitializerListItem<T>[] | InsertableInitializerListItem<T>;

/** Use this to initialize an element's children later. Don't call it after a component has been rendered */
export function addChildren<T extends ValidElement>(
    ins: Insertable<T>, 
    children: InsertableInitializerListOrItem<T>
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

// ---- DOM node child management

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
export function setChildAt(mountPoint: Insertable<any>, child: Insertable<any>, i: number,) {
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

// ---- DOM node attribute management, and various functions that actually end up being very useful

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
    state: T | null | undefined | false | "" | 0
): state is T {
    component._isHidden = !state;
    if (state) {
        component.el.style.setProperty("display", "", "")
    } else {
        component.el.style.setProperty("display", "none", "important")
    }
    return !!state;
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
 * shorthand for `removeEventListener`. I never use this tbh - I've just never found a reason to totally remove an event handler - 
 * I find it much easier to just write code that early-returns out of events as needed. But it's here for completeness's sake.
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

/** This is how I know to make an input that auto-sizes to it's text */
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
    horizontal = false,
) {
    if (horizontal) {
        // NOTE: this is a copy-paste from below

        const scrollOffset = scrollToRelativeOffset * scrollParent.offsetWidth;
        const elementWidthOffset = scrollToRelativeOffset * scrollTo.el.getBoundingClientRect().width;

        // offsetLeft is relative to the document, not the scroll parent. lmao
        const scrollToElOffsetLeft = scrollTo.el.offsetLeft - scrollParent.offsetLeft;

        scrollParent.scrollLeft = scrollToElOffsetLeft - scrollOffset + elementWidthOffset;

        return;
    }

    const scrollOffset = scrollToRelativeOffset * scrollParent.offsetHeight;
    const elementHeightOffset = scrollToRelativeOffset * scrollTo.el.getBoundingClientRect().height;

    // offsetTop is relative to the document, not the scroll parent. lmao
    const scrollToElOffsetTop = scrollTo.el.offsetTop - scrollParent.offsetTop;

    scrollParent.scrollTop = scrollToElOffsetTop - scrollOffset + elementHeightOffset;
}


// ---- Render group API


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
     * without having the root itself. 
     */
    instantiatedRoot: Insertable<any> | undefined = undefined;
    /* 
     * Has this component rendered once? 
     * Used to detect bugs where a render function may continue to add more handlers during the render part
     */
    instantiated = false;
    /** 
     * Disables error handling when set to true.
     **/
    skipErrorBoundary: boolean;
    /** 
     * Internal variable used to check if an 'if' statement is currently open to any 'else' statement that follows it.
     */
    ifStatementOpen = false;

    constructor(
        initialState: S | undefined,
        templateName: string = "unknown",
        skipErrorBoundary = false,
    ) {
        this._s = initialState;
        this.templateName = templateName;
        this.skipErrorBoundary = skipErrorBoundary;
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
    render(s: S) {
        this.ifStatementOpen = false;
        this._s = s;
        this.renderWithCurrentState();
    }

    /**
     * Calls every render function in the order they were appended to the array using the current state {@link RenderGroup._s}.
     * If this value is undefined, this function will throw.
     */
    renderWithCurrentState() {
        this.instantiated = true;

        this.renderFunctions(this.preRenderFnList);
        this.renderFunctions(this.domRenderFnList);
        this.renderFunctions(this.postRenderFnList);
    }

    /**
     * Returns a span which will update it's text with {@link fn} each render.
     */
    text(fn: (s: S) => string): Insertable<HTMLSpanElement> {
        const e = span();
        this.pushRenderFn(this.domRenderFnList, (s) => setText(e, fn(s)), e);
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
    c<T, U extends ValidElement>(templateFn: TemplateFn<T, U>, renderFn: (c: Component<T, U>, s: S) => void): Component<T, U> {
        const component = newComponent(templateFn);
        return this.inlineFn(component, (c, s) => renderFn(c, s));
    }

    /**
     * Returns what you passed in, and will 'rerender' it with {@link renderFn} each render.
     */
    inlineFn<T extends Insertable<U>, U extends ValidElement>(component: T, renderFn: (c: T, s: S) => void): T {
        this.pushRenderFn(this.domRenderFnList, (s) => renderFn(component, s), component);
        return component;
    }

    /** 
     * Same as `else_if(() => true, ...)`,
     */
    else<U extends ValidElement> (templateFn: TemplateFn<S, U>): Component<S, U> {
        return this.else_if(() => true, templateFn);
    }

    /**
     * Display a specific component based on a string value.
     * Doesn't have to be exhaustive.
     **/
    switch<R extends ValidElement, U extends ValidElement, K extends string | number>(
        root: Insertable<R>,
        predicate: (s: S) => K,
        dispatchTable: Record<K, TemplateFn<S, U>>,
    ): Component<S, R> {
        return this.partial_switch(root, predicate, dispatchTable);
    }

    /**
     * Display a specific component based on a string value.
     **/
    partial_switch<R extends ValidElement, U extends ValidElement, K extends string | number>(
        root: Insertable<R>,
        predicate: (s: S) => K,
        dispatchTable: Partial<Record<K, TemplateFn<S, U>>>,
    ): Component<S, R> {
        const c = newComponent((rg: RenderGroup<S>) => {
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

                setChildAt(root, component, 0);
                component.render(s);
            })
        });
        return this.inlineFn(c, (c, s) => c.render(s));
    }

    /** 
     * Sets a component visible based on a predicate, and only renders it if it is visible 
     **/
    if<U extends ValidElement> (predicate: (s: S) => boolean, templateFn: TemplateFn<S, U>): Component<S, U> {
        return this.inlineFn(newComponent(templateFn), (c, s) => {
            this.ifStatementOpen = true;
            if (setVisible(c, this.ifStatementOpen && predicate(s))) {
                this.ifStatementOpen = false;
                c.render(s);
            }
        });
    }

    /** 
     * Same as `if`, but only runs it's predicate if previous predicates were false.
     */
    else_if<U extends ValidElement> (predicate: (s: S) => boolean, templateFn: TemplateFn<S, U>): Component<S, U> {
        return this.inlineFn(newComponent(templateFn), (c, s) => {
            if (setVisible(c, this.ifStatementOpen && predicate(s))) {
                this.ifStatementOpen = false;
                c.render(s);
            }
        });
    }

    /** 
     * Same as `if`, but it will hide the component if T is undefined. This allows for some type narrowing.
     */
    with<U extends ValidElement, T> (predicate: (s: S) => T | undefined, templateFn: TemplateFn<T, U>): Component<T, U> {
        return this.inlineFn(newComponent(templateFn), (c, s) => {
            this.ifStatementOpen = true;
            const val = predicate(s);
            if (setVisible(c, val)) {
                this.ifStatementOpen = false;
                c.render(val);
            }
        });
    }
    
    /** 
     * The `with` equivelant of `else_if`
     */
    else_with<U extends ValidElement, T> (predicate: (s: S) => T | undefined, templateFn: TemplateFn<T, U>): Component<T, U> {
        return this.inlineFn(newComponent(templateFn), (c, s) => {
            if (!this.ifStatementOpen) {
                setVisible(c, false);
                return;
            }

            const val = predicate(s);
            // val could be 0 or ""...
            const res = val === undefined ? val : undefined;
            if (setVisible(c, res)) {
                this.ifStatementOpen = false;
                c.render(res);
            }
        });
    }

    /**
     * Returns functionality that will append an event to the parent component.
     * TODO: (ME) - extend to SVGElement as well. you can still use it for those, but you'll be fighting with TypeScript
     */
    on<K extends keyof HTMLElementEventMap>(
        type: K,
        listener: (s: S, ev: HTMLElementEventMap[K]) => any,
        options?: boolean | AddEventListenerOptions
    ): Functionality<HTMLElement> {
        return (parent) => {
            on(parent, type, (e) => {
                listener(this.s, e);
            }, options);
        }
    }

    /** 
     * Returns functionality that will set attributes on the parent component each render.
     */
    attr<U extends ValidElement>(attrName: string, valueFn: (s: S) => string): Functionality<U> {
        return (parent) => {
            this.pushRenderFn(this.domRenderFnList, (s) => setAttr(parent, attrName, valueFn(s)), parent);
        }
    }

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
     *                  TODO: getNext(item.id).render(item);
     *
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
    list<R extends ValidElement, T, U extends ValidElement>(
        root: Insertable<R>,
        templateFn: TemplateFn<T, U>,
        renderFn: (getNext: () => Component<T, U>, s: S, listRenderer: ListRenderer<R, T, U>) => void,
    ): ListRenderer<R, T, U> {
        const listRenderer = newListRenderer(root, () => newComponent(templateFn));
        this.pushRenderFn(this.domRenderFnList, (s) => {
            listRenderer.render((getNext) => {
                renderFn(getNext, s, listRenderer);
            });
            this.ifStatementOpen = listRenderer.lastIdx === 0;
        }, root);
        return listRenderer;
    }

    /** 
     * Returns functionality that will enable/disable a particular class in the classList each render.
     */
    class<U extends ValidElement>(className: string, predicate: (s: S) => boolean): Functionality<U> {
        return (parent) => {
            this.pushRenderFn(this.domRenderFnList, (s) => setClass(parent, className, predicate(s)), parent);
        }
    }

    /** 
     * Returns functionality that will sets the current value of an element's style each render.
     */
    style<U extends ValidElement, K extends StyleObject<U>>(val: K, valueFn: (s: S) => U["style"][K]): Functionality<U> {
        return (parent) => {
            const currentStyle = parent.el.style[val];
            this.pushRenderFn(this.domRenderFnList, (s) => setStyle(parent, val, valueFn(s) || currentStyle), parent);
        };
    }

    /**
     * Returns custom functionality, allowing for declaratively specifying a component's behaviour.
     * See the documentation for {@link el} for info on how that works.
     */
    functionality<U extends ValidElement> (fn: (val: Insertable<U>, s: S) => void): Functionality<U> {
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
    preRenderFn(fn: (s: S) => void, errorRoot?: Insertable<any>) {
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
    postRenderFn(fn: (s: S) => void, errorRoot?: Insertable<any>) {
        this.pushRenderFn(this.postRenderFnList, fn, errorRoot);
    }

    private renderFunctions(renderFns: RenderFn<S>[]) {
        const s = this.s;
        const defaultErrorRoot = this.root;

        countRender(this.templateName, this, renderFns.length);

        if (this.skipErrorBoundary) {
            for (let i = 0; i < renderFns.length; i++) {
                renderFns[i].fn(s);
            }
            return;
        }

        for (let i = 0; i < renderFns.length; i++) {
            const errorRoot = renderFns[i].root || defaultErrorRoot;
            const fn = renderFns[i].fn;

            // While this still won't catch errors with callbacks, it is still extremely helpful.
            // By catching the error at this component and logging it, we allow all other components to render as expected, and
            // It becomes a lot easier to spot the cause of a bug.
            //
            // TODO: consider doing this for callbacks as well, it shouldn't be too hard.

            try {
                setErrorClass(errorRoot, false, this.templateName);
                fn(s);
            } catch (e) {
                setErrorClass(errorRoot, true, this.templateName);

                // TODO: do something with these errors we're collecting. lmao.
                renderFns[i].error = e;
                console.error("An error occured while rendering your component:", e);

                // don't run more functions for this component if one of them errored
                break;
            }
        }
    }

    private pushRenderFn(renderFns: RenderFn<S>[], fn: (s: S) => void, root: Insertable<any> | undefined) {
        if (this.instantiated) {
            throw new Error("Can't add event handlers to this template (" + this.templateName + ") after it's been instantiated");
        }
        renderFns.push({ root, fn });
    }
}


function setErrorClass<T extends ValidElement>(root: Insertable<T> | Component<any, any>, state: boolean, templateName: string) {
    if (setClass(root, "catastrophic---error", state)) {
        const message = templateName ? `An error occured while updating the ${templateName} component`  :
            "An error occured while updating an element";
        root.el.style.setProperty("--error-text", JSON.stringify(`${message}. You've found a bug!`));
    } else {
        root.el.style.removeProperty("--error-text");
    }
}

function wasHiddenOrUninserted<T extends ValidElement>(ins: Insertable<T>) {
    return ins._isHidden || !ins.el.parentElement;
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
export class Component<T, U extends ValidElement> implements Insertable<U> {
    root: Insertable<U>;
    el: U;
    get _isHidden() { return this.root._isHidden; }
    set _isHidden(val: boolean) { this.root._isHidden = val; }
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
    /** Used for debugging purposes */
    templateName: string;
    renderFn: { fn: (s: T) => void };

    constructor(
        root: Insertable<U>, 
        renderFn: (s: T) => void, 
        s: T | undefined, 
        templateName: string,
    ) {
        this.root = root;
        this.el = root.el;
        this.templateName = templateName;
        this._s = s;
        this.renderFn = { fn: renderFn };
    }
    /**
     * Renders the component with the arguments provided.
     * 
     * if skipErrorBoundary has not been set to false (it is true by default), any exceptions are handled by 
     * adding the "catastrophic---error" css class to the root element of this component.
     */
    render(args: T) {
        this._s = args;
        this.renderWithCurrentState();
    }
    /**
     * Renders the component with the arguments provided.
     * 
     * if skipErrorBoundary has been set to true, any exceptions are handled by 
     * adding the "catastrophic---error" css class to the root element of this component.
     */
    renderWithCurrentState() {
        if (this.rendering) {
            throw new Error("Can't call a this's render method while it's already rendering");
        }

        if (this.instantiated) {
            checkForRenderMistake(this);
        }

        // Setting this value this late allows the this to render once before it's ever inserted.
        this.instantiated = true;

        this.rendering = true;

        try {
            this.renderFn.fn(this.s);
        } finally {
            this.rendering = false;
        }
    }
}

type RenderFn<S> = { fn: (s: S) => void; root: Insertable<any> | undefined; error?: any };
type TemplateFn<T, U extends ValidElement> = (rg: RenderGroup<T>) => Insertable<U>;

/**
 * Instantiates a {@link TemplateFn} into a useable component 
 * that can be inserted into the DOM and rendered one or more times.
 *
 * If {@link initialState} is specified, the component will be rendered once here itself.
 */
export function newComponent<T, U extends ValidElement, Si extends T>(
    templateFn: TemplateFn<T, U>,
    initialState?: Si,
    skipErrorBoundary = false
) {
    const rg = new RenderGroup<T>(
        initialState,
        templateFn.name ?? "",
        skipErrorBoundary,
    );

    const root = templateFn(rg);
    const component = new Component(root, rg.render.bind(rg), initialState, rg.templateName);
    rg.instantiatedRoot = root;
    setAttr(root, "data-template-name", rg.templateName);

    if (component._s !== undefined) {
        component.renderWithCurrentState();
    }

    return component;
}

// ---- List rendering API

export type ListRenderer<R extends ValidElement, T, U extends ValidElement> = Insertable<R> & {
    components: Component<T, U>[];
    lastIdx: number;
    getIdx(): number;
    render: (renderFn: (getNext: () => Component<T, U>) => void) => void;
};

export function newListRenderer<R extends ValidElement, T, U extends ValidElement>(
    root: Insertable<R>,
    // TODO: templateFn?
    createFn: () => Component<T, U>,
): ListRenderer<R, T, U> {
    function getNext() {
        if (renderer.lastIdx > renderer.components.length) {
            throw new Error("Something strange happened when resizing the component pool");
        }

        if (renderer.lastIdx === renderer.components.length) {
            const component = createFn();
            renderer.components.push(component);
            appendChild(root, component);
        }

        return renderer.components[renderer.lastIdx++];
    }

    let renderFn: ((getNext: () => Component<T, U>) => void) | undefined;
    function renderFnBinded() {
        renderFn?.(getNext);
    }

    const renderer: ListRenderer<R, T, U> = {
        el: root.el,
        get _isHidden() { return root._isHidden; },
        set _isHidden(val: boolean) { root._isHidden = val; },
        components: [],
        lastIdx: 0,
        getIdx() {
            // (We want to get the index of the current iteration, not the literal value of lastIdx)
            return renderer.lastIdx - 1;
        },
        render(renderFnIn) {
            renderer.lastIdx = 0;

            renderFn = renderFnIn;

            renderFnBinded();

            while (renderer.components.length > renderer.lastIdx) {
                const component = renderer.components.pop()!;
                component.el.remove();
            }
        },
    };

    return renderer;
}


// ---- debugging utils

let debug = false;
export function enableDebugMode() {
    debug = true;
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

