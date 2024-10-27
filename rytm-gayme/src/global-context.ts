import { releaseAllKeys, ScheduledKeyPress, schedulePlayback } from "./dsp-loop-interface";
import {
    getCursorStartBeats,
    getSelectionRange,
    hasRangeSelection,
    isItemUnderCursor,
    mutateSequencerTimeline,
    newSequencerState,
    SequencerState,
    TIMELINE_ITEM_BPM,
    TIMELINE_ITEM_NOTE,
    TimelineItem
} from "./state/sequencer-state";
import { unreachable } from "src/utils/asserts";
import { getKeyForNote, KeyboardState, newKeyboardState } from "./state/keyboard-state";
import { newSavedState, newUiState, SavedState, UIState } from "./state/state";
import { clamp } from "src/utils/math-utils";
import { recursiveShallowCopyRemovingComputedFields } from "./utils/serialization-utils";

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
    mutateSequencerTimeline(ctx.sequencer, tl => {
        tl.splice(0, tl.length);
        tl.push(...JSON.parse(ctx.savedState.allSavedSongs["autosaved"]));
    });
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
        const [startIdx, endIdx] = getSelectionRange(sequencer);
        if (startIdx !== -1 && endIdx !== -1) {
            startPlaying(ctx, startIdx, endIdx, speed);
        }

        return;
    }

    // play from now till the end.
    const timeline = sequencer.timeline;
    const cursorStart = getCursorStartBeats(sequencer);
    let idx = 0;
    while (idx < timeline.length) {
        const item = timeline[idx];
        if (isItemUnderCursor(item, cursorStart)) {
            break;
        }
        idx++;
    }

    startPlaying(ctx, idx, timeline.length, speed);
}

export function playAll(
    ctx : GlobalContext,
    speed: number
) {
    startPlaying(ctx, 0, ctx.sequencer.timeline.length - 1, speed);
}

export function startPlaying(
    { sequencer, keyboard }: GlobalContext,
    startIdx: number, 
    endIdx: number, 
    speed: number,
) {
    const timeline = sequencer.timeline;
    const firstItem: TimelineItem | undefined = timeline[startIdx];
    if (!firstItem) {
        return;
    }

    sequencer.startPlayingTime = Date.now();
    sequencer.startPlayingIdx = startIdx;
    sequencer.endPlayingIdx = endIdx;
    sequencer.isPlaying = true;

    // schedule the keys that need to be pressed, and then send them to the DSP loop to play them.

    const scheduledKeyPresses: ScheduledKeyPress[] = [];
    const firstItemStartTime = timeline[startIdx]._scheduledStart;

    for (let i = startIdx; i < timeline.length && i <= endIdx; i++) {
        const item = timeline[i];
        if (item.type === TIMELINE_ITEM_BPM) {
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


// TODO: save and load the entire state.
export function save(ctx: GlobalContext) {
    const serialzed = recursiveShallowCopyRemovingComputedFields(ctx.sequencer.timeline);
    const currentTracks = JSON.stringify(serialzed);

    ctx.savedState.allSavedSongs["autosaved"] = currentTracks;

    localStorage.setItem("savedState", JSON.stringify(ctx.savedState));
    console.log("saved!");
}

export function saveStateDebounced(ctx: GlobalContext) {
    clearTimeout(ctx.ui.saveStateTimeout);
    ctx.ui.saveStateTimeout = setTimeout(() => {
        save(ctx);
    }, 100);
}

export function moveLoadSaveSelection(ctx: GlobalContext, amount: number) {
    const keys = Object.keys(ctx.savedState.allSavedSongs);
    const idx = keys.indexOf(ctx.ui.loadSaveCurrentSelection);
    if (idx === -1) {
        ctx.ui.loadSaveCurrentSelection = keys[0];
        return;
    }

    const newIdx = clamp(idx + amount, 0, keys.length - 1);
    ctx.ui.loadSaveCurrentSelection = keys[newIdx];
}

export function getCurrentSelectedSequenceName(ctx: GlobalContext) {
    return ctx.ui.loadSaveCurrentSelection;
}

export function loadCurrentSelectedSequence(ctx: GlobalContext) {
    const key = getCurrentSelectedSequenceName(ctx);
    if (!ctx.savedState.allSavedSongs[key]) {
        return;
    }

    mutateSequencerTimeline(ctx.sequencer, tl => {
        tl.splice(0, tl.length);
        tl.push(...JSON.parse(ctx.savedState.allSavedSongs[key]));
    });
}
