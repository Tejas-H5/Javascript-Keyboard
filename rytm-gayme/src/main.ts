import "src/css/layout.css";
import { appendChild, Component, div, el, getState, newComponent, newComponent2, newInsertable, RenderGroup, setCssVars, span } from "src/utils/dom-utils";
import { DspInfo, DspLoopEventNotification, DspLoopMessage, DSPPlaySettings } from "./dsp-loop";
import dspLoopWorkerUrl from "./dsp-loop.ts?worker&url";
import "./main.css";

// all util styles

function Slider(rg: RenderGroup<{
    label: string;
    value: number;
    min: number;
    max: number;
    step: number;
    onChange: (value: number) => void;
}>) {
    return div({ class: "row" }, [
        div({}, rg.text((s) => s.label)),
        el<HTMLInputElement>("INPUT", { type: "range", class: "slider", }, [
            rg.attr("min", (s) => "" + s.min),
            rg.attr("max", (s) => "" + s.max),
            rg.attr("step", (s) => "" + s.step),
            rg.attr("value", (s) => "" + s.value),
            rg.on("input", (s, e) => {
                s.onChange((e.target! as HTMLInputElement).value as unknown as number);
            })
        ]),
    ]);
}

function Description(rg: RenderGroup) {
    return div({}, [
        el("H1", {}, "Virtual Piano/Keyboard"),
        "Have following features:",
        el("ul", {}, [
            el("li", {}, "Pressing keys on a keyboard should make sounds"),
            el("li", {}, "Can program a sequence of keys to play automatically"),
            el("li", {}, "Show what keys I should play"),
        ]),
        "Want following features:",
        el("ul", {}, [
            el("li", {}, "Should be able to have multiple modes, one piano mode and one drum-kit mode at least"),
        ]),
    ]);
}

// at least one of these fields must be set
type MusicNote = {
    noteIndex?: number;
    sample?: string;
}

const NOTE_LETTERS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
function getNoteLetter(index: number) {
    return NOTE_LETTERS[index % NOTE_LETTERS.length];
}

function getNoteIndex(noteLetter: string, noteNumber: number, isSharp: boolean) {
    if (isSharp) {
        noteLetter += "#";
    }

    const baseIndex = NOTE_LETTERS.indexOf(noteLetter);
    if (baseIndex === -1) {
        throw new Error("invalid note letter: " + noteLetter);
    }
    return baseIndex + noteNumber * 12
}


// TODO: rememmber what this even does
function bpmToInterval(bpm: number, division: number) {
    return (60000 / bpm) / division;
}



const C_0 = 16.35;;
const TWELVTH_ROOT_OF_TWO = 1.0594631;

function getNoteFrequency(index: number) {
    return C_0 * Math.pow(TWELVTH_ROOT_OF_TWO, index);
}

function getNoteNumber(index: number) {
    return Math.floor(index / 12);
}

type InstrumentKey = {
    keyboardKey: string;
    text: string;
    noteText: string;
    musicNote: MusicNote;

    // this is the 'id'
    index: number;
    remainingDuration: number;
}


function unreachable(): never {
    throw new Error("Unreachable!");
}

