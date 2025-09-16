import { newCssBuilder } from "src/utils/cssb";
import { setInputValue } from "src/utils/dom-utils";
import { ImCache, imMemo, isFirstishRender } from "src/utils/im-core";
import { EL_TEXTAREA, elSetAttr, elSetClass, elSetStyle, elSetTextSafetyRemoved, imEl, imElEnd } from "src/utils/im-dom";
import { BLOCK, imLayout, imLayoutEnd, INLINE } from "./core/layout";
import { cn, cssVars } from "./core/stylesheets";

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

const cssb = newCssBuilder();

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

    const root = imLayout(c, BLOCK); {
        if (isFirstishRender(c)) {
            elSetClass(c, cn.flex1);
            elSetClass(c, cn.row);
            elSetClass(c, cn.h100);
            elSetClass(c, cn.overflowYAuto);
            elSetClass(c, cnTextAreaRoot);
        }

        // This is now always present.
        imLayout(c, BLOCK); {
            if (isFirstishRender(c)) {
                elSetClass(c, cn.handleLongWords);
                elSetClass(c, cn.relative);
                elSetClass(c, cn.w100);
                elSetClass(c, cn.hFitContent);
                elSetStyle(c, "minHeight", "100%");
            }

            if (imMemo(c, isOneLine)) {
                elSetClass(c, cn.preWrap, !isOneLine)
                elSetClass(c, cn.pre, !!isOneLine)
                elSetClass(c, cn.overflowHidden, isOneLine)
                elSetClass(c, cn.noWrap, !!isOneLine);
            }

            // This is a facade that gives the text area the illusion of auto-sizing!
            // but it only works if the text doesn't end in whitespace....
            imLayout(c, INLINE); {
                const placeholderChanged = imMemo(c, placeholder);
                const valueChanged = imMemo(c, value);
                if (placeholderChanged || valueChanged) {
                    if (!value) {
                        elSetTextSafetyRemoved(c, placeholder);
                        elSetStyle(c, "color", cssVars.fg2);
                    } else {
                        elSetTextSafetyRemoved(c, value);
                        elSetStyle(c, "color", cssVars.fg);
                    }
                }
            } imLayoutEnd(c);

            // This full-stop at the end of the text is what prevents the text-area from collapsing in on itself
            imLayout(c, INLINE); {
                if (isFirstishRender(c)) {
                    elSetStyle(c, "color", "transparent");
                    elSetStyle(c, "userSelect", "none");
                    elSetTextSafetyRemoved(c, ".");
                }
            } imLayoutEnd(c);

            textArea = imEl(c, EL_TEXTAREA).root; {
                if (isFirstishRender(c)) {
                    elSetAttr(c, "class", [cn.allUnset, cn.absoluteFill, cn.preWrap, cn.w100, cn.h100].join(" "));
                    elSetAttr(c, "style", "background-color: transparent; color: transparent; overflow-y: hidden; padding: 0px");
                }

                if (imMemo(c, value)) {
                    // don't update the value out from under the user implicitly
                    setInputValue(textArea, value);
                }

            } // imElEnd(c, EL_TEXTAREA);
        } // imLayoutEnd(c);

        // TODO: some way to optionally render other stuff hereYou can now render your own overlays here.
    } // imLayoutEnd(c);


    return [root, textArea] as const;
}

export function imTextAreaEnd(c: ImCache) {
    {
        {
            {
            } imElEnd(c, EL_TEXTAREA);
        } imLayoutEnd(c);
    } imLayoutEnd(c);
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

