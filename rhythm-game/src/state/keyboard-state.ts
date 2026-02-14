import { newColorFromHsv } from "src/utils/colour.ts";
import { getNormalizedKey, NormalizedKey } from "src/utils/key-state";
import { getNoteText } from "src/utils/music-theory-utils.ts";

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
    isLeftmost: boolean;
    isRightmost: boolean;
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
    return state.flatKeys.find(k => k.keyboardKey === getLowerCase(key));
}

function newKey(k: string): InstrumentKey {
    const key = k === "↵" ? "Enter" : k.toLowerCase();
    return {
        keyboardKey: key,
        keyboardKeyNormalized: getNormalizedKey(key),
        text: k[0].toUpperCase() + k.substring(1),
        noteText: "",
        index: -1,
        noteId: 0,
        remainingDuration: 0,
        isLeftmost: false,
        isRightmost: false,
        cssColours: {
            light: "",
            normal: "",
            dark: "",
        },
    };
}

export const BASE_NOTE = 28;

export const KEYBOARD_LAYOUT: string[] = [
    "1234567890-=",
    "qwertyuiop[]",
    "asdfghjkl;'↵",
    "zxcvbnm,./",
];

export const KEYBOARD_LAYOUT_FLAT = KEYBOARD_LAYOUT.join("");

export function newKeyboardState(): KeyboardState {
    const keys: InstrumentKey[][] = [];
    const flatKeys: InstrumentKey[] = [];
    let maxNoteIdx = 0;

    const pianoKeys = KEYBOARD_LAYOUT
        .map(line => line.split("").map(newKey));

    // initialize keys
    {
        // piano rows
        {
            keys.push(...pianoKeys);

            let noteIndexOffset = 0;
            for (let i = 0; i < pianoKeys.length; i++) {
                for (let j = 0; j < pianoKeys[i].length; j++) {
                    const key = pianoKeys[i][j];

                    flatKeys.push(key);

                    const noteIndex = BASE_NOTE + noteIndexOffset;
                    noteIndexOffset++;

                    key.noteText = getNoteText(noteIndex);
                    key.noteId = noteIndex;
                    maxNoteIdx = noteIndex;

                    key.isLeftmost = j === 0;
                    key.isRightmost = j === pianoKeys[i].length -1;
                }
            }
        }

        for (let i = 0; i < flatKeys.length; i++) {
            // re-index the things
            flatKeys[i].index = i;

            // colors!
            flatKeys[i].cssColours.normal = "" + newColorFromHsv(((2 * i + 1) / flatKeys.length) % 1, 1, 0.5);
            flatKeys[i].cssColours.light = "" + newColorFromHsv(((2 * i + 1) / flatKeys.length) % 1, 1, 0.75);
            flatKeys[i].cssColours.dark = "" + newColorFromHsv(((2 * i + 1) / flatKeys.length) % 1, 1, 0.25);
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

