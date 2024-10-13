import { beatsToMs, compareMusicNotes, getNoteHashKey, msToBeats, MusicNote, noteEquals, rebaseBeats } from "src/utils/music-theory-utils";
import { filterInPlace } from "./utils/array-utils";
import { unreachable } from "./utils/asserts";
import { greaterThan, greaterThanOrEqualTo, lessThan, lessThanOrEqualTo, within } from "./utils/math-utils";

export const SEQUENCER_ROW_COLS = 8;

const CURSOR_ITEM_TOLERANCE_BEATS = 0.000001;
const DEFAULT_BPM = 120;

export type TimelineItem = NoteItem | CommandItem;
export type TimelineItemType = TimelineItem["type"];

export type CommandItem = BpmChange;

type BaseTimelineItem = {
    start: number;
    divisor: number;
    _scheduledStart: number;
};

export const TIMELINE_ITEM_BPM = 1;
export const TIMELINE_ITEM_NOTE = 2;

export type NoteItem = BaseTimelineItem & {
    type: typeof TIMELINE_ITEM_NOTE;

    note: MusicNote;
    len: number;

    _scheduledEnd: number;
}

export type BpmChange = BaseTimelineItem & {
    type: typeof TIMELINE_ITEM_BPM;
    bpm: number;
}

export type SequencerState = {
    timeline: TimelineItem[];
    _timelineLastUpdated: number;

    cursorStart: number;
    isRangeSelecting: boolean;
    cursorEnd: number;
    cursorDivisor: number;
    _currentBpm: number;
    _currentBpmTime: number;

    currentHoveredTimelineItemIdx: number;

    isPlaying: boolean;
    startPlayingTime: number; // this is the time IRL we started playing, not the time along the timeline.
};


export function getBeats(numerator: number, divisor: number): number {
    return numerator / divisor;
}

export function getCursorStartBeats(state: SequencerState): number {
    return getBeats(state.cursorStart, state.cursorDivisor);
}

export function getCursorEndBeats(state: SequencerState): number {
    return getBeats(state.cursorEnd, state.cursorDivisor);
}

export function setIsRangeSelecting(state: SequencerState, value: boolean) {
    state.isRangeSelecting = value;
}


export function getItemIdxAtBeat(state: SequencerState, beats: number) {
    for (let i = 0; i < state.timeline.length; i++) {
        const item = state.timeline[i];
        if (within(getBeats(item.start, item.divisor), beats, CURSOR_ITEM_TOLERANCE_BEATS)) {
            return i;
        }
    }

    return -1;
}

export function getNoteItemAtBeats(state: SequencerState, beats: number): NoteItem | null {
    const idx = getItemIdxAtBeat(state, beats);
    if (idx === -1) {
        return null;
    }

    const item = state.timeline[idx];
    if (item.type !== TIMELINE_ITEM_NOTE) {
        return null;
    }

    return item;
}

export function getNextItemIndex(timeline: TimelineItem[], beats: number, defaultValue = -1) {
    for (let i = 0; i < timeline.length; i++) {
        const item = timeline[i];
        const itemBeats = getBeats(item.start, item.divisor);
        if (
            itemBeats >= beats
            || within(itemBeats, beats, CURSOR_ITEM_TOLERANCE_BEATS)
        ) {
            return i;
        }
    }

    return defaultValue;
}

export function getPlaybackDuration(state: SequencerState): number {
    const timeline = state.timeline;
    if (timeline.length === 0) {
        return 0;
    }

    const lastItem = timeline[timeline.length - 1]
    if (lastItem.type === TIMELINE_ITEM_NOTE) {
        return lastItem._scheduledEnd;
    }

    return lastItem._scheduledStart;

}

export function getPrevItemIndex(timeline: TimelineItem[], beats: number, defaultValue = -1, type?: TimelineItemType) {
    for (let i = timeline.length - 1; i >= 0; i--) {
        const item = timeline[i];
        if (type && type !== item.type) {
            continue;
        }

        const itemBeats = getBeats(item.start, item.divisor);
        if (ltBeats(itemBeats, beats)) {
            return i;
        }
    }

    return defaultValue;
}

