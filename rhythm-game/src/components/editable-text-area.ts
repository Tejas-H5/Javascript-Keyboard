import { el, im, ImCache, imdom } from "imcf";
import { BLOCK, cssVars, imui, INLINE, NA, PERCENT, setInputValue } from "imcf/im-ui";

export function getLineBeforePos(text: string, pos: number): string {
    const i = getLineStartPos(text, pos);
    return text.substring(i, pos);
}

export function getLineStartPos(text: string, pos: number): number {
    let i = pos;
    if (text[i] === "\r" || text[i] === "\n") {
        i--;
    }

    for (; i > 0; i--) {
        if (text[i] === "\r" || text[i] === "\n") {
            i++
            break;
        }
    }

    if (pos < i) {
        return 0;
    }

    return i;
}

export function newTextArea(initFn?: (el: HTMLTextAreaElement) => void): HTMLTextAreaElement {
    const textArea = document.createElement("textarea");

    initFn?.(textArea);

    return textArea
}

const cssb = imui.newCssBuilder();

const cnTextAreaRoot = cssb.newClassName("customTextArea");
cssb.s(`
.${cnTextAreaRoot} textarea { 
    white-space: pre-wrap; 
    padding: 5px; 
    caret-color: ${cssVars.fg};
    color: transparent;
}
.${cnTextAreaRoot}:has(textarea:focus), .${cnTextAreaRoot}:has(textarea:hover) { 
    background-color: ${cssVars.bg2};
}
`);


export type TextAreaArgs = {
    value: string;
    isOneLine?: boolean;
    placeholder?: string;
};

// My best attempt at making a text input with the layout semantics of a div.
// NOTE: this text area has a tonne of minor things wrong with it. we should fix them at some point.
//   - When I have a lot of empty newlines, and then click off, the empty lines go away 'as needed' 
export function imTextAreaBegin(c: ImCache, {
    value,
    isOneLine,
    placeholder = "",
}: TextAreaArgs) {
    let textArea: HTMLTextAreaElement;

    const root = imui.Begin(c, BLOCK); {
        if (im.IsFirstRender(c)) {
            imdom.setStyle(c, "display",   "flex");
            imdom.setStyle(c, "flex",      "1");
            imdom.setStyle(c, "height",    "100%");
            imdom.setStyle(c, "overflowY", "auto");
            imdom.setClass(c, cnTextAreaRoot);
        }

        // This is now always present.
        imui.Begin(c, BLOCK); imui.HandleLongWords(c); imui.Relative(c); imui.Size(c, 100, PERCENT, 0, NA); {
            if (im.IsFirstRender(c)) {
                imdom.setStyle(c, "height", "fit-content");
            }

            if (im.Memo(c, isOneLine)) {
                imdom.setStyle(c, "whiteSpace", isOneLine ? "nowrap" : "pre-wrap");
                imdom.setStyle(c, "overflow", isOneLine ? "hidden" : "");
            }

            // This is a facade that gives the text area the illusion of auto-sizing!
            // but it only works if the text doesn't end in whitespace....
            imui.Begin(c, INLINE); {
                const placeholderChanged = im.Memo(c, placeholder);
                const valueChanged = im.Memo(c, value);
                if (placeholderChanged || valueChanged) {
                    if (!value) {
                        imdom.setTextUnsafe(c, placeholder);
                        imdom.setStyle(c, "color", cssVars.fg2);
                    } else {
                        imdom.setTextUnsafe(c, value);
                        imdom.setStyle(c, "color", cssVars.fg);
                    }
                }
            } imui.End(c);

            // This full-stop at the end of the text is what prevents the text-area from collapsing in on itself
            imui.Begin(c, INLINE); {
                if (im.IsFirstRender(c)) {
                    imdom.setStyle(c, "color", "transparent");
                    imdom.setStyle(c, "userSelect", "none");
                    imdom.setTextUnsafe(c, ".");
                }
            } imui.End(c);

            textArea = imdom.ElBegin(c, el.TEXTAREA).root; {
                if (im.IsFirstRender(c)) {
                    imdom.setStyle(c, "all", "unset");
                    imdom.setStyle(c, "position", "absolute");
                    imdom.setStyle(c, "top", "0");
                    imdom.setStyle(c, "left", "0");
                    imdom.setStyle(c, "bottom", "0");
                    imdom.setStyle(c, "right", "0");
                    imdom.setStyle(c, "whiteSpace", "pre-wrap");
                    imdom.setStyle(c, "width", "100%");
                    imdom.setStyle(c, "height", "100%");
                    imdom.setStyle(c, "backgroundColor", "rgba(0, 0, 0, 0)");
                    imdom.setStyle(c, "color", "rgba(0, 0, 0, 0)");
                    imdom.setStyle(c, "overflowY", "hidden");
                    imdom.setStyle(c, "padding", "0");
                }

                if (im.Memo(c, value)) {
                    // don't update the value out from under the user implicitly
                    setInputValue(textArea, value);
                }

            } // imdom.ElEnd(c, el.TEXTAREA);
        } // imui.End(c);

        // TODO: some way to optionally render other stuff hereYou can now render your own overlays here.
    } // imui.End(c);


    return [root, textArea] as const;
}

