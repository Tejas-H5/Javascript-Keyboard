import { Button } from "./components/button";
import { RenderContext } from "./render-context";
import {
    CommandItem,
    divisorSnap,
    getCursorStartBeats,
    getItemLengthBeats,
    getItemStartBeats,
    getNextItemIndex,
    getPrevItemIndex,
    getRangeSelectionEndBeats,
    getRangeSelectionStartBeats,
    getSelectionRange,
    hasRangeSelection,
    isItemUnderCursor,
    NoteItem,
    SequencerState,
    TIMELINE_ITEM_BPM,
    TIMELINE_ITEM_NOTE,
    TimelineItem
} from "./sequencer-state";
import {
    getCurrentPlayingBeats,
    getKeyForNote,
    GlobalState,
    isItemBeingPlayed,
    isItemRangeSelected
} from "./state";
import { unreachable } from "./utils/asserts";
import { div, getState, RenderGroup } from "./utils/dom-utils";
import { inverseLerp, lerp } from "./utils/math-utils";
import { compareMusicNotes, getNoteHashKey, getNoteText, MusicNote } from "./utils/music-theory-utils";


export function getMusicNoteText(n: MusicNote): string {
    if (n.sample) {
        return n.sample;
    }
    if (n.noteIndex) {
        return getNoteText(n.noteIndex);
    }
    return "<???>";
}

export function getItemSequencerText(globalState: GlobalState, item: TimelineItem): string {
    if (item.type === TIMELINE_ITEM_NOTE) {
        const key = getKeyForNote(globalState, item.note);
        const keyText = key ? key.text.toUpperCase() : "<no key!>";
        return keyText + " " + getMusicNoteText(item.note);
    }

    if (item.type === TIMELINE_ITEM_BPM) {
        return "bpm=" + item.bpm;
    }

    return unreachable(item);
}

function timelinePosToString(numerator: number, divisor: number): string {
    const num = Math.floor(numerator / divisor);
    const fractional = numerator % divisor;
    return num + " " + fractional + "/" + divisor;
}

export type NoteMapEntry = { 
    musicNote: MusicNote; 
    items: NoteItem[];
};
type SequencerUIInternalState = {
    leftExtent: number;
    leftExtentAnimated: number;
    leftExtentIdx: number;
    rightExtent: number;
    rightExtentAnimated: number;
    rightExtentIdx: number;
    notesMap: Map<string, NoteMapEntry>;
    noteOrder: NoteMapEntry[];
    commandsList: CommandItem[]
};

function GridLine(rg: RenderGroup<{ text: string, divisor: number; }>) {
    return div({ class: "flex-1" }, [
        rg.text(s => s.text),
    ]);
}

function getSequencerThreads(
    sequencer: SequencerState,
    startBeats: number,
    endBeats: number,
    dstNotesMap: Map<string, NoteMapEntry>,
    dstCommandsMap: CommandItem[],
) {
    dstCommandsMap.length = 0;
    for (const val of dstNotesMap.values()) {
        val.items.length = 0;
    }

    const timeline = sequencer.timeline;
    let start = getPrevItemIndex(sequencer.timeline, startBeats, 0);
    let end = getNextItemIndex(sequencer.timeline, endBeats, timeline.length - 1);
    for (let i = start; i <= end; i++) {
        const item = timeline[i];
        if (item.type === TIMELINE_ITEM_BPM) {
            dstCommandsMap.push(item);
            continue;
        }

        if (item.type === TIMELINE_ITEM_NOTE) {
            const key = getNoteHashKey(item.note);
            const entry = dstNotesMap.get(key) ?? { musicNote: item.note, items: [] };

            entry.musicNote = item.note;
            entry.items.push(item);

            dstNotesMap.set(key, entry);

            continue;
        }

        unreachable(item);
    }
}


// The number of divisions to show before AND after the cursor.
const NUM_EXTENT_DIVISIONS = 16;

// TODO: there's some redundancy here, we should get rid of it.
export function getSequencerLeftExtent(sequencer: SequencerState): number {
    return -NUM_EXTENT_DIVISIONS / sequencer.cursorDivisor;
}
export function getSequencerRightExtent(sequencer: SequencerState): number {
    return NUM_EXTENT_DIVISIONS / sequencer.cursorDivisor;
}

/**
 * This component handles both the editing UI and the gameplay UI
 */