export function getPrevItemIndexForTime(timeline: TimelineItem[], time: number, defaultValue = -1, type?: TimelineItemType) {
    for (let i = timeline.length - 1; i >= 0; i--) {
        const item = timeline[i];
        if (type && type !== item.type) {
            continue;
        }

        if (item._scheduledStart < time) {
            return i;
        }
    }

    return defaultValue;
}

export function getItemStartTime(item: TimelineItem): number {
    return item._scheduledStart;
}

export function getItemEndTime(item: TimelineItem): number {
    if (item.type === TIMELINE_ITEM_NOTE) {
        return item._scheduledEnd;
    }

    return item._scheduledStart;
}

export function getItemStartBeats(item: TimelineItem): number {
    return getBeats(item.start, item.divisor);
}

export function isItemUnderCursor(item: TimelineItem, cursorBeats: number):boolean {
    const start = getItemStartBeats(item);
    const end = getItemEndBeats(item);
    return lteBeats(start, cursorBeats) && ltBeats(cursorBeats, end);
}

export function getItemLengthBeats(item: TimelineItem) {
    if (item.type === TIMELINE_ITEM_NOTE) {
        return item.len / item.divisor;
    }
    return 0;
}

export function getItemEndBeats(item: TimelineItem): number {
    return getItemStartBeats(item) + getItemLengthBeats(item);
}

export function mutateSequencerTimeline(state: SequencerState, fn: (timeline: TimelineItem[]) => void) {
    const timeline = state.timeline;
    fn(timeline);

    // Perform expensive recomputations whenever we mutate the timeline rather than per frame

    // re-sort the timeline
    {
        timeline.sort((a, b) => {
            const delta = getBeats(a.start, a.divisor) - getBeats(b.start, b.divisor);
            if (delta !== 0) {
                return delta;
            }

            return a.type - b.type;
        });
    }

    // filter degenerate objects out of the timeline
    {
        filterInPlace(timeline, (item) => {
            if (item.type === TIMELINE_ITEM_BPM) {
                return true;
            }

            if (item.type === TIMELINE_ITEM_NOTE) {
                if (within(
                    getItemLengthBeats(item), 
                    0, 
                    CURSOR_ITEM_TOLERANCE_BEATS
                )) {
                    return false;
                }

                return true;
            }

            return false;
        });
    }

    // Coalesce overlapping notes of the same key (only works _after_ sorting)
    {
        const currentlyStartedItems = new Map<string, NoteItem>();
        for (let i = 0; i < timeline.length; i++) {
            const item = timeline[i];
            if (item.type !== TIMELINE_ITEM_NOTE) {
                continue;
            }

            const startBeat = getItemStartBeats(item);

            // remove items from currentlyStartedItems that have 'ended'.
            for (const [startedItemKey, startedItem] of currentlyStartedItems) {
                const itemEndBeat = getItemEndBeats(startedItem)
                if (lessThan(itemEndBeat, startBeat, CURSOR_ITEM_TOLERANCE_BEATS)) {
                    currentlyStartedItems.delete(startedItemKey);
                }
            }

            const key = getNoteHashKey(item.note);

            const lastItem = currentlyStartedItems.get(key);
            if (lastItem) {
                // We need to merge the last instance of this key that was started, with this one.
                // This is just a matter of extending the last item to this item's end, and then deleting this item
                const thisItemEndBeats = getItemEndBeats(item);
                const lastItemStartBeats = getItemStartBeats(lastItem);
                const wantedLenBeats = thisItemEndBeats - lastItemStartBeats;
                lastItem.len = wantedLenBeats * lastItem.divisor;
                timeline.splice(i, 1);
                i--;
                currentlyStartedItems.set(key, lastItem);
                continue;
            }

            currentlyStartedItems.set(key, item);
        }
    }

    // Recompute the actual start and end times of every object
    {
        let currentBpm = 120;
        let currentBpmBeats = 0;
        for (const item of timeline) {
            const itemStart = getItemStartBeats(item);
            const relativeStart =  itemStart - currentBpmBeats;
            item._scheduledStart = beatsToMs(relativeStart, currentBpm);

            if (item.type === TIMELINE_ITEM_BPM) {
                currentBpm = item.bpm;
                currentBpmBeats = getBeats(item.start, item.divisor);
                continue;
            }

            if (item.type === TIMELINE_ITEM_NOTE) {
                const itemEnd = getItemEndBeats(item);
                const relativeEnd  = itemEnd - currentBpmBeats;
                item._scheduledEnd = beatsToMs(relativeEnd, currentBpm);
                continue;
            }

            unreachable(item);
        }
    }

    state._timelineLastUpdated = Date.now();
}

