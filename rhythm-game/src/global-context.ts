import { releaseAllKeys, ScheduledKeyPress, schedulePlayback } from "./dsp-loop-interface";
import {
    getBeatsRange,
    getBpm,
    getBpmChangeItemAtBeats,
    getCursorStartBeats,
    getItemEndBeats,
    getItemIdxAtBeat,
    getItemStartBeats,
    getLastMeasureBeats,
    getNextItemIndex,
    getPrevItemIndex,
    getRangeSelectionEndBeats,
    getRangeSelectionStartBeats,
    getSelectionRange,
    hasRangeSelection,
    isItemUnderCursor,
    mutateSequencerTimeline,
    newSequencerState,
    SequencerState,
    TIMELINE_ITEM_BPM,
    TIMELINE_ITEM_MEASURE,
    TIMELINE_ITEM_NOTE,
    TimelineItem
} from "./state/sequencer-state";
import { unreachable } from "src/utils/asserts";
import { getKeyForNote, KeyboardState, newKeyboardState } from "./state/keyboard-state";
import { newSavedState, SavedState } from "./state/saved-state";
import { clamp } from "src/utils/math-utils";
import { newUiState, UIState } from "./state/ui-state";
import { deepCopyJSONSerializable } from "./utils/deep-copy-json";
import { recursiveShallowCopyRemovingComputedFields } from "./utils/serialization-utils";
import { beatsToMs } from "./utils/music-theory-utils";

export type GlobalContext = {
    keyboard: KeyboardState;
    sequencer: SequencerState;
    ui: UIState;
    savedState: SavedState; 
    render(): void;
    dt: DOMHighResTimeStamp;
}

export function newGlobalContext(renderFn: () => void): GlobalContext {
    return { 
        keyboard: newKeyboardState(),
        sequencer: newSequencerState(),
        ui: newUiState(),
        savedState: newSavedState(),
        render: renderFn,
        dt: 0,
    };
}

export function resetSequencer(ctx: GlobalContext) {
    ctx.sequencer = newSequencerState();
}

export function load(ctx: GlobalContext) {
    const savedState = localStorage.getItem("savedState");
    if (!savedState) {
        return;
    }

    ctx.savedState = JSON.parse(savedState);
    ctx.ui.loadSave.loadedChartName = "autosaved";
}

export function getCurrentSelectedChartName(ctx: GlobalContext) {
    return ctx.ui.loadSave.selectedChartName;
}

// TODO: save the individual chart...
export function saveAllCharts(ctx: GlobalContext) {
    const { sequencer, savedState } = ctx;

    const serialzed = recursiveShallowCopyRemovingComputedFields(sequencer.timeline);
    const currentTracks = JSON.stringify(serialzed);

    savedState.allSavedSongs["autosaved"] = currentTracks;

    localStorage.setItem("savedState", JSON.stringify(savedState));
    console.log("saved!");
}

export function stopPlaying({ sequencer } : GlobalContext) {
    clearTimeout(sequencer.playingTimeout);
    releaseAllKeys();

    sequencer.playingTimeout = 0;
    sequencer.reachedLastNote = false;

    sequencer.startPlayingTime = 0;
    sequencer.isPlaying = false;
    sequencer.scheduledKeyPresses = [];
    schedulePlayback([]);
}

export function playCurrentInterval(
    ctx : GlobalContext,
    speed: number
) {
    const { sequencer } = ctx;
    if (hasRangeSelection(sequencer)) {
        const a = getRangeSelectionStartBeats(sequencer);
        const b = getRangeSelectionEndBeats(sequencer);
        startPlaying(ctx, a, b, speed);
        return;
    }

    // Play from the last measure till now.
    const cursorStart = getCursorStartBeats(sequencer);
    const lastMeasureStart = getLastMeasureBeats(sequencer, cursorStart);
    startPlaying(ctx, lastMeasureStart, cursorStart, speed);
}

export function playAll(
    ctx : GlobalContext,
    speed: number
) {
    startPlaying(ctx, 0, ctx.sequencer.timeline.length - 1, speed);
}

