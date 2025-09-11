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
    getItemEndBeats,
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
import { clamp, inverseLerp, lerp } from "src/utils/math-utils";
import { compareMusicNotes, getNoteText, MusicNote } from "src/utils/music-theory-utils";
import { GlobalContext, setViewTestCurrentChart } from "./app";
import { cssVarsApp } from "./styling";
import { isSaving } from "src/state/loading-saving-charts";
import { getDeltaTimeSeconds, ImCache, imEndFor, imEndIf, imFor, imForEnd, imIf, imIfElse, imIfEnd, imMemo, imState, imSwitch, imSwitchEnd, isFirstishRender } from "src/utils/im-core";
import { BLOCK, COL, DisplayTypeInstance, END, imAbsolute, imAlign, imBg, imFlex, imGap, imJustify, imLayout, imLayoutEnd, imPadding, imRelative, imSize, INLINE_BLOCK, NA, NOT_SET, PERCENT, PX, ROW } from "src/components/core/layout";
import { EL_B, EL_I, elSetClass, elSetStyle, imEl, imElEnd, imStr } from "src/utils/im-dom";
import { imButtonIsClicked } from "src/components/button";
import { cn, cssVars } from "src/components/core/stylesheets";
import { imLine, LINE_HORIZONTAL } from "src/components/im-line";
import { DEBUG_UNDO_BUFFER } from "src/debug-flags";


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

    leftExtentBeats: number;
    rightExtentBeats: number;
    leftExtentBeatsAnimated: number;
    rightExtentBeatsAnimated: number;
    leftExtentIdx: number;
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

        leftExtentBeats: 0,
        leftExtentBeatsAnimated: 0,
        leftExtentIdx: 0,
        rightExtentBeats: 0,
        rightExtentBeatsAnimated: 0,
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
export function imSequencer(c: ImCache, ctx: GlobalContext) {
    const { sequencer, ui } = ctx;
    const loadSaveModal = ui.loadSave.modal;

    const chart = sequencer._currentChart;
    const isRangeSelecting = hasRangeSelection(sequencer);

    const s = imState(c, newSequencerState);

    const cursorStartBeats = getSequencerPlaybackOrEditingCursor(sequencer);
    const divisor = sequencer.cursorDivisor;

    // Compute animation factors every frame without memoization
    {
        const lerpFactor = 20 * getDeltaTimeSeconds(c);

        s.currentCursorAnimated = lerp(s.currentCursorAnimated, s.lastCursorStartBeats, lerpFactor);
        s.divisorAnimated = lerp(
            s.divisorAnimated,
            sequencer.cursorDivisor,
            lerpFactor,
        );
        let leftExtent = cursorStartBeats + getSequencerLeftExtent(sequencer);
        let rightExtent = cursorStartBeats + getSequencerRightExtent(sequencer);
        s.leftExtentBeats = leftExtent;
        s.rightExtentBeats = rightExtent;
        s.leftExtentBeatsAnimated = lerp(s.leftExtentBeatsAnimated, leftExtent, lerpFactor);
        s.rightExtentBeatsAnimated = lerp(s.rightExtentBeatsAnimated, rightExtent, lerpFactor);

        const tl = sequencer._currentChart.timeline;

        s.cursorIdx = getBeatIdxBefore(chart, cursorStartBeats);

        [s.leftExtentIdx, s.rightExtentIdx] = getBeatsIndexesInclusive(
            sequencer._currentChart,
            s.leftExtentBeatsAnimated,
            s.rightExtentBeatsAnimated,
        );
        if (s.leftExtentIdx === -1) {
            s.leftExtentIdx = 0;
        }
        if (s.rightExtentIdx === -1) {
            s.rightExtentIdx = tl.length - 1;
        }
    }

    // TODO: check if this actually creates GC pressure.
    const previewItemsChanged = imMemo(c, sequencer.notesToPreviewVersion);
    const currentChartChanged = imMemo(c, sequencer._currentChart);

    // Recompute the non-overlapping items in the sequencer timeline as needed
    if (
        s.lastCursorStartBeats !== cursorStartBeats ||
        s.lastCursorStartDivisor !== divisor ||
        s.lastUpdatedTime !== sequencer._currentChart._timelineLastUpdated ||
        currentChartChanged ||
        previewItemsChanged ||
        s.invalidateCache
    ) {
        s.lastUpdatedTime = sequencer._currentChart._timelineLastUpdated;
        s.lastCursorStartBeats = cursorStartBeats;
        s.lastCursorStartDivisor = divisor;
        s.invalidateCache = false;

        getTimelineMusicNoteThreads(
            sequencer,
            s.leftExtentBeats,
            s.rightExtentBeats,
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

    imLayout(c, COL); imGap(c, 5, PX); imFlex(c); {
        imLayout(c, ROW); imAlign(c); imGap(c, 5, PX); { 
            imEl(c, EL_B); {
                imStr(c, "Currently editing ");
                imEl(c, EL_I); {
                    imStr(c, sequencer._currentChart.name);
                    assert(ctx.savedState.userCharts.indexOf(sequencer._currentChart) !== -1);
                } imElEnd(c, EL_I);
                imStr(c, "");
            } imElEnd(c, EL_B);

            const numCopied = ui.copied.items.length;
            if (imIf(c) && numCopied > 0) {
                imLayout(c, BLOCK); imFlex(c); imLayoutEnd(c);

                imStr(c, numCopied + " items copied");
            } imIfEnd(c);

            imLayout(c, BLOCK); imFlex(c); imLayoutEnd(c);

            imLayout(c, ROW); {
                if (isFirstishRender(c)) {
                    elSetStyle(c, "gap", "20px");
                }

                imLayout(c, BLOCK); imFlex(c); imLayoutEnd(c);

                // bpm input
                // TODO: clean this up.
                {
                    let lastBpmChange = sequencer._lastBpmChange;
                    const value = imBpmInput(c, getBpm(lastBpmChange));
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

                const newCursorDivisor = imDivisionInput(c, sequencer.cursorDivisor);
                if (newCursorDivisor !== null) {
                    setCursorDivisor(sequencer, newCursorDivisor);
                }

                imLayout(c, BLOCK); imFlex(c); imLayoutEnd(c);

            } imLayoutEnd(c);

            imLayout(c, BLOCK); imFlex(c); imLayoutEnd(c);

            if (imButtonIsClicked(c, "Test")) {
                setViewTestCurrentChart(ctx);
            }

            if (imButtonIsClicked(c, (loadSaveModal.open ? ">" : "<") + "Load/Save")) {
                loadSaveModal.open = !loadSaveModal.open;
            }
        } imLayoutEnd(c);

        imLine(c, LINE_HORIZONTAL, 1);

        imLayout(c, COL); imFlex(c); {
            if (imIf(c) && isRangeSelecting) {
                imLayout(c, BLOCK); imRelative(c); {
                    const [start, end] = getSelectionStartEndIndexes(sequencer);
                    let str;
                    if (start === -1 || end === -1) {
                        str = "none selected";
                    } else {
                        str = (end - start + 1) + " selected";
                    }

                    imStr(c, str);
                } imLayoutEnd(c);
            } imIfEnd(c);

            if (DEBUG_UNDO_BUFFER) {
                // Debug visualizer for the undo buffer
                imLayout(c, BLOCK); {
                    let i = 0;
                    const chart = sequencer._currentChart;
                    imFor(c); for (const item of chart._undoBuffer.items) {
                        imLayout(c, INLINE_BLOCK); imPadding(c, 0, NA, 30, PX, 0, NA, 0, NA); {
                            imStr(c, chart._undoBuffer.idx === i ? ">" : "");
                            imStr(c, "Entry " + (i++) + ": ");
                            imFor(c); for (const tlItem of item.items) {
                                imStr(c, timelineItemToString(tlItem));
                            } imForEnd(c);
                        } imLayoutEnd(c);
                    } imForEnd(c);
                } imLayoutEnd(c);
            }

            imLayout(c, BLOCK); imFlex(c); imRelative(c); {
                if (isFirstishRender(c)) {
                    elSetStyle(c, "overflowY", "auto");
                    elSetStyle(c, "overflowX", "hidden");
                }

                if (imIf(c) && isRangeSelecting) {
                    const beatsA = getRangeSelectionStartBeats(sequencer);
                    const beatsB = getRangeSelectionEndBeats(sequencer);

                    let min = Math.min(beatsA, beatsB);
                    let max = Math.max(beatsA, beatsB);

                    const leftAbsolutePercent = inverseLerp(
                        min,
                        s.leftExtentBeatsAnimated,
                        s.rightExtentBeatsAnimated,
                    ) * 100;

                    const rightAbsolutePercent = inverseLerp(
                        max,
                        s.rightExtentBeatsAnimated,
                        s.leftExtentBeatsAnimated,
                    ) * 100;

                    imLayout(c, BLOCK);
                    imAbsolute(
                        c,
                        0, PX, rightAbsolutePercent, PERCENT,
                        0, PX, leftAbsolutePercent, PERCENT);
                    imBg(c, `rgba(0, 0, 255, 0.25)`);
                    imLayoutEnd(c);

                    // range select lines
                    imSequencerVerticalLine(c, s, getRangeSelectionStartBeats(sequencer), cssVarsApp.mg, 3);
                    imSequencerVerticalLine(c, s, getRangeSelectionEndBeats(sequencer), cssVarsApp.mg, 3);
                } imIfEnd(c);

                {
                    const startNonFloored = s.leftExtentBeats;
                    const start = divisorSnap(startNonFloored, sequencer.cursorDivisor);
                    const endNonFloored = s.rightExtentBeats;
                    const end = divisorSnap(endNonFloored, sequencer.cursorDivisor);

                    // grid lines
                    imFor(c); for (let x = start; x < end; x += 1 / sequencer.cursorDivisor) {
                        if (x < 0) continue;

                        const thickness = Math.abs(x % 1) < 0.0001 ? 2 : 1;
                        imSequencerVerticalLine(c, s, x, cssVarsApp.bg2, thickness);
                    } imForEnd(c);

                    // cursor start vertical line
                    imSequencerVerticalLine(c, s, s.lastCursorStartBeats, cssVarsApp.mg, 3);

                    // add blue vertical lines for all the measures
                    imFor(c); for (const item of s.commandsList) {
                        if (item.type !== TIMELINE_ITEM_MEASURE) continue;
                        const beats = getItemStartBeats(item);
                        imSequencerVerticalLine(c, s, beats, cssVarsApp.playback, 4);
                    } imForEnd(c);
                }

                imLayout(c, COL); imJustify(c); imSize(c, 0, NA, 100, PERCENT); {
                    imSequencerNotesUI(c, "bpm", s.bpmChanges, null, ctx, s);
                    imSequencerNotesUI(c, "measures", s.measures, null, ctx, s);

                    imFor(c); for (const entry of s.noteOrder) {
                        assert(!!entry.firstItem);
                        const text = getItemSequencerText(ctx.keyboard, entry.firstItem);
                        imSequencerNotesUI(c, text, entry.items, entry.previewItems, ctx, s);
                    } imForEnd(c);
                } imLayoutEnd(c);
            } imLayoutEnd(c);

            imLine(c, LINE_HORIZONTAL, 1);


            // minimap of the entire chart
            const chart = sequencer._currentChart;
            if (imIf(c) && chart.timeline.length > 0) {
                const lastItem = chart.timeline[chart.timeline.length - 1]
                const totalBeats = getItemEndBeats(lastItem);

                imLayout(c, BLOCK); imSize(c, 0, NA, 50, PX); imRelative(c); {
                    const leftAbsolutePercent = 100.0 * s.leftExtentBeatsAnimated / totalBeats;
                    const rightAbsolutePercent = 100.0 * s.rightExtentBeatsAnimated / totalBeats;
                    const color = `rgba(0, 0, 0, 0.25)`;

                    imFor(c); for (let i = 0; i < chart.timeline.length; i++) {
                        const item = chart.timeline[i];
                        const absoluteLeftStart = 100 * getItemStartBeats(item) / totalBeats;
                        const absoluteLeftEnd   = 100 * getItemEndBeats(item) / totalBeats;
                        const width = absoluteLeftEnd - absoluteLeftStart;
                        imSwitch(c, item.type); switch (item.type) {
                            case TIMELINE_ITEM_MEASURE: {
                                imAbsoluteVerticalLine(c, absoluteLeftStart, cssVarsApp.playback, 2);
                            } break;
                            case TIMELINE_ITEM_BPM: {
                                imAbsoluteVerticalLine(c, absoluteLeftStart, cssVarsApp.bpmMarker, 2);
                            } break;
                            case TIMELINE_ITEM_NOTE: {
                                const absoluteTop = 100 * (item.note.noteIndex ?? 0) / (ctx.keyboard.maxNoteIdx + 1);

                                imLayout(c, BLOCK); 
                                imAbsolute(c, absoluteTop, PERCENT, 0, NOT_SET, 0, NA, absoluteLeftStart, PERCENT);
                                imSize(c, width, PERCENT, 2, PX); {
                                    imBg(c, cssVars.fg);
                                } imLayoutEnd(c);
                            } break;
                        } imSwitchEnd(c);
                    } imForEnd(c);

                    imAbsoluteVerticalLine(c, 100.0 * cursorStartBeats / totalBeats, cssVarsApp.fg, 4);

                    // the currently viewed sliding window
                    {
                        imLayout(c, BLOCK); {
                            imAbsolute(c, 0, PX, 0, NA, 0, PX, 0, PX);
                            imSize(c, leftAbsolutePercent, PERCENT, 0, NA);
                            imBg(c, color);
                        } imLayoutEnd(c);

                        imLayout(c, BLOCK); {
                            imAbsolute(c, 0, PX, 0, PX, 0, PX, rightAbsolutePercent, PERCENT);
                            imBg(c, color);
                        } imLayoutEnd(c);
                    }
                } imLayoutEnd(c);
            } imIfEnd(c);

            imLine(c, LINE_HORIZONTAL, 1);

            imLayout(c, ROW); imJustify(c); {
                const idxText = "note " + s.cursorIdx;
                const timelinePosText = timelinePosToString(sequencer.cursorStart, sequencer.cursorDivisor);
                imLayout(c, BLOCK); imFlex(c); {
                    if (imIf(c) && isSaving(ctx)) {
                        imStr(c, "Saving...");
                    } imIfEnd(c);
                } imLayoutEnd(c);
                imStr(c, idxText + " | " + timelinePosText);
                imLayout(c, ROW); imFlex(c); imJustify(c, END); {
                    if (imIf(c) && sequencer.notesToPreview.length > 0) {
                        imStr(c, "TAB -> place, DEL or ~ -> delete");
                    } imIfEnd(c);
                } imLayoutEnd(c);
            } imLayoutEnd(c);
            imLayout(c, ROW); {
                imFor(c); for (let i = 0; i < NUM_EXTENT_DIVISIONS; i++) {
                    // GridLine - wtf ???
                    imLayout(c, BLOCK); imFlex(c); {
                        // text: timestamp + "ms"
                        // timelinePosToString(s.state.cursorStartPos[0] + gridLineAmount, s.state.cursorStartPos[1]) 
                    } imLayoutEnd(c);
                } imForEnd(c);
            } imLayoutEnd(c);
        } imLayoutEnd(c);
    } imLayoutEnd(c);
}


function imSequencerVerticalLine(
    c: ImCache,
    internalState: SequencerUIState,
    beats: number,
    color: string,
    thickness: number,
) {
    const absolutePercent = inverseLerp(
        beats,
        internalState.leftExtentBeatsAnimated,
        internalState.rightExtentBeatsAnimated,
    ) * 100;

    imAbsoluteVerticalLine(c, absolutePercent, color, thickness);
}

function imAbsoluteVerticalLine(
    c: ImCache,
    absolutePercent: number,
    color: string,
    thickness: number,
) {
    if (imIf(c) && absolutePercent >= 0 && absolutePercent <= 100) {
        imLayout(c, BLOCK); imAbsolute(
            c,
            0, PX, 0, NOT_SET,
            0, PX, absolutePercent, PERCENT,
        ); {
            if (imMemo(c, thickness)) elSetStyle(c,"width", thickness + "px");
            if (imMemo(c, color)) elSetStyle(c,"backgroundColor", color);
        } imLayoutEnd(c);
    } imIfEnd(c);
}

function imSequencerNotesUI(
    c: ImCache,
    text: string, 
    items: TimelineItem[], 
    previewItems: TimelineItem[] | null, 
    ctx: GlobalContext, 
    s: SequencerUIState
) {
    let count = items.length;
    if (previewItems) count += previewItems.length;

    if (imIf(c) && count > 0) {
        imLayout(c, BLOCK); imRelative(c); imPadding(
            c,
            10, PX, 3, PX, 
            10, PX, 3, PX, 
        ); {
            imStr(c, text);

            imFor(c); for (const item of items) {
                const text = getItemSequencerText(ctx.keyboard, item);
                imSequencerTrackTimelineItem(c, text, item, ctx, s);
            } imForEnd(c);

            if (imIf(c) && previewItems) {
                imFor(c); for (const item of previewItems) {
                    const text = getItemSequencerText(ctx.keyboard, item);
                    imSequencerTrackTimelineItem(c, text, item, ctx, s);
                } imEndFor(c);
            } imEndIf(c);
        } imLayoutEnd(c);
    } imIfEnd(c);
}

function imSequencerTrackTimelineItem(
    c: ImCache,
    text: string,
    item: TimelineItem,
    ctx: GlobalContext,
    s: SequencerUIState
) {
    const left = s.leftExtentBeatsAnimated;
    const right = s.rightExtentBeatsAnimated;
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

    imLayout(c, BLOCK); imAbsolute(
        c,
        0, NOT_SET, 0, NOT_SET,
        0, PX, leftPercent, PERCENT,
    ); {
        if (isFirstishRender(c)) {
            elSetClass(c, cn.noWrap);
            elSetStyle(c,"overflowX", "clip");
            elSetStyle(c,"padding", "3px 10px");
            elSetStyle(c,"border", `1px solid ${cssVarsApp.fg}`);
            elSetStyle(c,"boxSizing", "border-box");
        }

        elSetStyle(c,"backgroundColor", isBeingPlayed ? cssVarsApp.playback : isUnderCursor ? cssVarsApp.bg2 : cssVarsApp.bg);
        elSetStyle(c,"width", width + "%");
        imStr(c, text);
    } imLayoutEnd(c);
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
function imDivisionInput(c: ImCache, val: number): number | null {
    let result: number | null = null;

    imLayout(c, ROW); imAlign(c); imGap(c, 5, PX); {
        if (imButtonIsClicked(c, "<")) {
            result =  getPrevDivisor(val);
        }
        if (imButtonIsClicked(c, "-")) {
            result = clamp(val - 1, 1, 16);
        }

        imLayout(c, BLOCK); imFlex(c); imLayoutEnd(c);

        imStr(c, "Divisor: ");
        imStr(c, "1 / " + val);

        imLayout(c, BLOCK); imFlex(c); imLayoutEnd(c);

        if (imButtonIsClicked(c, "+")) {
            result = clamp(val + 1, 1, 16);
        }
        if (imButtonIsClicked(c, ">")) {
            result = getNextDivisor(val);
        }
    } imLayoutEnd(c);

    return result;
}


function imBpmInput(c: ImCache, value: number): number | null {
    let result: number | null = null;

    imLayout(c, ROW); imAlign(c); imGap(c, 5, PX); {
        if (imButtonIsClicked(c, "<")) {
            result = value - 10;
        }
        if (imButtonIsClicked(c, "-")) {
            result = value -=1;
        }

        imLayout(c, BLOCK); imFlex(c); imLayoutEnd(c);

        imStr(c, "BPM: ");
        imStr(c, value.toFixed(1) + "");

        imLayout(c, BLOCK); imFlex(c); imLayoutEnd(c);

        if (imButtonIsClicked(c, "+")) {
            result = value + 1;
        }
        if (imButtonIsClicked(c, ">")) {
            result = value + 10;
        }
    } imLayoutEnd(c);

    return result;
}