export function isNotePressed(state: SequencerState, note: MusicNote, beats: number, divisor: number) {
    return ;
}

export function resetCursorEndToCursorStart(state: SequencerState) {
    state.cursorEnd = state.cursorStart;
}

export function setCursorBeats(state: SequencerState, dividedBeats: number) {
    state.cursorStart = dividedBeats;
    if (!state.isRangeSelecting) {
        resetCursorEndToCursorStart(state);
    }
}

export function setCursorDivisor(state: SequencerState, newDivisor: number) {
    // Should verify that this works
    const newStartBeats = rebaseBeats(
        state.cursorStart,
        state.cursorDivisor,
        newDivisor,
    );

    const newEndBeats = rebaseBeats(
        state.cursorEnd,
        state.cursorDivisor,
        newDivisor,
    );

    state.cursorStart = newStartBeats;
    state.cursorEnd = newEndBeats;
    state.cursorDivisor = newDivisor;
}


export function getSelectionRangeBeats(state: SequencerState): [number, number] {
    const startBeats = getBeats(state.cursorStart, state.cursorDivisor);
    const endBeats = getBeats(state.cursorEnd, state.cursorDivisor);
    const minBeats = Math.min(startBeats, endBeats);
    const maxBeats = Math.max(startBeats, endBeats);
    return [minBeats, maxBeats];
}

export function getSelectionRange(state: SequencerState): [number, number] {
    const [minBeats, maxBeats] = getSelectionRangeBeats(state);
    let min = getNextItemIndex(state.timeline, minBeats);
    let max = getPrevItemIndex(state.timeline, maxBeats);

    if (min === -1) {
        min = max;
    }

    if (max === -1) {
        max = min;
    }

    if (min === -1 || max === -1) {
        return [-1, -1];
    }

    // we need to make sure that the item after the min selection time is actually 
    // within the bounds of the max time. 
    const minItem = state.timeline[min]
    if (minItem._scheduledStart > maxBeats) {
        return [-1, -1];
    }

    return [min, max];
}

export function getCurrentItemIdx(state: SequencerState): number {
    return getItemIdxAtBeat(state, getCursorStartBeats(state));
}

export function deleteAtIdx(state: SequencerState, idx: number) {
    if (idx < 0 || idx >= state.timeline.length) {
        return;
    }

    state.timeline.splice(idx, 1);
}

export function equalBeats(beatsA: number, beatsB: number): boolean {
    return within(beatsA, beatsB, CURSOR_ITEM_TOLERANCE_BEATS);
}
export function lteBeats(beatsA: number, beatsB: number):boolean {
    return lessThanOrEqualTo(beatsA, beatsB, CURSOR_ITEM_TOLERANCE_BEATS)
}

export function ltBeats(beatsA: number, beatsB: number):boolean {
    return lessThan(beatsA, beatsB, CURSOR_ITEM_TOLERANCE_BEATS)
}

export function gteBeats(beatsA: number, beatsB: number):boolean {
    return greaterThanOrEqualTo(beatsA, beatsB, CURSOR_ITEM_TOLERANCE_BEATS)
}

