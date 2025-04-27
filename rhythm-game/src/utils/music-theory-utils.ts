import { Sample } from "src/samples/all-samples";

// at least one of these fields must be set
export type MusicNote = {
    noteIndex?: number;
    sample?: Sample;
}

export function getNoteHashKey(note: MusicNote): string {
    if (note.noteIndex) {
        return "" + note.noteIndex;
    }

    if (note.sample) {
        return note.sample;
    }
    
    return "";
}


export function compareMusicNotes(a: MusicNote, b: MusicNote): number {
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
}

export function notesEqual(a: MusicNote, b: MusicNote): boolean {
    return (!!a.sample && a.sample === b.sample) ||
        (!!a.noteIndex && a.noteIndex === b.noteIndex);
}

export function rebaseBeats(beats: number, divisor: number, newDivisor: number): number {
	const inBase1 = beats / divisor;
	return Math.floor(inBase1 * newDivisor);
}

export function beatsToMs(beats: number, bpm: number) {
    const bpms = bpm / 60 / 1000;
    return beats / bpms;
}

export function msToBeats(ms: number, bpm: number): number {
    const bpms = bpm / 60 / 1000;
    return ms * bpms;
}

// Each musical note has a frequency. The first or 0th musical note is a C0, which has a frequency of around 16.35hz.
// Each note after C0 (in half-steps) multiplies this frequency by the 12th root of two.
// TODO: source. because i did not make it up, actually

export const C_0 = 16.35;;
export const TWELVTH_ROOT_OF_TWO = 1.0594631;

export function getNoteFrequency(index: number) {
    return C_0 * Math.pow(TWELVTH_ROOT_OF_TWO, index);
}

export function getNoteNumber(index: number) {
    return Math.floor(index / 12);
}

export const NOTE_LETTERS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
export function getNoteLetter(index: number) {
    return NOTE_LETTERS[index % NOTE_LETTERS.length];
}

export function getNoteText(index: number) {
    const number = getNoteNumber(index);
    return `${getNoteLetter(index)}${number}`;
}

export function getNoteIndex(noteLetter: string, noteNumber: number) {
    const baseIndex = NOTE_LETTERS.indexOf(noteLetter);
    if (baseIndex === -1) {
        throw new Error("invalid note letter: " + noteLetter);
    }
    return baseIndex + noteNumber * 12
}
