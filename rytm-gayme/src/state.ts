import { compareMusicNotes, getNoteHashKey, getNoteText, MusicNote, noteEquals, rebaseBeats } from "src/utils/music-theory-utils";
import { filterInPlace } from "./utils/array-utils";
import { Insertable } from "./utils/dom-utils";
import { greaterThan, lessThan, within } from "./utils/math-utils";

export type InstrumentKey = {
    keyboardKey: string;
    text: string;
    noteText: string;
    musicNote: MusicNote;

    // this is the 'id'
    index: number;
    remainingDuration: number;
}

type BaseTimelineItem = {
    start: number;
    divisor: number;
    _scheduledStart: number;
};

export type TimelineItem = NoteItem | CommandItem;
export type CommandItem = BpmChange;

export const TIMELINE_ITEM_BPM = 0;
export const TIMELINE_ITEM_NOTE = 1;

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

export function getBeats(numerator: number, divisor: number): number {
    return numerator / divisor;
}

export function getCursorStartBeats(state: SequencerState): number {
    return getBeats(state.cursorStart, state.cursorDivisor);
}

export function getCursorEndBeats(state: SequencerState): number {
    return getBeats(state.cursorEnd, state.cursorDivisor);
}

// NOTE: contains cyclic references, so it shouldn't be serialized.
export type ScheduledKeyPress = {
    time: number;
    // Used to know which keyboard key is being played by the DSP.
    keyId: number;

    pressed: boolean;
    noteIndex?: number;
    sample?: string;
}

export type SequencerState = {
    timeline: TimelineItem[];
    _timelineLastUpdated: number;

    cursorStart: number;
    cursorEnd: number;
    cursorDivisor: number;
    isRangeSelecting: boolean;
    _currentBpm: number;
    _currentBpmTime: number;

    currentHoveredTimelineItemIdx: number;

    isPlaying: boolean;
    startPlayingTime: number;
    // used to know when to automatically stop playback, if needed.
    playingDuration: number;

    settings: {
        showKeysInsteadOfABCDEFG: boolean;
    };

    // DOM elements tracking which thing is selected or playing, for purposes of scrolling.
    // Might be redundantnow.
    _currentPlayingEl: Insertable<HTMLElement> | null;
    _currentSelectedEl: Insertable<HTMLElement> | null;
    _scheduledKeyPresses: ScheduledKeyPress[];
};

export function deepCopyJSONSerializable<T>(thing: T) {
    return JSON.parse(JSON.stringify(thing)) as T;
}

export function setIsRangeSelecting(state: SequencerState, value: boolean) {
    state.isRangeSelecting = value;
}

const CURSOR_ITEM_TOLERANCE_BEATS = 0.000001;

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

export function getPrevItemIndex(timeline: TimelineItem[], beats: number, defaultValue = -1) {
    for (let i = timeline.length - 1; i >= 0; i--) {
        const item = timeline[i];
        const itemBeats = getBeats(item.start, item.divisor);
        if (
            itemBeats <= beats
            || within(itemBeats, beats, CURSOR_ITEM_TOLERANCE_BEATS)
        ) {
            return i;
        }
    }

    return defaultValue;
}

export function getItemStartBeats(item: TimelineItem): number {
    return getBeats(item.start, item.divisor);
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


    state._timelineLastUpdated = Date.now();
}

export function recomputeState(state: GlobalState) {
    const sequencer = state.sequencer;

    // recompute current bpm
    {
        const idx = findPrevItemIndex(
            sequencer,
            getBeats(sequencer.cursorStart, sequencer.cursorDivisor), 
            i => i.type === TIMELINE_ITEM_BPM
        );
        const item = sequencer.timeline[idx];
        if (item && item.type === TIMELINE_ITEM_BPM) {
            sequencer._currentBpm = item.bpm;
            sequencer._currentBpmTime = item._scheduledStart;
        }
    }
}


export function findNextItemIndex(state: SequencerState, startTime: number, predicate: (item: TimelineItem) => boolean): number {
    let idx = getNextItemIndex(state.timeline, startTime);
    if (idx === -1) {
        return -1;
    }

    for (let i = idx + 1; i < state.timeline.length; i++) {
        if (predicate(state.timeline[i])) {
            return i;
        }
    }

    return -1;
}

export function findPrevItemIndex(state: SequencerState, beats: number, predicate: (item: TimelineItem) => boolean): number {
    let idx = getPrevItemIndex(state.timeline, beats);
    if (idx === -1) {
        return -1;
    }

    for (let i = idx - 1; i >= 0; i--) {
        if (predicate(state.timeline[i])) {
            return i;
        }
    }

    return -1;
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
    const [minTime, maxTime] = getSelectionRangeBeats(state);
    let min = getNextItemIndex(state.timeline, minTime);
    let max = getPrevItemIndex(state.timeline, maxTime);


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
    if (minItem._scheduledStart > maxTime) {
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
            greaterThan(itemStart, rangeEndBeats , CURSOR_ITEM_TOLERANCE_BEATS)
            || lessThan(itemEnd, rangeStartBeats, CURSOR_ITEM_TOLERANCE_BEATS)
        ) {
            return true;
        }

        // Some notes will start before the range and need to actually be split into two notes.
        if (
            lessThan(itemStart, rangeStartBeats, CURSOR_ITEM_TOLERANCE_BEATS)
            && greaterThan(itemEnd, rangeEndBeats, CURSOR_ITEM_TOLERANCE_BEATS)
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
            lessThan(itemEnd, rangeEndBeats, CURSOR_ITEM_TOLERANCE_BEATS)
            && greaterThan(itemStart, rangeStartBeats, CURSOR_ITEM_TOLERANCE_BEATS)
        ) {
            return false;
        }

        // trim notes that start before the bounds and end inside the bounds, or vice versa
        if (
            greaterThan(itemEnd, rangeStartBeats, CURSOR_ITEM_TOLERANCE_BEATS)
            && lessThan(itemStart, rangeStartBeats, CURSOR_ITEM_TOLERANCE_BEATS)
        ) {
            item.len = (rangeStartBeats - itemStart) * item.divisor;
            return true;
        }

        if (
            lessThan(itemStart, rangeEndBeats, CURSOR_ITEM_TOLERANCE_BEATS)
            && greaterThan(itemEnd, rangeEndBeats, CURSOR_ITEM_TOLERANCE_BEATS)
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
            greaterThan(getItemEndBeats(item), rangeStartBeats, CURSOR_ITEM_TOLERANCE_BEATS) 
            && lessThan(getItemStartBeats(item), rangeEndBeats, CURSOR_ITEM_TOLERANCE_BEATS)
        ) {
            return true;
        }
    }

    return false;
}

