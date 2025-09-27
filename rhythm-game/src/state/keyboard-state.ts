import { Sample } from "src/assets/samples/all-samples";
import { newColorFromHsv } from "src/utils/colour";
import { getNoteText } from "src/utils/music-theory-utils";

export type KeyboardState = {
    keys: InstrumentKey[][];
    flatKeys: InstrumentKey[];
    settings: {
    };
    hasClicked: boolean;
    maxNoteIdx: number;
};

export type InstrumentKey = {
    keyboardKey: string;
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

    // this is the 'id'
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
    return {
        keyboardKey: k === "↵" ? "enter" : k.toLowerCase(),
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

export function newKeyboardState(): KeyboardState {
    const keys: InstrumentKey[][] = [];
    const flatKeys: InstrumentKey[] = [];
    let maxNoteIdx = 0;

    // initialize keys
    {
        // piano rows
        {
            const pianoKeys: InstrumentKey[][] = [
                "1234567890-=".split("").map(newKey),
                "qwertyuiop[]".split("").map(newKey),
                "asdfghjkl;'↵".split("").map(newKey),
                "zxcvbnm,./".split("").map(newKey),
            ];

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
        settings: {
        },
        hasClicked: false,
        maxNoteIdx,
    };
}

export function sampleToNoteIdx(sample: Sample) {
    let offset = 0;
    switch (sample) {
        case "kick":   offset = 0; break;
        case "snare":  offset = 2; break;
        case "hat1":   offset = 4; break;
        case "hat2":   offset = 5; break;
        case "crash1": offset = 6; break;
        case "crash2": offset = 7; break;
        case "rand1":  offset = 8; break;
        case "rand2":  offset = 9; break;
    }

    return BASE_NOTE + offset;
}

// Allows our 'note index' to be a number, while also allowing us to override various samples.
export function noteIdToSample(noteIdx: number): Sample | null {
    switch(noteIdx) {
        case BASE_NOTE + 0: return "kick";
        case BASE_NOTE + 1: return "kick";
        case BASE_NOTE + 2: return "snare";
        case BASE_NOTE + 3: return "snare";
        case BASE_NOTE + 4: return "hat1";
        case BASE_NOTE + 5: return "hat2";
        case BASE_NOTE + 6: return "crash1";
        case BASE_NOTE + 7: return "crash2";
        case BASE_NOTE + 8: return "rand1";
        case BASE_NOTE + 9: return "rand2";
        case BASE_NOTE + 10: return "snare";
        case BASE_NOTE + 11: return "snare";
    }

    return null;
}

export function getMusicNoteText(noteId: number) {
    const sample = noteIdToSample(noteId);
    if (sample !== null) {
        return sample; 
    }
    return getNoteText(noteId);
}

