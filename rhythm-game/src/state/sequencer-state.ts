import { ScheduledKeyPress } from "src/dsp/dsp-loop-interface";
import { filterInPlace, findLastIndexOf } from "src/utils/array-utils";
import { unreachable } from "src/utils/asserts";
import { compareMusicNotes, getNoteHashKey, MusicNote, noteEquals, rebaseBeats } from "src/utils/music-theory-utils";
import { BpmChange, CommandItem, fixTimeline, getBeatIdxAfter, getBeatsForTime, getBeatsIndexes, getBpmChangeItemBeforeBeats, getItemEndBeats, getItemEndTime, getItemIdxAtBeat, getItemStartBeats, getItemStartTime, getTimeForBeats, gtBeats, gteBeats, ltBeats, lteBeats, newTimelineItemNote, NoteItem, RhythmGameChart, shiftItems, TIMELINE_ITEM_BPM, TIMELINE_ITEM_MEASURE, TIMELINE_ITEM_NOTE, TimelineItem, transposeItems } from "src/views/chart";

export const SEQUENCER_ROW_COLS = 8;



export type SequencerState = {
    _currentChart: RhythmGameChart;
    _timelineTempBuffer: TimelineItem[];
    _nonOverlappingItems: NoteItem[][];
    _visitedBuffer: boolean[];
    _timelineLastUpdated: number;

    cursorStart: number;
    cursorDivisor: number;
    _lastBpmChange: BpmChange | undefined;

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


// Un-callbackify
export function mutateSequencerTimeline(state: SequencerState, fn: (tl: TimelineItem[]) => void) {
    fn(state._currentChart.timeline);

    // Perform expensive recomputations whenever we mutate the timeline rather than per frame
    
    fixTimeline(state._currentChart, state._timelineTempBuffer);

    // recompute the non-overlapping threads. 
    // We can't do this for a specific window, because we don't want things from one thread to move to other threads.
    {
        getTimelineNonOverappingThreads(
            state._currentChart.timeline,
            0,
            state._currentChart.timeline.length - 1,
            state._nonOverlappingItems,
            state._visitedBuffer,
        );
    }

    state._timelineLastUpdated = Date.now();
}

export function setCursorBeats(state: SequencerState, dividedBeats: number) {
    state.cursorStart = dividedBeats;
}

export function setCursorDivisor(state: SequencerState, newDivisor: number) {
    if (state.isRangeSelecting) {
        // this breaks selection, so I've disabled it for now.
        return;
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


// This method mutates the timeline, and relies
// on the postprocessing function to fix up it's mess
export function setTimelineNoteAtPosition(
    timeline: TimelineItem[],
    position: number,
    divisor: number,
    note: MusicNote,
    len: number,
    onOrOff: boolean,
) {
    if (onOrOff) {
        // no longer sorted! postprocessing will take care of this.
        timeline.push(newTimelineItemNote(note, position, len, divisor));
        return;
    }

    const rangeStartBeats = getBeats(position, divisor);
    const rangeEndBeats = getBeats(position + len, divisor);

    const notesToAdd: NoteItem[] = [];

    filterInPlace(timeline, (item) => {
        if (item.type !== TIMELINE_ITEM_NOTE) {
            return true;
        }

        if (!noteEquals(item.note, note)) {
            return true;
        }

        const itemStart = getItemStartBeats(item);
        const itemEnd = getItemEndBeats(item);

        // keep notes below or above the bounds
        if (
            gtBeats(itemStart, rangeEndBeats)
            || ltBeats(itemEnd, rangeStartBeats)
        ) {
            return true;
        }

        // Some notes will start before the range and end after the range - they need to be split into two notes.
        if (
            ltBeats(itemStart, rangeStartBeats)
            && gtBeats(itemEnd, rangeEndBeats)
        ) {
            // postprocessing will take care of these too...
            notesToAdd.push(newTimelineItemNote(
                item.note, 
                item.start, 
                (rangeStartBeats - itemStart) * item.divisor, 
                item.divisor
            ));

            notesToAdd.push(newTimelineItemNote(
                item.note, 
                rangeEndBeats * item.divisor, 
                (itemEnd - rangeEndBeats) * item.divisor,
                item.divisor
            ));
            return false;
        }

        // delete notes completely within the bounds
        if (
            lteBeats(itemEnd, rangeEndBeats)
            && gteBeats(itemStart, rangeStartBeats)
        ) {
            return false;
        }

        // trim notes that start before the bounds and end inside the bounds, or vice versa
        if (
            gtBeats(itemEnd, rangeStartBeats)
            && ltBeats(itemStart, rangeStartBeats)
        ) {
            item.len = (rangeStartBeats - itemStart) * item.divisor;
            return true;
        }

        if (
            ltBeats(itemStart, rangeEndBeats)
            && gtBeats(itemEnd, rangeEndBeats)
        ) {
            item.len = (itemEnd - rangeEndBeats) * item.divisor;
            item.start = rangeEndBeats * item.divisor;
            return true;
        }


        return true;
    });

    timeline.push(...notesToAdd);
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

export function deleteRange(timeline: TimelineItem[], start: number, end: number) {
    timeline.splice(start, end - start + 1);
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

export function newSequencerState(currentChart: RhythmGameChart): SequencerState {
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

        _timelineLastUpdated: 0,
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
    setIsRangeSelecting(sequencer, isShiftPressed);

    if (isCtrlPressed) {
        // pressing ctrl to move by exactly 1 beat
        amount *= sequencer.cursorDivisor;
    }

    const cursorBeats = sequencer.cursorStart;
    const newStart = cursorBeats + amount;
    setCursorBeats(sequencer, newStart);

    if (sequencer.isRangeSelecting) {
        sequencer.rangeSelectEnd = newStart;
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
};

export function getTimelineMusicNoteThreads(
    timeline: TimelineItem[],
    startBeats: number,
    endBeats: number,
    dstNotesMap: Map<string, NoteMapEntry>,
    dstCommandsList: CommandItem[],
) {
    dstCommandsList.length = 0;
    for (const val of dstNotesMap.values()) {
        val.items.length = 0;
    }

    let start = findLastIndexOf(timeline, item => 
        lteBeats(getItemStartTime(item), startBeats)
    );
    if (start === -1) {
        start = 0;
    }

    let end = timeline.findIndex(item => 
        gteBeats(getItemStartBeats(item), endBeats)
    );
    if (end === -1) {
        end = timeline.length -1
    }

    for (let i = start; i <= end; i++) {
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
            const entry = dstNotesMap.get(key) ?? { musicNote: item.note, items: [] };

            entry.musicNote = item.note;
            entry.items.push(item);

            dstNotesMap.set(key, entry);

            continue;
        }

        unreachable(item);
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
    shiftItems(sequencer._currentChart, startIdx, endIdx, amountBeats);

    sequencer.rangeSelectStart += amountBeats * sequencer.cursorDivisor;
    sequencer.rangeSelectEnd += amountBeats * sequencer.cursorDivisor;
}

export function shiftItemsAfterCursor(s: SequencerState, subdivisions: number) {
    const cursorStart = getCursorStartBeats(s);
    const rightOfCursorIdx = getBeatIdxAfter(s._currentChart, cursorStart);
    const amountBeats = getBeats(subdivisions, s.cursorDivisor);
    shiftItems(s._currentChart, rightOfCursorIdx, s._currentChart.timeline.length - 1, amountBeats);

    // TODO: move cursor around as well??
}

export function transposeSelectedItems(sequencer: SequencerState, halfSteps: number) {
    const [startIdx, endIdx] = getSelectionStartEndIndexes(sequencer);
    if (startIdx === -1 || endIdx === -1) {
        return;
    }

    transposeItems(sequencer._currentChart, startIdx, endIdx, halfSteps);
}

