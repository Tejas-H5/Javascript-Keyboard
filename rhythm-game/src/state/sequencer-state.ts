import { ScheduledKeyPress } from "src/dsp/dsp-loop-interface";
import {
    CHART_STATUS_READONLY,
    CommandItem,
    FRACTIONAL_UNITS_PER_BEAT,
    getBeatIdxAfter,
    getBeatsForTime,
    getBeatsIndexesExclusive,
    getBpmChangeItemBeforeBeats,
    getItemEndTime,
    getItemIdxAtBeat,
    getItemStartTime,
    getTimeForBeats,
    itemEnd,
    newChart,
    newTimelineItemNote,
    NoteItem,
    SequencerChart,
    sequencerChartInsertItems,
    sequencerChartRemoveItems,
    sequencerChartShiftItems,
    sortAndIndexTimeline,
    TIMELINE_ITEM_BPM,
    TIMELINE_ITEM_MEASURE,
    TIMELINE_ITEM_NOTE,
    TimelineItem,
    TimelineItemBpmChange,
    transposeItems,
} from "src/state/sequencer-chart";
import { unreachable } from "src/utils/assert";
import { GlobalContext } from "src/views/app";

export const SEQUENCER_ROW_COLS = 8;

export type SequencerState = {
    keyEditFilterModalOpen: boolean;
    notesFilter: Set<number>;
    keyEditFilterRangeIdx0: number; 

    cursor: number; 
    cursorSnap: number;

    isRangeSelecting: boolean;
    rangeSelectStart: number;
    rangeSelectEnd: number;

    currentHoveredTimelineItemIdx: number;

    isPlaying: boolean;
    isPaused: boolean;
    playbackSpeed: number;
    startBeats: number;
    pausedPlaybackTime: number;
    startPlayingTime: number; // this is the time IRL we started playing, not the time along the timeline.seq

    playingTimeout: number;
    reachedLastNote: boolean;
    scheduledKeyPresses: ScheduledKeyPress[];
    scheduledKeyPressesFirstItemStart: number;
    scheduledKeyPressesPlaybackSpeed: number;

    notesToPreview: NoteItem[];
    notesToPreviewVersion: number;

    // Derived fields  
    _currentChart: SequencerChart;
    _trackIdx: number;
    _timelineTempBuffer: TimelineItem[];
    _nonOverlappingItems: NoteItem[][];
    _visitedBuffer: boolean[];
    _lastBpmChange: TimelineItemBpmChange | undefined;

};

export function getCursorStartTime(state: SequencerState): number {
    return getTimeForBeats(state._currentChart, state.cursor);
}

export function hasRangeSelection(state: SequencerState) {
    return state.rangeSelectStart !== -1 && state.rangeSelectEnd !== -1;
}

// TODO: ctx
export function getSelectionStartEndIndexes(state: SequencerState): [number, number] {
    const a = state.rangeSelectStart;
    const b = state.rangeSelectEnd;
    return getBeatsIndexesExclusive(state._currentChart, a, b);
}

export function clearRangeSelection(state: SequencerState, goBackToStart: boolean) {
    if (goBackToStart) {
        state.cursor = state.rangeSelectStart;
    }

    state.isRangeSelecting = false;
    state.rangeSelectStart = -1;
    state.rangeSelectEnd = -1;
}

export function setIsRangeSelecting(state: SequencerState, value: boolean) {
    if (state.isRangeSelecting === value) {
        return;
    }

    state.isRangeSelecting = value;
    if (state.isRangeSelecting) {
        state.rangeSelectStart = state.cursor;
        state.rangeSelectEnd = state.cursor;
    }
}

export function setCursorBeats(sequencer: SequencerState, beats: number) {
    sequencer.cursor = sequencer.cursorSnap * Math.floor(beats / sequencer.cursorSnap);
}

export function setCursorSnap(sequencer: SequencerState, snap: number) {
    if (snap === 0 || Math.trunc(snap) !== snap) {
        snap = FRACTIONAL_UNITS_PER_BEAT / 4;
    }

    sequencer.cursorSnap = Math.floor(snap);
    sequencer.cursor = sequencer.cursorSnap * Math.round(sequencer.cursor / sequencer.cursorSnap)

    clearRangeSelection(sequencer, false);
}

