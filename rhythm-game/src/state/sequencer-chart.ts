import { arrayAt, filterInPlace, findLastIndexOf } from "src/utils/array-utils";
import { assert, unreachable } from "src/utils/assert";
import { beatsToMs, msToBeats } from "src/utils/music-theory-utils";
import { numbersToVariableLengthBase64, variableLengthBase64ToNumbers } from "src/utils/vlbase64";
import { getMusicNoteText } from "./keyboard-state";

export type SequencerChart = {
    id: number;
    name: string;
    cursor: number;

    // NOTE: do not mutate the notes directly. Instead, remove, deep-copy, and insert the notes
    timeline: TimelineItem[];

    _savedStatus: SequencerChartSavedStatus;
    _lastUpdated: number;
    _tempBuffer: TimelineItem[];
    _undoBuffer: { 
        enabled: boolean;
        items: TimelineMutation[];
        idx: number;
    },
};

export function isBundledChartId(id: number) {
    return id <= 0;
}

export const CHART_STATUS_UNSAVED  = 0;
export const CHART_STATUS_SAVED    = 1;
export const CHART_STATUS_READONLY = 2;

export type SequencerChartSavedStatus
    = typeof CHART_STATUS_UNSAVED
    | typeof CHART_STATUS_SAVED
    | typeof CHART_STATUS_READONLY;

// A compressed char that aims to minimize it's size when saved as JSON
export type SequencerChartCompressed = {
    i: number; // SequencerChart.id,
    n: string; // SequencerChart.name,
    c: number; // SequencerChart.cursor,
    t: string; // SequencerChart.timeline
};

export const MUTATION_INSERT = 1;
export const MUTATION_REMOVE = 2;

type TimelineMutation = {
    t: typeof MUTATION_INSERT | typeof MUTATION_REMOVE;
    items: TimelineItem[];
};

export function newChart(name: string = ""): SequencerChart {
    return {
        id: -1,
        name,
        timeline: [],
        cursor: 0,

        _savedStatus: CHART_STATUS_UNSAVED,
        _lastUpdated: 0,
        _tempBuffer: [],
        _undoBuffer: { items: [], idx: -1, enabled: true }
    }
}

export function undoEdit(chart: SequencerChart) {
    traverseUndoBuffer(chart, false);
}

export function redoEdit(chart: SequencerChart) {
    traverseUndoBuffer(chart, true);
}

export function newTimelineItemBpmChange(
    start: number,
    bpm: number
): TimelineItemBpmChange {
    return {
        type: TIMELINE_ITEM_BPM,
        bpm,
        start,
        _scheduledStart: 0,
        _index: 0,
        _shouldDelete: false,
    };
}

export function newTimelineItemBpmChangeDefault() {
    return newTimelineItemBpmChange(0, DEFAULT_BPM);
}

export const TIMELINE_ITEM_BPM = 1;
export const TIMELINE_ITEM_MEASURE = 2;
export const TIMELINE_ITEM_NOTE = 3;
export const DEFAULT_BPM = 120;

// Beats are a timescale-agnostic way of representing when an item appears in a beatmap.
// A common problem that occurs in other rhythm games, is that if you change the timing after you've
// created a chart, all of the objects will no longer be snapped to the timeline. 
// By simply having 'beats' as the core unit everything is snapped to, then speeding up/slowing down
// playback after-the-fact, we get around this issue.
//
// Ideally, I'd like to pack this position into a single integer. 
// We can have a 'beat' part, and then a fractional part.
// We can put the beat part first, then the fractional part second, so that
// all the regular numerical operators work as usual.
// This ends up being semantically the same as a number that we divide by some high 
// number to convert it to beats, which is what I've gone with.
// 1 'fractional beat' is (1 'real beat' / FRACTIONAL_UNITS_PER_BEAT).
// The majority of the code here will use fractional beats.
//
// What is that number?
//
// 720 is a good number, because it divides perfectly with 1, 2, 3, 4, 5, 6, 8, 9, 10, 12, 15, 16.
// Aka every divisor we might ever want for our charts. Sorry in advance to all the jazz people that wanted 7 or 11. 
// I'm sure your idea is still doable, and that being 1/720 beats off every now and then isn't really a big deal anyway.
// Even when we divide INT_MAX by 720, we still have 800,000 'real' beats available to us for a song - more than enough.
// It was chosen from https://en.wikipedia.org/wiki/Highly_composite_number
export const FRACTIONAL_UNITS_PER_BEAT = 720;
export const FRACTIONAL_UNITS_CLEAN_DIVISORS = [
    1, 2, 3, 4, 5, 6, 8, 9, 10, 12, 15, 16,
];

