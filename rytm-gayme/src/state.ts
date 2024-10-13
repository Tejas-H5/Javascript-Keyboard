import { getNoteText, MusicNote } from "src/utils/music-theory-utils";
import { getCurrentPlayingTimeRelative, getItemEndTime, getItemStartTime, getNextItemIndex, getPrevItemIndex, getSelectionRange, newSequencerState, recomputeSequencerState, SequencerState, TIMELINE_ITEM_BPM, TIMELINE_ITEM_NOTE, TimelineItem } from "./sequencer-state";
import { Insertable } from "./utils/dom-utils";
import { releaseAllKeys, ScheduledKeyPress, schedulePlayback } from "./dsp-loop-interface";
import { unreachable } from "./utils/asserts";
import { getSequencerLeftExtent, getSequencerRightExtent } from "./sequencer";

export type GlobalState = {
    keys: InstrumentKey[][];
    flatKeys: InstrumentKey[];
    sequencer: SequencerState;
    settings: {
        showKeysInsteadOfABCDEFG: boolean;
    };

    // DOM elements tracking which thing is selected or playing, for purposes of scrolling.
    // Might be redundantnow.
    _currentPlayingEl: Insertable<HTMLElement> | null;
    _currentSelectedEl: Insertable<HTMLElement> | null;

    _playingTimeout: number;
    _reachedLastNote: boolean;
    _scheduledKeyPresses: ScheduledKeyPress[];
    _scheduledKeyPressesFirstItemStart: number;
    _scheduledKeyPressesPlaybackSpeed: number;
};


export type InstrumentKey = {
    keyboardKey: string;
    text: string;
    noteText: string;
    musicNote: MusicNote;

    // this is the 'id'
    index: number;
    remainingDuration: number;
}

export function deepCopyJSONSerializable<T>(thing: T) {
    return JSON.parse(JSON.stringify(thing)) as T;
}

export function recomputeState(state: GlobalState) {
    recomputeSequencerState(state.sequencer);
}

export function getKeyForMusicNoteIndex(state: GlobalState, idx: number): InstrumentKey | undefined {
    return state.flatKeys.find(k => k.musicNote.noteIndex === idx);
}

export function getKeyForNote(state: GlobalState, note: MusicNote): InstrumentKey | undefined {
    if (note.sample) return state.flatKeys.find(k => k.musicNote.sample === note.sample);
    if (note.noteIndex) return getKeyForMusicNoteIndex(state, note.noteIndex);
    return undefined;
}

export function getCurrentPlayingTime(state: GlobalState): number {
    if (!state.sequencer.isPlaying) {
        return -10;
    }

    const relativeTime = getCurrentPlayingTimeRelative(state.sequencer);
    return state._scheduledKeyPressesFirstItemStart + 
        relativeTime * state._scheduledKeyPressesPlaybackSpeed;
}

export function isItemBeingPlayed(state: GlobalState, item: TimelineItem): boolean {
    if (!state.sequencer.isPlaying) {
        return false;
    }
    
    const playbackTime = getCurrentPlayingTime(state);
    return getItemStartTime(item) <= playbackTime &&
        playbackTime <= getItemEndTime(item);
}

export function stopPlaying(state: GlobalState) {
    clearTimeout(state._playingTimeout);
    releaseAllKeys(state.flatKeys);

    state._playingTimeout = 0;
    state._reachedLastNote = false;

    const sequencer = state.sequencer;
    sequencer.startPlayingTime = 0;
    sequencer.isPlaying = false;
    state._scheduledKeyPresses = [];
    schedulePlayback([]);
}

export function playCurrentInterval(state: GlobalState, speed: number) {
    const sequencer = state.sequencer;
    if (sequencer.isRangeSelecting) {
        const [startIdx, endIdx] = getSelectionRange(sequencer);
        if (startIdx !== -1 && endIdx !== -1) {
            startPlaying(state, startIdx, endIdx, speed);
        }

        return;
    }

    const leftExtent = getSequencerLeftExtent(sequencer);
    const rightExtent = getSequencerRightExtent(sequencer);
    const leftExtentIdx = getNextItemIndex(sequencer.timeline, leftExtent);
    const rightExtentIdx = getPrevItemIndex(sequencer.timeline, rightExtent);

    startPlaying(state, leftExtentIdx, rightExtentIdx, speed);
}

export function playAll(state: GlobalState, speed: number) {
    const sequencer = state.sequencer;
    startPlaying(state, 0, sequencer.timeline.length - 1, speed);
}

export function startPlaying(state: GlobalState, startIdx: number, endIdx: number, speed: number) {
    const sequencer = state.sequencer;
    const timeline = sequencer.timeline;
    const firstItem: TimelineItem | undefined = timeline[startIdx];
    if (!firstItem) {
        return;
    }

    sequencer.startPlayingTime = Date.now();
    sequencer.isPlaying = true;

    // schedule the keys that need to be pressed, and then send them to the DSP loop to play them.

    const scheduledKeyPresses: ScheduledKeyPress[] = [];
    const firstItemStartTime = timeline[startIdx]._scheduledStart;

    for (let i = startIdx; i < timeline.length && i <= endIdx; i++) {
        const item = timeline[i];
        if (item.type === TIMELINE_ITEM_BPM) {
            // can't be played.
            continue;
        }

        if (item.type === TIMELINE_ITEM_NOTE) {
            const n = item.note;
            const key = getKeyForNote(state, n);
            if (!key) {
                // this note can't be played either
                continue;
            }

            scheduledKeyPresses.push({
                time: item._scheduledStart - firstItemStartTime,
                keyId: key.index,
                pressed: true,
                noteIndex: n.noteIndex,
                sample: n.sample,
            });

            if (item.note.noteIndex) {
                // notes need to be released, unlike samples.
                scheduledKeyPresses.push({
                    time: item._scheduledEnd - firstItemStartTime,
                    keyId: key.index,
                    pressed: false,
                    noteIndex: n.noteIndex,
                    sample: n.sample,
                });
            }
            continue;
        }

        unreachable(item);
    }

    for (const scp of scheduledKeyPresses) {
        scp.time /= speed;
    }

    scheduledKeyPresses.sort((a, b) => a.time - b.time);

    state._scheduledKeyPresses = scheduledKeyPresses;
    state._scheduledKeyPressesFirstItemStart = firstItemStartTime;
    state._scheduledKeyPressesPlaybackSpeed = speed;
    schedulePlayback(scheduledKeyPresses);
}


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

export function resetSequencer(state: GlobalState) {
    state.sequencer = newSequencerState();
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
        settings: {
            showKeysInsteadOfABCDEFG: false,
        },

        _scheduledKeyPresses: [],
        _scheduledKeyPressesFirstItemStart: 0,
        _scheduledKeyPressesPlaybackSpeed: 1,
        _playingTimeout: 0,
        _reachedLastNote: false,
        _currentPlayingEl: null,
        _currentSelectedEl: null,
    };
}
