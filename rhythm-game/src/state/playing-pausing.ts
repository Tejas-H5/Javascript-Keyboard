import { isAnythingPlaying, releaseAllKeys, ScheduledKeyPress, schedulePlayback, setPlaybackSpeed, updatePlaySettings } from "src/dsp/dsp-loop-interface";
import { getKeyForNote, KeyboardState } from "src/state/keyboard-state";
import {
    getBeatIdxAfter,
    getChartDurationInBeats,
    getItemEndTime,
    getItemStartTime,
    getLastMeasureBeats,
    getTimeForBeats,
    itemEnd,
    NoteItem,
    TIMELINE_ITEM_BPM,
    TIMELINE_ITEM_MEASURE,
    TIMELINE_ITEM_NOTE,
} from "src/state/sequencer-chart";
import { getCurrentPlayingBeats, hasRangeSelection, setSequencerPlaybackSpeed, } from "src/state/sequencer-state";
import { unreachable } from "src/utils/assert";
import { GlobalContext } from "src/views/app";

export function stopPlayback({ sequencer }: GlobalContext, stopOnCursor = false) {
    clearTimeout(sequencer.playingTimeout);
    releaseAllKeys();

    if (stopOnCursor) {
        const playingBeats = getCurrentPlayingBeats(sequencer);
        sequencer.cursor = Math.floor(playingBeats);
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
    const cursorStart = sequencer.cursor;
    const lastMeasureStart = getLastMeasureBeats(chart, cursorStart);

    // +1 for good luck - it's used to find a bound that must alawys include the last note,
    // that we can play every note
    const endBeats = getChartDurationInBeats(chart) + 1;
    startPlaying(ctx, lastMeasureStart, endBeats, options);
}

export function playFromCursor(ctx: GlobalContext, options: PlayOptions = {}) { 
    const { sequencer } = ctx;

    const chart = sequencer._currentChart;
    if (chart.timeline.length === 0) {
        return;
    }

    const cursorStart = sequencer.cursor;
    const endBeats = itemEnd(chart.timeline[chart.timeline.length - 1]);
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

    const a = sequencer.rangeSelectStart;
    const b = sequencer.rangeSelectEnd;
    startPlaying(ctx, a, b, options);
}

export function playAll(ctx : GlobalContext, options: PlayOptions = {}) {
    startPlaying(ctx, 0, undefined, options);
}

export type PlayOptions = {
    speed?: number;
    isUserDriven?: boolean;
};

export function pausePlayback(ctx: GlobalContext) {
    setSequencerSpeed(ctx, 0);
}

export function resumePlayback(ctx: GlobalContext) {
    setSequencerSpeed(ctx, 1);
}

// Not as straightforward as you  might think.
// Due to latency reasons, we can't simply query the current time from the DSP loop every frame.
// So the non-dsp code is using a linear equation to estimate the current dsp time based on the last known
// dsp time. We sync with the DSP loop often enough that it will always be accurate.
// We cannot change the speed without also resetting the linear equation
function setSequencerSpeed(ctx: GlobalContext, newSpeed: number) {
    const sequencer = ctx.sequencer;

    setSequencerPlaybackSpeed(sequencer, newSpeed);
    setPlaybackSpeed(newSpeed);
}

// TODO: handle the 'error' when we haven't clicked any buttons yet so the browser prevents audio from playing
export function startPlaying(ctx: GlobalContext, startBeats: number, endBeats?: number, options: PlayOptions = {}) {
    const chart = ctx.sequencer._currentChart;
    if (endBeats === undefined) {
        endBeats = getChartDurationInBeats(chart) + 1;
    }

    let { speed = 1, isUserDriven = false } = options;

    stopPlayback(ctx);

    const { sequencer, keyboard } = ctx;

    const firstItemAfterStartBeatIdx = getBeatIdxAfter(chart, startBeats);
    if (firstItemAfterStartBeatIdx === -1) {
        return;
    }

    const timeline = chart.timeline;
    const startTime = getTimeForBeats(chart, startBeats);

    // schedule the keys that need to be pressed, and then send them to the DSP loop to play them.

    const scheduledKeyPresses: ScheduledKeyPress[] = [];

    for (let i = 0; i < timeline.length; i++) {
        const item = timeline[i];
        if (itemEnd(item) < startBeats) continue;
        if (item.start > endBeats) break;

        if (item.type === TIMELINE_ITEM_BPM || item.type === TIMELINE_ITEM_MEASURE) {
            // can't be played.
            continue;
        }

        if (item.type === TIMELINE_ITEM_NOTE) {
            pushNotePress(scheduledKeyPresses, keyboard, item, startTime);
            continue;
        }

        unreachable(item);
    }

    // TODO: sort prob not needed, since the timeline is sorted already
    scheduledKeyPresses.sort((a, b) => a.time - b.time);
    sequencer.scheduledKeyPresses = scheduledKeyPresses;
    sequencer.scheduledKeyPressesFirstItemStart = startTime;
    sequencer.scheduledKeyPressesPlaybackSpeed = speed;

    sequencer.startPlayingTime = performance.now();
    sequencer.pausedPlaybackTime = 0;
    sequencer.isPlaying = true;
    sequencer.startBeats = startBeats;

    updatePlaySettings(s => s.isUserDriven = isUserDriven);
    schedulePlayback(scheduledKeyPresses);
}

function pushNotePress(
    scheduledKeyPresses: ScheduledKeyPress[], 
    keyboard: KeyboardState, 
    item: NoteItem,
    startPlaybackFromTime: number,
) {
    const n = item.noteId;
    const key = getKeyForNote(keyboard, n);
    if (!key) {
        // this note can't be played, do nothing
        return;
    }

    scheduledKeyPresses.push({
        time: getItemStartTime(item) - startPlaybackFromTime,
        timeEnd: getItemEndTime(item) - startPlaybackFromTime,
        keyId: key.index,
        noteId: item.noteId,
    });
}

// Plays notes without setting the sequencer's isPlaying = true.
export function previewNotes(ctx: GlobalContext, notes: NoteItem[]) {
    if (isAnythingPlaying()) return;

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
