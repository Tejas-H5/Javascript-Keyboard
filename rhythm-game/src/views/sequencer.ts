import {
    getKeyForNote,
    KeyboardState,
} from "src/state/keyboard-state";
import { previewNotes } from "src/state/playing-pausing";
import {
    CommandItem,
    divisorSnap,
    getBeatIdxBefore,
    getBeatsIndexesInclusive,
    getBpm,
    getItemLengthBeats,
    getItemStartBeats,
    isItemUnderCursor,
    newTimelineItemBpmChange,
    NoteItem,
    sequencerChartInsertItems,
    sequencerChartRemoveItems,
    TIMELINE_ITEM_BPM,
    TIMELINE_ITEM_MEASURE,
    TIMELINE_ITEM_NOTE,
    TimelineItem,
    TimelineItemBpmChange,
    TimelineItemMeasure,
    timelineItemToString
} from "src/state/sequencer-chart";
import {
    getCursorStartBeats,
    getRangeSelectionEndBeats,
    getRangeSelectionStartBeats,
    getSelectionStartEndIndexes,
    getSequencerPlaybackOrEditingCursor,
    getTimelineMusicNoteThreads,
    hasRangeSelection,
    isItemBeingPlayed,
    isItemRangeSelected,
    NoteMapEntry,
    SequencerState,
    setCursorDivisor,
} from "src/state/sequencer-state";
import { filteredCopy } from "src/utils/array-utils";
import { assert, unreachable } from "src/utils/assert";
import { cn } from "src/utils/cn";
import { deltaTimeSeconds, disableIm, enableIm, imBeginList, imEnd, imEndList, imInit, imMemo, imMemoArray, imState, imTextSpan, nextListRoot, setClass, setInnerText, setStyle } from "src/utils/im-dom-utils";
import { clamp, inverseLerp, lerp } from "src/utils/math-utils";
import { compareMusicNotes, getNoteText, MusicNote } from "src/utils/music-theory-utils";
import { GlobalContext } from "./app";
import { imButton } from "./button";
import { ABSOLUTE, ALIGN_CENTER, COL, FLEX1, GAP5, imBeginAbsolute, imBeginLayout, imBeginPadding, imBeginSpace, INLINE_BLOCK, JUSTIFY_CENTER, JUSTIFY_END, NOT_SET, PERCENT, PX, RELATIVE, ROW } from "./layout";
import { cssVars } from "./styling";
import { isSaving } from "src/state/loading-saving-charts";


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

// The number of divisions to show before AND after the cursor.
const NUM_EXTENT_DIVISIONS = 16;

// TODO: there's some redundancy here, we should get rid of it.
export function getSequencerLeftExtent(sequencer: SequencerState): number {
    return -NUM_EXTENT_DIVISIONS / sequencer.cursorDivisor;
}
export function getSequencerRightExtent(sequencer: SequencerState): number {
    return NUM_EXTENT_DIVISIONS / sequencer.cursorDivisor;
}

type SequencerUIState = {
    lastCursorStartBeats: number;
    lastCursorStartDivisor: number;
    lastUpdatedTime: number;
    invalidateCache: boolean;
    itemsUnderCursor: Set<TimelineItem>;
    notesToPlay: NoteItem[];

    currentCursorAnimated: number;
    divisorAnimated: number;

    leftExtent: number;
    leftExtentAnimated: number;
    leftExtentIdx: number;
    rightExtent: number;
    rightExtentAnimated: number;
    rightExtentIdx: number;
    cursorIdx: number;
    notesMap: Map<string, NoteMapEntry>;
    noteOrder: NoteMapEntry[];
    commandsList: CommandItem[]
    bpmChanges: TimelineItemBpmChange[];
    measures: TimelineItemMeasure[];
};

function newSequencerState(): SequencerUIState {
    return {
        lastCursorStartBeats: -1,
        lastCursorStartDivisor: -1,
        lastUpdatedTime: -1,
        invalidateCache: false,

        notesToPlay: [],
        itemsUnderCursor: new Set(),
        
        currentCursorAnimated: -1,
        divisorAnimated: 4,

        leftExtent: 0,
        leftExtentAnimated: 0,
        leftExtentIdx: 0,
        rightExtent: 0,
        rightExtentAnimated: 0,
        rightExtentIdx: 0,
        cursorIdx: 0,
        notesMap: new Map(),
        noteOrder: [],
        commandsList: [],
        bpmChanges: [],
        measures: [],
    };
}