export function startPlaying(
    { sequencer, keyboard }: GlobalContext,
    startBeats: number,
    endBeats: number,
    speed: number,
) {
    const [startIdx, endIdx] = getBeatsRange(sequencer, startBeats, endBeats);
    if (startIdx === -1 || endIdx === -1) {
        return;
    }

    const timeline = sequencer.timeline;
    const firstItem: TimelineItem | undefined = timeline[startIdx];
    if (!firstItem) {
        return;
    }

    const startItemBeats = getItemStartBeats(timeline[startIdx]);
    const bpmChange = getBpmChangeItemAtBeats(sequencer, startBeats);
    const bpm = getBpm(bpmChange);
    const leadInBeats = startItemBeats - startBeats;
    const leadInTime = beatsToMs(leadInBeats, bpm);

    sequencer.startPlayingTime = Date.now() + leadInTime;
    sequencer.startPlayingIdx = startIdx;
    sequencer.endPlayingIdx = endIdx;
    sequencer.isPlaying = true;

    // schedule the keys that need to be pressed, and then send them to the DSP loop to play them.

    const scheduledKeyPresses: ScheduledKeyPress[] = [];
    const firstItemStartTime = timeline[startIdx]._scheduledStart - leadInTime;

    for (let i = startIdx; i < timeline.length && i <= endIdx; i++) {
        const item = timeline[i];
        if (item.type === TIMELINE_ITEM_BPM || item.type === TIMELINE_ITEM_MEASURE) {
            // can't be played.
            continue;
        }

        if (item.type === TIMELINE_ITEM_NOTE) {
            const n = item.note;
            const key = getKeyForNote(keyboard, n);
            if (!key) {
                // this note can't be played either
                continue;
            }

            scheduledKeyPresses.push({
                time: item._scheduledStart - firstItemStartTime,
                keyId: key.index,
                pressed: true,
                noteIndex: n.noteIndex,
                sample: n.sample,
            });

            if (item.note.noteIndex) {
                // notes need to be released, unlike samples.
                scheduledKeyPresses.push({
                    time: item._scheduledEnd - firstItemStartTime,
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

    for (const scp of scheduledKeyPresses) {
        scp.time /= speed;
    }

    scheduledKeyPresses.sort((a, b) => a.time - b.time);

    sequencer.scheduledKeyPresses = scheduledKeyPresses;
    sequencer.scheduledKeyPressesFirstItemStart = firstItemStartTime;
    sequencer.scheduledKeyPressesPlaybackSpeed = speed;
    schedulePlayback(scheduledKeyPresses);
}


export function saveStateDebounced(ctx: GlobalContext) {
    const ui = ctx.ui.loadSave;

    clearTimeout(ui.saveStateTimeout);
    ui.saveStateTimeout = setTimeout(() => {
        saveAllCharts(ctx);
    }, 100);
}

export function moveLoadSaveSelection(ctx: GlobalContext, amount: number) {
    const ui = ctx.ui.loadSave;

    const keys = Object.keys(ctx.savedState.allSavedSongs);
    const idx = keys.indexOf(ui.selectedChartName);
    if (idx === -1) {
        ui.selectedChartName = keys[0];
        return;
    }

    const newIdx = clamp(idx + amount, 0, keys.length - 1);
    ui.selectedChartName = keys[newIdx];
}

export function loadChart(ctx: GlobalContext, chartName: string) {
    const ui = ctx.ui.loadSave;

    if (!ctx.savedState.allSavedSongs[chartName]) {
        return;
    }

    const json = ctx.savedState.allSavedSongs[chartName];
    ui.loadedChartName = chartName;
    mutateSequencerTimeline(ctx.sequencer, tl => {
        tl.splice(0, tl.length);
        tl.push(...JSON.parse(json));
    });
}

export function copyNotesToTempStore(ctx: GlobalContext, startIdx: number, endIdx: number): boolean {
    const { sequencer, ui } = ctx;

    if (startIdx === -1 || endIdx === -1) {
        return false;
    }

    ui.copied.items = sequencer.timeline.slice(startIdx, endIdx + 1)
        .map(deepCopyJSONSerializable);

    ui.copied.positionStart = Math.min(
        getCursorStartBeats(sequencer),
        getItemStartBeats(sequencer.timeline[startIdx])
    );

    return true;
}

export function pasteNotesFromTempStore(ctx: GlobalContext): boolean {
    const { ui, sequencer } = ctx;

    if (ui.copied.items.length === 0) {
        return false;
    }

    mutateSequencerTimeline(sequencer, tl => {
        const delta = getCursorStartBeats(sequencer) - ui.copied.positionStart;
        for (const item of ui.copied.items) {
            const newItem = deepCopyJSONSerializable(item);

            // TODO: attempt to use clean numbers/integers here.
            // This is just my noob code for now
            const beats = getItemStartBeats(newItem);
            const newBeats = beats + delta;
            newItem.start = newBeats * newItem.divisor;

            tl.push(newItem);
        }
    });

    return true;
}

export function setViewEditChart(ctx: GlobalContext, chartName: string) {
    ctx.ui.currentView = "edit-chart";
    loadChart(ctx, chartName);
}

export function setViewPlayChart(ctx: GlobalContext, chartName: string) {
    ctx.ui.currentView = "play-chart";
    loadChart(ctx, chartName);
}

export function setViewChartSelect(ctx: GlobalContext) {
    ctx.ui.currentView = "chart-select";
}

export function setViewStartScreen(ctx: GlobalContext) {
    ctx.ui.currentView = "startup";
}