export function getCurrentItemIdx(state: SequencerState): number {
    return getItemIdxAtBeat(state._currentChart, state.cursor);
}


// This method will insert a note with a particular length into an arbitrary position.
// if onOrOff is true, it will coalesce itself with any items of the same note.
// else, it union-differences itself from any notes of the same note. (there will only be one such note if all you do is call `setTimelineNoteAtPosition` all the time)
export function setTimelineNoteAtPosition(
    chart: SequencerChart,
    notesFilter: Set<number>,
    rangeStart: number, 
    rangeLen: number,
    noteId: number,
    onOrOff: boolean,
) {
    const timeline = chart.timeline;

    const rangeEnd = rangeStart + rangeLen;

    if (onOrOff) {
        const notesToRemove: NoteItem[] = [];

        let isNoteValid = true;
        let newNoteStartBeats = rangeStart;
        let newNoteEndBeats = rangeEnd;
        for (const item of timeline) {
            if (item.type !== TIMELINE_ITEM_NOTE) continue;
            if (item.noteId !== noteId) continue;

            // ignore notes that are not even in the range
            if (itemEnd(item) < rangeStart) continue;
            if (item.start > rangeEnd) break;

            if (item.start <= rangeStart && rangeEnd <= itemEnd(item)) {
                //    |-----------|
                //      |++++++|
                // => |-----------|  (don't add this note)
                isNoteValid = false;
                continue;
            } 

            if (item.start < newNoteStartBeats) {
                newNoteStartBeats = item.start;
            } else if (itemEnd(item) > newNoteEndBeats) {
                newNoteEndBeats = itemEnd(item);
            }

            notesToRemove.push(item);
        }

        sequencerChartRemoveItems(chart, notesToRemove, notesFilter);

        if (isNoteValid) {
            const newNoteStart = newNoteStartBeats;
            const newNoteLen = newNoteEndBeats - newNoteStartBeats;
            const newNote = newTimelineItemNote(noteId, newNoteStart, newNoteLen);

            sequencerChartInsertItems(chart, [newNote], notesFilter);
        }
    } else {
        const notesToAdd: NoteItem[] = [];
        const notesToRemove: NoteItem[] = [];

        for (const item of timeline) {
            if (item.type !== TIMELINE_ITEM_NOTE) continue;
            if (item.noteId !== noteId) continue;

            // ignore notes that are not even in the range
            if (itemEnd(item) < rangeStart) continue;
            if (item.start > rangeEnd) break;

            if (rangeStart <= item.start && itemEnd(item) <= rangeEnd) {
                //    |------|
                //  |xxxxxxxxxxx|
                // => nothing - delete this item
                notesToRemove.push(item);
                continue;
            } 

            //    |-----------------------|  |  |--------------|      |      |-----------|
            //           |xxxxxxxxxxx|       |         |xxxxxxxxxxx|  | |xxxxxxxxxxx|
            // => |------|           |----|  |  |------|              |             |----|
            //
            // Turns out that all three cases can be handled by putting two if-statements one after the other

            const trimEndOfPrevNote = item.start < rangeStart;
            const trimStartOfLastNote = rangeEnd < itemEnd(item);
            if (trimEndOfPrevNote || trimStartOfLastNote) {
                notesToRemove.push(item);
            }

            if (trimEndOfPrevNote) {
                const newStart = item.start;
                const newLen = rangeStart - newStart;
                notesToAdd.push(newTimelineItemNote(item.noteId, newStart, newLen));
            }

            if (trimStartOfLastNote) {
                const newStart = rangeEnd;
                const newLen = itemEnd(item) - rangeEnd;
                notesToAdd.push(newTimelineItemNote(item.noteId, newStart, newLen));
            }
        }

        sequencerChartRemoveItems(chart, notesToRemove, notesFilter);
        sequencerChartInsertItems(chart, notesToAdd, notesFilter);
    }
}


export function recomputeSequencerState(sequencer: SequencerState) {
    // recompute current bpm
    {
        const startBeats = sequencer.cursor;
        sequencer._lastBpmChange = getBpmChangeItemBeforeBeats(sequencer._currentChart, startBeats);
    }
}