export function Sequencer(rg: RenderGroup<RenderContext>) {

    function handleMouseLeave() {
        const state = getState(rg).state;
        state.currentHoveredTimelineItemIdx = -1;
        rg.renderWithCurrentState();
    }

    let lastCursorStartBeats = -1,
        lastCursorStartDivisor = -1,
        lastUpdatedTime = -1,
        invalidateCache = false;

    let currentCursorAnimated = -1,
        divisorAnimated = 4;

    const internalState: SequencerUIInternalState = {
        leftExtent: 0,
        leftExtentAnimated: 0,
        leftExtentIdx: 0,
        rightExtent: 0,
        rightExtentAnimated: 0,
        rightExtentIdx: 0,
        notesMap: new Map(),
        noteOrder: [],
        commandsList: [],
    };

    rg.preRenderFn(s => {
        let cursorStartBeats = getCursorStartBeats(s.state);
        if (s.state.isPlaying) {
            // move to where we're currently playing at all times
            cursorStartBeats = getCurrentPlayingBeats(s.globalState);
        } else if (s.state.isRangeSelecting) {
            cursorStartBeats = getRangeSelectionEndBeats(s.state);
        }
        const divisor = s.state.cursorDivisor;

        // Compute animation factors every frame without memoization
        {
            // const lerpFactor = 0.07; // for debugging
            const lerpFactor = 0.7;
            currentCursorAnimated = lerp(currentCursorAnimated, lastCursorStartBeats, lerpFactor);
            divisorAnimated = lerp(
                divisorAnimated,
                s.state.cursorDivisor,
                lerpFactor,
            );
            let leftExtent = cursorStartBeats + getSequencerLeftExtent(s.state);
            let rightExtent = cursorStartBeats + getSequencerRightExtent(s.state);
            internalState.leftExtent = leftExtent;
            internalState.rightExtent = rightExtent;
            internalState.leftExtentAnimated = lerp(internalState.leftExtentAnimated, leftExtent, lerpFactor);
            internalState.rightExtentAnimated = lerp(internalState.rightExtentAnimated, rightExtent, lerpFactor);

            internalState.leftExtentIdx = getPrevItemIndex(s.state.timeline, internalState.leftExtentAnimated);
            if (internalState.leftExtentIdx === -1) {
                internalState.leftExtentIdx = 0;
            }

            internalState.rightExtentIdx = getNextItemIndex(s.state.timeline, internalState.rightExtentAnimated);
            if (internalState.rightExtentIdx === -1) {
                internalState.rightExtentIdx = s.state.timeline.length - 1;
            }
        }

        // Recompute the non-overlapping items in the sequencer timeline as needed
        if (
            lastCursorStartBeats !== cursorStartBeats
            || lastCursorStartDivisor !== divisor
            || lastUpdatedTime !== s.state._timelineLastUpdated
            || invalidateCache
        ) {
            lastUpdatedTime = s.state._timelineLastUpdated;
            lastCursorStartBeats = cursorStartBeats;
            lastCursorStartDivisor = divisor;
            invalidateCache = false;

            getSequencerThreads(
                s.state,
                internalState.leftExtentAnimated,
                internalState.rightExtentAnimated,
                internalState.notesMap,
                internalState.commandsList
            );

            // recompute the note order
            internalState.noteOrder.length = 0;
            for (const entry of internalState.notesMap.values()) {
                if (entry.items.length === 0) {
                    continue;
                }
                internalState.noteOrder.push(entry);
            }
            internalState.noteOrder.sort((a, b) => {
                return compareMusicNotes(a.musicNote, b.musicNote);
            });
        }
    });

    return div({
        class: "flex-1 col",
        style: "padding: 10px",
    }, [
        rg.if(
            s => hasRangeSelection(s.state),
            rg => div({ class: "relative" }, [
                rg.text(s => {
                    const [start, end] = getSelectionRange(s.state);
                    if (start === -1 || end === -1) {
                        return "none selected";
                    }
                    return (end - start + 1) + " selected";
                }),
            ]),
        ),
        div({ class: "row" }, [
            rg.text(() => Math.floor(internalState.leftExtentAnimated) + "ms"),
            div({ class: "flex-1" }),
            rg.text(() => Math.floor(internalState.rightExtentAnimated) + "ms"),
        ]),
        div({
            class: "relative flex-1 overflow-y-auto",
        }, [
            rg.list(div({ class: "contents" }), SequencerVerticalLine, (getNext, s) => {
                const startNonFloored = internalState.leftExtent;
                const start = divisorSnap(startNonFloored, s.state.cursorDivisor);
                const endNonFloored = internalState.rightExtent;
                const end = divisorSnap(endNonFloored, s.state.cursorDivisor);

                // grid lines
                for (let x = start; x < end; x += 1 / s.state.cursorDivisor) {
                    getNext().render({
                        internalState,
                        beats: x,
                        color: "var(--bg2)",
                    });
                }

                // playback vertical line
                getNext().render({
                    internalState,
                    beats: getCurrentPlayingBeats(s.globalState),
                    color: "var(--playback)"
                });

                // range select lines
                getNext().render({
                    internalState,
                    beats: getRangeSelectionStartBeats(s.state),
                    color: "var(--mg)"
                });

                getNext().render({
                    internalState,
                    beats: getRangeSelectionEndBeats(s.state),
                    color: "var(--mg)"
                })

                // cursor start vertical line
                getNext().render({
                    internalState,
                    beats: lastCursorStartBeats,
                    color: "var(--fg)"
                });
            }),
            () => {
                const root = div({
                    style: "border-top: 1px solid var(--fg); border-bottom: 1px solid var(--fg);"
                });
                return rg.list(root, SequencerNotesUI, (getNext, s) => {
                    const c = getNext();
                    c.render({
                        state: s.state,
                        globalState: s.globalState,
                        render: s.render,
                        internalState,
                        musicNote: null,
                        items: internalState.commandsList,
                    });

                    for (const entry of internalState.noteOrder) {
                        const c = getNext();
                        c.render({
                            state: s.state,
                            globalState: s.globalState,
                            render: s.render,
                            internalState,
                            musicNote: entry.musicNote, 
                            items: entry.items,
                        });
                    }
                });
            }
        ]),
        div({ class: "row justify-content-center" }, [
            rg.text(s => timelinePosToString(s.state.cursorStart, s.state.cursorDivisor)),
        ]),
        rg.list(div({ class: "row" }), GridLine, (getNext, s) => {
            for (let i = 0; i < NUM_EXTENT_DIVISIONS; i++) {
                const gridLineAmount = i - NUM_EXTENT_DIVISIONS / 2;
                // const timestamp = getTime(s.state._currentBpm, s.state.cursorDivisor, s.state.cursorStartBeats + gridLineAmount)
                getNext().render({
                    // text: timestamp + "ms"
                    text: "", //timelinePosToString(s.state.cursorStartPos[0] + gridLineAmount, s.state.cursorStartPos[1]) 
                    divisor: s.state.cursorDivisor,
                });
            }
        })
    ]);
}

