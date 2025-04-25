import { Sample } from "src/samples/all-samples";
import { newColorFromHsv } from "src/utils/colour";
import { getNoteText, MusicNote } from "src/utils/music-theory-utils";

export type KeyboardState = {
    keys: InstrumentKey[][];
    flatKeys: InstrumentKey[];
    settings: {
    };
};

export type InstrumentKey = {
    keyboardKey: string;
    text: string;
    noteText: string;
    musicNote: MusicNote;
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


export function getKeyForMusicNoteIndex(state: KeyboardState, idx: number): InstrumentKey | undefined {
    return state.flatKeys.find(k => k.musicNote.noteIndex === idx);
}
export function getKeyForNote(keyboard: KeyboardState, note: MusicNote): InstrumentKey | undefined {
    if (note.sample) return keyboard.flatKeys.find(k => k.musicNote.sample === note.sample);
    if (note.noteIndex) return getKeyForMusicNoteIndex(keyboard, note.noteIndex);
    return undefined;
}

export function getKeyForKeyboardKey(state: KeyboardState, key: string): InstrumentKey | undefined {
    return state.flatKeys.find(k => k.keyboardKey === key.toLowerCase());
}

function newKey(k: string): InstrumentKey {
    return {
        keyboardKey: k === "↵" ? "enter" : k.toLowerCase(),
        text: k[0].toUpperCase() + k.substring(1),
        noteText: "",
        index: -1,
        musicNote: {},
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

export function newKeyboardState(): KeyboardState {
    const keys: InstrumentKey[][] = [];
    const flatKeys: InstrumentKey[] = [];

    // initialize keys
    {
        // drums row
        {
            const drumKeys = "1234567890-=".split("").map(k => newKey(k));
            const drumSlots: { name: string, sample: Sample }[] = [
                { name: "kickA", sample: "kick", },
                { name: "kickB", sample: "kick", },
                { name: "snareA", sample: "snare", },
                { name: "snareB", sample: "snare", },
                { name: "hatA", sample: "hat1", },
                { name: "hatB", sample: "hat2", },
                { name: "crashA", sample: "crash1", },
                { name: "crashB", sample: "crash2", },
                { name: "randA", sample: "rand1", },
                { name: "randB", sample: "rand2", },
                // TODO: add some more samples for these guys
                { name: "snareC", sample: "snare", },
                { name: "snareD", sample: "snare", },
            ];
            if (drumKeys.length !== drumSlots.length) {
                throw new Error("Mismatched drum slots!");
            }

            keys.push(drumKeys);

            for (let i = 0; i < drumSlots.length; i++) {
                const key = drumKeys[i];
                key.noteText = drumSlots[i].name;
                key.musicNote.sample = drumSlots[i].sample;
                key.isLeftmost = i === 0;
                key.isRightmost = i === drumSlots.length - 1;
                flatKeys.push(key);
            }
        }

        // piano rows
        {
            const pianoKeys: InstrumentKey[][] = [
                "qwertyuiop[]".split("").map(newKey),
                "asdfghjkl;'↵".split("").map(newKey),
                "zxcvbnm,./".split("").map(newKey),
            ];

            keys.push(...pianoKeys);

            let noteIndexOffset = 0;
            const BASE_NOTE = 40;
            for (let i = 0; i < pianoKeys.length; i++) {
                for (let j = 0; j < pianoKeys[i].length; j++) {
                    const key = pianoKeys[i][j];

                    flatKeys.push(key);

                    const noteIndex = BASE_NOTE + noteIndexOffset;
                    noteIndexOffset++;

                    key.noteText = getNoteText(noteIndex);
                    key.musicNote.noteIndex = noteIndex;
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
    };
}

