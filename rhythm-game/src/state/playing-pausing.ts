import { unreachable } from "src/utils/asserts";
import { releaseAllKeys, ScheduledKeyPress, schedulePlayback } from "src/dsp/dsp-loop-interface";
import { getKeyForNote } from "src/state/keyboard-state";
import {
    getBeatsIndexes,
    getBpm,
    getBpmChangeItemBeforeBeats,
    getBpmTime,
    getCurrentPlayingBeats,
    getCursorStartBeats,
    getItemEndBeats,
    getItemStartBeats,
    getLastMeasureBeats,
    getRangeSelectionEndBeats,
    getRangeSelectionStartBeats,
    hasRangeSelection,
    TIMELINE_ITEM_BPM,
    TIMELINE_ITEM_MEASURE,
    TIMELINE_ITEM_NOTE,
    TimelineItem
} from "src/state/sequencer-state";
import { beatsToMs } from "src/utils/music-theory-utils";
import { GlobalContext } from "./global-context";


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

export function playFromLastMeasure(ctx: GlobalContext, speed: number) {
    const { sequencer } = ctx;

    // Play from the last measure till the end
    const cursorStart = getCursorStartBeats(sequencer);
    const lastMeasureStart = getLastMeasureBeats(sequencer, cursorStart);
    const endBeats = getItemEndBeats(sequencer.timeline[sequencer.timeline.length - 1]);
    startPlaying(ctx, lastMeasureStart, endBeats, speed);
}

export function playFromCursor(ctx: GlobalContext, speed: number) { 
    const { sequencer } = ctx;

    // Play from the last measure till the end
    const cursorStart = getCursorStartBeats(sequencer);
    const endBeats = getItemEndBeats(sequencer.timeline[sequencer.timeline.length - 1]);
    startPlaying(ctx, cursorStart, endBeats, speed);
}

export function playCurrentRangeSelection(ctx: GlobalContext, speed: number,) {
    const { sequencer } = ctx;

    if (sequencer.timeline.length === 0) {
        return;
    }

    if (!hasRangeSelection(sequencer)) {
        return;
    }

    const a = getRangeSelectionStartBeats(sequencer);
    const b = getRangeSelectionEndBeats(sequencer);
    startPlaying(ctx, a, b, speed);
}

export function playAll(
    ctx : GlobalContext,
    speed: number
) {
    startPlaying(ctx, 0, ctx.sequencer.timeline.length - 1, speed);
}

export function startPlaying(
    ctx: GlobalContext,
    startBeats: number,
    endBeats: number,
    speed: number,
) {
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