/**
 * This component handles both the editing UI and the gameplay UI
 */
export function imSequencer(ctx: GlobalContext) {
    const sequencer = ctx.sequencer;
    const chart = sequencer._currentChart;
    const isRangeSelecting = hasRangeSelection(sequencer);

    const s = imState(newSequencerState);

    const cursorStartBeats = getSequencerPlaybackOrEditingCursor(sequencer);
    const divisor = sequencer.cursorDivisor;

    // Compute animation factors every frame without memoization
    disableIm();
    {
        const lerpFactor = 20 * deltaTimeSeconds();

        s.currentCursorAnimated = lerp(s.currentCursorAnimated, s.lastCursorStartBeats, lerpFactor);
        s.divisorAnimated = lerp(
            s.divisorAnimated,
            sequencer.cursorDivisor,
            lerpFactor,
        );
        let leftExtent = cursorStartBeats + getSequencerLeftExtent(sequencer);
        let rightExtent = cursorStartBeats + getSequencerRightExtent(sequencer);
        s.leftExtent = leftExtent;
        s.rightExtent = rightExtent;
        s.leftExtentAnimated = lerp(s.leftExtentAnimated, leftExtent, lerpFactor);
        s.rightExtentAnimated = lerp(s.rightExtentAnimated, rightExtent, lerpFactor);

        const tl = sequencer._currentChart.timeline;

        s.cursorIdx = getBeatIdxBefore(chart, cursorStartBeats);

        [s.leftExtentIdx, s.rightExtentIdx] = getBeatsIndexesInclusive(
            sequencer._currentChart,
            s.leftExtentAnimated,
            s.rightExtentAnimated,
        );
        if (s.leftExtentIdx === -1) {
            s.leftExtentIdx = 0;
        }
        if (s.rightExtentIdx === -1) {
            s.rightExtentIdx = tl.length - 1;
        }
    }
    enableIm();

    // TODO: check if this actually creates GC pressure.
    const previewItemsChanged = imMemoArray(...sequencer.notesToPreview);
    const currentChartChanged = imMemo(sequencer._currentChart);

    // Recompute the non-overlapping items in the sequencer timeline as needed
    if (
        s.lastCursorStartBeats !== cursorStartBeats ||
        s.lastCursorStartDivisor !== divisor ||
        s.lastUpdatedTime !== sequencer._currentChart._timelineLastUpdated ||
        currentChartChanged ||
        previewItemsChanged ||
        s.invalidateCache
    ) {
        disableIm();

        s.lastUpdatedTime = sequencer._currentChart._timelineLastUpdated;
        s.lastCursorStartBeats = cursorStartBeats;
        s.lastCursorStartDivisor = divisor;
        s.invalidateCache = false;

        getTimelineMusicNoteThreads(
            sequencer,
            s.leftExtent,
            s.rightExtent,
            s.notesMap,
            s.commandsList
        );

        filteredCopy(
            s.commandsList,
            s.bpmChanges,
            c => c.type === TIMELINE_ITEM_BPM
        );

        filteredCopy(
            s.commandsList,
            s.measures,
            c => c.type === TIMELINE_ITEM_MEASURE
        );

        // recompute the note order
        s.noteOrder.length = 0;
        for (const entry of s.notesMap.values()) {
            if (entry.firstItem === null) {
                continue;
            }
            s.noteOrder.push(entry);
        }
        s.noteOrder.sort((a, b) => {
            return compareMusicNotes(b.musicNote, a.musicNote);
        });

        // check if we've got any new things in the set, and then play them.
        {
            for (const note of s.itemsUnderCursor) {
                if (!isItemUnderCursor(note, cursorStartBeats)) {
                    s.itemsUnderCursor.delete(note);
                }
            }

            s.notesToPlay.length = 0;
            for (const notes of s.notesMap.values()) {
                for (const note of notes.items) {
                    if (isItemUnderCursor(note, cursorStartBeats)) {
                        if (!s.itemsUnderCursor.has(note)) {
                            s.notesToPlay.push(note);
                        }

                        s.itemsUnderCursor.add(note);
                    }
                }
            }

            if (!sequencer.isPlaying) {
                previewNotes(ctx, s.notesToPlay);
            }
        }
    }
    enableIm();

    imBeginPadding(
        10, PX, 10, PX, 
        10, PX, 10, PX, 
        FLEX1 | COL
    ); {
        imBeginList();
        if (nextListRoot() && isRangeSelecting) {
            imBeginLayout(RELATIVE); {
                const [start, end] = getSelectionStartEndIndexes(sequencer);
                if (start === -1 || end === -1) {
                    setInnerText("none selected");
                } else {
                    setInnerText((end - start + 1) + " selected");
                }
            } imEnd();
        }
        imEndList();
        imBeginLayout(ROW); {
            if (imInit()) {
                setStyle("gap", "20px");
            }

            imBeginLayout(FLEX1); imEnd();

            // bpm input
            // TODO: clean this up.
            {
                let lastBpmChange = sequencer._lastBpmChange;
                const value = imBpmInput(getBpm(lastBpmChange));
                if (value !== null) {
                    if (lastBpmChange) {
                        sequencerChartRemoveItems(sequencer._currentChart, [lastBpmChange]);
                        lastBpmChange.bpm = value;
                    } else {
                        lastBpmChange = newTimelineItemBpmChange(0, 4, value);
                    }
                    sequencerChartInsertItems(sequencer._currentChart, [lastBpmChange]);
                }
            }

            const newCursorDivisor = imDivisionInput(sequencer.cursorDivisor);
            if (newCursorDivisor !== null) {
                setCursorDivisor(sequencer, newCursorDivisor);
            }

            imBeginLayout(FLEX1); imEnd();

        } imEnd();
        if (0) {
            // Debug visualizer for the undo buffer
            imBeginLayout(); {
                imBeginList();
                let i = 0;
                for (const item of chart._undoBuffer.items) {
                    nextListRoot();

                    imBeginPadding(0, NOT_SET, 30, PX, 0, NOT_SET, 0, NOT_SET, INLINE_BLOCK); {
                        imTextSpan(chart._undoBuffer.idx === i ? ">" : "");
                        imTextSpan("Entry " + (i++) + ": ");
                        imBeginList();
                        for (const tlItem of item.items) {
                            nextListRoot();
                            imTextSpan(timelineItemToString(tlItem));
                        }
                        imEndList();
                    } imEnd();
                }
                imEndList();
            } imEnd();
        }
        imBeginLayout(FLEX1 | RELATIVE); {
            if (imInit()) {
                setStyle("overflowY", "auto");
            }

            // SequencerRangeSelect
            imBeginList();
            if (nextListRoot() && isRangeSelecting) {
                const beatsA = getRangeSelectionStartBeats(sequencer);
                const beatsB = getRangeSelectionEndBeats(sequencer);

                let min = Math.min(beatsA, beatsB);
                let max = Math.max(beatsA, beatsB);

                const leftAbsolutePercent = inverseLerp(
                    min,
                    s.leftExtentAnimated,
                    s.rightExtentAnimated,
                ) * 100;

                const rightAbsolutePercent = inverseLerp(
                    max,
                    s.rightExtentAnimated,
                    s.leftExtentAnimated,
                ) * 100;

                imBeginAbsolute(
                    0, PX, leftAbsolutePercent, PERCENT,
                    0, PX, rightAbsolutePercent, PERCENT,
                ); {
                    if (imInit()) {
                        setStyle("backgroundColor", `rgba(0, 0, 255, 0.25)`);
                    }
                } imEnd();

                // range select lines
                imSequencerVerticalLine(s, getRangeSelectionStartBeats(sequencer), cssVars.mg, 3);
                imSequencerVerticalLine(s, getRangeSelectionEndBeats(sequencer), cssVars.mg, 3);
            }
            imEndList();
            imBeginList(); {
                const startNonFloored = s.leftExtent;
                const start = divisorSnap(startNonFloored, sequencer.cursorDivisor);
                const endNonFloored = s.rightExtent;
                const end = divisorSnap(endNonFloored, sequencer.cursorDivisor);

                // grid lines
                for (let x = start; x < end; x += 1 / sequencer.cursorDivisor) {
                    if (x < 0) continue;

                    nextListRoot();
                    const thickness = Math.abs(x % 1) < 0.0001 ? 2 : 1;
                    imSequencerVerticalLine(s, x, cssVars.bg2, thickness);
                }

                // cursor start vertical line
                nextListRoot();
                imSequencerVerticalLine(s, s.lastCursorStartBeats, cssVars.mg, 3);

                // add blue vertical lines for all the measures
                for (const item of s.commandsList) {
                    if (item.type !== TIMELINE_ITEM_MEASURE) {
                        continue;
                    }

                    const beats = getItemStartBeats(item);
                    nextListRoot();
                    imSequencerVerticalLine(s, beats, cssVars.playback, 4);
                }
            } imEndList();
            imBeginSpace(0, NOT_SET, 100, PERCENT, COL | JUSTIFY_CENTER | 10); {
                if (imInit()) {
                    setStyle("borderTop", `1px solid ${cssVars.fg}`);
                }

                imSequencerNotesUI("bpm", s.bpmChanges, null,ctx, s);
                imSequencerNotesUI("measures", s.measures, null, ctx, s);

                imBeginList(); 
                for (const entry of s.noteOrder) {
                    assert(entry.firstItem);

                    nextListRoot();
                    const text = getItemSequencerText(ctx.keyboard, entry.firstItem);
                    imSequencerNotesUI(text, entry.items, entry.previewItems, ctx, s);
                }
                imEndList();
            } imEnd();
        } imEnd();
        imBeginLayout(ROW | JUSTIFY_CENTER); {
            const idxText = "note " + s.cursorIdx;
            const timelinePosText = timelinePosToString(sequencer.cursorStart, sequencer.cursorDivisor);
            imBeginLayout(FLEX1); {
                imBeginList();
                if (nextListRoot() && isSaving(ctx)) {
                    imTextSpan("Saving...");
                }
                imEndList();
            } imEnd();
            imTextSpan(idxText + " | " + timelinePosText);
            imBeginLayout(FLEX1 | ROW | JUSTIFY_END); {
                imBeginList();
                if (nextListRoot() && sequencer.notesToPreview.length > 0) {
                    imTextSpan("TAB -> place, DEL or ~ -> delete");
                }
                imEndList();
            } imEnd();
        } imEnd();
        imBeginLayout(ROW); {
            imBeginList();
            for (let i = 0; i < NUM_EXTENT_DIVISIONS; i++) {
                nextListRoot();
                // GridLine - wtf ???
                imBeginLayout(FLEX1); {
                    // text: timestamp + "ms"
                    // timelinePosToString(s.state.cursorStartPos[0] + gridLineAmount, s.state.cursorStartPos[1]) 
                } imEnd();
            }
            imEndList();
        } imEnd();
    } imEnd();

}


