// TODO: move to src/state/

import { beatsToMs, compareMusicNotes, getNoteHashKey, msToBeats, MusicNote, noteEquals } from "src/utils/music-theory-utils";
import { arrayAt, findLastIndexOf } from "src/utils/array-utils";
import { greaterThan, greaterThanOrEqualTo, lessThan, lessThanOrEqualTo, within } from "src/utils/math-utils";
import { unreachable } from "src/utils/asserts";
import { assert } from "src/utils/assert";

export type RhythmGameChart = {
    name: string;
    timeline: TimelineItem[];
    cursorStart: number;
    cursorDivisor: number;
}

export function newChart(name: string = ""): RhythmGameChart {
    return {
        name,
        timeline: [],
        cursorStart: 0,
        cursorDivisor: 4,
    }
}

type BaseTimelineItem = {
    start: number;
    divisor: number;
    _scheduledStart: number;
    _index: number;
};

export function newTimelineItemBpmChange(start: number, divisor: number, bpm: number): BpmChange {
    return {
        type: TIMELINE_ITEM_BPM,
        bpm,
        start,
        divisor,
        _scheduledStart: 0,
        _index: 0,
    };
}

export function newTimelineItemBpmChangeDefault() {
    return newTimelineItemBpmChange(0, 4, DEFAULT_BPM);
}

export const TIMELINE_ITEM_BPM = 1;
export const TIMELINE_ITEM_MEASURE = 2;
export const TIMELINE_ITEM_NOTE = 3;
export const DEFAULT_BPM = 120;

const CURSOR_ITEM_TOLERANCE_BEATS = 0.000001;

export type NoteItem = BaseTimelineItem & {
    type: typeof TIMELINE_ITEM_NOTE;

    note: MusicNote;
    len: number;

    _scheduledEnd: number;
}

export type BpmChange = BaseTimelineItem & {
    type: typeof TIMELINE_ITEM_BPM;
    bpm: number;
}

export type Measure = BaseTimelineItem & {
    type: typeof TIMELINE_ITEM_MEASURE;
};

export type CommandItem = BpmChange | Measure;

export type TimelineItem = NoteItem | CommandItem;
export type TimelineItemType = TimelineItem["type"];

export function equalBeats(beatsA: number, beatsB: number): boolean {
    return within(beatsA, beatsB, CURSOR_ITEM_TOLERANCE_BEATS);
}
export function lteBeats(beatsA: number, beatsB: number): boolean {
    return lessThanOrEqualTo(beatsA, beatsB, CURSOR_ITEM_TOLERANCE_BEATS)
}

export function ltBeats(beatsA: number, beatsB: number): boolean {
    return lessThan(beatsA, beatsB, CURSOR_ITEM_TOLERANCE_BEATS)
}

export function gteBeats(beatsA: number, beatsB: number): boolean {
    return greaterThanOrEqualTo(beatsA, beatsB, CURSOR_ITEM_TOLERANCE_BEATS)
}

export function gtBeats(beatsA: number, beatsB: number): boolean {
    return greaterThan(beatsA, beatsB, CURSOR_ITEM_TOLERANCE_BEATS)
}


export function getItemStartBeats(item: TimelineItem): number {
    return getBeats(item.start, item.divisor);
}


export function getBeats(numerator: number, divisor: number): number {
    return numerator / divisor;
}

export function getBpmChangeItemBeforeBeats(chart: RhythmGameChart, beats: number): BpmChange | undefined {
    const timeline = chart.timeline;

    const idx = findLastIndexOf(timeline, item =>
        item.type === TIMELINE_ITEM_BPM
        && lteBeats(getItemStartBeats(item), beats)
    );
    if (idx === -1) {
        return undefined;
    }

    const item = timeline[idx];
    if (item.type !== TIMELINE_ITEM_BPM) {
        throw new Error("!item || item.type !== TIMELINE_ITEM_BPM");
    }

    return item;
}

export function getBeatIdxAfter(chart: RhythmGameChart, beats: number) {
    const timeline = chart.timeline;
    const startIdx = timeline.findIndex(
        item => gteBeats(getItemStartBeats(item), beats),
    );
    return startIdx;
}

export function getBeatIdxBefore(chart: RhythmGameChart, beats: number) {
    const timeline = chart.timeline;
    const endIdx = findLastIndexOf(
        timeline,
        (item) => lteBeats(getItemStartBeats(item), beats)
    );
    return endIdx;
}

