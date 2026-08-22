// A simple undo/redo system for JSON-serializable data.
// Also highly inefficient at the moment (although
// I'm sure we could turn it into a sync engine by 
// computing diffs between the JSONs themselves).
// There are no plans on optimizing it.

// NOTE: you are expected to write the initial version of the file as soon as you load it,
// so that the size of the buffer is never 0, and you can actually undo back to the
// first version of your file.

import { assert } from "./assert";
import { bytesToMegabytes, utf16ByteLength } from "./utf8";

type UndoBufferEntry = {
    // JSON is actually smarter than objects here - we can compare if two files are the same or not, 
    // estimate undo buffer size easier, and the `string` datatype will enforce immutability for us.
    // NOTE: Highly inefficient - copies entire object.
    json: string;
};


export type JSONUndoBuffer<T> = {
    fileVersionsJSON: UndoBufferEntry[];
    fileVersionsJSONSizeMb: number;
    capacity: number;

    position: number;

    // NOTE: still some race conditions in here, but it's all good. xD
    timer: number;
    pendingWrite: T | undefined;

    serializeFn: (val: T) => string;
    deserializeFn: (str: string) => T;

};

function jsonSerialize<T>(val: T) {
    return JSON.stringify(val);
}

function jsonDeserialize<T>(val: string): T {
    return JSON.parse(val) as T;
}

export function newJSONUndoBuffer<T>(
    firstVersion: T,
    maxVersions: number,
    serializeFn: (val: T) => string = jsonSerialize,
    deserializeFn: (str: string) => T = jsonDeserialize,
): JSONUndoBuffer<T> {
    // 1 slot to store the initial version, 1 more to store the current version
    assert(maxVersions > 1);

    return {
        fileVersionsJSON: [{ json: serializeFn(firstVersion) }],
        fileVersionsJSONSizeMb: 0,
        capacity: maxVersions,
        pendingWrite: undefined,
        position: 0,
        timer: -1,
        serializeFn,
        deserializeFn,
    };
}

// TODO: maybe use javascript timeout ?? xD
export function stepUndoBufferTimer<T>(undoBuffer: JSONUndoBuffer<T>, dt: number) {
    if (undoBuffer.timer > 0) {
        undoBuffer.timer -= dt;
        if (undoBuffer.timer <= 0) {
            writePendingUndoToUndoBuffer(undoBuffer);
        }
    }
}

export function writeToUndoBufferDebounced<T>(
    undoBuffer: JSONUndoBuffer<T>,
    file: T,
    debounceSeconds: number
) {
    undoBuffer.timer = debounceSeconds;
    undoBuffer.pendingWrite = file;
}

export function writeToUndoBuffer<T>(undoBuffer: JSONUndoBuffer<T>, file: T) {
    writePendingUndoToUndoBuffer(undoBuffer);

    undoBuffer.timer = -1;
    undoBuffer.pendingWrite = undefined;

    const currentProgramJSON = undoBuffer.serializeFn(file)
    const entry: UndoBufferEntry = { json: currentProgramJSON };

    let lastFile;
    if (undoBuffer.fileVersionsJSON.length > 0) {
        lastFile = undoBuffer.fileVersionsJSON[undoBuffer.fileVersionsJSON.length - 1];
    }

    if (lastFile && lastFile.json === currentProgramJSON) {
        // Don't write anything if its literally the same file
        return;
    }

    assert(undoBuffer.position < undoBuffer.fileVersionsJSON.length)

    if (undoBuffer.position + 1 < undoBuffer.fileVersionsJSON.length) {
        // Truncate undo buffer to where we are now
        undoBuffer.fileVersionsJSON.length = undoBuffer.position + 1;
    }

    if (undoBuffer.fileVersionsJSON.length === undoBuffer.capacity) {
        // TODO: this is highly inefficient, use a ringbuffer
        undoBuffer.fileVersionsJSON.shift();
        undoBuffer.fileVersionsJSON.push(entry);
    } else {
        undoBuffer.fileVersionsJSON.push(entry);
        undoBuffer.position++;
    }

    // track size for the lolz
    let sizeBytes = 0;
    for (const entry of undoBuffer.fileVersionsJSON) {
        sizeBytes += utf16ByteLength(entry.json);
    }
    undoBuffer.fileVersionsJSONSizeMb = bytesToMegabytes(sizeBytes);
}

function writePendingUndoToUndoBuffer<T>(undoBuffer: JSONUndoBuffer<T>) {
    if (undoBuffer.pendingWrite) {
        // Breaks infinite recursion, and is idempotent in the face of exceptions
        const fileToWrite = undoBuffer.pendingWrite;
        undoBuffer.pendingWrite = undefined;

        undoBuffer.timer = -1;
        writeToUndoBuffer(undoBuffer, fileToWrite);
    }
}

export function canUndo<T>(undoBuffer: JSONUndoBuffer<T>): boolean {
    if (undoBuffer.pendingWrite) {
        return true;
    }

    return undoBuffer.position >= 1;
}

export function undo<T>(undoBuffer: JSONUndoBuffer<T>): T {
    writePendingUndoToUndoBuffer(undoBuffer);

    assert(canUndo(undoBuffer));

    undoBuffer.position--;
    const currentEntry = undoBuffer.fileVersionsJSON[undoBuffer.position];
    return undoBuffer.deserializeFn(currentEntry.json);
}

export function undoBufferIsEmpty<T>(undoBuffer: JSONUndoBuffer<T>): boolean {
    return undoBuffer.fileVersionsJSON.length === 0;
}

export function canRedo<T>(undoBuffer: JSONUndoBuffer<T>) {
    return undoBuffer.position < undoBuffer.fileVersionsJSON.length - 1;
}

export function redo<T>(undoBuffer: JSONUndoBuffer<T>) {
    if (canRedo(undoBuffer)) {
        undoBuffer.position++;
    }

    const currentEntry = undoBuffer.fileVersionsJSON[undoBuffer.position];
    return undoBuffer.deserializeFn(currentEntry.json);
}