function getAbsoluteLeftPercent(
    internalState: SequencerUIInternalState, 
    beats: number
): number {
    return inverseLerp(
        internalState.leftExtentAnimated,
        internalState.rightExtentAnimated,
        beats,
    ) * 100;
}

function SequencerVerticalLine(rg: RenderGroup<{
    internalState: SequencerUIInternalState;
    beats: number;
    color: string;
}>) {
    let absolutePercent = 0;

    rg.preRenderFn((s) => {
        absolutePercent = getAbsoluteLeftPercent(s.internalState, s.beats);
    });

    return rg.if(
        () => absolutePercent >= 0 && absolutePercent <= 100,
        rg => div({
            class: "absolute",
            style: "width: 3px; top: 0; bottom: 0;"
        }, [
            rg.style("left", () => absolutePercent + "%"),
            rg.style("backgroundColor", s => s.color),
        ])
    );
}


function SequencerNotesUI(rg: RenderGroup<{
    state: SequencerState;
    globalState: GlobalState;
    internalState: SequencerUIInternalState;
    render(): void;
    musicNote: MusicNote | null;
    items: TimelineItem[];
}>) {
    return div({ class: "relative", style: "padding: 3px 10px;" }, [
        rg.text(s => s.musicNote ? getItemSequencerText(s.globalState, s.items[0]) : "null"),
        rg.list(div(), SequencerThreadItemUI, (getNext, s) => {
            for (let i = 0; i < s.items.length; i++) {
                const c = getNext();
                c.render({
                    item: s.items[i],
                    state: s.state,
                    internalState: s.internalState,
                    render: s.render,
                    globalState: s.globalState,
                });
            }
        })
    ]);
}