export function getBeatsIndexes(chart: RhythmGameChart, startBeats: number, endBeats: number): [number, number] {
    const min = Math.min(startBeats, endBeats);
    const max = Math.max(startBeats, endBeats);

    const startIdx = getBeatIdxAfter(chart, min);
    const endIdx = getBeatIdxBefore(chart, max);

    if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
        return [-1, -1];
    }

    return [startIdx, endIdx];
}



export function getItemIdxAtBeat(chart: RhythmGameChart, beats: number, type?: TimelineItemType) {
    const timeline = chart.timeline;

    for (let i = 0; i < timeline.length; i++) {
        const item = timeline[i];
        if (type && item.type !== type) {
            continue;
        }

        if (within(getBeats(item.start, item.divisor), beats, CURSOR_ITEM_TOLERANCE_BEATS)) {
            return i;
        }
    }

    return -1;
}

export function timelineMeasureAtBeatsIdx(chart: RhythmGameChart, beats: number): number {
    return getItemIdxAtBeat(chart, beats, TIMELINE_ITEM_MEASURE);
}

export function timelineHasNoteAtPosition(
    chart: RhythmGameChart,
    position: number,
    divisor: number,
    note: MusicNote,
): boolean {
    const len = 1;

    const rangeStartBeats = getBeats(position, divisor);
    const rangeEndBeats = getBeats(position + len, divisor);
    for (const item of chart.timeline) {
        if (item.type !== TIMELINE_ITEM_NOTE) {
            continue;
        }

        if (!noteEquals(item.note, note)) {
            continue;
        }

        if (
            gtBeats(getItemEndBeats(item), rangeStartBeats)
            && ltBeats(getItemStartBeats(item), rangeEndBeats)
        ) {
            return true;
        }
    }

    return false;
}


export function getNoteItemAtBeats(chart: RhythmGameChart, beats: number): NoteItem | null {
    const timeline = chart.timeline;

    const idx = getItemIdxAtBeat(chart, beats);
    if (idx === -1) {
        return null;
    }

    const item = timeline[idx];
    if (item.type !== TIMELINE_ITEM_NOTE) {
        return null;
    }

    return item;
}



export function getPlaybackDuration(chart: RhythmGameChart): number {
    const timeline = chart.timeline;
    if (timeline.length === 0) {
        return 0;
    }

    const lastItem = timeline[timeline.length - 1]
    if (lastItem.type === TIMELINE_ITEM_NOTE) {
        return lastItem._scheduledEnd;
    }

    return getItemStartTime(lastItem);

}


export function getPrevItemIndexForTime(timeline: TimelineItem[], time: number, defaultValue = -1, type?: TimelineItemType) {
    for (let i = timeline.length - 1; i >= 0; i--) {
        const item = timeline[i];
        if (type && type !== item.type) {
            continue;
        }

        if (getItemStartTime(item) < time) {
            return i;
        }
    }

    return defaultValue;
}

export function getNextItemIndexForTime(timeline: TimelineItem[], time: number, defaultValue = -1, type?: TimelineItemType) {
    for (let i = 0; i < timeline.length; i++) {
        const item = timeline[i];
        if (type && type !== item.type) {
            continue;
        }

        if (getItemStartTime(item) >= time) {
            return i;
        }
    }

    return defaultValue;
}

export function getItemStartTime(item: TimelineItem): number {
    return item._scheduledStart;
}


export function getItemEndTime(item: TimelineItem): number {
    if (item.type === TIMELINE_ITEM_NOTE) {
        return item._scheduledEnd;
    }

    return item._scheduledStart;
}


export function isItemUnderCursor(item: TimelineItem, cursorBeats: number): boolean {
    const start = getItemStartBeats(item);
    const end = getItemEndBeats(item);
    return lteBeats(start, cursorBeats) && ltBeats(cursorBeats, end);
}


export function getItemLengthBeats(item: TimelineItem) {
    if (item.type === TIMELINE_ITEM_NOTE) {
        return item.len / item.divisor;
    }
    return 0;
}


export function getItemEndBeats(item: TimelineItem): number {
    return getItemStartBeats(item) + getItemLengthBeats(item);
}