export function imTextAreaEnd(c: ImCache) {
    {
        {
            {
            } imdom.ElEnd(c, el.TEXTAREA);
        } imui.End(c);
    } imui.End(c);
}



export type EditableTextAreaConfig = {
    useSpacesInsteadOfTabs?: boolean;
    tabStopSize?: number;
};

// Use this in a text area's "keydown" event handler
export function doExtraTextAreaInputHandling(
    e: KeyboardEvent,
    textArea: HTMLTextAreaElement,
    config: EditableTextAreaConfig
): boolean {
    const execCommand = document.execCommand.bind(document);

    // HTML text area doesn't like tabs, we need this additional code to be able to insert tabs (among other things).
    // Using the execCommand API is currently the only way to do this while perserving undo, 
    // and I won't be replacing it till there is really something better.
    const spacesInsteadOfTabs = config.useSpacesInsteadOfTabs ?? false;
    const tabStopSize = config.tabStopSize ?? 4;

    let text = textArea.value;
    const start = textArea.selectionStart;
    const end = textArea.selectionEnd;

    let handled = false;

    const getSpacesToRemove = (col: string) => {
        if (!config.useSpacesInsteadOfTabs) {
            return 1;
        }

        // if this bit has tabs, we can't do shiet
        if (![...col].every(c => c === " ")) {
            return 1;
        }

        // seems familiar, because it is - see the tab stop computation below
        let spacesToRemove = (col.length % tabStopSize)
        if (spacesToRemove === 0) {
            spacesToRemove = tabStopSize;
        }
        if (spacesToRemove > col.length) {
            spacesToRemove = col.length;
        }

        return spacesToRemove;
    }

    const getIndentation = (col: string): string => {
        if (!spacesInsteadOfTabs) {
            return "\t";
        }

        const numSpaces = tabStopSize - (col.length % tabStopSize);
        return " ".repeat(numSpaces);
    }

    if (e.key === "Backspace" && !e.altKey && !e.ctrlKey && !e.shiftKey && !e.metaKey) {
        if (start === end) {
            const col = getLineBeforePos(text, start);

            const spacesToRemove = getSpacesToRemove(col);
            if (spacesToRemove) {
                e.preventDefault();
                for (let i = 0; i < spacesToRemove; i++) {
                    execCommand("delete", false, undefined);
                    handled = true;
                }
            }
        }
    } else if (e.key === "Tab" && !e.altKey && !e.ctrlKey && !e.metaKey) {
        if (e.shiftKey) {
            e.preventDefault();

            let newStart = start;
            let newEnd = end;

            // iterating backwards allows us to delete text while iterating, since indices won't be shifted.
            let i = end;
            while (i >= start) {
                const col = getLineBeforePos(text, i);
                if (col.length === 0) {
                    i--;
                    continue;
                }

                const numNonWhitespaceAtColStart = col.trimStart().length;
                const pos = i - numNonWhitespaceAtColStart;
                textArea.selectionStart = pos;
                textArea.selectionEnd = pos;

                // de-indent by the correct amount.
                {
                    const col2 = col.substring(0, col.length - numNonWhitespaceAtColStart);
                    const spacesToRemove = getSpacesToRemove(col2);
                    for (let i = 0; i < spacesToRemove; i++) {
                        // cursor implicitly moves back 1 for each deletion.
                        execCommand("delete", false, undefined);
                        handled = true;
                        newEnd--;
                    }
                }

                i -= col.length;
            }

            textArea.selectionStart = newStart;
            textArea.selectionEnd = newEnd;
        } else {
            if (start === end) {
                const col = getLineBeforePos(text, start);
                const indentation = getIndentation(col);
                e.preventDefault();
                execCommand("insertText", false, indentation);
                handled = true;
            } else {
                e.preventDefault();

                let newStart = start;
                let newEnd = end;

                // iterating backwards allows us to delete text while iterating, since indices won't be shifted.
                let i = end;
                while (i >= start) {
                    const col = getLineBeforePos(text, i);
                    if (col.length === 0) {
                        i--;
                        continue;
                    }

                    const numNonWhitespaceAtColStart = col.trimStart().length;
                    const pos = i - numNonWhitespaceAtColStart;

                    // indent by the correct amount.
                    const col2 = col.substring(0, col.length - numNonWhitespaceAtColStart);
                    const indentation = getIndentation(col2);
                    textArea.selectionStart = pos;
                    textArea.selectionEnd = pos;

                    execCommand("insertText", false, indentation);
                    handled = true;
                    newEnd += indentation.length;

                    i -= col.length;
                }

                textArea.selectionStart = newStart;
                textArea.selectionEnd = newEnd;

            }
        }
    } else if (e.key === "Escape" && !e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && start !== end) {
        handled = true;
        e.stopImmediatePropagation();
        textArea.selectionEnd = textArea.selectionStart;
    }

    return handled;
}