function imSequencerVerticalLine(
    internalState: SequencerUIState,
    beats: number,
    color: string,
    thickness: number,
) {
    const absolutePercent = inverseLerp(
        beats,
        internalState.leftExtentAnimated,
        internalState.rightExtentAnimated,
    ) * 100;

    imBeginList(); 
    if (nextListRoot() && absolutePercent >= 0 && absolutePercent <= 100) {
        imBeginAbsolute(
            0, PX, absolutePercent, PERCENT,
            0, PX, 0, NOT_SET,
        ); {
            setStyle("width", thickness + "px");
            setStyle("backgroundColor", color);
        } imEnd();
    }
    imEndList();
}

function imSequencerNotesUI(
    text: string, 
    items: TimelineItem[], 
    previewItems: TimelineItem[] | null, 
    ctx: GlobalContext, 
    s: SequencerUIState
) {
    let count = items.length;
    if (previewItems) count += previewItems.length;

    imBeginList();
    if (nextListRoot() && count > 0) {
        imBeginPadding(
            10, PX, 3, PX, 
            10, PX, 3, PX, 
            RELATIVE
        ); {
            imTextSpan(text);

            imBeginList();
            for (const item of items) {
                nextListRoot(); {
                    const text = getItemSequencerText(ctx.keyboard, item);
                    imSequencerTrackTimelineItem(text, item, ctx, s);
                }
            }
            imEndList();
            imBeginList();
            if (previewItems) {
                for (const item of previewItems) {
                    nextListRoot(); {
                        const text = getItemSequencerText(ctx.keyboard, item);
                        imSequencerTrackTimelineItem(text, item, ctx, s);
                    }
                }
            }
            imEndList();
        } imEnd();
    }
    imEndList();
}

