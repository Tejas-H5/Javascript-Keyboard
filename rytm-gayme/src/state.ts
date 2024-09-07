import { getNoteText, MusicNote } from "src/utils/music-theory-utils";

export type InstrumentKey = {
    keyboardKey: string;
    text: string;
    noteText: string;
    musicNote: MusicNote;

    // this is the 'id'
    index: number;
    remainingDuration: number;
}
export const SEQ_ITEM = {
    CHORD: 1,
    REST: 2,
    HOLD: 3,
} as const;

type ChordItem = {
    t: typeof SEQ_ITEM.CHORD; // press this chord, play these samples, wait 1 interval
    notes: MusicNote[];
};

export type SequencerLineItem = ChordItem | {
    t: typeof SEQ_ITEM.REST  // release the last chord, wait 1 interval
    | typeof SEQ_ITEM.HOLD;   // keep holding down the las chord, wait 1 interval
};

export type SequencerLine = {
    // These are also set for every following line as well.
    comment: string | undefined;
    bpm: number | undefined;
    division: number | undefined;

    items: SequencerLineItem[];
}

export type SequencerTrack = {
    lines: SequencerLine[];
}

export function getCurrentTrack(state: SequencerState): SequencerTrack {
    if (state.currentSelectedTrackIdx === state.sequencerTracks.length) {
        state.sequencerTracks.push({
            lines: [],
        });
    }

    return state.sequencerTracks[state.currentSelectedTrackIdx];
}


function newDefaultLine(): SequencerLine {
    return {
        bpm: 120,
        comment: "",
        division: 4,
        items: [{ t: SEQ_ITEM.REST }],
    };
}

export function getCurrentLine(state: SequencerState): SequencerLine {
    const track = getCurrentTrack(state);

    if (state.currentSelectedLineIdx === track.lines.length) {
        track.lines.push(newDefaultLine());
    }

    const line = track.lines[state.currentSelectedLineIdx];
    return line;
}

export function deepCopyJSONSerializable<T>(thing: T) {
    return JSON.parse(JSON.stringify(thing)) as T;
}

function clamp(val: number, min: number, max: number) {
    return Math.min(max, Math.max(min, val));
}

export function setCurrentLineIdx(state: SequencerState, idx: number) {
    const track = getCurrentTrack(state);

    idx = clamp(idx, 0, track.lines.length - 1);
    state.currentSelectedLineIdx = idx;

    setCurrentItemIdx(state, state.currentSelectedItemIdx);
}

export function setCurrentItemIdx(state: SequencerState, idx: number) {
    const line = getCurrentLine(state);
    idx = clamp(idx, 0, line.items.length - 1);
    state.currentSelectedItemIdx = idx;
}

export function setCurrentItemChord(state: SequencerState, notes: MusicNote[]) {
    const line = getCurrentLine(state);
    line.items[state.currentSelectedItemIdx] = {
        t: SEQ_ITEM.CHORD,
        notes: sortNotes(deepCopyJSONSerializable(notes)),
    };
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

export function setCurrentItemHold(state: SequencerState) {
    const line = getCurrentLine(state);
    line.items[state.currentSelectedItemIdx] = { t: SEQ_ITEM.HOLD };
}

export function setCurrentItemRest(state: SequencerState) {
    const line = getCurrentLine(state);
    line.items[state.currentSelectedItemIdx] = { t: SEQ_ITEM.REST };
}

function newRestItem(): SequencerLineItem {
    return { t: SEQ_ITEM.REST };
}

export function insertNewLineItemAfter(state: SequencerState) {
    const line = getCurrentLine(state);
    const newLineItemIdx = state.currentSelectedItemIdx + 1;
    line.items.splice(newLineItemIdx, 0, newRestItem());
    setCurrentItemIdx(state, newLineItemIdx);
}

export function deleteCurrentLine(state: SequencerState) {
    const track = getCurrentTrack(state);
    if (track.lines.length === 1) {
        return;
    }

    track.lines.splice(state.currentSelectedLineIdx, 1);
    if (track.lines.length === state.currentSelectedLineIdx) {
        state.currentSelectedLineIdx--;
    }
}

export function getLineDivision(track: SequencerTrack, lineIdx: number) {
    for (let i = lineIdx; i >= 0; i--) {
        const line = track.lines[i];
        if (line.division) {
            return line.division;
        }
    }

    return 4;
}

export function getLastChord(track: SequencerTrack, lineIdx: number, itemIdx: number): ChordItem | undefined {
    for (let l = lineIdx; l >= 0; l--) {
        for (let i = itemIdx; i >= 0; i--) {
            const line = track.lines[l];
            const item = line.items[i];

            if (item.t === SEQ_ITEM.CHORD) {
                return item;
            }
        }
    }

    return undefined;
}

export function getLineBpm(track: SequencerTrack, lineIdx: number) {
    for (let i = lineIdx; i >= 0; i--) {
        const line = track.lines[i];
        if (line.bpm) {
            return line.bpm;
        }
    }

    return 120;
}


export function deleteCurrentLineItem(state: SequencerState) {
    const line = getCurrentLine(state);
    if (line.items.length === 1 && state.currentSelectedItemIdx === 0) {
        deleteCurrentLine(state);
        return;
    };

    line.items.splice(state.currentSelectedItemIdx, 1);
    if (line.items.length === state.currentSelectedItemIdx) {
        state.currentSelectedItemIdx--;
    }
}

export function addNewLine(state: SequencerState) {
    const track = getCurrentTrack(state);
    const newTrackIdx = state.currentSelectedLineIdx + 1;
    track.lines.splice(newTrackIdx, 0, newDefaultLine());
    setCurrentLineIdx(state, newTrackIdx);
}

export type SequencerState = {
    sequencerTracks: SequencerTrack[];
    currentSelectedTrackIdx: number;
    currentSelectedLineIdx: number;
    currentSelectedItemIdx: number;
    currentHoveredLineIdx: number;
    currentHoveredItemIdx: number;


    lastPlayingTrackIdx: number;
    lastPlayingLineIdx: number;
    lastPlayingItemIdx: number;
    currentPlayingTrackIdx: number;
    currentPlayingLineIdx: number;
    currentPlayingItemIdx: number;
    playingToSelected: boolean;
};

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
                key.index = flatKeys.length;
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

                    key.index = flatKeys.length;
                    flatKeys.push(key);

                    const noteIndex = 40 + noteIndexOffset;
                    noteIndexOffset++;

                    key.noteText = getNoteText(noteIndex);
                    key.musicNote.noteIndex = noteIndex;
                }
            }
        }
    }

    const sequencer: SequencerState = {
        sequencerTracks: [],
        currentSelectedTrackIdx: 0,
        currentSelectedLineIdx: 0,
        currentSelectedItemIdx: 0,
        lastPlayingItemIdx: 0,
        lastPlayingLineIdx: 0,
        lastPlayingTrackIdx: 0,
        currentPlayingItemIdx: 0,
        currentPlayingLineIdx: 0,
        currentPlayingTrackIdx: 0,
        playingToSelected: true,
        currentHoveredLineIdx: -1,
        currentHoveredItemIdx: -1,
    };

    return {
        keys,
        flatKeys,
        sequencer,
    };
}
