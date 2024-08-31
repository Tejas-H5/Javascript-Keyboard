import "src/css/layout.css";
import { appendChild, Component, div, el, getState, newComponent, newInsertable, RenderGroup, setCssVars, span } from "src/utils/dom-utils";
import dspLoopWorkerUrl from "./dsp-loop.ts?worker&url";
import "./main.css";
import { getSampleArray } from "./samples";

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

const NOTE_LETTERS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
function getNoteLetter(index: number) {
    return NOTE_LETTERS[index % NOTE_LETTERS.length];
}

// TODO: rememmber what this even does
function bpmToInterval(bpm: number, division: number) {
    return (60000 / bpm) / division;
}

// 0 is c0, 12 is c1, etc
function getNote(index: number) {
    const c0 = 16.35;
    const twelvethRootOfTwo = 1.0594631;

    return {
        frequency: c0 * Math.pow(twelvethRootOfTwo, index),
        number: Math.floor(index / 12),
    }
}


type Key = {
    keyboardKey: string;
    text: string;
    noteText: string;

    index: number;
    remainingDuration: number;
}

function Keyboard(rg: RenderGroup) {
    function KeyboardRow(rg: RenderGroup<{ 
        keys: Key[]; 
        keySize: number; 
        startOffset: number;
    }>) {
        function KeyboardKey(rg: RenderGroup<{ 
            key: Key; 
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
            return span({ class: "keyboard-key relative" }, [
                rg.style("width", s => s.keySize + "px"),
                rg.style("height", s => s.keySize + "px"),
                rg.style("fontSize", s => (s.keySize / 2) + "px"),
                rg.on("mousedown", handlePress),
                rg.on("mouseup", handleRelease),
                rg.on("mouseleave", handleRelease),
                // TODO: gradient of values here
                rg.class('pressed', (s) => oscillators[s.key.index].signal > 0.1),
                div({ style: "position: absolute; top:5px; left: 0; right:0;" }, rg.text(s => s.key.text)),
                div({ class: "keyboard-key-note", style: "position: absolute; bottom:5px; left: 0; right:0;" }, [
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

    function pressKey(k: Key) {
        resumeAudio();
        oscillators[k.index].signal = 1;
        audioLoopDispatch({ setSignal: [k.index, 1] })
    }

    function releaseKey(k: Key) {
        oscillators[k.index].signal = 0;
        audioLoopDispatch({ setSignal: [k.index, 0] })
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

    function newKey(k: string): Key {
        return {
            keyboardKey: k.toLowerCase(),
            text: k,
            noteText: "",
            index: -1,
            remainingDuration: 0
        };
    }

    const keys: Key[][] = [];
    const flatKeys: Key[] = [];
    // NOTE: this is really a read/write-through cache - the data will actually be on 
    // the DSP audio worker thread, and we need to set it there every time we make changes here.
    const oscillators: Oscillator[] = [];

    // initialize keys
    {
        // drums row
        {
            const drumKeys = "1234567890-=".split("").map(newKey);
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
                drumKeys[i].noteText = drumSlots[i].name;
                const samples = getSampleArray(drumSlots[i].sample);

                drumKeys[i].index = oscillators.length;
                flatKeys.push(drumKeys[i]);
                oscillators.push({
                    t: 1,
                    signal: 0,
                    prevSignal: 0,
                    samples: samples,
                    sample: samples.length,
                });
            }
        }

        // piano rows
        {
            const pianoKeys: Key[][] = [
                "qwertyuiop[]".split("").map(newKey),
                [..."asdfghjkl;'".split("").map(newKey), newKey("enter")],
                "zxcvbnm,./".split("").map(newKey),
            ];

            keys.push(...pianoKeys);

            let keyIndex = 0;
            for (const i in pianoKeys) {
                for (const j in pianoKeys[i]) {
                    const key = pianoKeys[i][j];

                    const noteIndex = 40 + keyIndex;
                    const { frequency, number } = getNote(noteIndex);

                    key.noteText = `${getNoteLetter(noteIndex)}${number}`;

                    key.index = oscillators.length;
                    flatKeys.push(key);
                    oscillators.push({
                        t: 0,
                        signal: 0,
                        prevSignal: 0,
                        awakeTime: 0,
                        phase: Math.random(),
                        gain: 0,
                        frequency: frequency,
                    });

                    keyIndex++;
                }
            }
        }

        audioLoopDispatch({ oscillators });
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

    return rg.list(div(), KeyboardRow, (getNext) => {
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
            rg.cNull(Keyboard),
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

    // Our code only works after the audio context has loaded.
    app = newComponent(App);
    appendChild(root, app);
    rerenderApp();
})();

window.addEventListener("resize", () => {
    rerenderApp();
});

