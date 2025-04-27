import { ScheduledKeyPress } from "src/dsp/dsp-loop-interface";
import { unreachable } from "src/utils/assert";
import { compareMusicNotes, getNoteHashKey, MusicNote, notesEqual, rebaseBeats } from "src/utils/music-theory-utils";
import { TimelineItemBpmChange, CommandItem, getBeatIdxAfter, getBeatsForTime, getBeatsIndexes, getBpmChangeItemBeforeBeats, getItemEndBeats, getItemEndTime, getItemIdxAtBeat, getItemStartBeats, getItemStartTime, getTimeForBeats, gtBeats, gteBeats, ltBeats, lteBeats, newTimelineItemNote, NoteItem, SequencerChart, sequencerChartRemoveItems, sequencerChartShiftItems, TIMELINE_ITEM_BPM, TIMELINE_ITEM_MEASURE, TIMELINE_ITEM_NOTE, TimelineItem, transposeItems, sequencerChartInsertItems, getBeatIdxBefore } from "src/state/sequencer-chart";

export const SEQUENCER_ROW_COLS = 8;



export type SequencerState = {
    _currentChart: SequencerChart;
    _timelineTempBuffer: TimelineItem[];
    _nonOverlappingItems: NoteItem[][];
    _visitedBuffer: boolean[];

    cursorStart: number;
    cursorDivisor: number;
    _lastBpmChange: TimelineItemBpmChange | undefined;

    isRangeSelecting: boolean;
    rangeSelectStart: number;
    rangeSelectEnd: number;

    currentHoveredTimelineItemIdx: number;

    isPlaying: boolean;
    isPaused: boolean;
    pausedTime: number;
    startPlayingTime: number; // this is the time IRL we started playing, not the time along the timeline.seq
    startPlayingIdx: number;
    endPlayingIdx: number;

    playingTimeout: number;
    reachedLastNote: boolean;
    scheduledKeyPresses: ScheduledKeyPress[];
    scheduledKeyPressesFirstItemStart: number;
    scheduledKeyPressesPlaybackSpeed: number;

    notesToPreview: NoteItem[];
};


export function getCursorStartBeats(state: SequencerState): number {
    return getBeats(state.cursorStart, state.cursorDivisor);
}

export function getCursorStartTime(state: SequencerState): number {
    return getTimeForBeats(state._currentChart, getCursorStartBeats(state));
}

export function getRangeSelectionStartBeats(state: SequencerState): number {
    return getBeats(state.rangeSelectStart, state.cursorDivisor);
}

export function getBeats(numerator: number, divisor: number): number {
    return numerator / divisor;
}

export function getRangeSelectionEndBeats(state: SequencerState): number {
    return getBeats(state.rangeSelectEnd, state.cursorDivisor);
}

export function hasRangeSelection(state: SequencerState) {
    return state.rangeSelectStart !== -1 && state.rangeSelectEnd !== -1;
}

// TODO: ctx
export function getSelectionStartEndIndexes(state: SequencerState): [number, number] {
    const a = getRangeSelectionStartBeats(state);
    const b = getRangeSelectionEndBeats(state);
    return getBeatsIndexes(state._currentChart, a, b);
}

export function clearRangeSelection(state: SequencerState, goBackToStart: boolean) {
    if (goBackToStart) {
        state.cursorStart = state.rangeSelectStart;
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
        state.rangeSelectStart = state.cursorStart;
        state.rangeSelectEnd = state.cursorStart;
    }
}

export function setCursorBeats(state: SequencerState, dividedBeats: number) {
    state.cursorStart = dividedBeats;
}

export function setCursorDivisor(state: SequencerState, newDivisor: number) {
    if (state.isRangeSelecting) {
        // this breaks selection, so we've gotta clear it for now.
        // TODO: verify that this is still the case
        clearRangeSelection(state, false);
    }

    // Should verify that this works
    const newStartBeats = rebaseBeats(
        state.cursorStart,
        state.cursorDivisor,
        newDivisor,
    );

    state.cursorStart = newStartBeats;
    state.cursorDivisor = newDivisor;
}


export function getCurrentItemIdx(state: SequencerState): number {
    return getItemIdxAtBeat(state._currentChart, getCursorStartBeats(state));
}


