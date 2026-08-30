import { imButtonIsClicked } from "src/components/button.ts";
import { imTextAreaBegin, imTextAreaEnd } from "src/components/editable-text-area.ts";
import { imLine, LINE_HORIZONTAL, LINE_VERTICAL } from "src/components/im-line.ts";
import { imSliderInput } from "src/components/slider.ts";
import { imTextInputBegin, imTextInputEnd } from "src/components/text-input.ts";
import { debugFlags } from "src/debug-flags.ts";
import { getPlaybackSpeed } from "src/dsp/dsp-loop-interface.ts";
import {
    getBottomRowStartRowNoteId,
    getHighestNoteId,
    getKeyForNote,
    getLowestNoteId,
    getMusicNoteText,
    InstrumentKey
} from "src/state/keyboard-state.ts";
import { previewNotes, setGlobalPlaybackSpeed } from "src/state/playing-pausing.ts";
import {
    CommandItem,
    compressChart,
    FRACTIONAL_UNITS_PER_BEAT,
    getBeatIdxBefore,
    getBeatsIndexesInclusive,
    getBpm,
    getTimeForBeats,
    isBeatWithinExclusive,
    isBeatWithinInclusve,
    isReadonlyChart,
    itemEnd,
    newTimelineItemBpmChange,
    NoteItem,
    SequencerChart,
    sequencerChartInsertItems,
    sequencerChartRemoveItems,
    TIMELINE_ITEM_BPM,
    TIMELINE_ITEM_MEASURE,
    TIMELINE_ITEM_NOTE,
    TimelineItem,
    TimelineItemBpmChange,
    TimelineItemMeasure,
    timelineItemToString
} from "src/state/sequencer-chart.ts";
import {
    getSelectionStartEndIndexes,
    getSequencerPlaybackOrEditingCursor,
    getTimelineMusicNoteThreads,
    hasRangeSelection,
    isItemBeingPlayed,
    isItemRangeSelected,
    NoteMapEntry,
    SequencerState,
    setCursorSnap
} from "src/state/sequencer-state.ts";
import { filteredCopy } from "src/utils/array-utils.ts";
import { assert, unreachable } from "src/utils/assert.ts";
import { copyToClipboard } from "src/utils/clipboard.ts";
import { el, ev, im, ImCache, imdom } from "src/utils/im-js";
import { BLOCK, COL, COL_REVERSE, cssVars, END, imui, INLINE_BLOCK, NA, PERCENT, PX, REM, ROW } from "src/utils/im-js/im-ui";

import { clamp, inverseLerp, lerp } from "src/utils/math-utils.ts";
import { bytesToMegabytes, utf16ByteLength } from "src/utils/utf8.ts";
import { GlobalContext, setLoadSaveModalOpen, setViewPlayCurrentChartTest } from "./app.ts";
import { CHART_SAVE_DEBOUNCE_SECONDS } from "./edit-view.ts";
import { isSavingAnyChart } from "./saving-chart.ts";
import { cssVarsApp, getCurrentTheme } from "./styling.ts";


export function getItemSequencerText(item: TimelineItem, key: InstrumentKey | undefined): string {
    if (item.type === TIMELINE_ITEM_NOTE) {
        const keyText = key ? key.text.toUpperCase() : "<no key!>";
        return keyText + " " + getMusicNoteText(item.noteId);
    }

    if (item.type === TIMELINE_ITEM_BPM) {
        return "bpm=" + item.bpm;
    }

    if (item.type === TIMELINE_ITEM_MEASURE) {
        return "measure";
    }

    return unreachable(item);
}


// The number of divisions to show before AND after the cursor.
const NUM_EXTENT_DIVISIONS = 8;

// TODO: there's some redundancy here, we should get rid of it.
export function getSequencerLeftExtent(sequencer: SequencerState): number {
    return -NUM_EXTENT_DIVISIONS * sequencer.cursorSnap;
}
export function getSequencerRightExtent(sequencer: SequencerState): number {
    return NUM_EXTENT_DIVISIONS * sequencer.cursorSnap;
}

type SequencerUIState = {
    lastCursor: number;
    lastUpdatedTime: number;
    invalidateCache: boolean;
    itemsUnderCursor: Set<TimelineItem>;
    notesToPlay: NoteItem[];

    currentCursorAnimated: number;
    cursorSnapAnimated: number;

    leftExtentBeats: number;
    rightExtentBeats: number;
    leftExtentBeatsAnimated: number;
    rightExtentBeatsAnimated: number;
    leftExtentIdx: number;
    rightExtentIdx: number;
    cursorIdx: number;
    notesMap: Map<number, NoteMapEntry>;
    noteOrder: NoteMapEntry[];
    commandsList: CommandItem[]
    bpmChanges: TimelineItemBpmChange[];
    measures: TimelineItemMeasure[];

    exportModalOpen: boolean;
    importModalOpen: boolean;
};

