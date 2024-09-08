import { getNoteText, MusicNote } from "src/utils/music-theory-utils";
import { mag } from "./utils/math-utils";
import { Insertable } from "./utils/dom-utils";

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

// NOTE: state with _ is computed or non-JSON serializable, and should be stripped
// before saving the state as JSON

export type SequencerLine = {
    // These are also set for every following line as well.
    comment: string | undefined;
    bpm: number;
    division: number;

    items: SequencerLineItem[];

    // The single UI component that is rendering this that is currently focused will update this array.
    // if present, we'll use it to determine which notes are above/below each other on the same line. 
    _itemPositions: [number, number][];
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

export type SequencerState = {
    sequencerTracks: SequencerTrack[];

    currentSelectedTrackIdx: number;

    currentSelectedLineIdx: number;
    // NOTE: can't range-select lines and items at the same time.
    currentSelectedLineStartIdx: number;
    currentSelectedLineEndIdx: number;

    currentSelectedItemIdx: number;
    currentSelectedItemStartIdx: number;   
    currentSelectedItemEndIdx: number;   

    isRangeSelecting: boolean;

    currentHoveredLineIdx: number;
    currentHoveredItemIdx: number;

    lastPlayingTrackIdx: number;
    lastPlayingLineIdx: number;
    lastPlayingItemIdx: number;
    currentPlayingTrackIdx: number;
    currentPlayingLineIdx: number;
    currentPlayingEndLineIdx: number;
    currentPlayingItemIdx: number;
    currentPlayingEndItemIdx: number;

    // DOM elements tracking which thing is selected or playing.
    _currentPlayingEl: Insertable<HTMLElement> | null;
    _currentSelectedEl: Insertable<HTMLElement> | null;
};


function newDefaultLine(): SequencerLine {
    return {
        bpm: 120,
        comment: "",
        division: 4,
        items: [{ t: SEQ_ITEM.REST }],
        _itemPositions: [],
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

export function getCurrentLineItem(state: SequencerState): SequencerLineItem {
    const line = getCurrentLine(state);
    const item = line.items[state.currentSelectedItemIdx];
    return item;
}

export function deepCopyJSONSerializable<T>(thing: T) {
    return JSON.parse(JSON.stringify(thing)) as T;
}

function clamp(val: number, min: number, max: number) {
    return Math.min(max, Math.max(min, val));
}

export function setCurrentLineIdx(state: SequencerState, idx: number, itemIdx?: number) {
    const track = getCurrentTrack(state);

    idx = clamp(idx, 0, track.lines.length - 1);

    if (state.currentSelectedLineIdx === idx) {
        return;
    }

    state.currentSelectedLineIdx = idx;
    state.currentSelectedItemStartIdx = -1;
    state.currentSelectedItemEndIdx = -1;

    setCurrentItemIdx(state, itemIdx ?? state.currentSelectedItemIdx);
}

export function hasLineRangeSelect(state: SequencerState) {
    return state.currentSelectedLineStartIdx !== state.currentSelectedLineEndIdx;
}
export function hasItemRangeSelect(state: SequencerState) {
    return state.currentSelectedItemStartIdx !== state.currentSelectedItemEndIdx;
}

export function setIsRangeSelecting(state: SequencerState, value: boolean) {
    state.isRangeSelecting = value;
    if (value) {
        state.currentSelectedItemStartIdx = state.currentSelectedItemIdx;
        state.currentSelectedItemEndIdx = state.currentSelectedItemIdx;
        state.currentSelectedLineStartIdx = state.currentSelectedLineIdx;
        state.currentSelectedLineEndIdx = state.currentSelectedLineIdx;
    } else {
        // TODO: refine
        if (!hasLineRangeSelect(state)) {
            clearRangeSelectLine(state);
        }

        if (!hasItemRangeSelect(state)) {
            clearRangeSelectItem(state);
        }
    }
}

export function clearRangeSelectItem(state: SequencerState) {
    state.currentSelectedItemStartIdx = -1;
    state.currentSelectedItemEndIdx = -1;
}

export function clearRangeSelectLine(state: SequencerState) {
    state.currentSelectedLineStartIdx = -1;
    state.currentSelectedLineEndIdx = -1;
}

export function clearRangeSelect(state: SequencerState) {
    clearRangeSelectLine(state);
    clearRangeSelectItem(state);
}

export function indexOfNextLineItem(state: SequencerState, predicate: (item: SequencerLineItem) => boolean): number {
    const line = getCurrentLine(state);
    for (let i = state.currentSelectedItemIdx + 1; i < line.items.length; i++) {
        if (predicate(line.items[i])) {
            return i;
        }
    }
    return -1;
}

export function indexOfPrevLineItem(state: SequencerState, predicate: (item: SequencerLineItem) => boolean): number {
    const line = getCurrentLine(state);
    for (let i = state.currentSelectedItemIdx - 1; i >= 0; i--) {
        if (predicate(line.items[i])) {
            return i;
        }
    }
    return -1;
}

export function setCurrentItemIdx(state: SequencerState, idx: number) {
    const line = getCurrentLine(state);
    idx = clamp(idx, 0, line.items.length - 1);

    state.currentSelectedItemIdx = idx;
    if (state.isRangeSelecting) {
        state.currentSelectedItemEndIdx = idx;
    }
}

export function getItemSelectionRange(state: SequencerState): [number, number] {
    const min = Math.min(state.currentSelectedItemStartIdx, state.currentSelectedItemEndIdx);
    const max = Math.max(state.currentSelectedItemStartIdx, state.currentSelectedItemEndIdx);
    return [min, max];
}

export function getLineSelectionRange(state: SequencerState) {
    const min = Math.min(state.currentSelectedLineStartIdx, state.currentSelectedLineEndIdx);
    const max = Math.max(state.currentSelectedLineStartIdx, state.currentSelectedLineEndIdx);
    return [min, max];
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

export function insertNewLineItemAfter(state: SequencerState, item?: SequencerLineItem) {
    const line = getCurrentLine(state);
    const newLineItemIdx = state.currentSelectedItemIdx + 1;

    if (!item) {
        item = newRestItem();
    } else {
        item = deepCopyJSONSerializable(item);
    }

    line.items.splice(newLineItemIdx, 0, item);

    setCurrentItemIdx(state, newLineItemIdx);
}

// TODO: selection, range select
export function deleteCurrentLine(state: SequencerState) {
    const track = getCurrentTrack(state);
    if (track.lines.length === 1) {
        return;
    }

    setIsRangeSelecting(state, false);
    track.lines.splice(state.currentSelectedLineIdx, 1);
    if (track.lines.length === state.currentSelectedLineIdx) {
        state.currentSelectedLineIdx--;
    }
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

export function deleteCurrentLineItemRange(state: SequencerState) {
    const line = getCurrentLine(state);
    const track = getCurrentTrack(state);

    if (hasLineRangeSelect(state)) {
        const [min, max] = getLineSelectionRange(state);
        track.lines.splice(min, max - min + 1);
        clearRangeSelectLine(state);
    } else if (hasItemRangeSelect(state)) {
        const [min, max] = getItemSelectionRange(state);
        line.items.splice(min, max - min + 1);
        clearRangeSelectItem(state);

    } else {
        line.items.splice(state.currentSelectedItemIdx, 1);
    };

    if (line.items.length === 0) {
        deleteCurrentLine(state);
        if (state.currentSelectedLineIdx >= track.lines.length) {
            state.currentSelectedLineIdx = track.lines.length - 1;
        }
    }

    if (state.currentSelectedItemIdx >= line.items.length) {
        state.currentSelectedItemIdx = line.items.length - 1;
    }
}

export function insertNewLineAfter(state: SequencerState, newLine?: SequencerLine) {
    const track = getCurrentTrack(state);
    const newLineIndex = state.currentSelectedLineIdx + 1;

    if (!newLine) {
        newLine = newDefaultLine();
    } else {
        newLine = deepCopyJSONSerializable(newLine);
    }

    const currentLine = track.lines[state.currentSelectedLineIdx];
    if (currentLine) {
        newLine.bpm = currentLine.bpm;
        newLine.division = currentLine.division;
    }

    track.lines.splice(newLineIndex, 0, newLine);
    setCurrentLineIdx(state, newLineIndex);
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

export function moveUpOrDownALine(state: SequencerState, direction: number) {
    if (direction !== 1 && direction !== -1) {
        return;
    }

    const line = getCurrentLine(state);

    // if we've calculated _itemPositions via UI, we can run additional logic to move within the same line based on 
    // how the line has wrapped the elements.
    if (line.items.length === line._itemPositions.length) {
        const initIdx = state.currentSelectedItemIdx;
        const [initX, initY] = line._itemPositions[initIdx];
        let minDistanceIdx = -1;
        let minDistance = 99999999999999;

        for (let i = initIdx; i >= 0 && i < line.items.length; i += direction) {
            const [x, y] = line._itemPositions[i];
            if (Math.abs(y - initY) < 1) {
                // ignore everything on the same row
                continue;
            }
            
            const dist = mag(x - initX, y - initY);
            if (dist < minDistance) {
                minDistance = dist;
                minDistanceIdx = i;
            }
        }

        if (minDistanceIdx !== -1) {
            setCurrentItemIdx(state, minDistanceIdx);
            return;
        }
    }

    setCurrentLineIdx(state, state.currentSelectedLineIdx + direction);
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
        currentSelectedLineStartIdx: -1,
        currentSelectedLineEndIdx: -1,
        currentSelectedItemIdx: 0,
        currentSelectedItemStartIdx: -1,
        currentSelectedItemEndIdx: -1,
        isRangeSelecting: false,
        lastPlayingItemIdx: -1,
        lastPlayingLineIdx: -1,
        lastPlayingTrackIdx: -1,
        currentPlayingItemIdx: 0,
        currentPlayingEndItemIdx: 0,
        currentPlayingLineIdx: 0,
        currentPlayingEndLineIdx: 0,
        currentPlayingTrackIdx: 0,
        currentHoveredLineIdx: -1,
        currentHoveredItemIdx: -1,

        _currentPlayingEl: null,
        _currentSelectedEl: null,
    };

    return {
        keys,
        flatKeys,
        sequencer,
    };
}