export function deleteRange(chart: SequencerChart, notesFilter: Set<number>, start: number, end: number) {
    const toRemove = chart.timeline.slice(start, end + 1).filter(item => item.type !== TIMELINE_ITEM_MEASURE);
    sequencerChartRemoveItems(chart, toRemove, notesFilter);
}


export function isItemPlaying(state: SequencerState, item: TimelineItem): boolean {
    if (item.type !== TIMELINE_ITEM_NOTE) {
        return false;
    }

    const currentTime = getCurrentPlayingTimeIntoScheduledKeys(state);
    if (currentTime < 0) {
        return false;
    }

    return getItemStartTime(item) <= currentTime && currentTime <= getItemEndTime(item);
}

export function newSequencerState(): SequencerState {
    const chart = newChart("Sequencer default chart");
    // prevent accidental saving
    chart._savedStatus = CHART_STATUS_READONLY;

    const sequencer: SequencerState = {
        _currentChart: chart,
        _trackIdx: 0,
        _timelineTempBuffer: [],
        _nonOverlappingItems: [],
        _visitedBuffer: [],

        keyEditFilterModalOpen: false,
        notesFilter: new Set<number>(),
        keyEditFilterRangeIdx0: -1,

        cursor: 0,
        cursorSnap: FRACTIONAL_UNITS_PER_BEAT / 4,

        isPlaying: false,
        isPaused: false,
        playbackSpeed: 1,
        startBeats: 0,
        pausedPlaybackTime: 0,
        startPlayingTime: 0,
        currentHoveredTimelineItemIdx: -1,

        isRangeSelecting: false,
        rangeSelectEnd: -1,
        rangeSelectStart: -1,

        scheduledKeyPresses: [],
        scheduledKeyPressesFirstItemStart: 0,
        scheduledKeyPressesPlaybackSpeed: 1,
        playingTimeout: 0,
        reachedLastNote: false,

        notesToPreview: [],
        notesToPreviewVersion: 0,

        _lastBpmChange: undefined,
    };

    return sequencer
}

export function syncPlayback(sequencer: SequencerState, dspTime: number, dspPaused: boolean) {
    if (!sequencer.isPlaying) {
        return;
    }

    const currentEstimatedScheduledTime = getCurrentPlayingTimeIntoScheduledKeysInternal(sequencer);

    sequencer.isPaused = dspPaused;
    if (dspPaused) {
        sequencer.pausedPlaybackTime = dspTime;
    } else if (sequencer.isPlaying) {
        // resync the current time with the DSP time. 
        // it's pretty imperceptible if we do it frequently enough, since it's only tens of ms.
        const difference = dspTime - currentEstimatedScheduledTime;
        sequencer.startPlayingTime -= difference;
    }
}

function getCurrentPlayingTimeIntoScheduledKeys(state: SequencerState): number {
    if (!state.isPlaying) return -10;
    return getCurrentPlayingTimeIntoScheduledKeysInternal(state);
}

function getCurrentPlayingTimeIntoScheduledKeysInternal(sequencer: SequencerState): number {
    const playbackSpeed = sequencer.isPaused ? 0 : sequencer.playbackSpeed;
    return sequencer.pausedPlaybackTime + (performance.now() - sequencer.startPlayingTime) * playbackSpeed;
}

export function setSequencerPlaybackSpeed(sequencer: SequencerState, newSpeed: number) {
    sequencer.pausedPlaybackTime = getCurrentPlayingTimeIntoScheduledKeysInternal(sequencer);
    sequencer.startPlayingTime = performance.now();
    sequencer.playbackSpeed = newSpeed;
}

