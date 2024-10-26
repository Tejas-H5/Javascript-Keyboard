import { RenderContext } from "./render-context";
import { getNonOverlappingThreadsSubset } from "./sequencer";
import { getItemLengthBeats, getItemStartBeats, NoteItem } from "./sequencer-state";
import { getKeyForNote, getSequencerPlaybackOrEditingCursor, InstrumentKey } from "./state";
import { div, RenderGroup } from "./utils/dom-utils";
import { inverseLerp } from "./utils/math-utils";

const GAMEPLAY_LOOKAHEAD_BEATS = 2;
const PADDING = 10;

type GameArgs = {
    ctx: RenderContext;
    thread: NoteItem[];
    start: number;
}

export function Gameplay(rg: RenderGroup<RenderContext>) {
    const threads: NoteItem[][] = [];
    let start = 0;

    rg.preRenderFn(s => {
        start = getSequencerPlaybackOrEditingCursor(s.globalState);
        getNonOverlappingThreadsSubset(
            s.sequencer._nonOverlappingItems,
            start, 
            start + GAMEPLAY_LOOKAHEAD_BEATS,
            threads
        );
    });

    return div({ class: "flex-1 col align-items-stretch justify-contents-center" }, [
        div({ class: "flex-1" }),
        rg.list(div({ class: "contents" }), Thread, (getNext, s) => {
            for (const thread of threads) {
                if (thread.length === 0) {
                    continue;
                }
                getNext().render({ ctx: s, thread, start });
            }
        }),
        rg.else(rg => div({ class: "contents" }, "Break")),
        div({ class: "flex-1" }),
    ])
}

function Thread(rg: RenderGroup<GameArgs>) {
    return div({ class: "row justify-contents-center" }, [
        rg.c(Letters, (c, s) => {
            c.render(s);
        }),
        div({ style: "width: 3px; top: 0; bottom: 0; background-color: var(--fg);" }),
        rg.c(Bars, (c, s) => {
            c.render(s);
        }),
    ])
}

function Letters(rg: RenderGroup<GameArgs>) {
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

    return rg.list(div({ class: "row justify-content-end flex-1" }), Letter, (getNext, s) => {
        // the letters closest to the center-line need to be the next letters  to press, and since this
        // component is positions on the left, it's going backwards.
        for (let i = s.thread.length - 1; i >= 0; i--) {
            const item = s.thread[i];
            getNext().render({ ctx: s.ctx, item });
        }
    });
}

function Bars(rg: RenderGroup<GameArgs>) {
    function Bar(rg: RenderGroup<{
        ctx: RenderContext;
        item: NoteItem;
        start: number;
    }>) {
        let leftPercent = 0;
        let widthPercent = 0;

        rg.preRenderFn(s => {
            const start = s.start;
            const end = start + GAMEPLAY_LOOKAHEAD_BEATS;
            const itemStart = getItemStartBeats(s.item);
            const itemLength = getItemLengthBeats(s.item);

            leftPercent = 100 * inverseLerp(start, end, itemStart);
            widthPercent = 100 * itemLength / GAMEPLAY_LOOKAHEAD_BEATS;

            // prevent the bar from going past the midpoint line
            if (leftPercent < 0) {
                widthPercent += leftPercent;
                leftPercent = 0;
            }
        });

        return div({
            style: "color: transparent; position: absolute; outline: 1px solid var(--fg); top: 0px; bottom: 0px;"
        }, [
            rg.style("left", () => leftPercent + "%"),
            rg.style("width", () => widthPercent + "%"),
        ]);
    }

    const root = div({ class: "flex-1 row justify-content-start relative", style: "height: 2ch; padding: 10px" })
    return rg.list(root, Bar, (getNext, s) => {
        // the letters closest to the center-line need to be the next letters  to press, and since this
        // component is positions on the left, it's going backwards.
        for (let i = s.thread.length - 1; i >= 0; i--) {
            const item = s.thread[i];
            getNext().render({ ctx: s.ctx, item, start: s.start });
        }
    });
}

