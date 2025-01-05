import { GlobalContext } from "src/state/global-context";
import {
    getKeyForNote,
    InstrumentKey,
    KeyboardState
} from "src/state/keyboard-state";
import {
    CommandItem,
    getItemLengthBeats,
    getItemStartBeats,
    getNonOverlappingThreadsSubset,
    getSequencerPlaybackOrEditingCursor,
    getTimelineMusicNoteThreads,
    NoteItem,
    NoteMapEntry
} from "src/state/sequencer-state";
import {
    div,
    RenderGroup,
    span
} from "src/utils/dom-utils";
import { inverseLerp } from "src/utils/math-utils";
import { getNoteHashKey } from "src/utils/music-theory-utils";

const GAMEPLAY_LOOKAHEAD_BEATS = 2;
const GAMEPLAY_LOADAHEAD_BEATS = 6;
const PADDING = 10;

type GameArgs = {
    ctx: GlobalContext;
    thread: NoteItem[];
    start: number;
}


export type KeysMapEntry = { 
    instrumentKey: InstrumentKey;

    // NOTE: this is a non-owning reference
    _items: NoteItem[];
};

export function notesMapToKeysMap(
    keyboard: KeyboardState,
    srcNotesMap: Map<string, NoteMapEntry>,
    dstKeysMap: Map<string, KeysMapEntry>,
) {
    for (const k of keyboard.flatKeys) {
        let block = dstKeysMap.get(k.keyboardKey);
        if (!block) {
            block = { instrumentKey: k, _items: [] };
            dstKeysMap.set(k.keyboardKey, block);
        }

        const noteHashKey = getNoteHashKey(k.musicNote);
        const notesMapEntry = srcNotesMap.get(noteHashKey);
        if (!notesMapEntry) {
            continue;
        }

        block._items = notesMapEntry.items;
    }
}


export function Gameplay(rg: RenderGroup<GlobalContext>) {
    let start = 0;
    let midpoint = 0;

    const notesMap = new Map<string, NoteMapEntry>();
    const keysMap = new Map<string, KeysMapEntry>();
    const commandsList: CommandItem[] = [];

    rg.preRenderFn(s => {
        start = getSequencerPlaybackOrEditingCursor(s.sequencer);

        // getNonOverlappingThreadsSubset(
        //     s.sequencer._nonOverlappingItems,
        //     start,
        //     start + GAMEPLAY_LOOKAHEAD_BEATS,
        //     threads
        // );

        
        getTimelineMusicNoteThreads(
            s.sequencer.timeline,
            start,
            start + GAMEPLAY_LOADAHEAD_BEATS,
            notesMap,
            commandsList
        );

        notesMapToKeysMap(s.keyboard, notesMap, keysMap);

        midpoint = Math.floor(keysMap.size / 2);
    });

    return div({
        class: "flex-1 col align-items-stretch justify-content-center overflow-hidden",
    }, [
        div({ class: "flex-1 row align-items-stretch justify-content-center overflow-hidden" }, [
            rg.list(div({ class: "contents" }), VerticalThread, (getNext, s) => {
                // for (const thread of notesMap.values()) {
                //     if (thread.items.length === 0) {
                //         continue;
                //     }
                //
                //     getNext().render({
                //         ctx: s,
                //         thread: thread.items,
                //         start
                //     });
                // }

                let i = 0;
                for (const thread of keysMap.values()) {
                    getNext().render({
                        ctx: s,
                        thread: thread._items,
                        start,
                        instrumentKey: thread.instrumentKey,
                    })

                    // i++;
                    // if (i >= midpoint) {
                    //     break;
                    // }
                }
            }),
        ]),
        /* div({ class: "flex-1 row align-items-stretch justify-content-center overflow-hidden" }, [
            rg.list(div({ class: "contents" }), VerticalThread, (getNext, s) => {
                // for (const thread of notesMap.values()) {
                //     if (thread.items.length === 0) {
                //         continue;
                //     }
                //
                //     getNext().render({
                //         ctx: s,
                //         thread: thread.items,
                //         start
                //     });
                // }

                let i = 0;
                for (const thread of keysMap.values()) {
                    if (i < midpoint) {
                        i++;
                        continue;
                    }

                    getNext().render({
                        ctx: s,
                        thread: thread._items,
                        start,
                        instrumentKey: thread.instrumentKey,
                    })
                }
            }),
        ]) */
    ]);
}

