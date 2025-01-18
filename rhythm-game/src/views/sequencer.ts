import { Button } from "src/components/button";
import {
    getKeyForNote,
    KeyboardState,
} from "src/state/keyboard-state";
import { previewNotes } from "src/state/playing-pausing";
import {
    BpmChange,
    CommandItem,
    divisorSnap,
    getBeatsIndexes,
    getBpm,
    getCursorStartBeats,
    getItemLengthBeats,
    getItemStartBeats,
    getRangeSelectionEndBeats,
    getRangeSelectionStartBeats,
    getSelectionStartEndIndexes,
    getSequencerPlaybackOrEditingCursor,
    getTimelineMusicNoteThreads,
    hasRangeSelection,
    isItemBeingPlayed,
    isItemRangeSelected,
    isItemUnderCursor,
    Measure,
    mutateSequencerTimeline,
    newTimelineItemBpmChange,
    NoteItem,
    NoteMapEntry,
    SequencerState,
    setCursorDivisor,
    TIMELINE_ITEM_BPM,
    TIMELINE_ITEM_MEASURE,
    TIMELINE_ITEM_NOTE,
    TimelineItem
} from "src/state/sequencer-state";
import { filterInPlace2 } from "src/utils/array-utils";
import { unreachable } from "src/utils/asserts";
import { cn, div, RenderGroup } from "src/utils/dom-utils";
import { inverseLerp, lerp } from "src/utils/math-utils";
import { compareMusicNotes, getNoteText, MusicNote } from "src/utils/music-theory-utils";
import { GlobalContext } from "./app";
import { cssVars } from "./styling";

export function getMusicNoteText(n: MusicNote): string {
    if (n.sample) {
        return n.sample;
    }
    if (n.noteIndex) {
        return getNoteText(n.noteIndex);
    }
    return "<???>";
}

export function getItemSequencerText(globalState: KeyboardState, item: TimelineItem): string {
    if (item.type === TIMELINE_ITEM_NOTE) {
        const key = getKeyForNote(globalState, item.note);
        const keyText = key ? key.text.toUpperCase() : "<no key!>";
        return keyText + " " + getMusicNoteText(item.note);
    }

    if (item.type === TIMELINE_ITEM_BPM) {
        return "bpm=" + item.bpm;
    }

    if (item.type === TIMELINE_ITEM_MEASURE) {
        return "measure";
    }

    return unreachable(item);
}

function timelinePosToString(numerator: number, divisor: number): string {
    const num = Math.floor(numerator / divisor);
    const fractional = numerator % divisor;
    return num + " " + fractional + "/" + divisor;
}

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
    bpmChanges: BpmChange[];
    measures: Measure[];
};

