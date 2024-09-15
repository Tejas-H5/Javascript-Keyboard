import { Button } from "src/components/button";
import "src/css/layout.css";
import { appendChild, Component, div, el, getState, isEditingTextSomewhereInDocument, newComponent, newInsertable, RenderGroup, setCssVars, setInputValue, span } from "src/utils/dom-utils";
import { getCurrentOscillatorGain, getDspInfo, initDspLoopInterface, pressKey, releaseAllKeys, releaseKey, schedulePlayback } from "./dsp-loop-interface";
import "./main.css";
import { getItemSequencerText, Sequencer } from "./sequencer";
import { ChordItem, deleteCurrentLineItemRange, getCurrentLine, getCurrentLineItem, getCurrentPlayingTime, getCurrentTrack, getItemSelectionRange, getKeyForNote, getLineSelectionRange, hasItemRangeSelect, hasLineRangeSelect, indexOfNextLineItem, indexOfPrevLineItem, insertNewLineAfter, insertNewLineItemAfter, InstrumentKey, moveUpOrDownALine, newGlobalState, resetSequencer, ScheduledKeyPress, SEQ_ITEM, SequencerLine, SequencerLineItem, setCurrentItemChord, setCurrentItemHold, setCurrentItemIdx, setIsRangeSelecting } from "./state";
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
        rg.skipErrorBoundary = true;

        function KeyboardKey(rg: RenderGroup<{
            key: InstrumentKey;
            keySize: number;
        }>) {
            rg.skipErrorBoundary = true;

            function ApproachSquare(rg: RenderGroup<{
                currentTime: number;
                keyTime: number;
            }>) {
                rg.skipErrorBoundary = true;

                const keyMarkedColor = `rgba(0, 0, 255)`;

                let t = 0;
                let scale = 0;
                rg.preRenderFn(s => {
                    t = s.keyTime;
                    scale = 250 * Math.max(0, t)
                });

                return div({}, [
                    div({
                        class: "absolute",
                        style: `top: 0; left: 0; bottom: 0; right: 0; background-color: ${keyMarkedColor};`
                    }, [
                        rg.style("opacity", s => "" + t / 10),
                    ]),
                    div({
                        class: "absolute",
                        style: "border: 5px solid var(--fg); opacity: 1;"
                    }, [
                        rg.style("top", s => -scale + "px"),
                        rg.style("left", s => -scale + "px"),
                        rg.style("bottom", s => -scale + "px"),
                        rg.style("right", s => -scale + "px"),
                    ]),
                ]);
            }

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
                rg.list(div(), ApproachSquare, (getNext, s) => {
                    // need to iterate over all the notes within the approach window, 
                    // could need multiple approach squares for this key.
                    const sequencer = globalState.sequencer;
                    if (!sequencer.isPlaying) {
                        return;
                    }

                    const currentTime = getCurrentPlayingTime(sequencer);

                    const scheduledKeyPresses = sequencer._scheduledKeyPresses;
                    for (let i = 0; i < scheduledKeyPresses.length; i++) {
                        const scheduledPress = scheduledKeyPresses[i];
                        if (scheduledPress.keyId !== s.key.index) {
                            continue;
                        }
                        if (!scheduledPress.pressed) {
                            continue;
                        }

                        const APPROACH_WINDOW = 500;
                        const PERSIST_WINDOW = 200;

                        const relativeTime = currentTime - scheduledPress.time;
                        if (relativeTime < -APPROACH_WINDOW) {
                            continue;
                        }

                        if (relativeTime > PERSIST_WINDOW) {
                            continue;
                        }

                        getNext().render({
                            currentTime, 
                            keyTime: -relativeTime / APPROACH_WINDOW,
                        });
                    }
                }),
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
            const c = getNext();
            c.render({
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

    playingTimeout = 0;
    reachedLastNote = false;

    const sequencer = globalState.sequencer;
    sequencer._scheduledKeyPresses = [];
    schedulePlayback([]);
    sequencer.startPlayingTime = 0;
    sequencer.isPlaying = false;
}

function playToSelection(speed: number) {
    const sequencer = globalState.sequencer;

    sequencer.currentPlayingSpeed = speed;

    if (hasLineRangeSelect(sequencer)) {
        const [start, end] = getLineSelectionRange(sequencer);
        const track = getCurrentTrack(sequencer);
        const endLine = track.lines[end];

        sequencer.startPlayingLineIdx = start;
        sequencer.startPlayingEndLineIdx = end;
        sequencer.currentPlayingItemIdx = 0;
        sequencer.startPlayingEndItemIdx = endLine.items.length - 1;

        sequencer.startPlayingTrackIdx = 0;
    } else if (hasItemRangeSelect(sequencer)) {
        const [start, end] = getItemSelectionRange(sequencer);
        sequencer.startPlayingLineIdx = sequencer.currentSelectedLineIdx;
        sequencer.startPlayingEndLineIdx = sequencer.currentSelectedLineIdx;
        sequencer.currentPlayingItemIdx = start;
        sequencer.startPlayingEndItemIdx = end;
    } else {
        sequencer.startPlayingLineIdx = sequencer.currentSelectedLineIdx;
        sequencer.startPlayingEndLineIdx = sequencer.currentSelectedLineIdx;
        sequencer.currentPlayingItemIdx = 0;
        sequencer.startPlayingEndItemIdx = sequencer.currentSelectedItemIdx;

        sequencer.startPlayingTrackIdx = 0;
    }


    startPlaying();
}

function playAll(speed: number) {
    const sequencer = globalState.sequencer;

    sequencer.currentPlayingSpeed = speed;

    sequencer.startPlayingLineIdx = 0;
    sequencer.startPlayingEndLineIdx = 9999999999;
    sequencer.currentPlayingItemIdx = 0;
    sequencer.startPlayingEndItemIdx = 9999999999;
    
    sequencer.startPlayingTrackIdx = 0;

    startPlaying();
}

function startPlaying() {
    stopPlaying();

    // schedule the keys that need to be pressed, and then send them to the DSP loop to play them.
    const sequencer = globalState.sequencer;
    sequencer.startPlayingTime = Date.now();
    sequencer.isPlaying = true;

    // clear scheduled times
    {
        for (const track of sequencer.tracks) {
            for (const line of track.lines) {
                for (const item of line.items) {
                    item._scheduledStart = -1;
                    item._scheduledEnd = -1;
                }
            }
        }
    }
    
    const track = getCurrentTrack(sequencer);
    const scheduledKeyPresses: ScheduledKeyPress[] = [];
    const end = Math.min(sequencer.startPlayingEndLineIdx, track.lines.length - 1);
    let itemIdx = sequencer.currentPlayingItemIdx;
    let nextTime = 500;
    const currentPressed: [ChordItem, InstrumentKey][] = [];

    const scheduleReleaseOfCurrentlyPressed = (currentTime: number, trackIdx: number, lineIdx: number, itemIdx: number) => {
        // release everything we've pressed
        for (const [chordItem, key] of currentPressed) {
            const note = key.musicNote;
            if (note.sample) {
                // release is invalid for samples.
                continue;
            }

            chordItem._scheduledEnd = currentTime;
            scheduledKeyPresses.push({
                time: currentTime,
                keyId: key.index,
                trackIdx,
                lineIdx,
                itemIdx,
                noteIndex: note.noteIndex,
                sample: note.sample,
                pressed: false,
            });
        }

        currentPressed.splice(0, currentPressed.length);
    }

    outer: for (
        let lineIdx = sequencer.startPlayingLineIdx; 
        lineIdx <= end; 
        lineIdx++
    ) {
        const line = track.lines[lineIdx];


        for(let i = itemIdx; i < line.items.length; i++) {
            if (lineIdx === end && (i - 1) === sequencer.startPlayingEndItemIdx) {
                // playback should finish about here!
                break outer;
            }

            const item = line.items[i];

            const bpm = line.bpm;
            const division = line.division;
            const time = bpmToInterval(bpm, division) / sequencer.currentPlayingSpeed;

            const currentTime = nextTime;
            nextTime += time;

            item._scheduledStart = currentTime;
            item._scheduledEnd = nextTime;

            if (item.t === SEQ_ITEM.CHORD) {
                // press everything we've not already pressed
                for (const n of item.notes) {
                    const key = getKeyForNote(globalState, n);
                    if (!key) {
                        // don't schedule stuff we can't press on the keyboard
                        continue;
                    }

                    if (currentPressed.find(v => v[1].index === key.index)) {
                        // already held down.
                        continue;
                    }

                    scheduledKeyPresses.push({
                        time: currentTime,
                        trackIdx: sequencer.startPlayingTrackIdx, 
                        lineIdx,
                        itemIdx: i,
                        noteIndex: n.noteIndex,
                        sample: n.sample,
                        keyId: key.index,
                        pressed: true,
                    });
                    currentPressed.push([item, key]);
                }
                continue;
            }

            if (item.t === SEQ_ITEM.HOLD) {
                // keep everything we've pressed held down. in other words, do nothing
                continue;
            }

            if (item.t === SEQ_ITEM.REST) {
                // release everything we've pressed
                scheduleReleaseOfCurrentlyPressed(
                    currentTime, 
                    sequencer.startPlayingTrackIdx, 
                    lineIdx,
                    i,
                );
                continue;
            }
        }

        itemIdx = 0;
    }

    scheduleReleaseOfCurrentlyPressed(nextTime, -1, -1, -1,);
    sequencer.playingDuration = nextTime + 1000;

    sequencer._scheduledKeyPresses = scheduledKeyPresses;
    schedulePlayback(scheduledKeyPresses);
    console.log(scheduledKeyPresses);
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

    globalState.sequencer.tracks = JSON.parse(allSavedSongs[key]);
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
                        allSavedSongs[key] = JSON.stringify(globalState.sequencer.tracks);
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
    const currentTracks = JSON.stringify(globalState.sequencer.tracks);
    allSavedSongs["autosaved"] = currentTracks;
    localStorage.setItem("allSavedSongs", JSON.stringify(allSavedSongs));
}

function App(rg: RenderGroup) {
    setCssVars({
        "--foreground": "black",
        "--background": "white",
        "--key-size": "75px",
    });

    rg.preRenderFn(() => {
        const sequencer = globalState.sequencer;
        const currentTime = getCurrentPlayingTime(sequencer);
        if (currentTime > sequencer.playingDuration) {
            stopPlaying();
        }
    });

    function newSliderTemplateFn(name: string, initialValue: number, fn: (val: number) => void) {
        return rg.c(Slider, (c, s) => c.render({
            label: name,
            min: 0.01, max: 1, step: 0.01,
            value: initialValue,
            onChange(val) { fn(val); rerenderApp(); },
        }));
    }

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

        if (key === "K" && ctrlPressed && shiftPressed) {
            sequencer.settings.showKeysInsteadOfABCDEFG = !sequencer.settings.showKeysInsteadOfABCDEFG;
            return true;
        }

        if (loadSaveSidebarOpen) {
            if (vAxis !== 0) {
                moveLoadSaveSelection(vAxis);
                return true;
            }

            if (key === "Enter") {
                loadCurrentSelectedSequence();
                playAll(1);
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
            setIsRangeSelecting(sequencer, false);
            insertNewLineItemAfter(sequencer);
            saveStateDebounced();
            return true;
        }

        if (key === "_") {
            setIsRangeSelecting(sequencer, false);
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
            const speed = ctrlPressed ? 0.5 : 1;
            if (shiftPressed) {
                playAll(speed);
            }  else {
                playToSelection(speed);
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
        if (
            globalState.sequencer.currentHoveredItemIdx !== -1
            || globalState.sequencer.currentHoveredLineIdx !== -1
        ) {
            globalState.sequencer.currentHoveredItemIdx = -1;
            globalState.sequencer.currentHoveredLineIdx = -1;
            rerenderApp();
        }
    });

    window.addEventListener("resize", () => {
        rerenderApp();
    });


    function clearSequencer() {
        if (confirm("Are you sure you want to clear your progress?")) {
            resetSequencer(globalState);
            rerenderApp();
        }
    }

    function toggleLoadSaveSiderbar() {
        loadSaveSidebarOpen = !loadSaveSidebarOpen;
        rerenderApp();
        rerenderApp();
    }

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
                        onClick: toggleLoadSaveSiderbar
                    }))
                ]),
                div({ class: "row", style: "gap: 5px" }, [
                    span({ class: "b" }, "Sequencer"),
                    rg.if(
                        s => copiedLines.length > 0,
                        rg => rg.text(s => copiedLines.length + " lines copied")
                    ),
                    rg.if(
                        s => copiedItems.length > 0,
                        rg => rg.text(s => copiedItems.length + " items copied")
                    ),
                    div({ class: "flex-1" }),
                    rg.c(Button, c => c.render({
                        text: "Clear All",
                        onClick: clearSequencer
                    }))
                ]),
                rg.c(Sequencer, c => c.render({ state: globalState.sequencer, globalState }))
            ]),
            // div({ class: "row justify-content-center flex-1" }, [
            //     rg.c(Teleprompter, c => c.render(null)),
            // ]),
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
    globalState.sequencer.tracks = JSON.parse(allSavedSongs.autosaved);
}

const root = newInsertable(document.body);
let app: Component<any, any> | undefined;
function rerenderApp() {
    app?.render(null);
}

// initialize the app.
(async () => {
    await initDspLoopInterface({
        render: () => {
            rerenderApp();

            const dspInfo = getDspInfo();
            const sequencer = globalState.sequencer;

            // resync the current time with the DSP time. 
            // it's pretty imperceptible if we do it frequently enough, since it's only tens of ms.
            if (sequencer.isPlaying) {
                const currentEstimatedScheduledTime = getCurrentPlayingTime(sequencer);
                const difference = dspInfo.scheduledPlaybackTime - currentEstimatedScheduledTime;
                sequencer.startPlayingTime -= difference;
            }
        }
    });

    // Our code only works after the audio context has loaded.
    app = newComponent(App);
    appendChild(root, app);

    // render to the dom at 60 fps (!)
    // (based??)
    setInterval(() => {
        if (!app) {
            return;
        }

        app.renderWithCurrentState();
    }, 1000 / 60);

    rerenderApp();
})();