export function handleMovement(
    sequencer: SequencerState,
    amount: number,
    isCtrlPressed: boolean,
    isShiftPressed: boolean,
) {
    const chart = sequencer._currentChart;
    const currentBeats = sequencer.cursor;
    let moveToBeats = currentBeats;

    if (isCtrlPressed) {
        if (amount < 0) {
            // Move to the first object before this beat
            for (let i = chart.timeline.length - 1; i >= 0; i--) {
                const item = chart.timeline[i];
                if (item.start < currentBeats) {
                    moveToBeats = item.start;
                    break;
                }
            }
        } else if (amount > 0) {
            // Move to the first object after this beat
            for (let i = 0; i < chart.timeline.length; i++) {
                const item = chart.timeline[i];
                if (item.start > currentBeats) {
                    moveToBeats = item.start;
                    break;
                }
            }
        }
    } else {
        moveToBeats = currentBeats + amount;
    }

    handleMovementAbsolute(sequencer, moveToBeats, isShiftPressed);
}

export function handleMovementAbsolute(
    sequencer: SequencerState,
    newCursorPos: number,
    isShiftPressed: boolean,
) {
    setIsRangeSelecting(sequencer, isShiftPressed);
    setCursorBeats(sequencer, newCursorPos);
    if (sequencer.isRangeSelecting) {
        sequencer.rangeSelectEnd = newCursorPos;
    }
}

export function getSequencerPlaybackOrEditingCursor(sequencer: SequencerState) {
    if (sequencer.isPlaying) {
        // move to where we're currently playing at all times
        return getCurrentPlayingBeats(sequencer);
    } 

    if (sequencer.isRangeSelecting) {
        return sequencer.rangeSelectEnd;
    }

    return sequencer.cursor;
}


export function getCurrentPlayingTimeIntoChart(sequencer: SequencerState): number {
    if (!sequencer.isPlaying) {
        return -10;
    }

    const relativeTime = getCurrentPlayingTimeIntoScheduledKeys(sequencer);
    return sequencer.scheduledKeyPressesFirstItemStart + relativeTime;
}

export function getCurrentPlayingBeats(sequencer: SequencerState): number {
    const currentTime = getCurrentPlayingTimeIntoChart(sequencer);
    const beats = getBeatsForTime(sequencer._currentChart, currentTime);
    return Math.round(beats);
}

export function recomputeState(sequencer: SequencerState) {
    recomputeSequencerState(sequencer);
}

export function isItemBeingPlayed(sequencer: SequencerState, item: TimelineItem): boolean {
    if (!sequencer.isPlaying) {
        return false;
    }

    const playbackTime = getCurrentPlayingTimeIntoChart(sequencer);
    return getItemStartTime(item) <= playbackTime && playbackTime <= getItemEndTime(item);
}

export function isItemRangeSelected(sequencer: SequencerState, item: TimelineItem): boolean {
    const start = sequencer.rangeSelectStart;
    const end = sequencer.rangeSelectEnd;
    const min = Math.min(start, end);
    const max = Math.max(start, end);

    return min <= item.start && item.start < max;
}

export type NoteMapEntry = { 
    noteId: number;
    items: NoteItem[];
    firstItem: NoteItem | null;
    previewItems: NoteItem[];
};

export function getTimelineMusicNoteThreads(
    sequencer: SequencerState,
    startBeats: number,
    endBeats: number,
    dstNotesMap: Map<number, NoteMapEntry>,
    dstCommandsList: CommandItem[],
) {
    const chart = sequencer._currentChart;
    const timeline = chart.timeline;

    dstCommandsList.length = 0;
    for (const val of dstNotesMap.values()) {
        val.items.length = 0;
        val.previewItems.length = 0;
        val.firstItem = null;
    }

    for (let i = 0; i < timeline.length; i++) {
        const item = timeline[i];
        if (itemEnd(item) < startBeats) continue;
        if (item.start > endBeats) break;

        if (
            item.type === TIMELINE_ITEM_BPM || 
            item.type === TIMELINE_ITEM_MEASURE
        ) {
            dstCommandsList.push(item);
            continue;
        }

        if (item.type === TIMELINE_ITEM_NOTE) {
            const entry = dstNotesMap.get(item.noteId) ?? {
                noteId: item.noteId,
                items: [],
                previewItems: [],
                firstItem: null
            };

            entry.noteId = item.noteId;
            if (entry.firstItem === null) entry.firstItem = item;
            entry.items.push(item);

            dstNotesMap.set(item.noteId, entry);
            continue;
        }

        unreachable(item);
    }

    for (const item of sequencer.notesToPreview) {
        const entry = dstNotesMap.get(item.noteId) ?? {
            noteId: item.noteId,
            items: [],
            previewItems: [],
            firstItem: null
        };

        entry.noteId = item.noteId;
        if (entry.firstItem === null) entry.firstItem = item;
        entry.previewItems.push(item);

        dstNotesMap.set(item.noteId, entry);
    }
}