// This method will insert a note with a particular length into an arbitrary position.
// if onOrOff is true, it will coalesce itself with any items of the same note.
// else, it union-differences itself from any notes of the same note. (there will only be one such note if all you do is call `setTimelineNoteAtPosition` all the time)
export function setTimelineNoteAtPosition(
    chart: SequencerChart,
    pos: number, divisor: number,
    note: MusicNote,
    len: number,
    onOrOff: boolean,
) {
    const timeline = chart.timeline;

    if (onOrOff) {
        const rangeStartBeats = getBeats(pos, divisor);
        const rangeEndBeats = getBeats(pos + len, divisor);

        const notesToRemove: NoteItem[] = [];

        let isNoteValid = true;
        let newNoteStartBeats = rangeStartBeats;
        let newNoteEndBeats = rangeEndBeats;
        for (const item of timeline) {
            if (item.type !== TIMELINE_ITEM_NOTE) continue;
            if (!notesEqual(item.note, note)) continue;

            const itemStartBeats = getItemStartBeats(item);
            const itemEndBeats = getItemEndBeats(item);

            // ignore notes that are not even in the range
            if (ltBeats(itemEndBeats, rangeStartBeats)) continue;
            if (gtBeats(itemStartBeats, rangeEndBeats)) break;

            if (lteBeats(itemStartBeats, rangeStartBeats) && lteBeats(rangeEndBeats, itemEndBeats)) {
                //    |-----------|
                //      |++++++|
                // => |-----------|  (don't add this note)
                isNoteValid = false;
                continue;
            } 

            if (ltBeats(itemStartBeats, newNoteStartBeats)) {
                newNoteStartBeats = itemStartBeats;
            } else if (gtBeats(itemEndBeats, newNoteEndBeats)) {
                newNoteEndBeats = itemEndBeats;
            }

            notesToRemove.push(item);
        }

        sequencerChartRemoveItems(chart, notesToRemove);

        if (isNoteValid) {
            const newNoteStart = newNoteStartBeats * divisor;
            const newNoteLen = (newNoteEndBeats - newNoteStartBeats) * divisor;
            const newNote = newTimelineItemNote(note, newNoteStart, newNoteLen, divisor);

            sequencerChartInsertItems(chart, [newNote]);
        }
    } else {
        const rangeStartBeats = getBeats(pos, divisor);
        const rangeEndBeats = getBeats(pos + len, divisor);

        const notesToAdd: NoteItem[] = [];
        const notesToRemove: NoteItem[] = [];

        for (const item of timeline) {
            if (item.type !== TIMELINE_ITEM_NOTE) continue;
            if (!notesEqual(item.note, note)) continue;

            const itemStartBeats = getItemStartBeats(item);
            const itemEndBeats = getItemEndBeats(item);

            // ignore notes that are not even in the range
            if (ltBeats(itemEndBeats, rangeStartBeats)) continue;
            if (gtBeats(itemStartBeats, rangeEndBeats)) break;

            if (lteBeats(rangeStartBeats, itemStartBeats) && lteBeats(itemStartBeats, rangeEndBeats)) {
                //    |------|
                //  |xxxxxxxxxxx|
                // => nothing - delete this item
                notesToRemove.push(item);
                continue;
            } 

            //    |-----------------------|  |  |--------------|      |      |-----------|
            //           |xxxxxxxxxxx|       |         |xxxxxxxxxxx|  | |xxxxxxxxxxx|
            // => |------|           |----|  |  |------|              |             |----|
            // Turns out that all three cases can behandled by putting two if-statements one after the other

            const trimEndOfPrevNote = ltBeats(itemStartBeats, rangeStartBeats);
            const trimStartOfLastNote = ltBeats(itemStartBeats, rangeStartBeats);
            if (trimEndOfPrevNote || trimStartOfLastNote) {
                notesToRemove.push(item);
            }

            if (trimEndOfPrevNote) {
                // TODO: is there a better way ?
                const newStart = item.start;
                const divisor = item.divisor;
                const newNoteStartBeats = itemStartBeats;
                const newNoteEndBeats = rangeStartBeats;
                const deltaBeats = newNoteEndBeats - newNoteStartBeats;
                const newLen = deltaBeats * divisor;
                notesToAdd.push(newTimelineItemNote(item.note, newStart, newLen, divisor));
            }

            if (trimStartOfLastNote) {
                // TODO: is there a better way ?
                const newStart = pos + len;
                // const divisor = divisor;
                const newNoteStartBeats = rangeEndBeats;
                const newNoteEndBeats = itemEndBeats;
                const deltaBeats = newNoteEndBeats - newNoteStartBeats;
                const newLen = deltaBeats * divisor;
                notesToAdd.push(newTimelineItemNote(item.note, newStart, newLen, divisor));
            }
        }

        sequencerChartRemoveItems(chart, notesToRemove);
        sequencerChartInsertItems(chart, notesToAdd);
    }
}


export function recomputeSequencerState(sequencer: SequencerState) {
    // recompute current bpm
    {
        const startBeats = getCursorStartBeats(sequencer);
        sequencer._lastBpmChange = getBpmChangeItemBeforeBeats(sequencer._currentChart, startBeats);
    }
}

// Used to deterministically order notes
export function sortNotes(notes: MusicNote[]) {
    return notes.sort(compareMusicNotes);
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
        _timelineTempBuffer: [],
        _nonOverlappingItems: [],
        _visitedBuffer: [],
        cursorStart: 0,
        cursorDivisor: 4,
        isPlaying: false,
        isPaused: false,
        pausedTime: 0,
        startPlayingTime: 0,
        startPlayingIdx: 0,
        endPlayingIdx: 0,
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
    } else {
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

    return Date.now() - state.startPlayingTime;
}