export function fixTimeline(chart: RhythmGameChart, timelineTemp: TimelineItem[]) {
    const timeline = chart.timeline;

    // re-sort the timeline
    {
        timeline.sort((a, b) => {
            const delta = getBeats(a.start, a.divisor) - getBeats(b.start, b.divisor);
            if (Math.abs(delta) > CURSOR_ITEM_TOLERANCE_BEATS) {
                return delta;
            }

            if (a.type === TIMELINE_ITEM_NOTE && b.type === TIMELINE_ITEM_NOTE) {
                return compareMusicNotes(a.note, b.note);
            }

            return a.type - b.type;
        });
    }

    // filter degenerate objects out of the timeline
    {
        timelineTemp.length = 0;
        for (let i = 0; i < timeline.length; i++) {
            timelineTemp.push(timeline[i]);
        }
        timeline.length = 0;

        const replaceLast = (item: TimelineItem) => {
            const idx = findLastIndexOf(timeline, i => i.type === item.type);
            if (idx !== -1) {
                timeline[idx] = item;
            } else {
                timeline.push(item);
            }
        }

        let lastBpmBeats = 0;
        let lastMeasureBeats = 0;
        for (let i = 0; i < timelineTemp.length; i++) {
            const item = timelineTemp[i];
            const startBeats = getItemStartBeats(item);

            if (item.type === TIMELINE_ITEM_MEASURE) {
                // the most recent measure should overwrite the last one at the same position
                // (not a big deal, but just don't want duplicates)
                if (equalBeats(lastMeasureBeats, startBeats)) {
                    replaceLast(item);
                    continue;
                }
                lastMeasureBeats = startBeats;
            }

            if (item.type === TIMELINE_ITEM_BPM) {
                // the most recent bpm should overwrite the last one at the same position
                if (equalBeats(lastBpmBeats, startBeats)) {
                    replaceLast(item);
                    continue;
                }
                lastBpmBeats = startBeats;
            }

            if (item.type === TIMELINE_ITEM_NOTE) {
                // remove zero-length notes
                if (within(
                    getItemLengthBeats(item),
                    0,
                    CURSOR_ITEM_TOLERANCE_BEATS
                )) {
                    continue;
                }
            }

            timeline.push(item);
        }
    }

    // Coalesce overlapping notes of the same key (only works _after_ sorting)
    {
        const currentlyStartedItems = new Map<string, NoteItem>();
        for (let i = 0; i < timeline.length; i++) {
            const item = timeline[i];
            if (item.type !== TIMELINE_ITEM_NOTE) {
                continue;
            }

            const startBeat = getItemStartBeats(item);

            // remove items from currentlyStartedItems that have 'ended'.
            for (const [startedItemKey, startedItem] of currentlyStartedItems) {
                const itemEndBeat = getItemEndBeats(startedItem)
                if (lessThan(itemEndBeat, startBeat, CURSOR_ITEM_TOLERANCE_BEATS)) {
                    currentlyStartedItems.delete(startedItemKey);
                }
            }

            const key = getNoteHashKey(item.note);

            const lastItem = currentlyStartedItems.get(key);
            if (lastItem) {
                // We need to merge the last instance of this key that was started, with this one.
                // This is just a matter of extending the last item to this item's end, and then deleting this item
                const thisItemEndBeats = getItemEndBeats(item);
                const lastItemStartBeats = getItemStartBeats(lastItem);
                const wantedLenBeats = thisItemEndBeats - lastItemStartBeats;
                lastItem.len = wantedLenBeats * lastItem.divisor;
                timeline.splice(i, 1);
                i--;
                currentlyStartedItems.set(key, lastItem);
                continue;
            }

            currentlyStartedItems.set(key, item);
        }
    }

    // Recompute the actual start and end times of every object, and indexes
    {
        let currentBpm = DEFAULT_BPM;
        let currentBpmTime = 0;
        let currentBpmBeats = 0;
        for (let i = 0; i < timeline.length; i++) {
            const item = timeline[i];
            item._index = i;

            const relativeBeats = getItemStartBeats(item) - currentBpmBeats;
            const itemStartTime = currentBpmTime + beatsToMs(relativeBeats, currentBpm);
            item._scheduledStart = itemStartTime;

            if (item.type === TIMELINE_ITEM_MEASURE) {
                continue;
            }

            if (item.type === TIMELINE_ITEM_BPM) {
                currentBpmTime = itemStartTime;
                currentBpm = item.bpm;
                currentBpmBeats = getItemStartBeats(item);
                continue;
            }

            if (item.type === TIMELINE_ITEM_NOTE) {
                const itemEnd = getItemEndBeats(item);
                const relativeEnd = itemEnd - currentBpmBeats;
                item._scheduledEnd = currentBpmTime + beatsToMs(relativeEnd, currentBpm);
                continue;
            }

            unreachable(item);
        }
    }
}


export function deleteAtIdx(chart: RhythmGameChart, idx: number) {
    const timeline = chart.timeline;

    if (idx < 0 || idx >= timeline.length) {
        return;
    }

    timeline.splice(idx, 1);
}


