import { beatsToMs, compareMusicNotes, getNoteHashKey, msToBeats, MusicNote, noteEquals, rebaseBeats } from "src/utils/music-theory-utils";
import { filterInPlace, findLastIndexOf } from "src/utils/array-utils";
import { unreachable } from "src/utils/asserts";
import { greaterThan, greaterThanOrEqualTo, lessThan, lessThanOrEqualTo, within } from "src/utils/math-utils";
import { ScheduledKeyPress } from "src/dsp-loop-interface";

export const SEQUENCER_ROW_COLS = 8;

const CURSOR_ITEM_TOLERANCE_BEATS = 0.000001;
const DEFAULT_BPM = 120;

export type TimelineItem = NoteItem | CommandItem;
export type TimelineItemType = TimelineItem["type"];

export type CommandItem = BpmChange | Measure;

type BaseTimelineItem = {
    start: number;
    divisor: number;
    _scheduledStart: number;
    _index: number;
};

export type NoteMapEntry = { 
    musicNote: MusicNote; 
    items: NoteItem[];
};

export const TIMELINE_ITEM_BPM = 1;
export const TIMELINE_ITEM_MEASURE = 2;
export const TIMELINE_ITEM_NOTE = 3;

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

export type Measure = BaseTimelineItem & {
    type: typeof TIMELINE_ITEM_MEASURE;
};

export type SequencerState = {
    timeline: TimelineItem[];
    _timelineTempBuffer: TimelineItem[];
    _nonOverlappingItems: NoteItem[][];
    _visitedBuffer: boolean[];
    _timelineLastUpdated: number;

    cursorStart: number;
    cursorDivisor: number;
    _currentBpm: number;
    _currentBpmTime: number;

    isRangeSelecting: boolean;
    rangeSelectStart: number;
    rangeSelectEnd: number;

    currentHoveredTimelineItemIdx: number;

    isPlaying: boolean;
    startPlayingTime: number; // this is the time IRL we started playing, not the time along the timeline.seq
    startPlayingIdx: number;
    endPlayingIdx: number;

    playingTimeout: number;
    reachedLastNote: boolean;
    scheduledKeyPresses: ScheduledKeyPress[];
    scheduledKeyPressesFirstItemStart: number;
    scheduledKeyPressesPlaybackSpeed: number;
};


export function getBeats(numerator: number, divisor: number): number {
    return numerator / divisor;
}

export function getCursorStartBeats(state: SequencerState): number {
    return getBeats(state.cursorStart, state.cursorDivisor);
}

export function getRangeSelectionStartBeats(state: SequencerState): number {
    return getBeats(state.rangeSelectStart, state.cursorDivisor);
}

export function getRangeSelectionEndBeats(state: SequencerState): number {
    return getBeats(state.rangeSelectEnd, state.cursorDivisor);
}

export function hasRangeSelection(state: SequencerState) {
    return state.rangeSelectStart !== -1 && state.rangeSelectEnd !== -1;
}
export function getSelectionRange(state: SequencerState): [number, number] {
    const a = getRangeSelectionStartBeats(state);
    const b = getRangeSelectionEndBeats(state);
    return getBeatsRange(state, a, b);
}

export function getBeatsRange(state: SequencerState, startBeats: number, endBeats: number): [number, number] {
    const min = Math.min(startBeats, endBeats);
    const max = Math.max(startBeats, endBeats);

    let startIdx = getItemIdxAtBeat(state, min);
    if (startIdx === -1) {
        startIdx = getNextItemIndex(state.timeline, min);
    }
    let endIdx = getItemIdxAtBeat(state, max);
    if (endIdx === -1) {
        endIdx = getPrevItemIndex(state.timeline, max);
    }

    if (
        startIdx === -1 ||
        endIdx === -1 ||
        endIdx < startIdx
    ) {
        return [-1, -1];
    }

    return [startIdx, endIdx];
}