export function gtBeats(beatsA: number, beatsB: number):boolean {
    return greaterThan(beatsA, beatsB, CURSOR_ITEM_TOLERANCE_BEATS)
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
        timeline.push({
            type: TIMELINE_ITEM_NOTE,
            start: position,
            divisor: divisor,
            note,
            len,
            _scheduledStart: 0,
            _scheduledEnd: 0,
        });

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

        // Some notes will start before the range and need to actually be split into two notes.
        if (
            ltBeats(itemStart, rangeStartBeats)
            && gtBeats(itemEnd, rangeEndBeats)
        ) {
            // postprocessing will take care of these too...

            notesToAdd.push({
                type: TIMELINE_ITEM_NOTE,
                note: item.note,
                start: item.start,
                divisor: item.divisor,
                len: (rangeStartBeats - itemStart) * item.divisor,
                _scheduledStart: 0,
                _scheduledEnd: 0,
            });

            notesToAdd.push({
                type: TIMELINE_ITEM_NOTE,
                note: item.note,
                start: rangeEndBeats * item.divisor,
                divisor: item.divisor,
                len: (itemEnd - rangeEndBeats) * item.divisor,
                _scheduledStart: 0,
                _scheduledEnd: 0,
            });
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

// This method mutates the timeline
export function timelineHasNoteAtPosition(
    timeline: TimelineItem[],
    position: number,
    divisor: number,
    note: MusicNote,
): boolean {
    const len = 1;

    const rangeStartBeats = getBeats(position, divisor);
    const rangeEndBeats = getBeats(position + len, divisor);
    for (const item of timeline) {
        if (item.type !== TIMELINE_ITEM_NOTE) {
            continue;
        }

        if (!noteEquals(item.note, note)) {
            continue;
        }

        if (
            gtBeats(getItemEndBeats(item), rangeStartBeats) 
            && ltBeats(getItemStartBeats(item), rangeEndBeats)
        ) {
            return true;
        }
    }

    return false;
}

export function recomputeSequencerState(sequencer: SequencerState) {
    // recompute current bpm
    {
        const idx = getPrevItemIndex(sequencer.timeline, -1, TIMELINE_ITEM_BPM);
        const item = sequencer.timeline[idx];
        if (item && item.type === TIMELINE_ITEM_BPM) {
            sequencer._currentBpm = item.bpm;
            sequencer._currentBpmTime = item._scheduledStart;
        }
    }
}

// Used to deterministically order notes
export function sortNotes(notes: MusicNote[]) {
    return notes.sort(compareMusicNotes);
}

export function deleteRange(state: SequencerState, start: number, end: number) {
    state.timeline.splice(start, end - start + 1);
}


export function isItemPlaying(state: SequencerState, item: TimelineItem): boolean {
    if (item.type !== TIMELINE_ITEM_NOTE) {
        return false;
    }

    const currentTime = getCurrentPlayingTimeRelative(state);
    if (currentTime < 0) {
        return false;
    }

    return item._scheduledStart <= currentTime && currentTime <= item._scheduledEnd;
}

export function newSequencerState(): SequencerState {
    const sequencer: SequencerState = {
        timeline: [],
        cursorStart: 0,
        cursorEnd: 0,
        cursorDivisor: 4,
        isRangeSelecting: false,
        isPlaying: false,
        startPlayingTime: 0,
        currentHoveredTimelineItemIdx: -1,

        // computed values:

        _timelineLastUpdated: 0,
        _currentBpm: DEFAULT_BPM,
        _currentBpmTime: 0,
    };

    return sequencer
}

export function getCurrentPlayingTimeRelative(state: SequencerState): number {
    if (!state.isPlaying) {
        return -10;
    }

    return Date.now() - state.startPlayingTime;
}

export function getBeatsForTime(state: SequencerState, time: number): number {
    let bpm = DEFAULT_BPM;
    let bpmTime = 0;
    let bpmBeats = 0;

    const lastBpmIdx = getPrevItemIndexForTime(state.timeline, time, -1, TIMELINE_ITEM_BPM);
    if (lastBpmIdx !== -1) {
        const bpmItem = state.timeline[lastBpmIdx];
        if (bpmItem.type !== TIMELINE_ITEM_BPM) {
            throw new Error("bpmItem.type !== TIMELINE_ITEM_BPM");
        }

        bpm = bpmItem.bpm;
        bpmTime = bpmItem._scheduledStart;
        bpmBeats = getItemStartBeats(bpmItem);
    }

    const relativeBeats = msToBeats(time - bpmTime, bpm);
    return bpmBeats + relativeBeats;
}