function Keyboard(rg: RenderGroup) {
    function KeyboardRow(rg: RenderGroup<{
        keys: InstrumentKey[];
        keySize: number;
        startOffset: number;
    }>) {
        function KeyboardKey(rg: RenderGroup<{
            key: InstrumentKey;
            keySize: number;
        }>) {
            function handlePress() {
                const s = getState(rg);
                pressKey(s.key);
                rerenderApp();
            }

            function handleRelease() {
                const s = getState(rg);
                releaseKey(s.key);
                rerenderApp();
            }

            let signal = 0;

            rg.preRenderFn((s) => {
                signal = getCurrentOscillatorGain(s.key.index);
            });

            return span({
                class: " relative",
                style: "font-family: monospace; outline: 1px solid var(--foreground);" +
                    "display: inline-block; text-align: center; user-select: none;",
            }, [
                rg.style("width", s => s.keySize + "px"),
                rg.style("height", s => s.keySize + "px"),
                rg.style("fontSize", s => (s.keySize / 2) + "px"),
                // TODO: opacity between 0 and 1 here
                rg.style("backgroundColor", () => signal > 0.1 ? `rgba(0, 0, 0, ${signal})` : `rgba(255, 255, 255, ${signal})`),
                rg.style("color", (s) => signal > 0.1 ? `var(--bg)` : `var(--fg)`),
                rg.on("mousedown", handlePress),
                rg.on("mouseup", handleRelease),
                rg.on("mouseleave", handleRelease),
                div({
                    style: "position: absolute; top:5px; left: 0; right:0;"
                }, [
                    rg.text(s => s.key.text)
                ]),
                div({
                    class: "text-mg",
                    style: "position: absolute; bottom:5px; left: 0; right:0;" +
                        "text-align: right;"
                }, [
                    rg.style("fontSize", s => (s.keySize / 4) + "px"),
                    rg.style("paddingRight", s => (s.keySize / 10) + "px"),
                    rg.text(s => s.key.noteText),
                ]),
            ]);
        }

        return div({ class: "row", style: "gap: 5px; margin-top: 5px;" }, [
            div({}, [
                rg.style("width", s => (s.startOffset * s.keySize) + "px"),
            ]),
            rg.list(div({ class: "row" }), KeyboardKey, (getNext, s) => {
                for (let i = 0; i < s.keys.length; i++) {
                    const key = getNext();
                    key.render({ key: s.keys[i], keySize: s.keySize });
                }
            })
        ]);
    }

    function pressKey(k: InstrumentKey) {
        resumeAudio();

        const block = getOrMakeInfoBlock(k.index);
        block[1] = 1;

        if (k.musicNote.sample) {
            audioLoopDispatch({ playSample: [k.index, { sample: k.musicNote.sample }] })
        } else if (k.musicNote.noteIndex) {
            const frequency = getNoteFrequency(k.musicNote.noteIndex);
            audioLoopDispatch({ setOscilatorSignal: [k.index, { frequency, signal: 1 }] })
        } else {
            unreachable();
        }
    }

    function releaseKey(k: InstrumentKey) {
        if (k.musicNote.sample) {
            // do nothing
        } else if (k.musicNote.noteIndex) {
            const frequency = getNoteFrequency(k.musicNote.noteIndex);
            audioLoopDispatch({ setOscilatorSignal: [k.index, { frequency, signal: 0 }] })
        }
    }

    function findKey(note: MusicNote): InstrumentKey | undefined {
        if (note.sample) {
            return flatKeys.find(k => k.musicNote.sample === note.sample);
        } else if (note.noteIndex) {
            return flatKeys.find(k => k.musicNote.noteIndex === note.noteIndex);
        } else {
            throw new Error("music note was empty!");
        }
    }

    // TODO: better name
    function releasePressedKeysBasedOnDuration() {
        for (const key of flatKeys) {
            if (key.remainingDuration > 0) {
                key.remainingDuration -= 1;
            }

            if (key.remainingDuration === 0) {
                releaseKey(key);
            }
        }
    }

    function releaseAllKeys() {
        for (const key of flatKeys) {
            releaseKey(key);
        }
    }

    function stopPlaying() {
        releaseAllKeys();
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
                console.warn("Mismatched drum slots!");
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
                    const number = getNoteNumber(noteIndex);

                    key.noteText = `${getNoteLetter(noteIndex)}${number}`;
                    key.musicNote.noteIndex = noteIndex;
                }
            }
        }
    }


    document.addEventListener("keydown", (e) => {
        e.preventDefault();

        const key = flatKeys.find(k => k.keyboardKey === e.key.toLowerCase());
        if (!key) {
            return;
        }

        pressKey(key);
        rerenderApp();
    })

    document.addEventListener("keyup", (e) => {
        e.preventDefault();

        const key = flatKeys.find(k => k.keyboardKey === e.key.toLowerCase());
        if (!key) {
            return;
        }

        releaseKey(key);
        rerenderApp();
    })

    document.addEventListener("blur", () => {
        releaseAllKeys();
        rerenderApp();
    })

    const root = rg.list(div(), KeyboardRow, (getNext) => {
        const offsets = [
            0,
            0.5,
            0.75,
            1.25,
            1.75,
        ];

        let maxOffset = 0;
        for (let i = 0; i < keys.length; i++) {
            const row = keys[i];
            let computedOffset = offsets[i] + row.length + 1;
            maxOffset = Math.max(maxOffset, computedOffset);
        }

        const width = window.innerWidth;
        const height = window.innerHeight;
        const keySize = Math.min(
            width / maxOffset,
            height / (2 * keys.length)
        )

        for (let i = 0; i < keys.length; i++) {
            const row = keys[i];
            getNext().render({
                keys: row,
                keySize,
                startOffset: offsets[i],
            });
        }
    });

    return [root, {
        pressNote(note: MusicNote) {
            const key = findKey(note);
            if (key) {
                pressKey(key);
            } else {
                console.warn("the key for a note was not found: ", note);
            }

        },
        releaseNote(note: MusicNote) {
            const key = findKey(note);
            if (key) {
                releaseKey(key);
            } else {
                console.warn("the key for a note was not found: ", note);
            }

        },
    }] as const;
}