function SequencerThreadItemUI(rg: RenderGroup<{
    item: TimelineItem;
    state: SequencerState;
    globalState: GlobalState;
    internalState: SequencerUIInternalState;
    render(): void;
}>) {
    let text = "";
    let extentSize = 0;
    let leftPercent = 0;
    let width = 0;
    let isUnderCursor = false;
    let isBeingPlayed = false;

    rg.preRenderFn(s => {
        text = getItemSequencerText(s.globalState, s.item);

        // debug code
        // const durationText = s.item.type === TIMELINE_ITEM_NOTE ? (":" + s.item.len.toFixed(2)) : "";
        // text = timelinePosToString(s.item.start, s.item.divisor) + ":" + durationText + " " + text;

        const left = s.internalState.leftExtentAnimated;
        const right = s.internalState.rightExtentAnimated;
        extentSize = right - left;

        leftPercent = 100 * (getItemStartBeats(s.item) - left) / extentSize;
        const MIN_WIDTH_PERCENT = 1;
        if (s.item.type === TIMELINE_ITEM_NOTE) {
            width = Math.max(100 * getItemLengthBeats(s.item) / extentSize, MIN_WIDTH_PERCENT);
        } else {
            width = MIN_WIDTH_PERCENT;
        }

        if (s.item.type === TIMELINE_ITEM_NOTE) {
            const sequencer = s.state;
            const cursorStart = getCursorStartBeats(sequencer);

            if (hasRangeSelection(s.state)) {
                isUnderCursor = isItemRangeSelected(s.globalState, s.item);
            } else {
                isUnderCursor = isItemUnderCursor(s.item, cursorStart);
            }

            isBeingPlayed = isItemBeingPlayed(s.globalState, s.item);
        }
    });

    return div({
        class: "nowrap",
        style: "position: absolute; overflow-x: clip; padding: 3px 10px; border: 1px solid var(--fg); box-sizing: border-box; top: 0;",
    }, [
        rg.style("left", () => leftPercent + "%"),
        rg.style("width", () => width + "%"),
        rg.style("backgroundColor", () => isBeingPlayed ? "var(--playback)" : isUnderCursor ? "var(--bg2)" : "var(--bg)"),
        rg.text(() => text),
    ]);
}

// allows someone to specifically select a number between 1 and 16
function DivisionInput(rg: RenderGroup<{
    value: number;
    onChange(val: number): void;
}>) {
    function onChange(val: number) {
        const s = getState(rg);
        if (val > 0 && val <= 16) {
            s.onChange(val);
        }
    }

    function getPrev(val: number) {
        //truly I can't think of the math formula for this...
        switch (val) {
            case 1: return 1;
            case 2: return 1;
            case 3: return 1;
            case 4: return 2;
            case 5: return 1;
            case 6: return 3;
            case 7: return 1;
            case 8: return 4;
            case 9: return 6;
            case 10: return 5;
            case 11: return 1;
            case 12: return 6;
            case 13: return 12;
            case 14: return 7;
            case 15: return 10;
            case 16: return 12;
        }
        throw new Error("Invalid val: " + val);
    }

    function getNext(val: number) {
        //truly I can't think of the math formula for this either ...
        switch (val) {
            case 1: return 2;
            case 2: return 4;
            case 3: return 6;
            case 4: return 8;
            case 5: return 10;
            case 6: return 12;
            case 7: return 14;
            case 8: return 16;
            case 9: return 12;
            case 10: return 15;
            case 11: return 13;
            case 12: return 16;
            case 13: return 15;
            case 14: return 16;
            case 15: return 16;
            case 16: return 16;
        }
        throw new Error("Invalid val: " + val);
    }

    return div({ class: "row justify-content-center" }, [
        rg.c(Button, (c, s) => c.render({
            text: "<",
            onClick() {
                onChange(getPrev(s.value));
            }
        })),
        rg.c(Button, (c, s) => c.render({
            text: "-",
            onClick: () => onChange(s.value - 1),
        })),
        div({ class: "flex-1" }),
        rg.text(s => "1 / " + s.value),
        div({ class: "flex-1" }),
        rg.c(Button, (c, s) => c.render({
            text: "+",
            onClick: () => onChange(s.value + 1),
        })),
        rg.c(Button, (c, s) => c.render({
            text: ">",
            onClick() {
                onChange(getNext(s.value));
            }
        })),
    ]);
}


function BpmInput(rg: RenderGroup<{
    value: number;
    onChange(val: number): void;
}>) {
    return div({ class: "row justify-content-center" }, [
        rg.c(Button, (c, s) => c.render({
            text: "<",
            onClick() {
                s.onChange(s.value - 10);
            }
        })),
        rg.c(Button, (c, s) => c.render({
            text: "-",
            onClick() {
                s.onChange(s.value - 1);
            }
        })),
        div({ class: "flex-1" }),
        rg.text(s => s.value.toFixed(1) + ""),
        div({ class: "flex-1" }),
        rg.c(Button, (c, s) => c.render({
            text: "+",
            onClick() {
                s.onChange(s.value + 1);
            }
        })),
        rg.c(Button, (c, s) => c.render({
            text: ">",
            onClick() {
                s.onChange(s.value + 10);
            }
        })),
    ]);
}