function GridLine(rg: RenderGroup<{ text: string, divisor: number; }>) {
    return div({ class: [cn.flex1] }, [
        rg.text(s => s.text),
    ]);
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
export function Sequencer(rg: RenderGroup<GlobalContext>) {
    let lastCursorStartBeats = -1,
        lastCursorStartDivisor = -1,
        lastUpdatedTime = -1,
        invalidateCache = false;
    
    const itemsUnderCursor = new Set<TimelineItem>();
    const notesToPlay: NoteItem[] = [];

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
        bpmChanges: [],
        measures: [],
    };

    rg.preRenderFn(s => {
        const cursorStartBeats = getSequencerPlaybackOrEditingCursor(s.sequencer);
        const divisor = s.sequencer.cursorDivisor;

        // Compute animation factors every frame without memoization
        {
            // const lerpFactor = 0.07; // for debugging
            const lerpFactor = 0.7;
            currentCursorAnimated = lerp(currentCursorAnimated, lastCursorStartBeats, lerpFactor);
            divisorAnimated = lerp(
                divisorAnimated,
                s.sequencer.cursorDivisor,
                lerpFactor,
            );
            let leftExtent = cursorStartBeats + getSequencerLeftExtent(s.sequencer);
            let rightExtent = cursorStartBeats + getSequencerRightExtent(s.sequencer);
            internalState.leftExtent = leftExtent;
            internalState.rightExtent = rightExtent;
            internalState.leftExtentAnimated = lerp(internalState.leftExtentAnimated, leftExtent, lerpFactor);
            internalState.rightExtentAnimated = lerp(internalState.rightExtentAnimated, rightExtent, lerpFactor);

            [internalState.leftExtentIdx, internalState.rightExtentIdx] = getBeatsIndexes(
                s.sequencer, 
                internalState.leftExtentAnimated, 
                internalState.rightExtentAnimated,
            );
            if (internalState.leftExtentIdx === -1) {
                internalState.leftExtentIdx = 0;
            }
            if (internalState.rightExtentIdx === -1) {
                internalState.rightExtentIdx = s.sequencer.timeline.length - 1;
            }
        }

        // Recompute the non-overlapping items in the sequencer timeline as needed
        if (
            lastCursorStartBeats !== cursorStartBeats
            || lastCursorStartDivisor !== divisor
            || lastUpdatedTime !== s.sequencer._timelineLastUpdated
            || invalidateCache
        ) {
            lastUpdatedTime = s.sequencer._timelineLastUpdated;
            lastCursorStartBeats = cursorStartBeats;
            lastCursorStartDivisor = divisor;
            invalidateCache = false;

            getTimelineMusicNoteThreads(
                s.sequencer.timeline,
                internalState.leftExtentAnimated,
                internalState.rightExtentAnimated,
                internalState.notesMap,
                internalState.commandsList
            );

            filterInPlace2(
                internalState.commandsList, 
                internalState.bpmChanges, 
                c => c.type === TIMELINE_ITEM_BPM
            );

            filterInPlace2(
                internalState.commandsList, 
                internalState.measures, 
                c => c.type === TIMELINE_ITEM_MEASURE
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
                return compareMusicNotes(b.musicNote, a.musicNote);
            });

            // check if we've got any new things in the set, and then play them.
            if (!s.sequencer.isPlaying) {
                for (const note of itemsUnderCursor) {
                    if (!isItemUnderCursor(note, cursorStartBeats)) {
                        itemsUnderCursor.delete(note);
                    }
                }

                notesToPlay.length = 0;
                for (const notes of internalState.notesMap.values()) {
                    for (const note of notes.items) {
                        if (isItemUnderCursor(note, cursorStartBeats)) {
                            if (!itemsUnderCursor.has(note)) {
                                console.log("playing note: ", note.note.noteIndex);
                                notesToPlay.push(note);
                            }

                            itemsUnderCursor.add(note);
                        }
                    }
                }

                previewNotes(s, notesToPlay);
            }
        }
    });

    function handleBpmInputChange(newBpm: number) {
        const s = rg.s;
        const sequencer = s.sequencer;
        const lastBpmChange = sequencer._lastBpmChange;
        if (!lastBpmChange) {
            mutateSequencerTimeline(sequencer, () => {
                sequencer.timeline.push(newTimelineItemBpmChange(0, 4, newBpm));
            });
            return;
        }

        mutateSequencerTimeline(sequencer, () => {
            lastBpmChange.bpm = newBpm;
        });

        s.render();
    }

    function handleDivisionChange(newDivisor: number) {
        const s = rg.s;
        setCursorDivisor(s.sequencer, newDivisor);
        s.render();
    }

    return div({
        class: [cn.flex1, cn.col],
        style: "padding: 10px",
    }, [
        rg.if(
            s => hasRangeSelection(s.sequencer),
            rg => div({ class: [cn.relative] }, [
                rg.text(s => {
                    const [start, end] = getSelectionStartEndIndexes(s.sequencer);
                    if (start === -1 || end === -1) {
                        return "none selected";
                    }
                    return (end - start + 1) + " selected";
                }),
            ]),
        ),
        div({ class: [cn.row], style: "gap: 20px" }, [
            div({ class: [cn.flex1] }),
            rg.c(BpmInput, (c, s) => {
                c.render({
                    value: getBpm(s.sequencer._lastBpmChange),
                    onChange: handleBpmInputChange,
                })
            }),
            rg.c(DivisionInput, (c, s) => {
                c.render({
                    value: s.sequencer.cursorDivisor,
                    onChange: handleDivisionChange,
                })
            }),
            div({ class: [cn.flex1] }),
        ]),
        div({
            class: [cn.flex1, cn.relative, cn.overflowYAuto],
        }, [
            rg.if(
                s => hasRangeSelection(s.sequencer),
                rg => rg.c(SequencerRangeRect, (c, s) => c.render({
                    internalState,
                    beatsA: getRangeSelectionStartBeats(s.sequencer),
                    beatsB: getRangeSelectionEndBeats(s.sequencer),
                    color: `rgba(0, 0, 255, 0.25)`,
                }))
            ),
            rg.list(div({ class: [cn.contents] }), SequencerVerticalLine, (getNext, s) => {
                const sequencer = s.sequencer;
                const startNonFloored = internalState.leftExtent;
                const start = divisorSnap(startNonFloored, sequencer.cursorDivisor);
                const endNonFloored = internalState.rightExtent;
                const end = divisorSnap(endNonFloored, sequencer.cursorDivisor);

                // grid lines
                for (let x = start; x < end; x += 1 / sequencer.cursorDivisor) {
                    getNext().render({
                        internalState,
                        beats: x,
                        color: cssVars.bg2,
                        thickness: 1,
                    });
                }

                // range select lines
                getNext().render({
                    internalState,
                    beats: getRangeSelectionStartBeats(sequencer),
                    color: cssVars.mg,
                    thickness: 3,
                });

                getNext().render({
                    internalState,
                    beats: getRangeSelectionEndBeats(sequencer),
                    color: cssVars.mg,
                    thickness: 3,
                })

                // cursor start vertical line
                getNext().render({
                    internalState,
                    beats: lastCursorStartBeats,
                    color: cssVars.fg,
                    thickness: 3,
                });


                // add blue vertical lines for all the measures
                for (const item of internalState.commandsList) {
                    if (item.type !== TIMELINE_ITEM_MEASURE) {
                        continue;
                    }

                    const beats = getItemStartBeats(item);
                    getNext().render({
                        internalState,
                        beats,
                        color: cssVars.playback,
                        thickness: 4,
                    });
                }

            }),
            () => {
                const root = div({
                    style: `border-top: 1px solid ${cssVars.fg}: 1px solid var(--fg);`,
                    class: [cn.col, cn.justifyContentCenter, cn.h100],
                });
                return rg.list(root, SequencerNotesUI, (getNext, s) => {
                    getNext().render({
                        ctx: s,
                        internalState,
                        text: "bpm",
                        items: internalState.bpmChanges,
                    });

                    getNext().render({
                        ctx: s,
                        internalState,
                        text: "measures",
                        items: internalState.measures,
                    });

                    for (const entry of internalState.noteOrder) {
                        const c = getNext();
                        c.render({
                            internalState,
                            ctx: s,
                            text: getItemSequencerText(s.keyboard, entry.items[0]),
                            items: entry.items,
                        });
                    }
                });
            }
        ]),
        div({ class: [cn.row, cn.justifyContentCenter] }, [
            rg.text(s => timelinePosToString(s.sequencer.cursorStart, s.sequencer.cursorDivisor)),
        ]),
        rg.list(div({ class: [cn.row] }), GridLine, (getNext, s) => {
            for (let i = 0; i < NUM_EXTENT_DIVISIONS; i++) {
                // const timestamp = getTime(s.state._currentBpm, s.state.cursorDivisor, s.state.cursorStartBeats + gridLineAmount)
                getNext().render({
                    // text: timestamp + "ms"
                    text: "", //timelinePosToString(s.state.cursorStartPos[0] + gridLineAmount, s.state.cursorStartPos[1]) 
                    divisor: s.sequencer.cursorDivisor,
                });
            }
        })
    ]);
}


