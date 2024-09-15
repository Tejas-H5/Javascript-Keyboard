import { bpmToInterval, getNoteText, MusicNote, noteEquals } from "src/utils/music-theory-utils";
import { within } from "./utils/math-utils";
import { Insertable } from "./utils/dom-utils";
import { filterInPlace } from "./utils/array-utils";

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
    // for animation purposes, computed from other things just before we play the stuff.
    _scheduledStart: number;
    _scheduledEnd: number;
    time: number;
};

export type TimelineItem = (
    ChordItem
    | BpmChange
);

export type ChordItem = BaseTimelineItem & {
    t: "chord",
    notes: MusicNote[];
    duration: number;
}

export type BpmChange = BaseTimelineItem & {
    t: "bpm",
    bpm: number;
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

    cursorStartTime: number;
    cursorEndTime: number;
    isRangeSelecting: boolean;
    currentBeatSnapDivisor: number;
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

function clamp(val: number, min: number, max: number) {
    return Math.min(max, Math.max(min, val));
}

export function setIsRangeSelecting(state: SequencerState, value: boolean) {
    state.isRangeSelecting = value;
}

const CURSOR_ITEM_TOLERANCE_MS = 5;

export function getCurrentItemIdx(state: SequencerState, startTime: number) {
    for (let i = 0; i < state.timeline.length; i++) {
        const item = state.timeline[i];
        if (within(item.time, startTime, CURSOR_ITEM_TOLERANCE_MS)) {
            return i;
        }
    }

    return -1;
}

export function getNextItemIndex(state: SequencerState, startTime: number) {
    for (let i = 0; i < state.timeline.length; i++) {
        const item = state.timeline[i];
        if (
            item.time >= startTime
            || within(item.time, startTime, CURSOR_ITEM_TOLERANCE_MS)
        ) {
            return i;
        }
    }

    return -1;
}

export function getPrevItemIndex(state: SequencerState, startTime: number) {
    for (let i = state.timeline.length - 1; i >= 0; i--) {
        const item = state.timeline[i];
        if (
            item.time <= startTime
            || within(item.time, startTime, CURSOR_ITEM_TOLERANCE_MS)
        ) {
            return i;
        }
    }

    return -1;
}

export function sortSequencerTimeline(state: SequencerState) {
    state.timeline.sort((a, b) => a.time - b.time);
}

export function recomputeState(state: GlobalState) {
    { // recompute sequencer state
        const sequencer = state.sequencer;
        sequencer._currentBpm = 120;
        sequencer._currentBpmTime = 0;
        const idx = findPrevItemIndex(sequencer, sequencer.cursorStartTime, i => i.t === "bpm");
        const item = sequencer.timeline[idx];
        if (item && item.t === "bpm") {
            sequencer._currentBpm = item.bpm;
            sequencer._currentBpmTime = item.time;
        }

        // make sure it's sorted at all times
        for (let i = 1; i < sequencer.timeline.length; i++) {
            if (sequencer.timeline[i-1].time > sequencer.timeline[i].time) {
                sortSequencerTimeline(sequencer);
                break;
            }
        }
    }
}


export function findNextItemIndex(state: SequencerState, startTime: number, predicate: (item: TimelineItem) => boolean): number {
    let idx = getNextItemIndex(state, startTime);
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

export function moveCursor(state: SequencerState, time: number) {
    state.cursorStartTime = time;
    if (!state.isRangeSelecting) {
        state.cursorEndTime = time;
    }
}

export function findPrevItemIndex(state: SequencerState, startTime: number, predicate: (item: TimelineItem) => boolean): number {
    let idx = getPrevItemIndex(state, startTime);
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

export function getSelectionRangeTime(state: SequencerState): [number, number] {
    const minTime = Math.min(state.cursorStartTime, state.cursorEndTime);
    const maxTime = Math.max(state.cursorStartTime, state.cursorEndTime);
    return [minTime, maxTime];
}

export function getSelectionRange(state: SequencerState): [number, number] {
    const [minTime, maxTime] = getSelectionRangeTime(state);
    let min = getNextItemIndex(state, minTime);
    let max = getPrevItemIndex(state, maxTime);


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
    if (minItem.time > maxTime) {
        return [-1, -1];
    }

    return [min, max];
}

export function getCurrentItem(state: SequencerState): TimelineItem | null {
    const [start, end] = getSelectionRange(state);
    if (start === -1 || end === -1) {
        // NOTE: not sure if needed, but makes sense when I wrote it
        return null;
    }

    const idx = getCurrentItemIdx(state, state.cursorStartTime);
    if (idx === -1) {
        return null;
    }

    return state.timeline[idx];
}

export function hasChordItem(item: ChordItem, note: MusicNote): boolean {
    return !!item.notes.find(n => noteEquals(n, note));
}

export function setChordItem(chord: ChordItem, note: MusicNote, onOrOff: boolean) {
    if (onOrOff === hasChordItem(chord, note)) {
        return 
    }

    if (onOrOff) {
        chord.notes.push(deepCopyJSONSerializable(note));
        sortNotes(chord.notes);
    } else {
        filterInPlace(chord.notes, n => !noteEquals(n, note));
    }
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

function sortNotes(notes: MusicNote[]) {
    return notes.sort((a, b) => {
        if (a.noteIndex && b.noteIndex) {
            return a.noteIndex - b.noteIndex;
        }

        if (a.sample && b.sample) {
            return a.sample.localeCompare(b.sample);
        }

        if (a.sample && b.noteIndex) {
            return 1;
        }
        if (b.sample && a.noteIndex) {
            return -1;
        }
        return 0;
    });
}

export function extendChordToTime(chord: ChordItem, absoluteTime: number) {
    chord.duration = absoluteTime - chord.time;
}

export function deleteRange(state: SequencerState, start: number, end: number) {
    state.timeline.splice(start, end - start + 1);
}

export function newChordItem(state: SequencerState): ChordItem {
    const item: ChordItem = {
        t: "chord",
        _scheduledStart: 0,
        _scheduledEnd: 0,
        time: state.cursorStartTime,
        notes: [],
        duration: 0,
    }

    state.timeline.push(item);
    sortSequencerTimeline(state);

    return item;
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
    if (item.t !== "chord") {
        return false;
    }

    const currentTime = getCurrentPlayingTime(state);
    if (currentTime < 0) {
        return false;
    }

    return item._scheduledStart <= currentTime && currentTime <= item._scheduledEnd;
}


export function getAdjacentTimelinePosition(
    time: number, 
    bpmTime: number, 
    bpm: number, 
    divisor: number, 
    amount: number,
) {
    const delta = time - bpmTime;
    const spacing = bpmToInterval(bpm, divisor);
    const deltaGridsnapped = Math.round(delta / spacing) * spacing;
    if (!within(time, deltaGridsnapped, CURSOR_ITEM_TOLERANCE_MS)) {
        // If we aren't on a gridsnapped point, we should consume one 'jump' 
        // moving to a gridsnapped point before we move to the next point
        if (time < deltaGridsnapped) {
            amount--;
        } else if (time > deltaGridsnapped) {
            amount++;
        }
    }

    return deltaGridsnapped + spacing * amount;
}
export function newSequencerState(): SequencerState {
    const sequencer: SequencerState = {
        timeline: [],
        cursorStartTime: 0,
        cursorEndTime: 0,
        isRangeSelecting: false,
        currentBeatSnapDivisor: 4, 
        isPlaying: false,
        startPlayingTime: 0,
        playingDuration: 0,
        currentHoveredTimelineItemIdx: -1,

        settings: {
            showKeysInsteadOfABCDEFG: false,
        },

        _currentPlayingEl: null,
        _currentSelectedEl: null,
        _scheduledKeyPresses: [],
        _currentBpm: 120,
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
