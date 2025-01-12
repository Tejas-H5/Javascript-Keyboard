import { releaseAllKeys, ScheduledKeyPress, schedulePlayback, updatePlaySettings } from "src/dsp/dsp-loop-interface";
import { getKeyForNote, KeyboardState } from "src/state/keyboard-state";
import {
    getBeatsIndexes,
    getBpmChangeItemBeforeBeats,
    getCurrentPlayingBeats,
    getCursorStartBeats,
    getItemEndBeats,
    getItemStartBeats,
    getItemStartTime,
    getLastMeasureBeats,
    getRangeSelectionEndBeats,
    getRangeSelectionStartBeats,
    getTrackExtent,
    hasRangeSelection,
    NoteItem,
    TIMELINE_ITEM_BPM,
    TIMELINE_ITEM_MEASURE,
    TIMELINE_ITEM_NOTE,
    TimelineItem
} from "src/state/sequencer-state";
import { unreachable } from "src/utils/asserts";
import { beatsToMs } from "src/utils/music-theory-utils";
import { GlobalContext } from "src/views/app";


export function stopPlaying({ sequencer }: GlobalContext, stopOnCursor = false) {
    clearTimeout(sequencer.playingTimeout);
    releaseAllKeys();

    if (stopOnCursor) {
        const playingBeats = getCurrentPlayingBeats(sequencer);
        sequencer.cursorStart = Math.floor(playingBeats * sequencer.cursorDivisor);
    }

    sequencer.playingTimeout = 0;
    sequencer.reachedLastNote = false;

    sequencer.startPlayingTime = 0;
    sequencer.isPlaying = false;
    sequencer.scheduledKeyPresses = [];
    schedulePlayback([]);
}

export function playFromLastMeasure(ctx: GlobalContext, options: PlayOptions = {}) {
    const { sequencer } = ctx;

    // Play from the last measure till the end
    const cursorStart = getCursorStartBeats(sequencer);
    const lastMeasureStart = getLastMeasureBeats(sequencer, cursorStart);
    const endBeats = getTrackExtent(sequencer);
    startPlaying(ctx, lastMeasureStart, endBeats, options);
}

export function playFromCursor(ctx: GlobalContext, options: PlayOptions = {}) { 
    const { sequencer } = ctx;

    // Play from the last measure till the end
    const cursorStart = getCursorStartBeats(sequencer);
    const endBeats = getItemEndBeats(sequencer.timeline[sequencer.timeline.length - 1]);
    startPlaying(ctx, cursorStart, endBeats, options);
}

export function playCurrentRangeSelection(ctx: GlobalContext, options: PlayOptions = {}) {
    const { sequencer } = ctx;

    if (sequencer.timeline.length === 0) {
        return;
    }

    if (!hasRangeSelection(sequencer)) {
        return;
    }

    const a = getRangeSelectionStartBeats(sequencer);
    const b = getRangeSelectionEndBeats(sequencer);
    startPlaying(ctx, a, b, options);
}

export function playAll(ctx : GlobalContext, options: PlayOptions = {}) {
    startPlaying(ctx, 0, undefined, options);
}

export type PlayOptions = {
    speed?: number;
    isUserDriven?: boolean;
};


// TODO: handle the 'error' when we haven't clicked any buttons yet so the browser prevents audio from playing
export function startPlaying(ctx: GlobalContext, startBeats: number, endBeats?: number, options: PlayOptions = {}) {
    if (endBeats === undefined) {
        endBeats = getTrackExtent(ctx.sequencer);
    }

    let { speed = 1, isUserDriven = false } = options;

    stopPlaying(ctx);

    const { sequencer, keyboard } = ctx;

    const [startIdx, endIdx] = getBeatsIndexes(sequencer, startBeats, endBeats);
    if (startIdx === -1 || endIdx === -1) {
        return;
    }

    const timeline = sequencer.timeline;
    const firstItem: TimelineItem | undefined = timeline[startIdx];
    if (!firstItem) {
        return;
    }

    const startItem = timeline[startIdx];
    const bpmChange = getBpmChangeItemBeforeBeats(sequencer, startBeats);
    let cursorTime = 0;
    if (bpmChange) {
        const relativeBeats = startBeats - getItemStartBeats(bpmChange);
        cursorTime = bpmChange._scheduledStart + beatsToMs(relativeBeats, bpmChange.bpm);
    }
    const leadInTime = startItem._scheduledStart - cursorTime;

    // schedule the keys that need to be pressed, and then send them to the DSP loop to play them.

    const scheduledKeyPresses: ScheduledKeyPress[] = [];
    const startPlaybackFromTime = timeline[startIdx]._scheduledStart - leadInTime;

    for (let i = startIdx; i < timeline.length && i <= endIdx; i++) {
        const item = timeline[i];
        if (item.type === TIMELINE_ITEM_BPM || item.type === TIMELINE_ITEM_MEASURE) {
            // can't be played.
            continue;
        }

        if (item.type === TIMELINE_ITEM_NOTE) {
            pushNotePress(scheduledKeyPresses, keyboard, item, startPlaybackFromTime);
            continue;
        }

        unreachable(item);
    }

    for (const scp of scheduledKeyPresses) {
        scp.time /= speed;
        scp.timeEnd /= speed;
    }

    // TODO: sort prob not needed, since the timeline is sorted already
    scheduledKeyPresses.sort((a, b) => a.time - b.time);
    sequencer.scheduledKeyPresses = scheduledKeyPresses;
    sequencer.scheduledKeyPressesFirstItemStart = startPlaybackFromTime;
    sequencer.scheduledKeyPressesPlaybackSpeed = speed;

    sequencer.startPlayingTime = Date.now() + leadInTime;
    sequencer.startPlayingIdx = startIdx;
    sequencer.endPlayingIdx = endIdx;
    sequencer.isPlaying = true;
    sequencer.isPaused = false;

    updatePlaySettings(s => s.isUserDriven = isUserDriven);
    schedulePlayback(scheduledKeyPresses);
}

function pushNotePress(
    scheduledKeyPresses: ScheduledKeyPress[], 
    keyboard: KeyboardState, 
    item: NoteItem,
    startPlaybackFromTime: number,
) {
    const n = item.note;
    const key = getKeyForNote(keyboard, n);
    if (!key) {
        // this note can't be played, do nothing
        return;
    }

    scheduledKeyPresses.push({
        time: item._scheduledStart - startPlaybackFromTime,
        timeEnd: item._scheduledEnd - startPlaybackFromTime,
        keyId: key.index,
        noteIndex: n.noteIndex,
        sample: n.sample,
    });
}

// Plays notes without setting the sequencer's isPlaying = true.
export function previewNotes(ctx: GlobalContext, notes: NoteItem[]) {
    let minTime = Number.POSITIVE_INFINITY;
    for (const note of notes) {
        minTime = Math.min(minTime, getItemStartTime(note));
    }

    const keyboard = ctx.keyboard;
    const scheduledKeyPresses: ScheduledKeyPress[] = [];
    for (const note of notes) {
        pushNotePress(scheduledKeyPresses, keyboard, note, minTime);
    }

    schedulePlayback(scheduledKeyPresses);
}