export function clearRangeSelection(state: SequencerState) {
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


export function getItemIdxAtBeat(state: SequencerState, beats: number, type?: TimelineItemType) {
    for (let i = 0; i < state.timeline.length; i++) {
        const item = state.timeline[i];
        if (type && item.type !== type) {
            continue;
        }

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
        const itemBeats = getItemStartBeats(item);
        if (gtBeats(itemBeats, beats)) {
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

        const itemBeats = getItemStartBeats(item);
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

export function isItemUnderCursor(item: TimelineItem, cursorBeats: number): boolean {
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

// TODO: add some tests
export function mutateSequencerTimeline(state: SequencerState, fn: (timeline: TimelineItem[]) => void) {
    const timeline = state.timeline;
    const timelineTemp = state._timelineTempBuffer;
    fn(timeline);

    // Perform expensive recomputations whenever we mutate the timeline rather than per frame

    // re-sort the timeline
    {
        timeline.sort((a, b) => {
            const delta = getBeats(a.start, a.divisor) - getBeats(b.start, b.divisor);
            if (Math.abs(delta) > CURSOR_ITEM_TOLERANCE_BEATS) {
                return delta;
            }

            if (a.type === TIMELINE_ITEM_NOTE && b.type === TIMELINE_ITEM_NOTE) {
                return compareMusicNotes(a.note, b.note);
            }

            return a.type - b.type;
        });
    }

    // filter degenerate objects out of the timeline
    {
        timelineTemp.splice(0, timelineTemp.length);
        for (let i = 0; i < timeline.length; i++) {
            timelineTemp.push(timeline[i]);
        }
        timeline.splice(0, timeline.length);

        const replaceLast = (item: TimelineItem) => {
            const idx = findLastIndexOf(timeline, i => i.type === item.type);
            if (idx !== -1) {
                timeline[idx] = item;
            } else {
                timeline.push(item);
            }
        }

        let lastBpmBeats = 0;
        let lastMeasureBeats = 0;
        for (let i = 0; i < timelineTemp.length; i++) {
            const item = timelineTemp[i];
            const startBeats = getItemStartBeats(item);

            if (item.type === TIMELINE_ITEM_MEASURE) {
                // the most recent measure should overwrite the last one at the same position
                // (not a big deal, but just don't want duplicates)
                if (equalBeats(lastMeasureBeats, startBeats)) {
                    replaceLast(item);
                    continue;
                }
                lastMeasureBeats = startBeats;
            }

            if (item.type === TIMELINE_ITEM_BPM) {
                // the most recent bpm should overwrite the last one at the same position
                if (equalBeats(lastBpmBeats, startBeats)) {
                    replaceLast(item);
                    continue;
                }
                lastBpmBeats = startBeats;
            }

            if (item.type === TIMELINE_ITEM_NOTE) {
                // remove zero-length notes
                if (within(
                    getItemLengthBeats(item),
                    0,
                    CURSOR_ITEM_TOLERANCE_BEATS
                )) {
                    continue;
                }
            }

            timeline.push(item);
        }
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

    // Recompute the actual start and end times of every object, and indexes
    {
        let currentBpm = 120;
        let currentBpmBeats = 0;
        for (let i = 0; i < timeline.length; i++) {
            const item = timeline[i];
            const itemStart = getItemStartBeats(item);
            const relativeStart = itemStart - currentBpmBeats;

            item._index = i;
            item._scheduledStart = beatsToMs(relativeStart, currentBpm);

            if (item.type === TIMELINE_ITEM_MEASURE) {
                continue;
            }

            if (item.type === TIMELINE_ITEM_BPM) {
                currentBpm = item.bpm;
                currentBpmBeats = getBeats(item.start, item.divisor);
                continue;
            }

            if (item.type === TIMELINE_ITEM_NOTE) {
                const itemEnd = getItemEndBeats(item);
                const relativeEnd = itemEnd - currentBpmBeats;
                item._scheduledEnd = beatsToMs(relativeEnd, currentBpm);
                continue;
            }

            unreachable(item);
        }
    }

    // recompute the non-overlapping threads. 
    // We can't do this for a specific window, because we don't want things from one thread to move to other threads.
    {
        getTimelineNonOverappingThreads(
            timeline,
            0,
            timeline.length - 1,
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
export function lteBeats(beatsA: number, beatsB: number): boolean {
    return lessThanOrEqualTo(beatsA, beatsB, CURSOR_ITEM_TOLERANCE_BEATS)
}

export function ltBeats(beatsA: number, beatsB: number): boolean {
    return lessThan(beatsA, beatsB, CURSOR_ITEM_TOLERANCE_BEATS)
}

export function gteBeats(beatsA: number, beatsB: number): boolean {
    return greaterThanOrEqualTo(beatsA, beatsB, CURSOR_ITEM_TOLERANCE_BEATS)
}

export function gtBeats(beatsA: number, beatsB: number): boolean {
    return greaterThan(beatsA, beatsB, CURSOR_ITEM_TOLERANCE_BEATS)
}

export function newTimelineItemMeasure(start: number, divisor: number): Measure {
    return {
        type: TIMELINE_ITEM_MEASURE,
        start,
        divisor,
        _scheduledStart: 0,
        _index: 0,
    }
}

export function newTimelineItemNote(musicNote: MusicNote, start: number, len: number, divisor: number): NoteItem {
    return {
        type: TIMELINE_ITEM_NOTE,
        start,
        divisor,
        note: musicNote,
        len,
        _scheduledStart: 0,
        _index: 0,
        _scheduledEnd: 0,
    };
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

export function timelineMeasureAtBeatsIdx(state: SequencerState, beats: number): number {
    return getItemIdxAtBeat(state, beats, TIMELINE_ITEM_MEASURE);
}

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
        const startBeats = getCursorStartBeats(sequencer);
        const bpmChange = getBpmChangeItemAtBeats(sequencer, startBeats);
        sequencer._currentBpm = getBpm(bpmChange);
        sequencer._currentBpmTime = getBpmTime(bpmChange);
    }
}

export function getBpm(bpmChange: BpmChange | undefined): number {
    if (!bpmChange) return DEFAULT_BPM;
    return bpmChange.bpm;
}

export function getBpmTime(bpmChange: BpmChange | undefined): number {
    if (!bpmChange) return 0;
    return bpmChange._scheduledStart;
}


export function getBpmChangeItemAtBeats(sequencer: SequencerState, beats: number): BpmChange | undefined {
    const idx = getPrevItemIndex(sequencer.timeline, beats, -1, TIMELINE_ITEM_BPM);
    if (idx === -1) {
        return undefined;
    }

    const item = sequencer.timeline[idx];
    if (item.type !== TIMELINE_ITEM_BPM) {
        throw new Error("!item || item.type !== TIMELINE_ITEM_BPM");
    }

    return item;
}

export function getLastMeasureBeats(sequencer: SequencerState, beats: number): number {
    const timeline = sequencer.timeline;
    const idx = getPrevItemIndex(timeline, beats, -1, TIMELINE_ITEM_MEASURE);
    if (idx === -1) {
        return 0;
    }

    const item = timeline[idx];
    if (!item || item.type !== TIMELINE_ITEM_MEASURE) {
        throw new Error("!item || item.type !== TIMELINE_ITEM_MEASURE");
    }

    return getItemStartBeats(item);
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

    return item._scheduledStart <= currentTime && currentTime <= item._scheduledEnd;
}

export function newSequencerState(): SequencerState {
    const sequencer: SequencerState = {
        timeline: [],
        _timelineTempBuffer: [],
        _nonOverlappingItems: [],
        _visitedBuffer: [],
        cursorStart: 0,
        cursorDivisor: 4,
        isPlaying: false,
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

export function divisorSnap(beats: number, divisor: number): number {
    return Math.floor(beats * divisor) / divisor;
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
    const beats = getBeatsForTime(sequencer, currentTime);
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

    let start = getPrevItemIndex(timeline, startBeats, 0);
    let end = getNextItemIndex(timeline, endBeats, timeline.length - 1);
    for (let i = start; i <= end; i++) {
        const item = timeline[i];
        if (item.type === TIMELINE_ITEM_BPM || item.type === TIMELINE_ITEM_MEASURE) {
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



