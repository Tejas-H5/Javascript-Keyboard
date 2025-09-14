import { ScheduledKeyPress } from "src/dsp/dsp-loop-interface";
import {
    CommandItem,
    getBeatIdxAfter,
    getBeatsForTime,
    getBeatsIndexesExclusive,
    getBpmChangeItemBeforeBeats,
    itemEnd,
    getItemEndTime,
    getItemIdxAtBeat,
    getItemStartTime,
    getTimeForBeats,
    newTimelineItemNote,
    NoteItem,
    SequencerChart,
    sequencerChartInsertItems,
    sequencerChartRemoveItems,
    sequencerChartShiftItems,
    TIMELINE_ITEM_BPM,
    TIMELINE_ITEM_MEASURE,
    TIMELINE_ITEM_NOTE,
    TimelineItem,
    TimelineItemBpmChange,
    transposeItems,
    FRACTIONAL_UNITS_PER_BEAT,
} from "src/state/sequencer-chart";
import { unreachable } from "src/utils/assert";

export const SEQUENCER_ROW_COLS = 8;

export type SequencerState = {
    keyEditFilterModalOpen: boolean;
    keyEditFilter: boolean[]; // NOTE: use the getter for this one

    cursor: number; 
    cursorSnap: number;

    isRangeSelecting: boolean;
    rangeSelectStart: number;
    rangeSelectEnd: number;

    currentHoveredTimelineItemIdx: number;

    isPlaying: boolean;
    isPaused: boolean;
    pausedTime: number;
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

export function isNoteFiltered() {
}

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

        sequencerChartRemoveItems(chart, notesToRemove);

        if (isNoteValid) {
            const newNoteStart = newNoteStartBeats;
            const newNoteLen = newNoteEndBeats - newNoteStartBeats;
            const newNote = newTimelineItemNote(noteId, newNoteStart, newNoteLen);

            sequencerChartInsertItems(chart, [newNote]);
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

        sequencerChartRemoveItems(chart, notesToRemove);
        sequencerChartInsertItems(chart, notesToAdd);
    }
}


export function recomputeSequencerState(sequencer: SequencerState) {
    // recompute current bpm
    {
        const startBeats = sequencer.cursor;
        sequencer._lastBpmChange = getBpmChangeItemBeforeBeats(sequencer._currentChart, startBeats);
    }
}

export function deleteRange(chart: SequencerChart, start: number, end: number) {
    const toRemove = chart.timeline.slice(start, end + 1);
    sequencerChartRemoveItems(chart, toRemove);
}


export function isItemPlaying(state: SequencerState, item: TimelineItem): boolean {
    if (item.type !== TIMELINE_ITEM_NOTE) {
        return false;
    }

    const currentTime = getCurrentPlayingTimeRelative(state);
    if (currentTime < 0) {
        return false;
    }

    return getItemStartTime(item) <= currentTime && currentTime <= getItemEndTime(item);
}

export function newSequencerState(currentChart: SequencerChart): SequencerState {
    const sequencer: SequencerState = {
        _currentChart: currentChart,
        _trackIdx: 0,
        _timelineTempBuffer: [],
        _nonOverlappingItems: [],
        _visitedBuffer: [],

        keyEditFilterModalOpen: false,
        keyEditFilter: [],

        cursor: 0,
        cursorSnap: FRACTIONAL_UNITS_PER_BEAT / 4,

        isPlaying: false,
        isPaused: false,
        pausedTime: 0,
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

    sequencer.isPaused = dspPaused;
    if (dspPaused) {
        sequencer.pausedTime = dspTime;
        // the other way:
        // if (!sequencer.isPaused) {
        //     sequencer.pausedTime = Date.now() - sequencer.startPlayingTime;
        // }
    } else if (sequencer.isPlaying) {
        // resync the current time with the DSP time. 
        // it's pretty imperceptible if we do it frequently enough, since it's only tens of ms.
        const currentEstimatedScheduledTime = getCurrentPlayingTimeRelative(sequencer);
        const difference = dspTime - currentEstimatedScheduledTime;
        sequencer.startPlayingTime -= difference;
    }
}

export function getCurrentPlayingTimeRelative(state: SequencerState): number {
    if (!state.isPlaying) {
        return -10;
    }

    if (state.isPaused) {
        return state.pausedTime;
    }

    return performance.now() - state.startPlayingTime;
}

export function handleMovement(
    sequencer: SequencerState,
    amount: number,
    isCtrlPressed: boolean,
    isShiftPressed: boolean,
) {
    if (isCtrlPressed) {
        amount = Math.sign(amount) * FRACTIONAL_UNITS_PER_BEAT;
    }

    const cursorBeats = sequencer.cursor;
    const newStart = cursorBeats + amount;

    handleMovementAbsolute(sequencer, newStart, isCtrlPressed, isShiftPressed);
}

export function handleMovementAbsolute(
    sequencer: SequencerState,
    newCursorPos: number,
    isCtrlPressed: boolean,
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


export function getCurrentPlayingTime(sequencer: SequencerState): number {
    if (!sequencer.isPlaying) {
        return -10;
    }

    const relativeTime = getCurrentPlayingTimeRelative(sequencer);
    return sequencer.scheduledKeyPressesFirstItemStart + 
        relativeTime * sequencer.scheduledKeyPressesPlaybackSpeed;
}

export function getCurrentPlayingBeats(sequencer: SequencerState): number {
    const currentTime = getCurrentPlayingTime(sequencer);
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

    const playbackTime = getCurrentPlayingTime(sequencer);
    return getItemStartTime(item) <= playbackTime && playbackTime <= getItemEndTime(item);
}

export function isItemRangeSelected(sequencer: SequencerState, item: TimelineItem): boolean {
    const start = sequencer.rangeSelectStart;
    const end = sequencer.rangeSelectEnd;
    const min = Math.min(start, end);
    const max = Math.max(start, end);

    const itemBeats = item.start;

    return min <= itemBeats && itemBeats <= max;
}

export type NoteMapEntry = { 
    noteId: number;
    items: NoteItem[];
    firstItem: NoteItem | null;
    previewItems: NoteItem[];
};

// NOTE: Our date model might be wrong. 
// This might need to become the core datastructure, rather than a derived view.
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

export function shiftSelectedItems(sequencer: SequencerState, beats: number) {
    const [startIdx, endIdx] = getSelectionStartEndIndexes(sequencer);
    if (startIdx === -1 || endIdx === -1) {
        return;
    }

    sequencerChartShiftItems(sequencer._currentChart, startIdx, endIdx, beats);

    sequencer.rangeSelectStart += beats;
    sequencer.rangeSelectEnd   += beats;
}

export function shiftItemsAfterCursor(s: SequencerState, amount: number) {
    const cursorStart = s.cursor;
    const rightOfCursorIdx = getBeatIdxAfter(s._currentChart, cursorStart);

    sequencerChartShiftItems(s._currentChart, rightOfCursorIdx, s._currentChart.timeline.length - 1, amount);
}

export function transposeSelectedItems(sequencer: SequencerState, halfSteps: number) {
    const [startIdx, endIdx] = getSelectionStartEndIndexes(sequencer);
    if (startIdx === -1 || endIdx === -1) {
        return;
    }

    transposeItems(sequencer._currentChart, startIdx, endIdx, halfSteps);
}

