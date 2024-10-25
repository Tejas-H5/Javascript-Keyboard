import { RenderContext } from "./render-context";
import { getCursorStartBeats, getItemLengthBeats, getItemStartBeats, NoteItem } from "./sequencer-state";
import { getKeyForNote, InstrumentKey } from "./state";
import { div, RenderGroup } from "./utils/dom-utils";
import { inverseLerp } from "./utils/math-utils";

const GAMEPLAY_LOOKAHEAD_BEATS = 32;
const PADDING = 10;

export function Gameplay(rg: RenderGroup<RenderContext>) {
    return div({ class: "flex-1 row align-items-center justify-contents-center" }, [
        div({ class: "flex-1" }, [
            rg.list(div({ class: "contents" }), Letters, (getNext, s) => {
                for (const thread of s.sequencer._nonOverlappingItems) {
                    getNext().render({ ctx: s, thread });
                }
            }),
        ]),
        div({ style: "width: 3px; top: 0; bottom: 0; background-color: var(--fg);" }),
        div({ class: "flex-1" }, [
            rg.list(div({ class: "contents" }), Bars, (getNext, s) => {
                for (const thread of s.sequencer._nonOverlappingItems) {
                    getNext().render({ ctx: s, thread });
                }
            }),
        ]),
    ])
}

function Letters(rg: RenderGroup<{
    ctx: RenderContext;
    thread: NoteItem[];
}>) {
    function Letter(rg: RenderGroup<{
        ctx: RenderContext;
        item: NoteItem;
    }>) {
        let key: InstrumentKey | undefined;

        rg.preRenderFn(s => {
            key = getKeyForNote(s.ctx.globalState, s.item.note);
        });

        return div({}, [
            rg.text(() => key ? key.text : "?"),
            rg.style("padding", () => PADDING + "px")
        ]);
    }

    return rg.list(div({ class: "row justify-content-end" }), Letter, (getNext, s) => {
        // the letters closest to the center-line need to be the next letters  to press, and since this
        // component is positions on the left, it's going backwards.
        for (let i = s.thread.length - 1; i >= 0; i--) {
            const item = s.thread[i];
            const itemStart = getItemStartBeats(item);
            if (itemStart < getCursorStartBeats(s.ctx.sequencer)) {
                break;
            }
            if (itemStart > getCursorStartBeats(s.ctx.sequencer) + GAMEPLAY_LOOKAHEAD_BEATS) {
                continue;
            }

            getNext().render({ ctx: s.ctx, item });
        }
    });
}

function Bars(rg: RenderGroup<{
    ctx: RenderContext;
    thread: NoteItem[];
}>) {
    function Bar(rg: RenderGroup<{
        ctx: RenderContext;
        item: NoteItem;
    }>) {
        let leftPercent = 0;
        let widthPercent = 0;

        rg.preRenderFn(s => {
            const start = getCursorStartBeats(s.ctx.sequencer);
            const end = getCursorStartBeats(s.ctx.sequencer) + GAMEPLAY_LOOKAHEAD_BEATS;
            const itemStart = getItemStartBeats(s.item);
            const itemLength = getItemLengthBeats(s.item);

            leftPercent = 100 * inverseLerp(start, end, itemStart);
            widthPercent = 100 * itemLength / GAMEPLAY_LOOKAHEAD_BEATS;
        });

        return div({
            style: "color: transparent; padding: 10px; position: absolute; outline: 1px solid var(--fg); top: 0px; bottom: 0px;"
        }, [
            rg.style("left", () => leftPercent + "%"),
            rg.style("width", () => widthPercent + "%"),
            rg.style("padding", () => PADDING + "px"),
        ]);
    }

    const root = div({ class: "row justify-content-start relative", style: "height: 2ch; padding: 10px" })
    return rg.list(root, Bar, (getNext, s) => {
        // the letters closest to the center-line need to be the next letters  to press, and since this
        // component is positions on the left, it's going backwards.
        for (let i = s.thread.length - 1; i >= 0; i--) {
            const item = s.thread[i];
            const itemStart = getItemStartBeats(item);
            if (itemStart < getCursorStartBeats(s.ctx.sequencer)) {
                break;
            }
            if (itemStart > getCursorStartBeats(s.ctx.sequencer) + GAMEPLAY_LOOKAHEAD_BEATS) {
                continue;
            }

            getNext().render({ ctx: s.ctx, item });
        }
    });
}