function imSequencerTrackTimelineItem(text: string, item: TimelineItem, ctx: GlobalContext, s: SequencerUIState) {
    const left = s.leftExtentAnimated;
    const right = s.rightExtentAnimated;
    const extentSize = right - left;

    const leftPercent = 100 * (getItemStartBeats(item) - left) / extentSize;
    const MIN_WIDTH_PERCENT = 1;
    let width;
    if (item.type === TIMELINE_ITEM_NOTE) {
        width = Math.max(100 * getItemLengthBeats(item) / extentSize, MIN_WIDTH_PERCENT);
    } else {
        width = MIN_WIDTH_PERCENT;
    }

    let isUnderCursor = false;
    let isBeingPlayed = false;

    if (item.type === TIMELINE_ITEM_NOTE) {
        const { sequencer } = ctx;
        const cursorStart = getCursorStartBeats(sequencer);

        if (hasRangeSelection(sequencer)) {
            isUnderCursor = isItemRangeSelected(sequencer, item);
        } else {
            isUnderCursor = isItemUnderCursor(item, cursorStart);
        }

        isBeingPlayed = isItemBeingPlayed(sequencer, item);
    }

    imBeginAbsolute(
        0, PX, leftPercent, PERCENT,
        0, NOT_SET, 0, NOT_SET,
        ABSOLUTE
    ); {
        if (imInit()) {
            setClass(cn.noWrap);
            setStyle("overflowX", "clip");
            setStyle("padding", "3px 10px");
            setStyle("border", `1px solid ${cssVars.fg}`);
            setStyle("boxSizing", "border-box");
        }

        setStyle("backgroundColor", isBeingPlayed ? cssVars.playback : isUnderCursor ? cssVars.bg2 : cssVars.bg);
        setStyle("width", width + "%");
        setInnerText(text);
    } imEnd();
}