function App(rg: RenderGroup) {
    setCssVars({
        "--foreground": "black",
        "--background": "white",
        "--key-size": "75px",
    });

    function newSliderTemplateFn(name: string, initialValue: number, fn: (val: number) => void) {
        return rg.c(Slider, (c, s) => c.render({
            label: name,
            min: 0.01, max: 1, step: 0.01,
            value: initialValue,
            onChange(val) { fn(val); rerenderApp(); },
        }));
    }

    const settings: DSPPlaySettings = {
        attack: 0.01,
        decay: 0.5,
        sustainVolume: 0.5,
        sustain: 0.25,
    };

    let firstRender = false;
    rg.preRenderFn(() => {
        if (!firstRender) {
            firstRender = true;
            audioLoopDispatch({ playSettings: settings });
        }
    })

    const [keyboard, keyboardHandle] = newComponent2(Keyboard);

    // TODO: automate playing some songs.
    // let on = false;
    // setInterval(() => {
    //     if (on) {
    //         keyboardHandle.pressNote({
    //             noteIndex: getNoteIndex("A", 4, false)
    //         });
    //     } else {
    //         keyboardHandle.releaseNote({
    //             noteIndex: getNoteIndex("A", 4, false)
    //         });
    //     }
    //     on = !on;
    // }, 1000);

    rg.postRenderFn(() => {
        keyboard.render(null);
    });

    return div({
        class: "col absolute-fill",
        style: "position: fixed",
    }, [
        div({ class: "flex-1" }),
        // newComponent(Description),
        // TODO: fix
        // newSliderTemplateFn("Attack", settings.attack, (val) => {
        //     settings.attack = val;
        //     audioLoopDispatch({ playSettings: settings });
        // }),
        // newSliderTemplateFn("Decay", settings.decay, (val) => {
        //     settings.decay = val;
        //     audioLoopDispatch({ playSettings: settings });
        // }),
        // newSliderTemplateFn("Sustain Volume", settings.sustainVolume, (val) => {
        //     settings.sustainVolume = val;
        //     audioLoopDispatch({ playSettings: settings });
        // }),
        // newSliderTemplateFn("Sustain Time", settings.sustain, (val) => {
        //     settings.sustain = val;
        //     audioLoopDispatch({ playSettings: settings });
        // }),
        div({ class: "row justify-content-center" }, [
            keyboard,
        ])
    ])
}

const root = newInsertable(document.body);
let app: Component<any, any> | undefined;
const audioCtx = new AudioContext()
function rerenderApp() {
    app?.render(null);
}

let dspPort: MessagePort | undefined;
const dspInfo: DspInfo = { currentlyPlaying: [] };

function getInfoBlock(id: number): [number, number] | undefined {
    return dspInfo.currentlyPlaying.find(b => b[0] === id);
}

// This thing gets overwritten very frequently every second, but we probably want our ui to update instantly and not
// within 1/10 of a second. this compromise is due to an inability to simply pull values from the dsp loop as needed - 
// instead, the dsp loop has been configured to push it's relavant state very frequently. SMH.
function getOrMakeInfoBlock(id: number): [number, number] {
    const block = getInfoBlock(id);
    if (block) return block;
    const b: [number, number] = [id, 0];
    dspInfo.currentlyPlaying.push(b);
    return b;
}

function getCurrentOscillatorGain(id: number): number {
    const block = getInfoBlock(id);
    if (!block) {
        return 0;
    }
    return block[1];
}



function audioLoopDispatch(message: DspLoopMessage) {
    if (!dspPort) {
        return;
    }

    dspPort.postMessage(message);
}

function resumeAudio() {
    // the audio context can only be started in response to a user gesture.
    audioCtx.resume().catch(console.error);
}

// initialize the app.
(async () => {
    // registers the DSP loop. we must communicate with this thread through a Port thinggy
    await audioCtx.audioWorklet.addModule(dspLoopWorkerUrl);
    const dspLoopNode = new AudioWorkletNode(audioCtx, "dsp-loop");
    dspLoopNode.onprocessorerror = (e) => {
        console.error("dsp process error:", e);
    }
    dspLoopNode.connect(audioCtx.destination);

    dspPort = dspLoopNode.port;

    // I'm surprized this isn't a memory leak...
    // but yeah this will literally create a new array and serialize it over
    // some port several times a second just so we know what the current
    // 'pressed' state of one of the notes is.
    const frequency = 1000 / 20;
    // const frequency = 1000 / 60; //  too much cpu heat 
    setInterval(() => {
        audioLoopDispatch(1337);
    }, frequency);

    dspPort.onmessage = ((e) => {
        const data = e.data as DspLoopEventNotification;
        if (data.currentlyPlaying) {
            dspInfo.currentlyPlaying = data.currentlyPlaying;
            rerenderApp();
        }
    });

    // Our code only works after the audio context has loaded.
    app = newComponent(App);
    appendChild(root, app);
    rerenderApp();
})();

window.addEventListener("resize", () => {
    rerenderApp();
});