type TimelinePoint = number & { __TimelinePoint: void };

export function getFractional(timelinePoint: TimelinePoint): number {
    return timelinePoint & 0xFF;
}

export function getBeatOffset(timelinePoint: TimelinePoint): number {
    return timelinePoint >> 0xFF;
}

// Can be interpreted as a position, or a length
type BaseTimelineItem = {
    start:  number; // integer - fractional beat

    _scheduledStart: number;
    _index: number;
    _shouldDelete: boolean;
};

export type NoteItem = BaseTimelineItem & {
    type: typeof TIMELINE_ITEM_NOTE;
    length: number; // length in fractional beats
    noteId: number;

    _scheduledEnd: number;
}

export type TimelineItemBpmChange = BaseTimelineItem & {
    type: typeof TIMELINE_ITEM_BPM;
    bpm: number;
}

export type TimelineItemMeasure = BaseTimelineItem & {
    type: typeof TIMELINE_ITEM_MEASURE;
};

export type CommandItem = TimelineItemBpmChange | TimelineItemMeasure;

export type TimelineItem = NoteItem | CommandItem;
export type TimelineItemType = TimelineItem["type"];

export function getBpmChangeItemBeforeBeats(
    chart: SequencerChart,
    beat: number,
): TimelineItemBpmChange | undefined {
    const timeline = chart.timeline;

    const idx = findLastIndexOf(timeline, item =>
        item.type === TIMELINE_ITEM_BPM && item.start <= beat
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

export function getBeatIdxAfter(chart: SequencerChart, beats: number) {
    const timeline = chart.timeline;
    const startIdx = timeline.findIndex(item => item.start >= beats);
    return startIdx;
}

export function getBeatIdxBefore(chart: SequencerChart, beats: number) {
    const timeline = chart.timeline;
    const endIdx = findLastIndexOf(timeline, (item) => item.start <= beats);
    return endIdx;
}

export function getBeatsIndexesInclusive(chart: SequencerChart, startBeats: number, endBeats: number): [number, number] {
    const min = Math.min(startBeats, endBeats);
    const max = Math.max(startBeats, endBeats);

    const startIdx = getBeatIdxAfter(chart, min);
    const endIdx = getBeatIdxBefore(chart, max);

    if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
        return [-1, -1];
    }

    return [startIdx, endIdx];
}

export function getBeatsIndexesExclusive(chart: SequencerChart, startBeats: number, endBeats: number): [number, number] {
    return getBeatsIndexesInclusive(chart, startBeats, endBeats  - 0.001);
}



export function getItemIdxAtBeat(chart: SequencerChart, beats: number, type?: TimelineItemType) {
    const timeline = chart.timeline;

    for (let i = 0; i < timeline.length; i++) {
        const item = timeline[i];
        if (type && item.type !== type) continue;
        if (item.start === beats) return i;
    }

    return -1;
}

export function timelineMeasureAtBeatsIdx(chart: SequencerChart, beats: number): number {
    return getItemIdxAtBeat(chart, beats, TIMELINE_ITEM_MEASURE);
}

export function timelineHasNoteAtPosition(chart: SequencerChart, beat: number, noteId: number): boolean {
    for (const item of chart.timeline) {
        if (item.type !== TIMELINE_ITEM_NOTE) continue;
        if (item.noteId !== noteId)     continue;

        if (item.start <= beat && beat <= itemEnd(item)) {
            return true;
        }
    }

    return false;
}


export function getNoteItemAtBeats(chart: SequencerChart, beats: number): NoteItem | null {
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


export function getPlaybackDuration(chart: SequencerChart): number {
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


export function isBeatWithinInclusve(item: TimelineItem, cursorBeats: number): boolean {
    return item.start <= cursorBeats && cursorBeats <= itemEnd(item);
}

export function isBeatWithinExclusive(item: TimelineItem, cursorBeats: number): boolean {
    return item.start <= cursorBeats && cursorBeats < itemEnd(item);
}

export function itemEnd(item: TimelineItem): number {
    return item.start + itemLength(item);
}

export function itemLength(item: TimelineItem): number {
    if (item.type === TIMELINE_ITEM_NOTE) return item.length;
    return 0;
}


export function isNoteInFilter(notesFilter: Set<number> | null, item: TimelineItem) {
    if (notesFilter === null) return true;
    if (notesFilter.size === 0) return true;
    if (item.type !== TIMELINE_ITEM_NOTE) return true;
    return notesFilter.has(item.noteId);
}


export function sequencerChartInsertItems(chart: SequencerChart, itemsToInsert: TimelineItem[], notesFilter: Set<number> | null) {
    itemsToInsert = itemsToInsert.filter(item => !isDegenerateItem(item) && isNoteInFilter(notesFilter, item));

    if (itemsToInsert.length === 0) return;

    sortAndIndexTimeline(chart);

    const itemsToInsertCopy = itemsToInsert.map(copyTimelineItem);
    chart.timeline.push(...itemsToInsertCopy);
    sortAndIndexTimeline(chart);
    const items = itemsToInsertCopy.map(copyTimelineItem);

    pushUndoBuffer(chart, { t: MUTATION_INSERT, items });
}

function pushUndoBuffer(chart: SequencerChart, m: TimelineMutation) {
    const undoBuffer = chart._undoBuffer;
    if (!undoBuffer.enabled) return;

    undoBuffer.idx++;

    const shouldTruncate = undoBuffer.idx !== undoBuffer.items.length;
    assert(undoBuffer.idx <= undoBuffer.items.length);
    if (shouldTruncate) {
        undoBuffer.items[undoBuffer.idx] = m;
        undoBuffer.items.length = undoBuffer.idx + 1;
    } else {
        undoBuffer.items.push(m);
    }
}


function traverseUndoBuffer(chart: SequencerChart, forwards: boolean) {
    const undoBuffer = chart._undoBuffer;

    undoBuffer.enabled = false;

    if (forwards) {
        if (undoBuffer.idx < undoBuffer.items.length - 1) {
            undoBuffer.idx++;

            const mutationToRedo = undoBuffer.items[undoBuffer.idx];

            switch (mutationToRedo.t) {
                case MUTATION_INSERT: {
                    sequencerChartInsertItems(chart, mutationToRedo.items, null);
                } break;
                case MUTATION_REMOVE: {
                    sequencerChartRemoveItems(chart, mutationToRedo.items, null);
                } break;
            }
        }
    } else {
        if (undoBuffer.idx >= 0 && undoBuffer.items.length > 0) {
            const mutationToUndo = undoBuffer.items[undoBuffer.idx];
            switch (mutationToUndo.t) {
                case MUTATION_INSERT: {
                    sequencerChartRemoveItems(chart, mutationToUndo.items, null);
                } break;
                case MUTATION_REMOVE: {
                    sequencerChartInsertItems(chart, mutationToUndo.items, null);
                } break;
            }
            undoBuffer.idx--;
        }
    }

    undoBuffer.enabled = true;
}

function isDegenerateItem(item: TimelineItem) {
    if (item.type === TIMELINE_ITEM_NOTE) {
        if (item.length === 0) {
            return true;
        }
    }

    return false;
}

/**
 * NOTE: this copies the items to the undo buffer, and removes them from the timeline.
 * in theory, you can then edit them, and then push them back to the timeline with 
 * {@link sequencerChartInsertItems}, which also copies items to the undo buffer. 
 * When we remove the items from the timeline, in theory, nothing else is referencing those items.
 */
export function sequencerChartRemoveItems(chart: SequencerChart, items: TimelineItem[], notesFilter: Set<number> | null) {
    items = items.filter(item => isNoteInFilter(notesFilter, item));

    if (items.length === 0) return [];

    sortAndIndexTimeline(chart);
    for (const item of chart.timeline) {
        item._shouldDelete = false;
    }

    const removed = items.map(copyTimelineItem);

    for (const item of items) {
        const idx = item._index;

        // get the real item - items may be a clone
        assert(idx >= 0 && idx < chart.timeline.length);
        const actualItem = chart.timeline[idx];
        assert(timelineItemsEqual(actualItem, item));

        actualItem._shouldDelete = true;
    }
    filterInPlace(chart.timeline, (item) => !item._shouldDelete);

    sortAndIndexTimeline(chart);

    pushUndoBuffer(chart, { t: MUTATION_REMOVE, items: removed });

    return removed.map(copyTimelineItem);
}

function reindexTimeline(timeline: TimelineItem[]) {
    for (let i = 0; i < timeline.length; i++) {
        const item = timeline[i];
        item._index = i;
    }
}

export function sortAndIndexTimeline(chart: SequencerChart) {
    chart._lastUpdated = Date.now();
    const timeline = chart.timeline;

    timeline.sort((a, b) => {
        const delta = a.start - b.start;
        if (delta !== 0) {
            return delta;
        }

        if (a.type === TIMELINE_ITEM_NOTE && b.type === TIMELINE_ITEM_NOTE) {
            return a.noteId - b.noteId;
        }

        return a.type - b.type;
    });

    reindexTimeline(timeline);
    computeScheduledTimes(timeline);
}

export function computeScheduledTimes(timeline: TimelineItem[]) {
    let currentBpm = DEFAULT_BPM;
    let currentBpmTime = 0;
    let currentBpmBeats = 0;
    for (let i = 0; i < timeline.length; i++) {
        const item = timeline[i];
        item._index = i;

        const realBeatsRelative = (item.start - currentBpmBeats) / FRACTIONAL_UNITS_PER_BEAT;
        const itemStartTime = currentBpmTime + beatsToMs(realBeatsRelative, currentBpm);
        item._scheduledStart = itemStartTime;

        if (item.type === TIMELINE_ITEM_MEASURE) {
            continue;
        }

        if (item.type === TIMELINE_ITEM_BPM) {
            currentBpmTime = itemStartTime;
            currentBpm = item.bpm;
            currentBpmBeats = item.start;
            continue;
        }

        if (item.type === TIMELINE_ITEM_NOTE) {
            const realBeatsEndRelative = (itemEnd(item) - currentBpmBeats) / FRACTIONAL_UNITS_PER_BEAT;
            item._scheduledEnd = currentBpmTime + beatsToMs(realBeatsEndRelative, currentBpm);
            continue;
        }

        unreachable(item);
    }
}

export function deleteAtIdx(chart: SequencerChart, idx: number) {
    const timeline = chart.timeline;

    if (idx < 0 || idx >= timeline.length) {
        return;
    }

    timeline.splice(idx, 1);
}


export function getBpm(bpmChange: TimelineItemBpmChange | undefined): number {
    if (!bpmChange) return DEFAULT_BPM;
    return bpmChange.bpm;
}

export function getBpmTime(bpmChange: TimelineItemBpmChange | undefined): number {
    if (!bpmChange) return 0;
    return getItemStartTime(bpmChange);
}

export function getBpmBeats(bpmChange: TimelineItemBpmChange | undefined): number {
    if (!bpmChange) return 0;
    return bpmChange.start;
}

export function getLastMeasureIndex(chart: SequencerChart, beats: number): number {
    const timeline = chart.timeline;

    let idx = -1;
    for (let i = timeline.length - 1; i >= 0; i--) {
        const item = timeline[i];
        if (item.type !== TIMELINE_ITEM_MEASURE) continue;

        if (item.start < beats) {
            idx = i;
            break;
        }
    }

    return idx;
}

export function getLastMeasureBeats(chart: SequencerChart, beats: number): number {
    const timeline = chart.timeline;
    if (timeline.length === 0) return 0;

    const idx = getLastMeasureIndex(chart, beats);
    if (idx === -1) {
        return 0;
    }

    const item = timeline[idx];
    if (!item || item.type !== TIMELINE_ITEM_MEASURE) {
        throw new Error("!item || item.type !== TIMELINE_ITEM_MEASURE");
    }

    return item.start;
}

export function getNextMeasureBeats(chart: SequencerChart, beats: number): number {
    const timeline = chart.timeline;
    if (timeline.length === 0) return 0;

    let idx = -1;
    for (let i = 0; i < timeline.length; i++) {
        const item = timeline[i];
        if (item.type !== TIMELINE_ITEM_MEASURE) continue;

        if (item.start > beats) {
            idx = i;
            break;
        }
    }
    if (idx === -1) {
        return beats;
    }

    const item = timeline[idx];
    if (!item || item.type !== TIMELINE_ITEM_MEASURE) {
        throw new Error("!item || item.type !== TIMELINE_ITEM_MEASURE");
    }

    return item.start;
}


export function getBeatsForTime(chart: SequencerChart, time: number): number {
    const timeline = chart.timeline;

    const lastBpmIdx = getPrevItemIndexForTime(timeline, time, -1, TIMELINE_ITEM_BPM);

    const bpmChange = arrayAt(timeline, lastBpmIdx);
    if (bpmChange && bpmChange.type !== TIMELINE_ITEM_BPM) {
        return 0;
    }

    const bpmTime = getBpmTime(bpmChange);
    const bpm = getBpm(bpmChange);
    const bpmBeats = getBpmBeats(bpmChange);

    const relativeBeats = msToBeats(time - bpmTime, bpm) * FRACTIONAL_UNITS_PER_BEAT;
    return bpmBeats + relativeBeats;
}


export function getTimeForBeats(chart: SequencerChart, beats: number): number {
    const bpmChange = getBpmChangeItemBeforeBeats(chart, beats);
    const bpmTime = getBpmTime(bpmChange);
    const bpm = getBpm(bpmChange);
    const bpmBeats = getBpmBeats(bpmChange);

    const relativeTime = beatsToMs((beats - bpmBeats) / FRACTIONAL_UNITS_PER_BEAT, bpm);
    return bpmTime + relativeTime;
}

export function transposeItems(
    chart: SequencerChart,
    notesFilter: Set<number>,
    startIdx: number,
    endIdx: number,
    halfSteps: number,
) {
    if (startIdx === -1 || endIdx === -1) {
        return;
    }

    let notesToEdit: NoteItem[] = [];

    const timeline = chart.timeline;
    for (let i = startIdx; i <= endIdx; i++) {
        const item = timeline[i];
        if (item.type === TIMELINE_ITEM_NOTE) {
            notesToEdit.push(item);
        }
    }

    notesToEdit = sequencerChartRemoveItems(chart, notesToEdit, notesFilter) as NoteItem[];

    for (const note of notesToEdit) {
        note.noteId += halfSteps;
    }

    sequencerChartInsertItems(chart, notesToEdit, notesFilter);
}


export function sequencerChartShiftItems(
    chart: SequencerChart,
    notesFilter: Set<number>,
    startIdx: number, endIdx: number,
    amountBeats: number,
) {
    if (startIdx === -1 || endIdx === -1) {
        return;
    }

    const timeline = chart.timeline;

    let toEdit: TimelineItem[] = [];
    for (let i = startIdx; i <= endIdx; i++) {
        const item = timeline[i];
        toEdit.push(item);
    }

    toEdit = sequencerChartRemoveItems(chart, toEdit, notesFilter);

    for (const item of toEdit) {
        item.start += amountBeats;
    }

    sequencerChartInsertItems(chart, toEdit, notesFilter);
}


export function getChartDurationInBeats(chart: SequencerChart): number {
    const timeline = chart.timeline;
    if (timeline.length === 0) {
        return 0;
    }

    const lastItem = timeline[timeline.length - 1];
    return itemEnd(lastItem);
}

export function newTimelineItemMeasure(start: number): TimelineItemMeasure {
    return {
        type: TIMELINE_ITEM_MEASURE,
        start,
        _scheduledStart: 0,
        _index: 0,
        _shouldDelete: false,
    }
}

export function newTimelineItemMeasureDefault() {
    return newTimelineItemMeasure(0);
}

export function newTimelineItemNote(noteId: number, start: number, len: number): NoteItem {
    return {
        type: TIMELINE_ITEM_NOTE,
        start,
        length: len,
        noteId,
        _scheduledStart: 0,
        _index: 0,
        _scheduledEnd: 0,
        _shouldDelete: false,
    };
}

export function newTimelineItemNoteDefault() {
    return newTimelineItemNote(0, 0, 1);
}

// TODO (javescript maintainers): add structs to the language, its a no brainer
export function copyTimelineItem<T extends TimelineItem>(item: T): T {
    let result: T;
    switch (item.type) {
        case TIMELINE_ITEM_NOTE: {
            result = newTimelineItemNote(item.noteId, item.start, item.length) as T;
        } break;
        case TIMELINE_ITEM_MEASURE: {
            result = newTimelineItemMeasure(item.start) as T;
        } break;
        case TIMELINE_ITEM_BPM: {
            result = newTimelineItemBpmChange(item.start, item.bpm) as T;
        } break;
        default: unreachable(item);
    }
    result._index = item._index;
    return result;
}


// TODO (javescript maintainers): add structs to the language, its a no brainer
export function timelineItemsEqual<T extends TimelineItem>(a: T, b: T): boolean {
    switch (a.type) {
        case TIMELINE_ITEM_NOTE: 
            return b.type === TIMELINE_ITEM_NOTE && a.start === b.start &&
                a.noteId === b.noteId && 
                a.length === b.length;
        case TIMELINE_ITEM_MEASURE: 
            return b.type === TIMELINE_ITEM_MEASURE && a.start === b.start;
        case TIMELINE_ITEM_BPM: 
            return b.type === TIMELINE_ITEM_BPM && a.start === b.start && a.bpm === b.bpm;
        default: unreachable(a);
    }
}

export function timelineItemToString<T extends TimelineItem>(item: T): string {
    switch (item.type) {
        case TIMELINE_ITEM_NOTE: 
            return "Note: " + item._index + " " + getMusicNoteText(item.noteId);
        case TIMELINE_ITEM_MEASURE: 
            return "Measure: " + item._index;
        case TIMELINE_ITEM_BPM: 
            return "BPM: " + item._index + " " + item.bpm;
        default: unreachable(item);
    }
}


export function compressChart(chart: SequencerChart): SequencerChartCompressed {
    const timelineAsNumbers = timelineToNumbers(chart.timeline);
    return {
        i: chart.id,
        n: chart.name,
        c: chart.cursor,
        t: numbersToVariableLengthBase64(timelineAsNumbers),
    };
}

export function uncompressChart(compressed: SequencerChartCompressed, saveStatus: SequencerChartSavedStatus): SequencerChart {
    // Metadata, id
    const chart = newChart(compressed.n);
    chart.id = compressed.i;
    chart.cursor = compressed.c;

    // Timeline
    const timelineAsNumbers = variableLengthBase64ToNumbers(compressed.t);
    chart.timeline = timelineFromNumbers(timelineAsNumbers);
    chart._savedStatus = saveStatus;

    return chart;
}

function timelineToNumbers(timeline: TimelineItem[]): number[] {
    const result: number[] = [];

    for (let i = 0; i < timeline.length; i++) {
        const item = timeline[i];
        result.push(item.type);
        result.push(item.start);
        switch (item.type) {
            case TIMELINE_ITEM_NOTE: {
                result.push(item.length);
                result.push(item.noteId);
            } break;
            case TIMELINE_ITEM_BPM: {
                result.push(item.bpm);
            } break;
            case TIMELINE_ITEM_MEASURE: {
                // nothing, as of yet
            } break;
            default: unreachable(item);
        }
        // If we need to extend our item for any reason, we
        // can start writing 1s here, and check if its a 0 or a 1.
        result.push(0);
    }

    return result;
}

function timelineFromNumbers(numbers: number[]): TimelineItem[] {
    let result: TimelineItem[] = [];

    for (let i = 0; i < numbers.length;) {
        const type = numbers[i]; i++;
        const start = numbers[i]; i++;
        switch (type) {
            case TIMELINE_ITEM_NOTE: {
                const length = numbers[i]; i++;
                const noteId = numbers[i]; i++;
                result.push(newTimelineItemNote(noteId, start, length));
            } break;
            case TIMELINE_ITEM_BPM: {
                const bpm = numbers[i]; i++;
                result.push(newTimelineItemBpmChange(start, bpm));
            } break;
            case TIMELINE_ITEM_MEASURE: {
                result.push(newTimelineItemMeasure(start));
            } break;
            default: assert(false); // can't be reached.
        }

        assert(numbers[i] === 0); i++;
    }

    return result;
}

export function isReadonlyChart(chart: SequencerChart) {
    return chart._savedStatus === CHART_STATUS_READONLY;
}