function newSequencerState(): SequencerUIState {
    return {
        lastCursor: 0,
        lastUpdatedTime: -1,
        invalidateCache: false,

        notesToPlay: [],
        itemsUnderCursor: new Set(),

        currentCursorAnimated: -1,
        cursorSnapAnimated: 4,

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

        exportModalOpen: !!debugFlags.testEditViewExport,
        importModalOpen: !!debugFlags.testEditViewImport,
    };
}

const noItems: TimelineItem[] = [];

/**
 * This component handles both the editing UI and the gameplay UI
 */
export function imSequencer(c: ImCache, ctx: GlobalContext) {
    const { sequencer, ui } = ctx;
    const loadSaveModal = ui.loadSave.modal;

    const chart = sequencer._currentChart;

    const s = im.State(c, newSequencerState);

    const currentCursor = getSequencerPlaybackOrEditingCursor(sequencer);

    // Expensive ? 
    sequencer._time = getTimeForBeats(chart, currentCursor);

    // Compute animation factors every frame without memoization
    {
        const lerpFactor = 20 * im.getDeltaTimeSeconds(c);

        s.currentCursorAnimated = lerp(s.currentCursorAnimated, s.lastCursor, lerpFactor);
        s.cursorSnapAnimated    = lerp(s.cursorSnapAnimated, sequencer.cursorSnap, lerpFactor);
        let leftExtent  = currentCursor + getSequencerLeftExtent(sequencer);
        let rightExtent = currentCursor + getSequencerRightExtent(sequencer);

        s.leftExtentBeats  = leftExtent;
        s.rightExtentBeats = rightExtent;
        s.leftExtentBeatsAnimated  = lerp(s.leftExtentBeatsAnimated, leftExtent, lerpFactor);
        s.rightExtentBeatsAnimated = lerp(s.rightExtentBeatsAnimated, rightExtent, lerpFactor);

        const tl = sequencer._currentChart.timeline;

        s.cursorIdx = getBeatIdxBefore(chart, currentCursor);

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

    const previewItemsChanged = im.Memo(c, sequencer.notesToPreviewVersion);
    const currentChartChanged = im.Memo(c, sequencer._currentChart);

    // Recompute the non-overlapping items in the sequencer timeline as needed
    if (
        s.lastCursor !== currentCursor ||
        s.lastUpdatedTime !== sequencer._currentChart._lastUpdated ||
        currentChartChanged ||
        previewItemsChanged ||
        s.invalidateCache
    ) {
        s.lastUpdatedTime = sequencer._currentChart._lastUpdated;
        s.lastCursor = currentCursor;
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
        s.noteOrder.sort((a, b) => b.noteId - a.noteId);

        // check if we've got any new things in the set, and then play them.
        {
            for (const note of s.itemsUnderCursor) {
                if (!isBeatWithinInclusve(note, currentCursor)) {
                    s.itemsUnderCursor.delete(note);
                }
            }

            s.notesToPlay.length = 0;
            for (const notes of s.notesMap.values()) {
                for (const note of notes.items) {
                    if (isBeatWithinInclusve(note, currentCursor)) {
                        if (!s.itemsUnderCursor.has(note)) {
                            s.notesToPlay.push(note);
                        }

                        s.itemsUnderCursor.add(note);
                    }
                }
            }

            if (!sequencer.playingId) {
                previewNotes(ctx, s.notesToPlay);
            }
        }
    }

    if (im.If(c) && s.importModalOpen) {
        imImportModal(c, ctx);

        if (!ctx.handled) {
            if (ctx.keyPressState?.key === "Escape") {
                s.importModalOpen = false;
                ctx.handled = true;
            }
        }

        ctx.handled = true;
    } im.IfEnd(c);

    if (im.If(c) && s.exportModalOpen) {
        imExportModal(c, ctx, sequencer._currentChart);

        if (!ctx.handled) {
            if (ctx.keyPressState?.key === "Escape") {
                s.exportModalOpen = false;
                ctx.handled = true;
            }
        }

        ctx.handled = true;
    } im.IfEnd(c);

    imui.Begin(c, COL); imui.Flex(c); imui.Relative(c); {
        // Top bar
        imui.Begin(c, ROW); imui.Align(c); imui.Gap(c, 5, PX); {
            imui.Begin(c, BLOCK); imui.Size(c, 5, PX, 0, NA); imui.End(c);

            if (im.If(c) && !loadSaveModal._open) {
                if (im.If(c) && sequencer.playingId) {
                    imui.Begin(c, ROW); imui.Gap(c, 20, PX); {
                        imui.Begin(c, ROW); imui.Align(c); imui.Gap(c, 5, PX); {
                            const speed = getPlaybackSpeed();
                            imdom.Str(c, "Speed: ");
                            imdom.Str(c, speed.toFixed(2));
                            imdom.Str(c, "x");

                            imui.Begin(c, COL); imui.Size(c, 500, PX, 1.5, REM); {
                                const newSpeed = imSliderInput(c, 0.0, 3, 0.0001, speed);
                                if (im.Memo(c, newSpeed)) {
                                    setGlobalPlaybackSpeed(ctx, newSpeed);
                                }
                            } imui.End(c);

                            if (im.If(c) && speed !== 1) {
                                if (imButtonIsClicked(c, "<")) {
                                    setGlobalPlaybackSpeed(ctx, 1);
                                }
                            } im.IfEnd(c);
                        } imui.End(c);

                        imui.Begin(c, BLOCK); {
                            imdom.Str(c, (sequencer._time / 1000).toFixed(3)); imdom.Str(c, "s");
                        } imui.End(c);
                    } imui.End(c);
                } else {
                    im.IfElse(c);

                    imui.Begin(c, ROW); imui.Gap(c, 20, PX); {
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
                                    lastBpmChange = newTimelineItemBpmChange(0, value);
                                }
                                sequencerChartInsertItems(sequencer._currentChart, [lastBpmChange]);
                            }
                        }

                        const newCursorDivisor = imCursorDivisor(c, Math.floor(FRACTIONAL_UNITS_PER_BEAT / sequencer.cursorSnap));
                        if (newCursorDivisor !== null) {
                            const newCursorSnap = Math.floor(FRACTIONAL_UNITS_PER_BEAT / newCursorDivisor);
                            setCursorSnap(sequencer, newCursorSnap);
                        }

                    } imui.End(c);
                } im.IfEnd(c);

                imui.Begin(c, ROW); imui.Flex(c); imui.Justify(c); imui.Fg(c, cssVarsApp.danger); { 
                    if (im.If(c) && isReadonlyChart(chart)) {
                        imdom.Str(c, "Readonly");
                    } im.IfEnd(c);
                } imui.End(c);

                if (imButtonIsClicked(c, "Test", s.importModalOpen)) {
                    const time = getTimeForBeats(chart, sequencer.cursor);
                    setViewPlayCurrentChartTest(ctx, time);
                }

                if (imButtonIsClicked(c, "Import", s.importModalOpen)) {
                    s.importModalOpen = true;
                }

                if (imButtonIsClicked(c, "Export", s.exportModalOpen)) {
                    s.exportModalOpen = true;
                }

                if (imButtonIsClicked(c, (loadSaveModal._open ? "->" : "<-") + "Load/Save")) {
                    setLoadSaveModalOpen(ctx);
                }
            } else {
                im.IfElse(c);

                // TODO: Load/save modal top bar. When needed.

            } im.IfEnd(c);

            imui.Begin(c, BLOCK); imui.Size(c, 5, PX, 0, NA); imui.End(c);
        } imui.End(c);

        imLine(c, LINE_HORIZONTAL, 1);

        const isRangeSelecting = hasRangeSelection(sequencer);
        if (im.If(c) && isRangeSelecting) {
            imui.Begin(c, BLOCK); imui.Relative(c); {
                const [start, end] = getSelectionStartEndIndexes(sequencer);
                let str;
                if (start === -1 || end === -1) {
                    str = "none selected";
                } else {
                    str = (end - start + 1) + " selected";
                }

                imdom.Str(c, str);
            } imui.End(c);
        } im.IfEnd(c);

        if (!!debugFlags.debuUndoBuffer) {
            // Debug visualizer for the undo buffer
            imui.Begin(c, BLOCK); {
                let i = 0;
                const chart = sequencer._currentChart;
                im.For(c); for (const item of chart._undoBuffer.items) {
                    imui.Begin(c, INLINE_BLOCK); imui.Padding(c, 0, NA, 30, PX, 0, NA, 0, NA); {
                        imdom.Str(c, chart._undoBuffer.idx === i ? "->" : "");
                        imdom.Str(c, "Entry " + (i++) + ": ");
                        im.For(c); for (const tlItem of item.items) {
                            imdom.Str(c, timelineItemToString(tlItem));
                        } im.ForEnd(c);
                    } imui.End(c);
                } im.ForEnd(c);
            } imui.End(c);
        }

        // Sequencer veiw
        imui.Begin(c, ROW); imui.Flex(c); {
            imSequencerInternal(c, ctx, s, true);
            imLine(c, LINE_VERTICAL, 1);
            imSequencerInternal(c, ctx, s, false);
        } imui.End(c);

        imLine(c, LINE_HORIZONTAL, 1);

        // minimap of the entire chart
        if (im.If(c) && chart.timeline.length > 0) {
            const lastItem = chart.timeline[chart.timeline.length - 1]
            const totalBeats = itemEnd(lastItem);

            imui.Begin(c, BLOCK); imui.Size(c, 0, NA, 50, PX); imui.Relative(c); {
                const leftAbsolutePercent = 100.0 * s.leftExtentBeatsAnimated / totalBeats;
                const rightAbsolutePercent = 100.0 * s.rightExtentBeatsAnimated / totalBeats;
                const color = `rgba(0, 0, 0, 0.25)`;

                im.For(c); for (let i = 0; i < chart.timeline.length; i++) {
                    const item = chart.timeline[i];
                    const absoluteLeftStart = 100 * item.start / totalBeats;
                    const absoluteLeftEnd = 100 * itemEnd(item) / totalBeats;
                    const width = absoluteLeftEnd - absoluteLeftStart;
                    im.Switch(c, item.type); switch (item.type) {
                        case TIMELINE_ITEM_MEASURE: {
                            imAbsoluteVerticalLine(c, absoluteLeftStart, cssVarsApp.playback, 2);
                        } break;
                        case TIMELINE_ITEM_BPM: {
                            imAbsoluteVerticalLine(c, absoluteLeftStart, cssVarsApp.bpmMarker, 2);
                        } break;
                        case TIMELINE_ITEM_NOTE: {
                            const lowestNote  = getLowestNoteId(ctx.keyboard);
                            const highestNote = getHighestNoteId(ctx.keyboard);

                            let absoluteTop;
                            let color;
                            let size;
                            let sizeUnit;
                            if (item.noteId < lowestNote) {
                                color = cssVarsApp.error;
                                absoluteTop = 75;
                                size = 25;
                                sizeUnit = PERCENT
                            } else if(item.noteId > highestNote) {
                                color = cssVarsApp.error;
                                absoluteTop = 0;
                                size = 25;
                                sizeUnit = PERCENT
                            } else {
                                color = cssVars.fg;
                                absoluteTop = 100 * inverseLerp(item.noteId, highestNote - 1, lowestNote - 1);
                                size = 2;
                                sizeUnit = PX;
                            }

                            imui.Begin(c, BLOCK);
                            imui.Absolute(c, absoluteTop, PERCENT, 0, NA, 0, NA, absoluteLeftStart, PERCENT);
                            imui.Size(c, width, PERCENT, size, sizeUnit); {
                                imui.Bg(c, color);
                            } imui.End(c);
                        } break;
                    } im.SwitchEnd(c);
                } im.ForEnd(c);

                imAbsoluteVerticalLine(c, 100.0 * s.currentCursorAnimated / totalBeats, cssVarsApp.fg, 4);

                // Middle split between top rows and bottom rows
                {
                    const noteId      = getBottomRowStartRowNoteId(ctx.keyboard);
                    const lowestNote  = getLowestNoteId(ctx.keyboard);
                    const highestNote = getHighestNoteId(ctx.keyboard);

                    const absoluteTop = 100 * inverseLerp(noteId, highestNote, lowestNote);

                    imui.Begin(c, BLOCK); imui.Absolute(c, absoluteTop, PERCENT, 0, PX, 0, NA, 0, PX); {
                        imui.Size(c, 0, NA, 1, PX);
                        imui.Bg(c, color);
                    } imui.End(c);
                }

                // the currently viewed sliding window
                {
                    imui.Begin(c, BLOCK); {
                        imui.Absolute(c, 0, PX, 0, NA, 0, PX, 0, PX);
                        imui.Size(c, leftAbsolutePercent, PERCENT, 0, NA);
                        imui.Bg(c, color);
                    } imui.End(c);

                    imui.Begin(c, BLOCK); {
                        imui.Absolute(c, 0, PX, 0, PX, 0, PX, rightAbsolutePercent, PERCENT);
                        imui.Bg(c, color);
                    } imui.End(c);
                }

                // Current selection
                if (im.If(c) && isRangeSelecting) {
                    const lo = sequencer.rangeSelectStart / totalBeats;
                    const hi  = sequencer.rangeSelectEnd / totalBeats;
                    const leftAbsolutePercent  = 100 * Math.min(hi, lo);
                    const rightAbsolutePercent = 100 * (1 - Math.max(hi, lo));
                    imui.Begin(c, BLOCK); {
                        imui.Absolute(
                            c,
                            0, PX, rightAbsolutePercent, PERCENT,
                            0, PX, leftAbsolutePercent, PERCENT
                        );
                        imui.Bg(c, `rgba(255, 255, 0, 0.25)`);
                    } imui.End(c);
                } im.IfEnd(c);
            } imui.End(c);
        } im.IfEnd(c);

        imLine(c, LINE_HORIZONTAL, 1);

        imui.Begin(c, ROW); imui.Justify(c); imui.Gap(c, 10, PX); {
            imdom.ElBegin(c, el.B); {
                imdom.Str(c, sequencer._currentChart.name);
            } imdom.ElEnd(c, el.B);

            imui.Begin(c, BLOCK); imui.Flex(c); {
                let isSaving = isSavingAnyChart();

                // We never want our '|' sperator to:
                // - occur twice in a row
                // - occur after nothing
                // - occur before nothing
                //
                // As long as the first item is always present, subsequent items
                // can be conditionally rendered like
                // if (condition) { "|" and content }
                //
                // And this will always be the case.

                if (im.If(c) && (ui.editView.chartSaveTimerSeconds > 0 || isSaving)) {
                    const t = ui.editView.chartSaveTimerSeconds / CHART_SAVE_DEBOUNCE_SECONDS;
                    const numDots = Math.floor((1.0 - t) * 10);
                    let message = "Awaiting save" + ".".repeat(numDots);

                    imdom.Str(c, message);
                } else {
                    im.IfElse(c);

                    const numToUndo = chart._undoBuffer.idx + 1;
                    if (im.If(c) && numToUndo > 0) {
                        imdom.Str(c, "|");
                        imdom.Str(c, numToUndo + " undo");
                    } im.IfEnd(c);
                    const numToRedo = chart._undoBuffer.items.length - chart._undoBuffer.idx - 1;
                    if (im.If(c) && numToRedo > 0) {
                        imdom.Str(c, "|");
                        imdom.Str(c, numToRedo + " redo");
                    } im.IfEnd(c);

                    const numCopied = ui.copied.items.length;
                    if (im.If(c) && numCopied > 0) {
                        imdom.Str(c, "|");
                        imdom.Str(c, numCopied + " items copied");
                    } im.IfEnd(c);
                } im.IfEnd(c);
            } imui.End(c);

            imdom.Str(c, "note_idx=");
            imdom.Str(c, s.cursorIdx);
            imdom.Str(c, ", beats="); imdom.Str(c, (sequencer.cursor / FRACTIONAL_UNITS_PER_BEAT).toFixed(3));
            imdom.Str(c, "(integer_beats="); imdom.Str(c, sequencer.cursor); imdom.Str(c, ")");
            imdom.Str(c, ", time="); imdom.Str(c, (sequencer._time / 1000).toFixed(3)); imdom.Str(c, "s");

            imui.Begin(c, ROW); imui.Flex(c); imui.Justify(c, END); {
                if (im.If(c) && sequencer.notesToPreview.length > 0) {
                    imdom.Str(c, "TAB -> place, DEL or ~ -> delete");
                } im.IfEnd(c);
            } imui.End(c);
        } imui.End(c);

    } imui.End(c);

    if (!ctx.handled) {
        const keyPress = ctx.keyPressState;
        if (keyPress) {
            let handled = false; 

            ctx.handled = handled;

            if (keyPress.keyUpper === "T" && keyPress.shiftPressed) {
                const time = getTimeForBeats(chart, sequencer.cursor);
                setViewPlayCurrentChartTest(ctx, time);
                handled = true;
            }
        }

    }
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
    if (im.If(c) && absolutePercent >= 0 && absolutePercent <= 100) {
        imui.Begin(c, BLOCK); imui.Absolute(
            c,
            0, PX, 0, NA,
            0, PX, absolutePercent, PERCENT,
        ); {
            if (im.Memo(c, thickness)) imdom.setStyle(c,"width", thickness + "px");
            if (im.Memo(c, color)) imdom.setStyle(c,"backgroundColor", color);
        } imui.End(c);
    } im.IfEnd(c);
}