function getPrevDivisor(val: number) {
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
    return val;
}

function getNextDivisor(val: number) {
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
    return val;
}


// allows someone to specifically select a number between 1 and 16
function imDivisionInput(val: number): number | null {
    let result: number | null = null;

    imBeginLayout(ROW | ALIGN_CENTER | GAP5); {
        if (imButton("<")) {
            result =  getPrevDivisor(val);
        }
        if (imButton("-")) {
            result = clamp(val - 1, 1, 16);
        }

        imBeginLayout(FLEX1); imEnd();

        imTextSpan("Divisor: ");
        imTextSpan("1 / " + val);

        imBeginLayout(FLEX1); imEnd();

        if (imButton("+")) {
            result = clamp(val + 1, 1, 16);
        }
        if (imButton(">")) {
            result = getNextDivisor(val);
        }
    } imEnd();

    return result;
}


function imBpmInput(value: number): number | null {
    let result: number | null = null;

    imBeginLayout(ROW | ALIGN_CENTER | GAP5); {
        if (imButton("<")) {
            result = value - 10;
        }
        if (imButton("-")) {
            result = value -=1;
        }

        imBeginLayout(FLEX1); imEnd();

        imTextSpan("BPM: ");
        imTextSpan(value.toFixed(1) + "");

        imBeginLayout(FLEX1); imEnd();

        if (imButton("+")) {
            result = value + 1;
        }
        if (imButton(">")) {
            result = value + 10;
        }
    } imEnd();

    return result;
}

