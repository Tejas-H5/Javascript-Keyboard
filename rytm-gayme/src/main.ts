import { Button } from "src/components/button";
import "src/css/layout.css";
import { appendChild, Component, div, el, getState, isEditingTextSomewhereInDocument, newComponent, newInsertable, RenderGroup, setChildAtEl, setCssVars, setInputValue, span } from "src/utils/dom-utils";
import { currentPressedNoteIndexes, getCurrentOscillatorGain, initDspLoopInterface, pressKey, releaseAllKeys, releaseKey } from "./dsp-loop-interface";
import "./main.css";
import { Sequencer } from "./sequencer";
import { deleteCurrentLineItemRange, getCurrentLine, getCurrentLineItem, getCurrentTrack, getItemSelectionRange, getKeyForMusicNoteIndex, getKeyForNote, getLineSelectionRange, hasItemRangeSelect, hasLineRangeSelect, indexOfNextLineItem, indexOfPrevLineItem, insertNewLineAfter, insertNewLineItemAfter, InstrumentKey, moveUpOrDownALine, newGlobalState, SEQ_ITEM, SequencerLine, SequencerLineItem, setCurrentItemChord, setCurrentItemHold, setCurrentItemIdx, setCurrentLineIdx, setIsRangeSelecting } from "./state";
import { clamp } from "./utils/math-utils";
import { bpmToInterval, MusicNote } from "./utils/music-theory-utils";

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

        return div({ class: "row", style: "gap: 5px;" }, [
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

    const root = div({ class: "" });

    return rg.list(root, KeyboardRow, (getNext, s) => {
        const offsets = [
            0,
            0.5,
            0.75,
            1.25,
            1.75,
        ];

        let maxOffset = 0;
        for (let i = 0; i < globalState.keys.length; i++) {
            const row = globalState.keys[i];
            let computedOffset = offsets[i] + row.length + 1;
            maxOffset = Math.max(maxOffset, computedOffset);
        }

        const parent = root.el.parentElement!;
        const width = parent.clientWidth;
        const height = parent.clientHeight;
        const keySize = Math.min(
            width / maxOffset,
            height / (globalState.keys.length),
        )

        for (let i = 0; i < globalState.keys.length; i++) {
            const row = globalState.keys[i];
            getNext().render({
                keys: row,
                keySize,
                startOffset: offsets[i],
            });
        }
    });
}

let playingTimeout = 0;
let reachedLastNote = false;
function stopPlaying() {
    clearTimeout(playingTimeout);
    releaseAllKeys(globalState.flatKeys);
    globalState.sequencer.lastPlayingLineIdx = -1;
    globalState.sequencer.lastPlayingItemIdx = -1;
    playingTimeout = 0;
    reachedLastNote = false;
}

function playToSelection() {
    const sequencer = globalState.sequencer;

    if (hasLineRangeSelect(sequencer)) {
        const [start, end] = getLineSelectionRange(sequencer);
        const track = getCurrentTrack(sequencer);
        const endLine = track.lines[end];

        sequencer.currentPlayingLineIdx = start;
        sequencer.currentPlayingEndLineIdx = end;
        sequencer.currentPlayingItemIdx = 0;
        sequencer.currentPlayingEndItemIdx = endLine.items.length - 1;

        sequencer.currentPlayingTrackIdx = 0;
    } else if (hasItemRangeSelect(sequencer)) {
        const [start, end] = getItemSelectionRange(sequencer);
        sequencer.currentPlayingLineIdx = sequencer.currentSelectedLineIdx;
        sequencer.currentPlayingEndLineIdx = sequencer.currentSelectedLineIdx;
        sequencer.currentPlayingItemIdx = start;
        sequencer.currentPlayingEndItemIdx = end;
    } else {
        sequencer.currentPlayingLineIdx = sequencer.currentSelectedLineIdx;
        sequencer.currentPlayingEndLineIdx = sequencer.currentSelectedLineIdx;
        sequencer.currentPlayingItemIdx = 0;
        sequencer.currentPlayingEndItemIdx = sequencer.currentSelectedItemIdx;

        sequencer.currentPlayingTrackIdx = 0;
    }


    startPlaying();
}

function playAll() {
    const sequencer = globalState.sequencer;

    sequencer.currentPlayingLineIdx = 0;
    sequencer.currentPlayingEndLineIdx = 9999999999;
    sequencer.currentPlayingItemIdx = 0;
    sequencer.currentPlayingEndItemIdx = 9999999999;
    
    sequencer.currentPlayingTrackIdx = 0;

    startPlaying();
}

function startPlaying() {
    stopPlaying();

    function recursiveTimeout() {
        // JavaScript we have `defer` at home meme
        setTimeout(rerenderApp, 1);

        if (reachedLastNote) {
            stopPlaying();
            return;
        }

        const sequencer = globalState.sequencer;
        const track = sequencer.sequencerTracks[sequencer.currentPlayingTrackIdx];
        // some of these conditions being checked elsewhere, but need to do this here again 
        // to avoid race conditions r.e. deleting stuff while we're playing
        if (!track) {
            stopPlaying();
            return;
        }

        const line = track.lines[sequencer.currentPlayingLineIdx];
        if (!line) {
            stopPlaying();
            return;
        }

        const item = line.items[sequencer.currentPlayingItemIdx];
        if (!item) {
            stopPlaying();
            return;
        }

        if (item.t === SEQ_ITEM.CHORD) {
            // release keys we've pressed that aren't in this chord
            for (const pressedNoteIdx of currentPressedNoteIndexes) {
                const pressedKey = getKeyForMusicNoteIndex(globalState, pressedNoteIdx)
                if (
                    pressedKey
                    && !item.notes.find(itemNote => itemNote.noteIndex === pressedNoteIdx)
                ) {
                    releaseKey(pressedKey);
                }
            }

            // press keys in this chord we're not already pressing
            for (const n of item.notes) {
                const key = getKeyForNote(globalState, n);
                if (!key) {
                    console.warn("Couldn't find key for note!", n);
                    continue;
                }

                if (n.sample) {
                    pressKey(key);
                    continue;
                }

                // don't want to re-pulse the note. but want the option to be able to do that, so I've
                // not set this at the  the dsp level
                if (n.noteIndex && !currentPressedNoteIndexes.has(n.noteIndex)) {
                    pressKey(key);
                }
            }
        } else if (item.t === SEQ_ITEM.REST) {
            releaseAllKeys(globalState.flatKeys);
        } else if (item.t === SEQ_ITEM.HOLD) {
            // keep the keys that were pressed last. in other words, do nothing
        }

        const bpm = line.bpm;
        const division = line.division;
        const time = bpmToInterval(bpm, division);

        // the playback visuals need to be for the note we just played, not the incremented note.
        sequencer.lastPlayingItemIdx = sequencer.currentPlayingItemIdx;
        sequencer.lastPlayingLineIdx = sequencer.currentPlayingLineIdx;
        sequencer.lastPlayingTrackIdx = sequencer.currentPlayingTrackIdx;

        sequencer.currentPlayingItemIdx++;
        if (line.items.length === sequencer.currentPlayingItemIdx) {
            sequencer.currentPlayingItemIdx = 0;
            sequencer.currentPlayingLineIdx++;
        }

        if (
            !track.lines[sequencer.currentPlayingLineIdx]
            || (
                sequencer.lastPlayingLineIdx === globalState.sequencer.currentPlayingEndLineIdx
                && sequencer.lastPlayingItemIdx === globalState.sequencer.currentPlayingEndItemIdx
            )
        ) {
            reachedLastNote = true;
        }

        playingTimeout = setTimeout(() => {
            recursiveTimeout();
        }, time);
    }

    recursiveTimeout();
}


let loadSaveSidebarOpen = false;
let loadSaveCurrentSelection = "";

function moveLoadSaveSelection(amount: number) {
    const keys = Object.keys(allSavedSongs);
    const idx = keys.indexOf(loadSaveCurrentSelection);
    if (idx === -1) {
        loadSaveCurrentSelection = keys[0];
        return;
    }

    const newIdx = clamp(idx + amount, 0, keys.length - 1);
    loadSaveCurrentSelection = keys[newIdx];
}

function getCurrentSelectedSequenceName() {
    return loadSaveCurrentSelection;
}

function loadCurrentSelectedSequence() {
    const key = getCurrentSelectedSequenceName();
    if (!allSavedSongs[key]) {
        return;
    }

    globalState.sequencer.sequencerTracks = JSON.parse(allSavedSongs[key]);
}

function LoadSavePanel(rg: RenderGroup) {
    function Item(rg: RenderGroup<{ name: string; }>) {
        return div({}, [
            rg.text(s => s.name),
            rg.style("backgroundColor", s => s.name === getCurrentSelectedSequenceName() ? "var(--bg2)" : ""),
            rg.on("click", s => {
                setInputValue(input, s.name);
                rerenderApp();
            })
        ]);
    }

    const input = el<HTMLInputElement>("INPUT", { style: "width: 100%", placeholder: "enter name here" }, [
        rg.on("input", () => {
            loadSaveCurrentSelection = input.el.value;
            rerenderApp();
        })
    ]);

    rg.preRenderFn(() => {
        setInputValue(input, getCurrentSelectedSequenceName());
    });

    return div({ style: "width: 33vw" }, [
        div({ class: "row", style: "gap: 10px" }, [
            // dont want to accidentally load over my work. smh.
            rg.if(
                s => (getCurrentSelectedSequenceName() in allSavedSongs),
                rg => rg.c(Button, c => c.render({
                    text: "Load",
                    onClick() {
                        loadCurrentSelectedSequence();
                        rerenderApp();
                    }
                })),
            ),
            input,
            rg.if(
                s => !!getCurrentSelectedSequenceName(),
                rg => rg.c(Button, c => c.render({
                    text: "Save",
                    onClick() {
                        const key = getCurrentSelectedSequenceName();
                        allSavedSongs[key] = JSON.stringify(globalState.sequencer.sequencerTracks);
                        save();
                        rerenderApp();
                    }
                })),
            )
        ]),
        rg.list(div(), Item, (getNext) => {
            for (const key in allSavedSongs) {
                getNext().render({ name: key });
            }
        })
    ]);
}

// TODO: polish. right now it's only good for local dev
let saveStateTimeout = 0;
function saveStateDebounced() {
    clearTimeout(saveStateTimeout);
    saveStateTimeout = setTimeout(() => {
        save();
    }, 100);
}

let copiedItems: SequencerLineItem[] = [];
let copiedLines: SequencerLine[] = [];

function save() {
    const currentTracks = JSON.stringify(globalState.sequencer.sequencerTracks);
    allSavedSongs["autosaved"] = currentTracks;
    localStorage.setItem("allSavedSongs", JSON.stringify(allSavedSongs));
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

    let firstRender = false;
    rg.preRenderFn(() => {
        if (!firstRender) {
            firstRender = true;
        }
    });

    // TODO: automate playing some songs.
    // let on = false;
    // setInterval(() => {
    //     if (on) {
    //         keyboardHandle.pressNote({
    //             noteIndex: getNoteIndex("A", 4, false)
    //         });
    //     } else {
    //         keyboardHandle.releaseNote({main
    //             noteIndex: getNoteIndex("A", 4, false)
    //         });
    //     }
    //     on = !on;
    // }, 1000);

    const currentlyPressedNotes: MusicNote[] = [];
    function handleKeyDown(
        key: string,
        ctrlPressed: boolean,
        shiftPressed: boolean,
        repeat: boolean
    ): boolean {
        if (isEditingTextSomewhereInDocument()) {
            return false;
        }

        if (key === "I" && ctrlPressed && shiftPressed) {
            // allow inspecting the element
            return false;
        }

        if (key === "R" && ctrlPressed) {
            // allow refreshing page
            return false;
        }

        const sequencer = globalState.sequencer;

        if (key === "Shift" && !repeat && !ctrlPressed) {
            setIsRangeSelecting(sequencer, true);
            return true;
        }

        let vAxis = 0;
        if (key === "ArrowUp") {
            vAxis = -1;
        } else if (key === "ArrowDown") {
            vAxis = 1;
        }

        if (key === "S" && ctrlPressed && shiftPressed) {
            loadSaveSidebarOpen = !loadSaveSidebarOpen;
            return true;
        }

        if (loadSaveSidebarOpen) {
            if (vAxis !== 0) {
                moveLoadSaveSelection(vAxis);
                return true;
            }

            if (key === "Enter") {
                loadCurrentSelectedSequence();
                playAll();
                return true;
            }

            if (key === "Escape") {
                loadSaveSidebarOpen = false;
                stopPlaying();
                return true;
            }

            if (key === "Delete") {
                const name = getCurrentSelectedSequenceName();
                if (name in allSavedSongs) {
                    // TODO: real UI
                    if (confirm("You sure you want to delete " + name)) {
                        delete allSavedSongs[name];
                        return true;
                    }
                }
            }

            return false;
        } 

        if (vAxis !== 0) {
            // doesn't handle wrapping correctly.
            // setCurrentLineIdx(sequencer, sequencer.currentSelectedLineIdx + vAxis);
            moveUpOrDownALine(sequencer, vAxis);
            return true;
        }

        const line = getCurrentLine(sequencer);
        if (ctrlPressed) {
            if (key === "ArrowLeft") {
                let idx = indexOfPrevLineItem(sequencer, i => i.t === SEQ_ITEM.CHORD);
                if (idx === -1) { idx = 0; }
                setCurrentItemIdx(sequencer, idx);
                return true;
            } else if (key === "ArrowRight") {
                let idx = indexOfNextLineItem(sequencer, i => i.t === SEQ_ITEM.CHORD);
                if (idx === -1) { idx = line.items.length - 1; }
                setCurrentItemIdx(sequencer, idx);
                return true;
            }
        }

        if (key === "ArrowLeft") {
            setCurrentItemIdx(sequencer, sequencer.currentSelectedItemIdx - 1);
            return true;
        } else if (key === "ArrowRight") {
            setCurrentItemIdx(sequencer, sequencer.currentSelectedItemIdx + 1);
            return true;
        }

        if (key === "Delete") {
            deleteCurrentLineItemRange(sequencer);
            return true;
        }

        if (repeat) {
            return false;
        }

        if (key === "Tab") {
            insertNewLineItemAfter(sequencer);
            saveStateDebounced();
            return true;
        }

        if (key === "_") {
            insertNewLineItemAfter(sequencer);
            setCurrentItemHold(sequencer);
            saveStateDebounced();
            return true;
        }

        if (key === "Enter" && shiftPressed) {
            insertNewLineAfter(sequencer);
            saveStateDebounced();
            return true;
        }

        if (key === "Home") {
            setCurrentItemIdx(sequencer, 0);
            return true;
        }

        if (key === "End") {
            const line = getCurrentLine(sequencer);
            setCurrentItemIdx(sequencer, line.items.length - 1);
            return true;
        }

        if ((key === "C" || key === "c") && ctrlPressed) {
            if (hasLineRangeSelect(sequencer)) {
                const track = getCurrentTrack(sequencer);
                const [start, end] = getLineSelectionRange(sequencer);
                copiedLines = track.lines.slice(start, end + 1);
                copiedItems = [];
            } else if (hasItemRangeSelect(sequencer)) {
                const line = getCurrentLine(sequencer);
                const [start, end] = getItemSelectionRange(sequencer);
                copiedItems = line.items.slice(start, end + 1);
                copiedLines = [];
            } else {
                const item = getCurrentLineItem(sequencer);
                copiedItems = [item];
                copiedLines = [];
            }

            return true;
        }

        if ((key === "V" || key === 'v') && ctrlPressed) {
            if (copiedLines.length > 0) {
                for (const line of copiedLines) {
                    insertNewLineAfter(sequencer, line);
                }
                return true;
            } else if (copiedItems.length > 0) {
                for (const item of copiedItems) {
                    insertNewLineItemAfter(sequencer, item);
                }
                return true;
            } 
        }

        if (key === "Escape") {
            if (playingTimeout) {
                stopPlaying();
                return true;
            }

            if (sequencer.currentSelectedLineStartIdx !== sequencer.currentSelectedLineEndIdx) {
                sequencer.currentSelectedLineStartIdx = -1;
                sequencer.currentSelectedLineEndIdx = -1;
                return true;
            }

            if (sequencer.currentSelectedItemStartIdx !== -1) {
                sequencer.currentSelectedItemStartIdx = -1;
                sequencer.currentSelectedItemEndIdx = -1;
                return true;
            }
        }

        const instrumentKey = globalState.flatKeys.find(k => k.keyboardKey === key.toLowerCase());
        if (instrumentKey) {
            pressKey(instrumentKey);
            const note = instrumentKey.musicNote;
            if (!currentlyPressedNotes.includes(note)) {
                currentlyPressedNotes.push(note);
            }
            setCurrentItemChord(globalState.sequencer, currentlyPressedNotes);

            saveStateDebounced();

            return true;
        }

        if (key === " ") {
            if (shiftPressed) {
                playAll();
            } else {
                playToSelection();
            }
            return true;
        }

        return false;
    }

    document.addEventListener("keydown", (e) => {
        if (handleKeyDown(e.key, e.ctrlKey || e.metaKey, e.shiftKey, e.repeat)) {
            e.preventDefault();
            rerenderApp();
        }
    })

    function handleKeyUp(
        key: string,
        ctrlPressed: boolean,
        shiftPressed: boolean,
    ): boolean {
        if (key === "Shift") {
            setIsRangeSelecting(globalState.sequencer, false);
            return true;
        }

        const instrumentKey = globalState.flatKeys.find(k => k.keyboardKey === key.toLowerCase());
        if (instrumentKey) {
            releaseKey(instrumentKey);
            currentlyPressedNotes.splice(0, currentlyPressedNotes.length);
            return true;
        }

        return false;
    }

    document.addEventListener("keyup", (e) => {
        if (handleKeyUp(e.key, e.ctrlKey || e.metaKey, e.shiftKey)) {
            e.preventDefault();
            rerenderApp();
        }
    });

    document.addEventListener("blur", () => {
        releaseAllKeys(globalState.flatKeys);
        rerenderApp();
    })

    document.addEventListener("mousemove", () => {
        globalState.sequencer.currentHoveredItemIdx = -1;
        globalState.sequencer.currentHoveredLineIdx = -1;
        rerenderApp();
    });

    window.addEventListener("resize", () => {
        rerenderApp();
    });


    return div({
        class: "absolute-fill row",
        style: "position: fixed",
    }, [
        div({ class: "col flex-1" }, [
            div({ class: "col flex-1" }, [
                div({ class: "row align-items-center b" }, [
                    div({ class: "flex-1" }),
                    rg.c(Button, c => c.render({
                        text: (loadSaveSidebarOpen ? ">" : "<") + "Load/Save",
                        onClick() {
                            loadSaveSidebarOpen = !loadSaveSidebarOpen;
                            rerenderApp();
                            rerenderApp();
                        }
                    }))
                ]),
                div({ class: "row", style: "gap: 5px" }, [
                    span({ class: "b" }, "Sequencer"),
                    rg.if(
                        s => copiedLines.length > 0,
                        rg => span({  }, [
                            rg.text(s => copiedLines.length + " lines copied")
                        ])
                    ),
                    rg.if(
                        s => copiedItems.length > 0,
                        rg => span({  }, [
                            rg.text(s => copiedItems.length + " items copied")
                        ])
                    ),
                ]),
                rg.c(Sequencer, c => c.render({ state: globalState.sequencer }))
            ]),
            div({ class: "row justify-content-center flex-1" }, [
                rg.c(Keyboard, c => c.render(null)),
            ]),
        ]),
        rg.if(
            s => loadSaveSidebarOpen,
            rg => div({ class: "col" }, [
                rg.c(LoadSavePanel, c => c.render(null))
            ])
        )
    ])
}

const globalState = newGlobalState();
let allSavedSongs: Record<string, string> = {};

const existinSavedSongs = localStorage.getItem("allSavedSongs");
if (existinSavedSongs) {
    allSavedSongs = JSON.parse(existinSavedSongs);
    globalState.sequencer.sequencerTracks = JSON.parse(allSavedSongs.autosaved);
}

const root = newInsertable(document.body);
let app: Component<any, any> | undefined;
function rerenderApp() {
    app?.render(null);
}

// initialize the app.
(async () => {
    await initDspLoopInterface({
        onCurrentPlayingChanged: rerenderApp
    });

    // Our code only works after the audio context has loaded.
    app = newComponent(App);
    appendChild(root, app);
    rerenderApp();
})();