export function getTimelineNonOverappingThreads(
    timeline: TimelineItem[],
    startIdx: number,
    endIdx: number,
    dstThreads: TimelineItem[][],
    dstVisited: boolean[],
) {
    for (let i = 0; i < dstVisited.length; i++) {
        dstVisited[i] = false;
    }
    for (const thread of dstThreads) {
        thread.length = 0;
    }

    let threadIdx = 0;
    while (true) {
        if (dstThreads.length === threadIdx) {
            dstThreads.push([]);
        }
        const thread = dstThreads[threadIdx];
        threadIdx++;
        let lastItemEnd = -1;
        let noneVisited = true;

        for (let i = startIdx; i <= endIdx; i++) {
            const item = timeline[i];
            const start = item.start;

            if (dstVisited[i - startIdx]) {
                continue;
            }
            dstVisited[i - startIdx] = false;

            if (item.type !== TIMELINE_ITEM_NOTE) {
                continue;
            }

            if (start <= lastItemEnd) {
                continue;
            }

            lastItemEnd = itemEnd(item);
            thread.push(item);
            dstVisited[i - startIdx] = true;
            noneVisited = false;
        }

        if (noneVisited) {
            break;
        }
    }
}

export function getNonOverlappingThreadsSubset(
    srcThreads: NoteItem[][], 
    startBeats: number,
    endBeats: number,
    dstThreads: NoteItem[][],
) {
    for (const arr of dstThreads) {
        arr.length = 0;
    }

    // the letters closest to the center-line need to be the next letters  to press, and since this
    // component is positions on the left, it's going backwards.
    let dstThreadIdx = 0;
    for (const thread of srcThreads) {
        let hasItems = false;
        for (const item of thread) {
            if (itemEnd(item) < startBeats) continue;
            if (item.start > endBeats) break;

            if (!hasItems) {
                hasItems = true;
                if (dstThreads.length <= dstThreadIdx) {
                    dstThreads.push([]);
                }
            }

            dstThreads[dstThreadIdx].push(item);
        }

        if (hasItems) {
            dstThreadIdx++;
        }
    }
}

export function shiftSelectedItems(s: SequencerState, beats: number) {
    const [startIdx, endIdx] = getSelectionStartEndIndexes(s);
    if (startIdx === -1 || endIdx === -1) {
        return;
    }

    sequencerChartShiftItems(s._currentChart, s.notesFilter, startIdx, endIdx, beats);

    s.rangeSelectStart += beats;
    s.rangeSelectEnd   += beats;
}

// NOTE: potentially very expensive
export function shiftItemsAfterCursor(s: SequencerState, beats: number) {
    const cursorStart = s.cursor;
    const rightOfCursorIdx = getBeatIdxAfter(s._currentChart, cursorStart);

    sequencerChartShiftItems(s._currentChart, s.notesFilter, rightOfCursorIdx, s._currentChart.timeline.length - 1, beats);
}

export function transposeSelectedItems(s: SequencerState, halfSteps: number) {
    const [startIdx, endIdx] = getSelectionStartEndIndexes(s);
    if (startIdx === -1 || endIdx === -1) {
        return;
    }

    if (s.notesFilter.size > 0) {
        // notes just dissapear, due to implementation.
        // can't be bothered fixing atm.
        return;
    }

    transposeItems(s._currentChart, s.notesFilter, startIdx, endIdx, halfSteps);
}

export function setSequencerChart(sequencer: SequencerState, chart: SequencerChart) {
    sequencer._currentChart.cursor = sequencer.cursor;
    sequencer._currentChart = chart;
    sequencer.cursor = chart.cursor;
    sortAndIndexTimeline(sequencer._currentChart);
}

export function getCurrentChart(ctx: GlobalContext) {
    return ctx.sequencer._currentChart;
}