export function resetSequencer(state: GlobalState) {
    state.sequencer = newSequencerState();
}

export function getKeyForMusicNoteIndex(state: GlobalState, idx: number): InstrumentKey | undefined {
    return state.flatKeys.find(k => k.musicNote.noteIndex === idx);
}

export function getKeyForNote(state: GlobalState, note: MusicNote): InstrumentKey | undefined {
    if (note.sample) return state.flatKeys.find(k => k.musicNote.sample === note.sample);
    if (note.noteIndex) return getKeyForMusicNoteIndex(state, note.noteIndex);
    return undefined;
}

// Used to deterministically order notes
export function sortNotes(notes: MusicNote[]) {
    return notes.sort(compareMusicNotes);
}

export function deleteRange(state: SequencerState, start: number, end: number) {
    state.timeline.splice(start, end - start + 1);
}

export type GlobalState = {
    keys: InstrumentKey[][];
    flatKeys: InstrumentKey[];
    sequencer: SequencerState;
};

function newKey(k: string): InstrumentKey {
    return {
        keyboardKey: k.toLowerCase(),
        text: k,
        noteText: "",
        index: -1,
        musicNote: {},
        remainingDuration: 0
    };
}

export const SEQUENCER_ROW_COLS = 8;

export function getCurrentPlayingTime(state: SequencerState): number {
    if (!state.isPlaying) {
        return -10;
    }

    return Date.now() - state.startPlayingTime;
}

export function isItemPlaying(state: SequencerState, item: TimelineItem): boolean {
    if (item.type !== TIMELINE_ITEM_NOTE) {
        return false;
    }

    const currentTime = getCurrentPlayingTime(state);
    if (currentTime < 0) {
        return false;
    }

    return item._scheduledStart <= currentTime && currentTime <= item._scheduledEnd;
}

const DEFAULT_BPM = 120;
export function newSequencerState(): SequencerState {
    const sequencer: SequencerState = {
        timeline: [],
        cursorStart: 0,
        cursorEnd: 0,
        cursorDivisor: 4,
        isRangeSelecting: false,
        isPlaying: false,
        startPlayingTime: 0,
        playingDuration: 0,
        currentHoveredTimelineItemIdx: -1,
        settings: {
            showKeysInsteadOfABCDEFG: false,
        },

        // computed values:

        _timelineLastUpdated: 0,
        _currentPlayingEl: null,
        _currentSelectedEl: null,
        _scheduledKeyPresses: [],
        _currentBpm: DEFAULT_BPM,
        _currentBpmTime: 0,
    };

    return sequencer
}

export function newGlobalState(): GlobalState {
    const keys: InstrumentKey[][] = [];
    const flatKeys: InstrumentKey[] = [];

    // initialize keys
    {
        // drums row
        {
            const drumKeys = "1234567890-=".split("").map(k => newKey(k));
            const drumSlots = [
                { name: "kickA", sample: "kick", },
                { name: "kickB", sample: "kick", },
                { name: "snareA", sample: "snare", },
                { name: "snareB", sample: "snare", },
                { name: "hatA", sample: "hatA", },
                { name: "hatB", sample: "hatB", },
                { name: "crashA", sample: "crashA", },
                { name: "crashB", sample: "crashB", },
                { name: "randA", sample: "randA", },
                { name: "randB", sample: "randB", },
                // TODO: add some more samples for these guys
                { name: "snareC", sample: "snare", },
                { name: "snareD", sample: "snare", },
            ];
            if (drumKeys.length !== drumSlots.length) {
                throw new Error("Mismatched drum slots!");
            }

            keys.push(drumKeys);

            for (const i in drumSlots) {
                const key = drumKeys[i];
                key.noteText = drumSlots[i].name;
                key.musicNote.sample = drumSlots[i].sample;
                flatKeys.push(key);
            }
        }

        // piano rows
        {
            const pianoKeys: InstrumentKey[][] = [
                "qwertyuiop[]".split("").map(newKey),
                [..."asdfghjkl;'".split("").map(newKey), newKey("enter")],
                "zxcvbnm,./".split("").map(newKey),
            ];

            keys.push(...pianoKeys);

            let noteIndexOffset = 0;
            for (const i in pianoKeys) {
                for (const j in pianoKeys[i]) {
                    const key = pianoKeys[i][j];

                    flatKeys.push(key);

                    const noteIndex = 40 + noteIndexOffset;
                    noteIndexOffset++;

                    key.noteText = getNoteText(noteIndex);
                    key.musicNote.noteIndex = noteIndex;
                }
            }
        }

        // re-index the things
        for (let i = 0; i < flatKeys.length; i++) {
            flatKeys[i].index = i;
        }
    }

    return {
        keys,
        flatKeys,
        sequencer: newSequencerState(),
    };
}
