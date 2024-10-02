import { Button } from "src/components/button";
import "src/css/layout.css";
import {
    appendChild,
    Component,
    div,
    el,
    getState,
    isEditingTextSomewhereInDocument,
    newComponent,
    newInsertable,
    RenderGroup,
    setCssVars,
    setInputValue,
    span
} from "src/utils/dom-utils";
import {
    getCurrentOscillatorGain,
    getDspInfo,
    initDspLoopInterface,
    pressKey,
    releaseAllKeys,
    releaseKey,
    schedulePlayback
} from "./dsp-loop-interface";
import "./main.css";
import { Sequencer } from "./sequencer";
import {
    deepCopyJSONSerializable,
    deleteRange,
    getCurrentPlayingTime,
    getCursorStartBeats,
    getItemIdxAtBeat,
    getItemStartBeats,
    getPrevItemIndex,
    getSelectionRange,
    InstrumentKey,
    mutateSequencerTimeline,
    newGlobalState,
    recomputeState,
    resetCursorEndToCursorStart,
    resetSequencer,
    setCursorBeats,
    setCursorDivisor,
    setIsRangeSelecting,
    setTimelineNoteAtPosition,
    TIMELINE_ITEM_NOTE,
    timelineHasNoteAtPosition,
    TimelineItem
} from "./state";
import { clamp } from "./utils/math-utils";

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
                        rg.style("opacity", () => "" + t),
                    ]),
                    // This osu! style border kinda whack ngl.
                    // div({
                    //     class: "absolute",
                    //     style: "border: 5px solid var(--fg); opacity: 1;"
                    // }, [
                    //     rg.style("top", () => -scale + "px"),
                    //     rg.style("left", () => -scale + "px"),
                    //     rg.style("bottom", () => -scale + "px"),
                    //     rg.style("right", () => -scale + "px"),
                    // ]),
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
                rg.style("color", () => signal > 0.1 ? `var(--bg)` : `var(--fg)`),
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

    return rg.list(root, KeyboardRow, (getNext) => {
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

    const [start, end] = getSelectionRange(sequencer);
    if (start !== -1 && end !== -1) {
        startPlaying(start, end, speed);
        return;
    }

    const idx = getPrevItemIndex(sequencer.timeline, getCursorStartBeats(sequencer));

    // TODO: play starting closer to the cursor's start instead of the very stat
    startPlaying(0, idx, speed);
}

function playAll(speed: number) {
    const sequencer = globalState.sequencer;
    startPlaying(0, sequencer.timeline.length - 1, speed);
}

function startPlaying(startIdx: number, endIdx: number, speed: number) {
    // TODO: fix/rework. this was written before the beats refactor
    /*
    stopPlaying();

    const sequencer = globalState.sequencer;
    sequencer.startPlayingTime = Date.now();
    sequencer.isPlaying = true;
    for (const item of sequencer.timeline) {
        item._scheduledStartTime = -1;
        item._endTime = -1;
    }

    // schedule the keys that need to be pressed, and then send them to the DSP loop to play them.

    const scheduledKeyPresses: ScheduledKeyPress[] = [];
    for (let i = startIdx; i < sequencer.timeline.length && i <= endIdx; i++) {
        const item = sequencer.timeline[i];
        if (item.t === TIMELINE_ITEM_BPM) {
            // this bpm thing doesn't do anything to the playback - it's purely for the UI
            continue;
        }

        if (item.t === TIMELINE_ITEM_CHORD) {
            for (const n of item.notes) {
                const key = getKeyForNote(globalState, n);
                if (!key) {
                    continue;
                }

                scheduledKeyPresses.push({
                    time: item._scheduledStartTime,
                    keyId: key.index,
                    pressed: true,
                    noteIndex: n.noteIndex,
                    sample: n.sample,
                });

                scheduledKeyPresses.push({
                    time: item._endTime,
                    keyId: key.index,
                    pressed: false,
                    noteIndex: n.noteIndex,
                    sample: n.sample,
                });
            }
            continue;
        }

        unreachable(item);
    }

    scheduledKeyPresses.sort((a, b) => a.time - b.time);
    sequencer._scheduledKeyPresses = scheduledKeyPresses;
    schedulePlayback(scheduledKeyPresses);
    */
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

    mutateSequencerTimeline(globalState.sequencer, tl => {
        tl.splice(0, tl.length);
        tl.push(...JSON.parse(allSavedSongs[key]));
    });
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
                () => (getCurrentSelectedSequenceName() in allSavedSongs),
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
                () => !!getCurrentSelectedSequenceName(),
                rg => rg.c(Button, c => c.render({
                    text: "Save",
                    onClick() {
                        const key = getCurrentSelectedSequenceName();
                        allSavedSongs[key] = JSON.stringify(globalState.sequencer.timeline);
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

let copiedItemsStartOffsetBeats = 0;
let copiedItems: TimelineItem[] = [];

function save() {
    const currentTracks = JSON.stringify(globalState.sequencer.timeline);
    allSavedSongs["autosaved"] = currentTracks;
    localStorage.setItem("allSavedSongs", JSON.stringify(allSavedSongs));
}

function HelpInfo(rg: RenderGroup<{ onClose(): void; }>) {
    return div({ style: "padding: 10px" }, [
        el("H3", {}, [
            "Help"
        ]),
        div({}, [
            "This website can be downloaded to your PC and ran offline!",
            "This website/rhythm game is currently a work in progress. I'm not quite sure how it will end up.",
        ]),
        el("H3", {}, [
            "Sequencer controls"
        ]),
        div({}, [
            el("UL", {}, [
                el("LI", {}, "Hold down multiple keys to input a chord."),
                el("LI", {}, "Press TAB to add a '.'. This is a REST - it releases all the keys that are currently held."),
                el("LI", {}, "Type an underscore character '_' to add a '_'. This is a hold - it keeps those keys held down for one more unit."),
                el("LI", {}, "The '120' and the 1 / 4 are the BPM and interval. Change these to edit the speed and granualrity of the notes"),
                el("LI", {}, "Arrow keys to move around, shift to select stuff, ctrl+c, ctrl+v to copy-paste notes (not to clipboard, just in this program)"),
                el("LI", {}, "Shift + Enter to make a new line. Lines play one after another. You would create new lines for organisation of measures, and because different lines can have different bpms."),
                el("LI", {}, "[Space] to play from the start of the current line to the currently selected note. Shift+Space plays from the very start to the very end, and Ctrl+Space plays at half speed."),
            ])
        ]),
        rg.c(Button, (c, s) => c.render({
            text: "Yep, I understand perfectly. makes sense to me!",
            onClick: () => s.onClose(),
        })),
    ]);
}

function App(rg: RenderGroup) {
    setCssVars({
        "--foreground": "black",
        "--background": "white",
        "--key-size": "75px",
    });

    rg.preRenderFn(() => {
        recomputeState(globalState);

        const sequencer = globalState.sequencer;
        const currentTime = getCurrentPlayingTime(sequencer);
        if (currentTime > sequencer.playingDuration) {
            stopPlaying();
        }
    });

    function newSliderTemplateFn(name: string, initialValue: number, fn: (val: number) => void) {
        return rg.c(Slider, (c) => c.render({
            label: name,
            min: 0.01, max: 1, step: 0.01,
            value: initialValue,
            onChange(val) { fn(val); rerenderApp(); },
        }));
    }

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
            // TODO: move thread selection thread up/down 
            return true;
        }

        if (ctrlPressed) {
            if (key === "ArrowLeft") {
                setCursorBeats(sequencer, -1);
                return true;
            } else if (key === "ArrowRight") {
                setCursorBeats(sequencer, 1);
            }
        }

        if (shiftPressed && (
            key === "!" || key === "1"
            || key === "@" || key === "2"
            || key === "#" || key === "3"
        )) {

            const cycleThroughDivisors = (divisors: number[]) => {
                for (let i = 0; i < divisors.length; i++) {
                    const curr = divisors[i];
                    const next = divisors[(i + 1) % divisors.length];
                    let cursorDivisor = sequencer.cursorDivisor;
                    if (cursorDivisor === curr) {
                        setCursorDivisor(sequencer, next);
                        return;
                    }
                }

                setCursorDivisor(sequencer, divisors[0]);
            }

            if (key === "!" || key === "1") {
                setCursorDivisor(sequencer, 1);
            } else if (key === "@" || key === "2") {
                cycleThroughDivisors([2, 4, 8, 16]);
            } else if (key === "#" || key === "3") {
                cycleThroughDivisors([3, 6, 9, 12, 15]);
            } else if (key === "$" || key === "4") {
                cycleThroughDivisors([4, 7, 10, 11, 13, 14,]);
            }
        }

        // need to move by the current beat snap.
        if (key === "ArrowLeft" || key === "ArrowRight") {
            let amount = key === "ArrowLeft" ? -1 : 1;
            const cursorBeats = sequencer.cursorStart;
            setCursorBeats(sequencer, cursorBeats + amount);
            return true;
        }

        if (key === "Delete") {
            const [start, end] = getSelectionRange(sequencer);
            if (start !== -1 && end !== -1) {
                deleteRange(sequencer, start, end);
                return true;
            }

            const idx = getItemIdxAtBeat(sequencer, getCursorStartBeats(sequencer));
            if (idx !== -1) {
                deleteRange(sequencer, idx, idx);
                return true;
            }
        }

        if (repeat) {
            return false;
        }

        if ((key === "C" || key === "c") && ctrlPressed) {
            const [start, end] = getSelectionRange(sequencer);
            if (start !== -1 && end !== -1) {
                copiedItems = sequencer.timeline.slice(start, end + 1);
                copiedItemsStartOffsetBeats = getItemStartBeats(copiedItems[0]) - getCursorStartBeats(sequencer);
                return true;
            }
        }

        if ((key === "V" || key === 'v') && ctrlPressed) {
            if (copiedItems.length > 0) {
                mutateSequencerTimeline(sequencer, tl => {
                    for (const item of copiedItems) {
                        const newItem = deepCopyJSONSerializable(item);
                        tl.push(newItem);
                    }
                });
                return true;
            }
        }

        if (key === "Escape") {
            if (sequencer.isPlaying) {
                stopPlaying();
                return true;
            }

            if (sequencer.isRangeSelecting) {
                setIsRangeSelecting(sequencer, false);
                resetCursorEndToCursorStart(sequencer);
                return true;
            }
        }

        const instrumentKey = globalState.flatKeys.find(k => k.keyboardKey === key.toLowerCase());
        if (instrumentKey) {
            // TODO: Just do one or the other based on if we're in 'edit' mode or play mode ?

            // play the instrument
            {
                pressKey(instrumentKey);
            }

            // insert notes into the sequencer
            {
                mutateSequencerTimeline(sequencer, tl => {
                    const pos = sequencer.cursorStart;
                    const divisor = sequencer.cursorDivisor;
                    const note = instrumentKey.musicNote;

                    const hasNote = timelineHasNoteAtPosition(tl, pos, divisor, note);
                    setTimelineNoteAtPosition(
                        tl,
                        pos,
                        divisor,
                        note,
                        1,
                        !hasNote
                    );
                });

                saveStateDebounced();
            }

            return true;
        }

        if (key === " ") {
            const speed = ctrlPressed ? 0.5 : 1;
            if (shiftPressed) {
                playAll(speed);
            } else {
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
        if (globalState.sequencer.currentHoveredTimelineItemIdx !== -1) {
            globalState.sequencer.currentHoveredTimelineItemIdx = -1;
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

    let helpOpen = false;
    function toggleHelp() {
        helpOpen = !helpOpen;
        rerenderApp();
    }

    function toggleLoadSaveSiderbar() {
        loadSaveSidebarOpen = !loadSaveSidebarOpen;
        // needs it twice for some reason...
        rerenderApp();
        rerenderApp();
    }

    return div({
        class: "absolute-fill row",
        style: "position: fixed",
    }, [
        div({ class: "col flex-1" }, [
            div({ class: "row align-items-center b" }, [
                div({ class: "flex-1" }),
                rg.c(Button, c => c.render({
                    text: "Help?",
                    onClick: toggleHelp
                })),
                rg.c(Button, c => c.render({
                    text: (loadSaveSidebarOpen ? ">" : "<") + "Load/Save",
                    onClick: toggleLoadSaveSiderbar
                }))
            ]),
            rg.if(
                () => helpOpen,
                rg => rg.c(HelpInfo, c => c.render({
                    onClose() {
                        helpOpen = false;
                        rerenderApp();
                    }
                })),
            ),
            div({ class: "row", style: "gap: 5px" }, [
                span({ class: "b" }, "Sequencer"),
                rg.if(
                    () => copiedItems.length > 0,
                    rg => rg.text(() => copiedItems.length + " items copied")
                ),
                div({ class: "flex-1" }),
                rg.c(Button, c => c.render({
                    text: "Clear All",
                    onClick: clearSequencer
                }))
            ]),
            rg.c(Sequencer, c => c.render({
                state: globalState.sequencer,
                globalState,
                render: rerenderApp
            })),
            // div({ class: "row justify-content-center flex-1" }, [
            //     rg.c(Teleprompter, c => c.render(null)),
            // ]),
            div({ class: "row justify-content-center flex-1" }, [
                rg.c(Keyboard, c => c.render(null)),
            ]),
        ]),
        rg.if(
            () => loadSaveSidebarOpen,
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
    mutateSequencerTimeline(globalState.sequencer, tl => {
        tl.splice(0, tl.length);
        tl.push(...JSON.parse(allSavedSongs.autosaved));
    });
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

            if (dspInfo.scheduledPlaybackTime === -1) {
                stopPlaying();
            } else if (sequencer.isPlaying) {
                // resync the current time with the DSP time. 
                // it's pretty imperceptible if we do it frequently enough, since it's only tens of ms.
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

        // if (globalState.sequencer.isPlaying) 
        {
            app.renderWithCurrentState();
        }
    }, 1000 / 60);

    rerenderApp();
})();