export function handleMovement(
    sequencer: SequencerState,
    amount: number,
    isCtrlPressed: boolean,
    isShiftPressed: boolean,
) {
    if (isCtrlPressed) {
        // pressing ctrl to move by exactly 1 beat
        amount *= sequencer.cursorDivisor;
    }

    const cursorBeats = sequencer.cursorStart;
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
        return getRangeSelectionEndBeats(sequencer);
    }

    return getCursorStartBeats(sequencer);
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
    return beats;
}

export function recomputeState(sequencer: SequencerState) {
    recomputeSequencerState(sequencer);
}

export function isItemBeingPlayed(sequencer: SequencerState, item: TimelineItem): boolean {
    if (!sequencer.isPlaying) {
        return false;
    }

    if (item._index < sequencer.startPlayingIdx) {
        return false;
    }
    if (item._index > sequencer.endPlayingIdx) {
        return false;
    }

    const playbackTime = getCurrentPlayingTime(sequencer);
    return getItemStartTime(item) <= playbackTime &&
        playbackTime <= getItemEndTime(item);
}

export function isItemRangeSelected(sequencer: SequencerState, item: TimelineItem): boolean {
    const start = getRangeSelectionStartBeats(sequencer);
    const end = getRangeSelectionEndBeats(sequencer);
    const min = Math.min(start, end);
    const max = Math.max(start, end);

    const itemBeats = getItemStartBeats(item);

    return lteBeats(min, itemBeats) && lteBeats(itemBeats, max);
}

export type NoteMapEntry = { 
    musicNote: MusicNote; 
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
    dstNotesMap: Map<string, NoteMapEntry>,
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
        const itemStart = getItemStartBeats(item);
        const itemEnd = getItemEndBeats(item);
        if (ltBeats(itemEnd, startBeats)) {
            continue;
        }
        if (gtBeats(itemStart, endBeats)) {
            break;
        }

        if (
            item.type === TIMELINE_ITEM_BPM || 
            item.type === TIMELINE_ITEM_MEASURE
        ) {
            dstCommandsList.push(item);
            continue;
        }

        if (item.type === TIMELINE_ITEM_NOTE) {
            const key = getNoteHashKey(item.note);
            const entry = dstNotesMap.get(key) ?? { musicNote: item.note, items: [], previewItems: [], firstItem: null };

            entry.musicNote = item.note;
            if (entry.firstItem === null) entry.firstItem = item;
            entry.items.push(item);

            dstNotesMap.set(key, entry);
            continue;
        }

        unreachable(item);
    }

    for (const item of sequencer.notesToPreview) {
        const key = getNoteHashKey(item.note);
        const entry = dstNotesMap.get(key) ?? { musicNote: item.note, items: [], previewItems: [], firstItem: null };

        entry.musicNote = item.note;
        if (entry.firstItem === null) entry.firstItem = item;
        entry.previewItems.push(item);

        dstNotesMap.set(key, entry);
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
            const start = getItemStartBeats(item);

            if (dstVisited[i - startIdx]) {
                continue;
            }
            dstVisited[i - startIdx] = false;

            if (item.type !== TIMELINE_ITEM_NOTE) {
                continue;
            }

            if (lteBeats(start, lastItemEnd)) {
                continue;
            }

            lastItemEnd = getItemEndBeats(item);
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
            const itemStart = getItemStartBeats(item);
            const itemEnd = getItemEndBeats(item);
            if (itemEnd < startBeats) {
                continue;
            }
            if (itemStart > endBeats) {
                break;
            }

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

export function shiftSelectedItems(sequencer: SequencerState, amount: number) {
    const [startIdx, endIdx] = getSelectionStartEndIndexes(sequencer);
    if (startIdx === -1 || endIdx === -1) {
        return;
    }

    const amountBeats = getBeats(amount, sequencer.cursorDivisor);
    sequencerChartShiftItems(sequencer._currentChart, startIdx, endIdx, amountBeats);

    sequencer.rangeSelectStart += amountBeats * sequencer.cursorDivisor;
    sequencer.rangeSelectEnd += amountBeats * sequencer.cursorDivisor;
}

export function shiftItemsAfterCursor(s: SequencerState, subdivisions: number) {
    const cursorStart = getCursorStartBeats(s);
    const rightOfCursorIdx = getBeatIdxAfter(s._currentChart, cursorStart);
    const amountBeats = getBeats(subdivisions, s.cursorDivisor);

    sequencerChartShiftItems(s._currentChart, rightOfCursorIdx, s._currentChart.timeline.length - 1, amountBeats);

    // TODO: move cursor around as well??
}

export function transposeSelectedItems(sequencer: SequencerState, halfSteps: number) {
    const [startIdx, endIdx] = getSelectionStartEndIndexes(sequencer);
    if (startIdx === -1 || endIdx === -1) {
        return;
    }

    transposeItems(sequencer._currentChart, startIdx, endIdx, halfSteps);
}