function imSequencerNotesUI(
    c: ImCache,
    text: string, 
    items: TimelineItem[], 
    previewItems: TimelineItem[] | null, 
    ctx: GlobalContext, 
    s: SequencerUIState,
) {
    let count = items.length;
    if (previewItems) count += previewItems.length;

    imui.Begin(c, COL); imui.Relative(c); imui.Padding(
        c,
        10, PX, 3, PX, 
        10, PX, 3, PX, 
    ); {
        imdom.Str(c, text);

        im.For(c); for (const item of items) {
            const key = item.type === TIMELINE_ITEM_NOTE ? getKeyForNote(ctx.keyboard, item.noteId) : undefined;
            const text = getItemSequencerText(item, key);
            imSequencerTrackTimelineItem(c, text, item, ctx, s);
        } im.ForEnd(c);

        if (im.If(c) && previewItems) {
            im.For(c); for (const item of previewItems) {
                const key = item.type === TIMELINE_ITEM_NOTE ? getKeyForNote(ctx.keyboard, item.noteId) : undefined;
                const text = getItemSequencerText(item, key);
                imSequencerTrackTimelineItem(c, text, item, ctx, s);
            } im.ForEnd(c);
        } im.IfEnd(c);
    } imui.End(c);
}

function imSequencerTrackTimelineItem(
    c: ImCache,
    text: string,
    item: TimelineItem,
    ctx: GlobalContext,
    s: SequencerUIState,
) {
    const left = s.leftExtentBeatsAnimated;
    const right = s.rightExtentBeatsAnimated;
    const extentSize = right - left;

    const leftPercent = 100 * (item.start - left) / extentSize;
    const MIN_WIDTH_PERCENT = 1;
    let width;
    if (item.type === TIMELINE_ITEM_NOTE) {
        width = Math.max(100 * item.length / extentSize, MIN_WIDTH_PERCENT);
    } else {
        width = MIN_WIDTH_PERCENT;
    }

    let isUnderCursor = false;
    let isBeingPlayed = false;

    if (item.type === TIMELINE_ITEM_NOTE) {
        const { sequencer } = ctx;
        const cursorStart = sequencer.cursor;

        if (hasRangeSelection(sequencer)) {
            isUnderCursor = isItemRangeSelected(sequencer, item);
        } else {
            isUnderCursor = isBeatWithinExclusive(item, cursorStart);
        }

        isBeingPlayed = isItemBeingPlayed(sequencer, item);
    }

    imui.Begin(c, BLOCK); 
    imui.Absolute(c, 0, NA, 0, NA, 0, PX, leftPercent, PERCENT); imui.NoWrap(c); {
        if (im.isFirstishRender(c)) {
            imdom.setStyle(c,"overflowX", "clip");
            imdom.setStyle(c,"border", `1px solid ${cssVarsApp.fg}`);
            imdom.setStyle(c,"boxSizing", "border-box");
            imdom.setStyle(c, "padding", "3px 10px");
        }

        imdom.setStyle(c,"backgroundColor", isBeingPlayed ? cssVarsApp.playback : isUnderCursor ? cssVarsApp.bg2 : cssVarsApp.bg);
        imdom.setStyle(c,"width", width + "%");
        imdom.Str(c, text);
    } imui.End(c);
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
function imCursorDivisor(c: ImCache, val: number): number | null {
    let result: number | null = null;

    imui.Begin(c, ROW); imui.Align(c); imui.Gap(c, 5, PX); {
        if (imButtonIsClicked(c, "<-")) {
            result =  getPrevDivisor(val);
        }
        if (imButtonIsClicked(c, "-")) {
            result = clamp(val - 1, 1, 16);
        }

        imui.Begin(c, BLOCK); imui.Flex(c); imui.End(c);

        imdom.Str(c, "Divisor: ");
        imdom.Str(c, "1 / " + val);

        imui.Begin(c, BLOCK); imui.Flex(c); imui.End(c);

        if (imButtonIsClicked(c, "+")) {
            result = clamp(val + 1, 1, 16);
        }
        if (imButtonIsClicked(c, "->")) {
            result = getNextDivisor(val);
        }
    } imui.End(c);

    return result;
}


function imBpmInput(c: ImCache, value: number): number | null {
    let result: number | null = null;

    imui.Begin(c, ROW); imui.Align(c); imui.Gap(c, 5, PX); {
        if (imButtonIsClicked(c, "<-")) {
            result = value - 10;
        }
        if (imButtonIsClicked(c, "-")) {
            result = value -=1;
        }

        imui.Begin(c, BLOCK); imui.Flex(c); imui.End(c);

        imdom.Str(c, "Last BPM: ");
        imdom.Str(c, value.toFixed(1) + "");

        imui.Begin(c, BLOCK); imui.Flex(c); imui.End(c);

        if (imButtonIsClicked(c, "+")) {
            result = value + 1;
        }
        if (imButtonIsClicked(c, "->")) {
            result = value + 10;
        }
    } imui.End(c);

    return result;
}


function imExportModal(
    c: ImCache,
    ctx: GlobalContext,
    chart: SequencerChart
) {
    imui.Begin(c, BLOCK); imui.Absolute(c, 0, PX, 0, PX, 0, PX, 0, PX); imui.Bg(c, `rgba(0, 0, 0, 0.3)`); {
        if (im.isFirstishRender(c)) {
            imdom.setStyle(c, "zIndex", "10");
        }
        imui.Begin(c, COL); imui.Absolute(c, 10, PX, 20, PERCENT, 10, PX, 20, PERCENT); imui.Bg(c, cssVars.bg); {
            let s; s = im.GetInline(c, imExportModal) ?? im.Set(c, {
                buttonText: "Copy to clipboard",
                serializedJson: "",
                sizeMb: 0,
            });

            if (im.Memo(c, true)) {
                const serialized = compressChart(chart);
                const text = JSON.stringify(serialized);
                const sizeInBytes = utf16ByteLength(text)
                s.serializedJson = text;
                s.sizeMb = bytesToMegabytes(sizeInBytes);
            }

            imui.Begin(c, COL); imui.Flex(c); imui.ScrollOverflow(c, true); {
                imui.Begin(c, BLOCK); {
                    imdom.setStyle(c, "userSelect", "none");
                    imdom.Str(c, s.sizeMb.toPrecision(3));
                    imdom.Str(c, "mb");
                } imui.End(c);
                imui.Begin(c, BLOCK); imui.Flex(c); {
                    imdom.setStyle(c, "wordBreak", "break-all");
                    imdom.Str(c, s.serializedJson);
                } imui.End(c);
            } imui.End(c);
            if (imButtonIsClicked(c, s.buttonText)) {
                copyToClipboard(s.serializedJson)
                    .then(() => {
                        s.buttonText = "Copied " + s.sizeMb.toPrecision(3) + "mb of JSON!";
                        setTimeout(() => s.buttonText = "Copy to clipboard", 2000);
                    })
                    .catch(e => console.error(e));
            }
        } imui.End(c);
    } imui.End(c);
}

function imImportModal(
    c: ImCache,
    ctx: GlobalContext,
) {
    imui.Begin(c, BLOCK); imui.Absolute(c, 0, PX, 0, PX, 0, PX, 0, PX); imui.Bg(c, `rgba(0, 0, 0, 0.3)`); {
        imui.Begin(c, COL); imui.Absolute(c, 10, PX, 20, PERCENT, 10, PX, 20, PERCENT); imui.Bg(c, cssVars.bg); {
            let s; s = im.GetInline(c, imExportModal) ?? im.Set(c, {
                importJson: "",
                nameOverride: "",
            });

            if (im.Memo(c, true)) {
                s.importJson = "";
            }

            imui.Begin(c, BLOCK); imui.Padding(c, 10, PX, 10, PX, 10, PX, 10, PX); {
                imdom.Str(c, "Data to import:");
            } imui.End(c);
            imui.Begin(c, COL); imui.Flex(c); imui.Padding(c, 10, PX, 10, PX, 10, PX, 10, PX); {
                const [, textArea] = imTextAreaBegin(c, {
                    value: s.importJson,
                    placeholder: "Paste in the JSON you exported"
                }); {
                    const input = imdom.On(c, ev.INPUT);
                    if (input) {
                        s.importJson = textArea.value;
                    }
                } imTextAreaEnd(c);
            } imui.End(c);
            imui.Begin(c, BLOCK); imui.Padding(c, 10, PX, 10, PX, 10, PX, 10, PX); {
                imdom.Str(c, "New name (optional):");
            } imui.End(c);
            imui.Begin(c, BLOCK); imui.Padding(c, 10, PX, 10, PX, 10, PX, 10, PX); {
                const input = imTextInputBegin(c, {
                    value: s.nameOverride,
                    placeholder: "Provide a new name here"
                }); {
                    const inputEv = imdom.On(c, ev.INPUT);
                    if (inputEv) {
                        s.nameOverride = input.root.value;
                    }
                } imTextInputEnd(c);
            } imui.End(c);
            if (imButtonIsClicked(c, "Import")) {
            }
        } imui.End(c);
    } imui.End(c);
}

function imSequencerInternal(c: ImCache, ctx: GlobalContext, s: SequencerUIState, topRow: boolean) {
    const { sequencer } = ctx;
    const isRangeSelecting = hasRangeSelection(sequencer);

    imui.Begin(c, BLOCK); imui.Flex(c); imui.Relative(c); {
        if (im.isFirstishRender(c)) {
            imdom.setStyle(c, "overflowY", "auto");
            imdom.setStyle(c, "overflowX", "hidden");
        }

        if (im.If(c) && isRangeSelecting) {
            const beatsA = sequencer.rangeSelectStart;
            const beatsB = sequencer.rangeSelectEnd;

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

            imui.Begin(c, BLOCK); {
                imui.Absolute(
                    c,
                    0, PX, rightAbsolutePercent, PERCENT,
                    0, PX, leftAbsolutePercent, PERCENT
                );
                imui.Bg(c, `rgba(255, 255, 0, 0.25)`);
            } imui.End(c);

            // range select lines
            imSequencerVerticalLine(c, s, sequencer.rangeSelectStart, cssVarsApp.mg, 3);
            imSequencerVerticalLine(c, s, sequencer.rangeSelectEnd, cssVarsApp.mg, 3);
        } im.IfEnd(c);

        {
            const start = sequencer.cursorSnap * Math.floor(s.leftExtentBeats / sequencer.cursorSnap);
            const end = sequencer.cursorSnap * Math.floor(s.rightExtentBeats / sequencer.cursorSnap);

            // grid lines
            im.For(c); for (let x = start; x < end; x += sequencer.cursorSnap) {
                if (x < 0) {
                    continue;
                }

                let color = cssVars.bg2;
                let thickness = 1;

                if (x % FRACTIONAL_UNITS_PER_BEAT === 0) {
                    thickness = 3;
                } else if (x % (FRACTIONAL_UNITS_PER_BEAT / 2) === 0) {
                    thickness = 2;
                }
                imSequencerVerticalLine(c, s, x, color, thickness);
            } im.ForEnd(c);

            // cursor start vertical line
            imSequencerVerticalLine(c, s, s.lastCursor, cssVarsApp.mg, 3);

            // add blue vertical lines for all the measures
            im.For(c); for (const item of s.commandsList) {
                if (item.type !== TIMELINE_ITEM_MEASURE) continue;
                const beats = item.start;
                imSequencerVerticalLine(c, s, beats, cssVarsApp.playback, 4);
            } im.ForEnd(c);
        }

        imui.Begin(c, COL_REVERSE); imui.Justify(c); imui.Size(c, 0, NA, 100, PERCENT); {
            let totalNumCols = 0;
            for (const row of ctx.keyboard.keys) {
                totalNumCols = Math.max(totalNumCols, row.length)
            }

            let start, end;
            if (topRow) {
                start = 0;
                end = 2;
            } else {
                start = 2;
                end = 4;
            }

            im.For(c); for (let j = 0; j < totalNumCols; j++) {
                for (let i = start; i < end; i++) {
                    const row = ctx.keyboard.keys[i];
                    if (j >= row.length) break;
                    const key = row[j];
                    const entry = s.notesMap.get(key.noteId);

                    if (entry?.firstItem) {
                        const text = getItemSequencerText(entry.firstItem, key);
                        imSequencerNotesUI(c, text, entry.items, entry.previewItems, ctx, s);
                    } else {
                        const text = getMusicNoteText(key.noteId);
                        imSequencerNotesUI(c, text, noItems, noItems, ctx, s);
                    }
                }
            } im.ForEnd(c);

            // if (im.If(c) && s.allNotesVisible) {
            //     im.For(c); for (let i = ctx.keyboard.flatKeys.length - 1; i >= 0; i--) {
            //         const key = ctx.keyboard.flatKeys[i];
            //         const entry = s.notesMap.get(key.noteId);
            //         if (entry?.firstItem) {
            //             const text = getItemSequencerText(entry.firstItem, key);
            //             imSequencerNotesUI(c, text, entry.items, entry.previewItems, ctx, s);
            //         } else {
            //             const text = getMusicNoteText(key.noteId);
            //             imSequencerNotesUI(c, text, noItems, noItems, ctx, s);
            //         }
            //     } im.ForEnd(c);
            // } else {
            //     im.IfElse(c);
            //
            //     im.For(c); for (const entry of s.noteOrder) {
            //         assert(!!entry.firstItem);
            //         const key = getKeyForNote(ctx.keyboard, entry.firstItem.noteId);
            //         if (!key) {
            //             continue;
            //         }
            //
            //         const text = getItemSequencerText(entry.firstItem, key);
            //         imSequencerNotesUI(
            //             c,
            //             text,
            //             entry.items,
            //             entry.previewItems,
            //             ctx,
            //             s,
            //         );
            //     } im.ForEnd(c);
            // } im.IfEnd(c);

            imSequencerNotesUI(c, "measures", s.measures, null, ctx, s);
            imSequencerNotesUI(c, "bpm", s.bpmChanges, null, ctx, s);
        } imui.End(c);
    } imui.End(c);
}