export function getBpm(bpmChange: BpmChange | undefined): number {
    if (!bpmChange) return DEFAULT_BPM;
    return bpmChange.bpm;
}

export function getBpmTime(bpmChange: BpmChange | undefined): number {
    if (!bpmChange) return 0;
    return getItemStartTime(bpmChange);
}

export function getBpmBeats(bpmChange: BpmChange | undefined): number {
    if (!bpmChange) return 0;
    return getItemStartBeats(bpmChange);
}


export function getLastMeasureBeats(chart: RhythmGameChart, beats: number): number {
    const timeline = chart.timeline;

    const idx = findLastIndexOf(timeline, item =>
        item.type === TIMELINE_ITEM_MEASURE
        && lteBeats(getItemStartBeats(item), beats)
    );
    if (idx === -1) {
        return 0;
    }

    const item = timeline[idx];
    if (!item || item.type !== TIMELINE_ITEM_MEASURE) {
        throw new Error("!item || item.type !== TIMELINE_ITEM_MEASURE");
    }

    return getItemStartBeats(item);
}


export function getBeatsForTime(chart: RhythmGameChart, time: number): number {
    const timeline = chart.timeline;

    const lastBpmIdx = getPrevItemIndexForTime(timeline, time, -1, TIMELINE_ITEM_BPM);

    const bpmChange = arrayAt(timeline, lastBpmIdx);
    if (bpmChange && bpmChange.type !== TIMELINE_ITEM_BPM) {
        return 0;
    }

    const bpmTime = getBpmTime(bpmChange);
    const bpm = getBpm(bpmChange);
    const bpmBeats = getBpmBeats(bpmChange);

    const relativeBeats = msToBeats(time - bpmTime, bpm);
    return bpmBeats + relativeBeats;
}


export function getTimeForBeats(chart: RhythmGameChart, beats: number): number {
    const bpmChange = getBpmChangeItemBeforeBeats(chart, beats);
    const bpmTime = getBpmTime(bpmChange);
    const bpm = getBpm(bpmChange);
    const bpmBeats = getBpmBeats(bpmChange);

    const relativeTime = beatsToMs(beats - bpmBeats, bpm);
    return bpmTime + relativeTime;
}


export function divisorSnap(beats: number, divisor: number): number {
    return Math.floor(beats * divisor) / divisor;
}

export function transposeItems(
    chart: RhythmGameChart,
    startIdx: number,
    endIdx: number,
    halfSteps: number,
) {
    if (startIdx === -1 || endIdx === -1) {
        return;
    }

    const timeline = chart.timeline;
    for (let i = startIdx; i <= endIdx; i++) {
        const item = timeline[i];
        if (item.type === TIMELINE_ITEM_NOTE) {
            if (item.note.noteIndex !== undefined) {
                item.note.noteIndex += halfSteps;
            }
        }
    }
}


export function shiftItems(
    chart: RhythmGameChart,
    startIdx: number, endIdx: number,
    amountBeats: number,
) {
    if (startIdx === -1 || endIdx === -1) {
        return;
    }

    const timeline = chart.timeline;
    for (let i = startIdx; i <= endIdx; i++) {
        const item = timeline[i];
        item.start += amountBeats * item.divisor;
    }
}


// TODO: rename -getChartExtent
export function getTrackExtent(chart: RhythmGameChart): number {
    const timeline = chart.timeline;
    if (timeline.length === 0) {
        return 0;
    }

    const lastItem = timeline[timeline.length - 1];
    // +1 for good luck - it's used to find a bound that must alawys include the last note, 
    // that we can play every note
    return getItemEndBeats(lastItem) + 1;
}

export function newTimelineItemMeasure(start: number, divisor: number): Measure {
    return {
        type: TIMELINE_ITEM_MEASURE,
        start,
        divisor,
        _scheduledStart: 0,
        _index: 0,
    }
}

export function newTimelineItemMeasureDefault() {
    return newTimelineItemMeasure(0, 4);
}

export function newTimelineItemNote(musicNote: MusicNote, start: number, len: number, divisor: number): NoteItem {
    assert(!!musicNote.sample || musicNote.noteIndex !== undefined);

    return {
        type: TIMELINE_ITEM_NOTE,
        start,
        divisor,
        note: { ...musicNote },
        len,
        _scheduledStart: 0,
        _index: 0,
        _scheduledEnd: 0,
    };
}

export function newTimelineItemNoteDefault() {
    return newTimelineItemNote({ noteIndex: 0 }, 0, 1, 4);
}
