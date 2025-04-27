import { releaseAllKeys, ScheduledKeyPress, schedulePlayback, updatePlaySettings } from "src/dsp/dsp-loop-interface";
import { getKeyForNote, KeyboardState } from "src/state/keyboard-state";
import {
    getCurrentPlayingBeats,
    getCursorStartBeats,
    getRangeSelectionEndBeats,
    getRangeSelectionStartBeats,
    hasRangeSelection,
} from "src/state/sequencer-state";
import { unreachable } from "src/utils/assert";
import { GlobalContext } from "src/views/app";
import { getBeatsIndexes, getItemEndBeats, getItemEndTime, getItemStartTime, getLastMeasureBeats, getTimeForBeats, getTrackExtent, NoteItem, TIMELINE_ITEM_BPM, TIMELINE_ITEM_MEASURE, TIMELINE_ITEM_NOTE } from "src/state/sequencer-chart";


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

    const chart = sequencer._currentChart;

    if (chart.timeline.length === 0) {
        return;
    }

    // Play from the last measure till the end
    const cursorStart = getCursorStartBeats(sequencer);
    const lastMeasureStart = getLastMeasureBeats(chart, cursorStart);
    const endBeats = getTrackExtent(chart);
    startPlaying(ctx, lastMeasureStart, endBeats, options);
}

export function playFromCursor(ctx: GlobalContext, options: PlayOptions = {}) { 
    const { sequencer } = ctx;

    const chart = sequencer._currentChart;
    if (chart.timeline.length === 0) {
        return;
    }

    const cursorStart = getCursorStartBeats(sequencer);
    const endBeats = getItemEndBeats(chart.timeline[chart.timeline.length - 1]);
    startPlaying(ctx, cursorStart, endBeats, options);
}

export function playCurrentRangeSelection(ctx: GlobalContext, options: PlayOptions = {}) {
    const { sequencer } = ctx;

    const chart = sequencer._currentChart;
    if (chart.timeline.length === 0) {
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
    const chart = ctx.sequencer._currentChart;
    if (endBeats === undefined) {
        endBeats = getTrackExtent(chart);
    }

    let { speed = 1, isUserDriven = false } = options;

    stopPlaying(ctx);

    const { sequencer, keyboard } = ctx;

    const [startIdx, endIdx] = getBeatsIndexes(chart, startBeats, endBeats);
    if (startIdx === -1 || endIdx === -1) {
        return;
    }

    const timeline = chart.timeline;
    const firstItem = timeline[startIdx];
    const startTime = getTimeForBeats(chart, startBeats);
    const leadInTime = getItemStartTime(firstItem) - startTime;

    // schedule the keys that need to be pressed, and then send them to the DSP loop to play them.

    const scheduledKeyPresses: ScheduledKeyPress[] = [];
    const startPlaybackFromTime = getItemStartTime(firstItem) - leadInTime;

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
        time: getItemStartTime(item) - startPlaybackFromTime,
        timeEnd: getItemEndTime(item) - startPlaybackFromTime,
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

    updatePlaySettings(s => s.isUserDriven = false);
    schedulePlayback(scheduledKeyPresses);
}