function SequencerRangeRect(rg: RenderGroup<{
    internalState: SequencerUIInternalState;
    beatsA: number;
    beatsB: number;
    color: string;
}>) {
    let leftAbsolutePercent = 0;
    let rightAbsolutePercent = 0;

    rg.preRenderFn((s) => {
        let min = Math.min(s.beatsA, s.beatsB);
        let max = Math.max(s.beatsA, s.beatsB);

        leftAbsolutePercent = inverseLerp(
            s.internalState.leftExtentAnimated,
            s.internalState.rightExtentAnimated,
            min,
        ) * 100;

        rightAbsolutePercent = inverseLerp(
            s.internalState.rightExtentAnimated,
            s.internalState.leftExtentAnimated,
            max,
        ) * 100;
    });

    return div({ class: [cn.absolute], style: "top: 0; bottom: 0;" }, [
        rg.style("left", () => leftAbsolutePercent + "%"),
        rg.style("right", () => rightAbsolutePercent + "%"),
        rg.style("backgroundColor", s => s.color),
    ]);
}

function SequencerVerticalLine(rg: RenderGroup<{
    internalState: SequencerUIInternalState;
    beats: number;
    color: string;
    thickness: number;
}>) {
    let absolutePercent = 0;

    rg.preRenderFn((s) => {
        absolutePercent = inverseLerp(
            s.internalState.leftExtentAnimated,
            s.internalState.rightExtentAnimated,
            s.beats,
        ) * 100;
    });

    return rg.if(
        () => absolutePercent >= 0 && absolutePercent <= 100,
        rg => div({
            class: [cn.absolute],
            style: "width: 3px; top: 0; bottom: 0;"
        }, [
            rg.style("width", s => s.thickness + "px"),
            rg.style("left", () => absolutePercent + "%"),
            rg.style("backgroundColor", s => s.color),
        ])
    );
}


