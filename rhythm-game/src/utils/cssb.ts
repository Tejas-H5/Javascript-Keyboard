import { type CssColor } from "src/utils/colour";

export function newStyleElement(): HTMLStyleElement {
    return document.createElement("style") as HTMLStyleElement;
}

const stylesStringBuilder: string[] = [];
const allClassNames = new Set<string>();

// collect every single style that was created till this point,
// and append it as a style node.
export function initCssbStyles(stylesRoot?: HTMLElement) {
    // NOTE: right now, you probably dont want to use document.body as your styles root, if that is also your app root.
    if (!stylesRoot) {
        stylesRoot = document.head;
    }

    const sb = stylesStringBuilder;
    if (sb.length > 0) {
        const text = sb.join("");
        stylesStringBuilder.length = 0;

        const styleNode = newStyleElement();
        styleNode.setAttribute("type", "text/css");
        styleNode.textContent = "\n\n" + text + "\n\n";
        stylesRoot.append(styleNode);
    }
}

/**
 * A util allowing components to register styles that they need to an inline stylesheet.
 * All styles in the entire bundle are string-built and appended in a `<style />` node as soon as
 * dom-utils is initialized. See {@link initializeDomUtils}
 *
 * The object approach allows us to add a prefix to all the class names we make.
 */
export function newCssBuilder(prefix: string = "") {
    const builder = stylesStringBuilder;
    return {
        /** Appends a CSS style to the builder. The prefix is not used. */
        s(string: string) {
            builder.push(string);
        },
        /** 
         * Returns `prefix + className`.
         * If this classname exists, we'll give you `prefix + classname + {incrementing number}`.
         */
        newClassName(className: string) {
            let name = prefix + className ;
            let baseName = name;
            let count = 2;
            while (allClassNames.has(name)) {
                // Should basically never happen. Would be interesting to see if it ever does, so I am logging it
                console.warn("conflicting class name " + name + ", generating another one");
                name = baseName + count;
                count++;
            }
            allClassNames.add(name);
            return name;
        },
        // makes a new class, it's variants, and returns the class name
        cn(className: string, styles: string[] | string): string {
            const name = this.newClassName(className);

            for (let style of styles) {
                const finalStyle = `.${name}${style}`;
                builder.push(finalStyle + "\n");
            }

            return name;
        },
    };
}

/** 
 * Use this to manage which app theme is 'current'.
 * Anything that isn't a string, number or colour-like object is ignored
 */
export function setCssVars(vars: Record<string, string | CssColor | object>, cssRoot?: HTMLElement) {
    if (!cssRoot) {
        cssRoot = document.querySelector(":root") as HTMLElement;
    }

    for (const k in vars) {
        const val = vars[k];
        if (typeof val === "string" || isColourLike(val)) {
            setCssVar(cssRoot, k, val);
        }
    }
}

export function isColourLike(val: object): val is CssColor {
    return "r" in val && "g" in val && "b" in val && "a" in val && "toString" in val;
}

export function setCssVar(cssRoot: HTMLElement, varName: string, value: string | CssColor) {
    const fullVarName = `--${varName}`;
    cssRoot.style.setProperty(fullVarName, "" + value);
}

