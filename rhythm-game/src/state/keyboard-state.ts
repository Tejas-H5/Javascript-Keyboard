import { getNoteText } from "src/utils/music-theory-utils.ts";
import { KEYBOARD_LAYOUT } from "./keyboard-config";
import { imdom, NormalizedKey } from "src/utils/im-js";
import { imui } from "src/utils/im-js/im-ui";
import { assert } from "src/utils/assert";
import { featureFlags } from "src/debug-flags";

export type KeyboardState = {
    keys: InstrumentKey[][];
    flatKeys: InstrumentKey[];
    hasClicked: boolean;
    maxNoteIdx: number;
};

export type InstrumentKey = {
    keyboardKey: string;
    keyboardKeyNormalized: NormalizedKey;
    text: string;
    noteText: string;
    noteId: number;
    cssColours: {
        light: string;
        normal: string;
        dark: string;
    };

    // this is the index from 0 -> flatKeys.length - 1
    index: number;
    remainingDuration: number;
}


export function getKeyForNote(state: KeyboardState, noteId: number): InstrumentKey | undefined {
    return state.flatKeys.find(k => k.noteId === noteId);
}

function getLowerCase(key: string) {
    switch (key) {
        case "!": return "1";
        case "@": return "2";
        case "#": return "3";
        case "$": return "4";
        case "%": return "5";
        case "^": return "6";
        case "&": return "7";
        case "*": return "8";
        case "(": return "9";
        case ")": return "0";
        case "_": return "-";
        case "+": return "=";
        case "{": return "[";
        case "}": return "]";
        case "|": return "\\";
        case ":": return ";";
        case "\"": return "'";
        case ">": return ".";
        case "<": return ",";
        case "?": return "/";
    }

    return key.toLowerCase();
}

export function getKeyForKeyboardKey(state: KeyboardState, key: string): InstrumentKey | undefined {
    return state.flatKeys.find(k => k.keyboardKeyNormalized === imdom.getNormalizedKey(key));
}

function newKey(k: string): InstrumentKey {
    const key = k === "↵" ? "Enter" : k.toLowerCase();
    return {
        keyboardKey: key,
        keyboardKeyNormalized: imdom.getNormalizedKey(key),
        text: k[0].toUpperCase() + k.substring(1),
        noteText: "",
        index: -1,
        noteId: 0,
        remainingDuration: 0,
        cssColours: {
            light: "",
            normal: "",
            dark: "",
        },
    };
}

export const BASE_NOTE = 28;

export function newKeyboardState(): KeyboardState {
    const keys: InstrumentKey[][] = [];
    const flatKeys: InstrumentKey[] = [];
    let maxNoteIdx = 0;

    const pianoKeys = KEYBOARD_LAYOUT
        .map(line => line.split("").map(newKey));

    // initialize keys
    {
        keys.push(...pianoKeys);

        // piano rows
        if (featureFlags.layout === 0) {
            // The first approach is to make every row it's own octave.
            // This is how a normal piano works, in some sense.
            // The pitch of a key does not naturally ascend from the left
            // of the keyboard to the right - they can wrap around the keyboard.
            // It is very logical, but that is probably why I've found it VERY hard to learn. 

            let noteIndexOffset = 0;
            for (let row = 0; row < pianoKeys.length; row++) {
                for (let idx = 0; idx < pianoKeys[row].length; idx++) {
                    const key = pianoKeys[row][idx];

                    flatKeys.push(key);

                    const noteIndex = BASE_NOTE + noteIndexOffset;
                    noteIndexOffset++;

                    key.noteText = getNoteText(noteIndex);
                    key.noteId = noteIndex;
                    maxNoteIdx = noteIndex;
                }
            }
        } else if (featureFlags.layout === 1) {
            // Another approach is to make sure that notes ascend from left to right, more or less.

            let totalNumCols = 0;
            for (const row of pianoKeys) {
                totalNumCols = Math.max(totalNumCols, row.length)
            }
            assert(totalNumCols > 0);

            let noteIndexOffset = 0;
            for (let colIdx = 0; colIdx < totalNumCols; colIdx++) {
                for (let rowIdx = 0; rowIdx < pianoKeys.length; rowIdx++) {
                    const row = pianoKeys[rowIdx];
                    if (!row) continue;

                    const key = row[colIdx];
                    if (!key) break;

                    flatKeys.push(key);

                    const noteIndex = BASE_NOTE + noteIndexOffset;
                    noteIndexOffset++;

                    key.noteText = getNoteText(noteIndex);
                    key.noteId = noteIndex;
                    maxNoteIdx = noteIndex;
                }
            }
        } else {
            // THe transiton from the number row to the lowest letter row
            // can still be a bit brutal. maybe we copy layout 1 but
            // with 1q and az ?

            let totalNumCols = 0;
            for (const row of pianoKeys) {
                totalNumCols = Math.max(totalNumCols, row.length)
            }
            assert(totalNumCols > 0);

            assert(pianoKeys.length === 4)

            let noteIndexOffset = 0;
            for (let rowOffset = 0; rowOffset <= 2; rowOffset += 2) {
                for (let colIdx = 0; colIdx < totalNumCols; colIdx++) {
                    for (let rowIdxOff = 0; rowIdxOff < 2; rowIdxOff++) {
                        const rowIdx = rowOffset + rowIdxOff;
                        const row = pianoKeys[rowIdx];
                        if (!row) continue;

                        const key = row[colIdx];
                        if (!key) break;

                        flatKeys.push(key);

                        const noteIndex = BASE_NOTE + noteIndexOffset;
                        noteIndexOffset++;

                        key.noteText = getNoteText(noteIndex);
                        key.noteId = noteIndex;
                        maxNoteIdx = noteIndex;
                    }
                }
            }
        }

        for (let i = 0; i < flatKeys.length; i++) {
            // re-index the things
            flatKeys[i].index = i;

            // colors!
            flatKeys[i].cssColours.normal = "" + imui.newColorFromHsv(((2 * i + 1) / flatKeys.length) % 1, 1, 0.5);
            flatKeys[i].cssColours.light = "" + imui.newColorFromHsv(((2 * i + 1) / flatKeys.length) % 1, 1, 0.75);
            flatKeys[i].cssColours.dark = "" + imui.newColorFromHsv(((2 * i + 1) / flatKeys.length) % 1, 1, 0.25);
        }
    }

    return {
        keys,
        flatKeys,
        hasClicked: false,
        maxNoteIdx,
    };
}

export function sampleToNoteIdx(sampleIdx: number) {
    return BASE_NOTE + sampleIdx;
}

// Allows our 'note index' to be a number, while also allowing us to override various samples.
export function getSampleIdx(noteIdx: number): number {
    const sampleLow = BASE_NOTE;
    const sampleHi = BASE_NOTE + 11;
    if (noteIdx > sampleHi) return -1;
    return noteIdx - sampleLow;
}

export function getMusicNoteText(noteId: number) {
    const sample = getSampleIdx(noteId);
    if (sample !== -1) {
        return "sample " + sample; 
    }
    return getNoteText(noteId);
}