function SequencerNotesUI(rg: RenderGroup<{
    text: string;
    items: TimelineItem[];
    ctx: GlobalContext;
    internalState: SequencerUIInternalState;
}>) {
    return rg.if(
        s => s.items.length > 0,
        rg => div({ class: [cn.relative], style: "padding: 3px 10px;" }, [
            rg.text(s => s.text),
            rg.list(div(), SequencerThreadItemUI, (getNext, s) => {
                for (let i = 0; i < s.items.length; i++) {
                    const c = getNext();
                    c.render({
                        item: s.items[i],
                        internalState: s.internalState,
                        ctx: s.ctx,
                    });
                }
            })
        ])
    );
}


function SequencerThreadItemUI(rg: RenderGroup<{
    item: TimelineItem;
    internalState: SequencerUIInternalState;
    ctx: GlobalContext;
}>) {
    let text = "";
    let extentSize = 0;
    let leftPercent = 0;
    let width = 0;
    let isUnderCursor = false;
    let isBeingPlayed = false;

    rg.preRenderFn(s => {
        text = getItemSequencerText(s.ctx.keyboard, s.item);

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
            const { sequencer } = s.ctx;
            const cursorStart = getCursorStartBeats(sequencer);

            if (hasRangeSelection(sequencer)) {
                isUnderCursor = isItemRangeSelected(sequencer, s.item);
            } else {
                isUnderCursor = isItemUnderCursor(s.item, cursorStart);
            }

            isBeingPlayed = isItemBeingPlayed(sequencer, s.item);
        }
    });

    return div({
        class: [cn.noWrap, cn.absolute],
        style: `overflow-x: clip; padding: 3px 10px; border: 1px solid ${cssVars.fg}; box-sizing: border-box; top: 0;`,
    }, [
        rg.style("left", () => leftPercent + "%"),
        rg.style("width", () => width + "%"),
        rg.style("backgroundColor", () => isBeingPlayed ? cssVars.playback : isUnderCursor ? cssVars.bg2 : cssVars.bg),
        rg.text(() => text),
    ]);
}


// allows someone to specifically select a number between 1 and 16
function DivisionInput(rg: RenderGroup<{
    value: number;
    onChange(val: number): void;
}>) {
    function onChange(val: number) {
        const s = rg.s;
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

    return div({ class: [cn.row, cn.justifyContentCenter] }, [
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
        div({ class: [cn.flex1] }),
        rg.text(s => "1 / " + s.value),
        div({ class: [cn.flex1] }),
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
    return div({ class: [cn.row, cn.justifyContentCenter] }, [
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
        div({ class: [cn.flex1] }),
        rg.text(s => s.value.toFixed(1) + ""),
        div({ class: [cn.flex1] }),
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