function VerticalThread(rg: RenderGroup<{
    ctx: GlobalContext;
    thread: NoteItem[];
    start: number;
    instrumentKey: InstrumentKey | undefined;
}>) {
    function Bar(rg: RenderGroup<{
        ctx: GlobalContext;
        item: NoteItem;
        start: number;
    }>) {
        let heightPercent = 0;
        let bottomPercent = 0;
        rg.preRenderFn(s => {
            const start = s.start;
            const end = start + GAMEPLAY_LOOKAHEAD_BEATS;
            const itemStart = getItemStartBeats(s.item);
            const itemLength = getItemLengthBeats(s.item);

            bottomPercent = 100 * inverseLerp(start, end, itemStart);
            heightPercent = 100 * itemLength / GAMEPLAY_LOOKAHEAD_BEATS;

            // prevent the bar from going past the midpoint line
            if (bottomPercent < 0) {
                heightPercent += bottomPercent;
                bottomPercent = 0;
            }

        });

        return div({
            style: "position: absolute; outline: 1px solid var(--fg); left: 0; right: 0; z-index: 10;" +
                "color: transparent; background-color: var(--fg); transition: background-color 0.2s;"
        }, [
            rg.style("bottom", () => bottomPercent + "%"),
            rg.style("height", () => heightPercent + "%"),
        ]);
    }

    return div({ 
        class: "col align-items-center justify-content-center", 
        style: "width: 40px; font-size: 64px;" 
    }, [
        span({ style: "transition: color 0.2s; height: 2ch;" }, [
            rg.style("color", s => s.thread.length === 0 ? "var(--bg2)" : "var(--fg)"),
            rg.text((s) => s.instrumentKey ? s.instrumentKey.text : "?"),
        ]),
        div({ style: "height: 3px; left: 0; right: 0; background-color: var(--fg);" }),
        div({ class: "flex-1 relative w-100 overflow-hidden", style: "transition: background-color 0.2s;" }, [
            rg.style("backgroundColor", s => s.thread.length === 0 ? "var(--bg)" : "var(--bg2)"),
            rg.list(div({ class: "contents" }), Bar, (getNext, s) => {
                for (const item of s.thread) {
                    getNext().render({
                        ctx: s.ctx,
                        item, 
                        start: s.start,
                    });
                }
            }),
        ]),
        div({ style: "height: 3px; left: 0; right: 0; background-color: var(--fg);" }),
        span({ style: "transition: color 0.2s; height: 2ch;" }, [
            rg.style("color", s => s.thread.length === 0 ? "var(--bg2)" : "var(--fg)"),
            rg.text((s) => s.instrumentKey ? s.instrumentKey.text : "?"),
        ]),
    ]);
}


export function GameplayV1(rg: RenderGroup<GlobalContext>) {
    const threads: NoteItem[][] = [];
    let start = 0;

    rg.preRenderFn(s => {
        start = getSequencerPlaybackOrEditingCursor(s.sequencer);
        getNonOverlappingThreadsSubset(
            s.sequencer._nonOverlappingItems,
            start, 
            start + GAMEPLAY_LOADAHEAD_BEATS,
            threads
        );
    });

    return div({ class: "flex-1 col align-items-stretch justify-contents-center overflow-hidden" }, [
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
    return div({ class: "row justify-content-center" }, [
        rg.c(Bars, (c, s) => {
            c.render(s);
        }),
        div({ style: "width: 3px; top: 0; bottom: 0; background-color: var(--fg);" }),
        rg.c(Letters, (c, s) => {
            c.render(s);
        }),
    ])
}

function Letters(rg: RenderGroup<GameArgs>) {
    function Letter(rg: RenderGroup<{
        ctx: GlobalContext;
        item: NoteItem;
        flipped: boolean;
    }>) {
        let key: InstrumentKey | undefined;

        rg.preRenderFn(s => {
            key = getKeyForNote(s.ctx.keyboard, s.item.note);
        });

        return div({}, [
            rg.text(() => key ? key.text : "?"),
            rg.style("padding", () => PADDING + "px"),
            rg.style("justifyContent", s => s.flipped ? "left" : "right"),
        ]);
    }

    return rg.list(div({ class: "row flex-1" }), Letter, (getNext, s) => {
        // the letters closest to the center-line need to be the next letters  to press, and since this
        // component is positions on the left, it's going backwards.
        for (let i = s.thread.length - 1; i >= 0; i--) {
            const item = s.thread[i];
            getNext().render({ 
                ctx: s.ctx, 
                item,
                flipped: true,
            });
        }
    });
}

function Bars(rg: RenderGroup<GameArgs>) {
    function Bar(rg: RenderGroup<{
        ctx: GlobalContext;
        item: NoteItem;
        start: number;
        flipped: boolean;
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
            rg.style("left", s => s.flipped ? "" : (leftPercent + "%")),
            rg.style("right", s => !s.flipped ? "" : (leftPercent + "%")),
            rg.style("width", () => widthPercent + "%"),
        ]);
    }

    const root = div({ class: "flex-1 row justify-content-start relative", style: "height: 2ch; padding: 10px" })
    return rg.list(root, Bar, (getNext, s) => {
        // the letters closest to the center-line need to be the next letters  to press, and since this
        // component is positions on the left, it's going backwards.
        for (let i = s.thread.length - 1; i >= 0; i--) {
            const item = s.thread[i];
            getNext().render({ 
                ctx: s.ctx, 
                item, 
                start: s.start ,
                flipped: true,
            });
        }
    });
}

