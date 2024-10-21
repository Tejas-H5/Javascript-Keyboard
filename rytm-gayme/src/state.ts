import { getNoteText, MusicNote } from "src/utils/music-theory-utils";
import { releaseAllKeys, ScheduledKeyPress, schedulePlayback } from "./dsp-loop-interface";
import { getBeatsForTime, getCurrentPlayingTimeRelative, getCursorStartBeats, getItemEndTime, getItemStartBeats, getItemStartTime, getRangeSelectionEndBeats, getRangeSelectionStartBeats, getSelectionRange, hasRangeSelection, isItemUnderCursor, lteBeats, mutateSequencerTimeline, newSequencerState, recomputeSequencerState, SequencerState, TIMELINE_ITEM_BPM, TIMELINE_ITEM_NOTE, TimelineItem } from "./sequencer-state";
import { unreachable } from "./utils/asserts";
import { clamp } from "./utils/math-utils";
import { recursiveShallowCopyRemovingComputedFields } from "./utils/serialization-utils";

export type GlobalState = {
    keys: InstrumentKey[][];
    flatKeys: InstrumentKey[];
    sequencer: SequencerState;
    settings: {
    };

    uiState: UIState;
    savedState: SavedState;

    playingTimeout: number;
    reachedLastNote: boolean;
    scheduledKeyPresses: ScheduledKeyPress[];
    scheduledKeyPressesFirstItemStart: number;
    scheduledKeyPressesPlaybackSpeed: number;
};

export type SavedState = {
    allSavedSongs: Record<string, string>;
}

export type UIState = {
    loadSaveSidebarOpen: boolean;
    isKeyboard: boolean;
    loadSaveCurrentSelection: string;

    // TODO: polish. right now it's only good for local dev
    saveStateTimeout: number;
    copiedPositionStart: number;
    copiedItems: TimelineItem[];
};

export function newUiState(): UIState {
    return {
        loadSaveSidebarOpen: false,
        isKeyboard: true,
        loadSaveCurrentSelection: "",

        // TODO: polish. right now it's only good for local dev
        saveStateTimeout: 0,
        copiedPositionStart: 0,
        copiedItems: [],
    };
}

export function newSavedState(): SavedState {
    return {
        allSavedSongs: {}
    };
}

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
    return state.scheduledKeyPressesFirstItemStart + 
        relativeTime * state.scheduledKeyPressesPlaybackSpeed;
}

export function getCurrentPlayingBeats(state: GlobalState): number {
    const currentTime = getCurrentPlayingTime(state);
    const beats = getBeatsForTime(state.sequencer, currentTime);
    return beats;
}

export function isItemBeingPlayed(state: GlobalState, item: TimelineItem): boolean {
    if (!state.sequencer.isPlaying) {
        return false;
    }

    if (item._index < state.sequencer.startPlayingIdx) {
        return false;
    }
    if (item._index > state.sequencer.endPlayingIdx) {
        return false;
    }

    const playbackTime = getCurrentPlayingTime(state);
    return getItemStartTime(item) <= playbackTime &&
        playbackTime <= getItemEndTime(item);
}

export function isItemRangeSelected(state: GlobalState, item: TimelineItem): boolean {
    const sequencer = state.sequencer;
    const start = getRangeSelectionStartBeats(sequencer);
    const end = getRangeSelectionEndBeats(sequencer);
    const min = Math.min(start, end);
    const max = Math.max(start, end);

    const itemBeats = getItemStartBeats(item);

    return lteBeats(min, itemBeats) && lteBeats(itemBeats, max);
}

export function stopPlaying(state: GlobalState) {
    clearTimeout(state.playingTimeout);
    releaseAllKeys(state.flatKeys);

    state.playingTimeout = 0;
    state.reachedLastNote = false;

    const sequencer = state.sequencer;
    sequencer.startPlayingTime = 0;
    sequencer.isPlaying = false;
    state.scheduledKeyPresses = [];
    schedulePlayback([]);
}

export function playCurrentInterval(state: GlobalState, speed: number) {
    const sequencer = state.sequencer;
    if (hasRangeSelection(sequencer)) {
        const [startIdx, endIdx] = getSelectionRange(sequencer);
        if (startIdx !== -1 && endIdx !== -1) {
            startPlaying(state, startIdx, endIdx, speed);
        }

        return;
    }

    // play from now till the end.
    const timeline = state.sequencer.timeline;
    const cursorStart = getCursorStartBeats(sequencer);
    let idx = 0;
    while (idx < timeline.length) {
        const item = timeline[idx];
        if (isItemUnderCursor(item, cursorStart)) {
            break;
        }
        idx++;
    }

    startPlaying(state, idx, timeline.length, speed);
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
    sequencer.startPlayingIdx = startIdx;
    sequencer.endPlayingIdx = endIdx;
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

    state.scheduledKeyPresses = scheduledKeyPresses;
    state.scheduledKeyPressesFirstItemStart = firstItemStartTime;
    state.scheduledKeyPressesPlaybackSpeed = speed;
    schedulePlayback(scheduledKeyPresses);
}


function newKey(k: string): InstrumentKey {
    return {
        keyboardKey: k.toLowerCase(),
        text: k[0].toUpperCase() + k.substring(1),
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
        },
        savedState: newSavedState(),
        uiState: newUiState(),
        scheduledKeyPresses: [],
        scheduledKeyPressesFirstItemStart: 0,
        scheduledKeyPressesPlaybackSpeed: 1,
        playingTimeout: 0,
        reachedLastNote: false,
    };
}

export function load(state: GlobalState) {
    const savedState = localStorage.getItem("savedState");
    if (!savedState) {
        return;
    }

    state.savedState = JSON.parse(savedState);
    mutateSequencerTimeline(state.sequencer, tl => {
        tl.splice(0, tl.length);
        tl.push(...JSON.parse(state.savedState.allSavedSongs["autosaved"]));
    });
}


// TODO: save and load the entire state.
export function save(state: GlobalState) {
    const serialzed = recursiveShallowCopyRemovingComputedFields(state.sequencer.timeline);
    const currentTracks = JSON.stringify(serialzed);

    state.savedState.allSavedSongs["autosaved"] = currentTracks;

    localStorage.setItem("savedState", JSON.stringify(state.savedState));
    console.log("saved!");
}

export function saveStateDebounced(state: GlobalState) {
    clearTimeout(state.uiState.saveStateTimeout);
    state.uiState.saveStateTimeout = setTimeout(() => {
        save(state);
    }, 100);
}

export function moveLoadSaveSelection(state: GlobalState, amount: number) {
    const keys = Object.keys(state.savedState.allSavedSongs);
    const idx = keys.indexOf(state.uiState.loadSaveCurrentSelection);
    if (idx === -1) {
        state.uiState.loadSaveCurrentSelection = keys[0];
        return;
    }

    const newIdx = clamp(idx + amount, 0, keys.length - 1);
    state.uiState.loadSaveCurrentSelection = keys[newIdx];
}

export function getCurrentSelectedSequenceName(state: GlobalState) {
    return state.uiState.loadSaveCurrentSelection;
}

export function loadCurrentSelectedSequence(state: GlobalState) {
    const key = getCurrentSelectedSequenceName(state);
    if (!state.savedState.allSavedSongs[key]) {
        return;
    }

    mutateSequencerTimeline(state.sequencer, tl => {
        tl.splice(0, tl.length);
        tl.push(...JSON.parse(state.savedState.allSavedSongs[key]));
    });
}

