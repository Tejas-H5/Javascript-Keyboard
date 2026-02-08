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
    // Used to 'batch' multiple actions. 
    // A non-zero type will replace the last undo entry instead of appending a new one
    actionType?: number;
};


export type JSONUndoBuffer<T> = {
    fileVersionsJSON: UndoBufferEntry[];
    fileVersionsJSONSizeMb: number;
    maxVersions: number;

    position: number;

    // NOTE: still some race conditions in here, but it's all good. xD
    timer: number;

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
    maxVersions: number,
    serializeFn: (val: T) => string = jsonSerialize,
    deserializeFn: (str: string) => T = jsonDeserialize,
): JSONUndoBuffer<T> {
    // 1 slot to store the initial version, 1 more to store the current version
    assert(maxVersions > 1);

    return {
        fileVersionsJSON: [],
        fileVersionsJSONSizeMb: 0,
        maxVersions: maxVersions,
        position: 0,
        timer: -1,
        serializeFn,
        deserializeFn,
    };
}

// TODO: maybe use javascript timeout ?? xD
export function stepUndoBufferTimer<T>(undoBuffer: JSONUndoBuffer<T>, dt: number, file: T) {
    if (undoBuffer.timer > 0) {
        undoBuffer.timer -= dt;
        if (undoBuffer.timer <= 0) {
            writeToUndoBuffer(undoBuffer, file);
        }
    }
}

export function writeToUndoBufferDebounced<T>(
    undoBuffer: JSONUndoBuffer<T>,
    // Might need later if we want to use setTimeout instead of the current polling approach
    _file: T,
    debounceSeconds: number
) {
    undoBuffer.timer = debounceSeconds;
}

export function writeToUndoBuffer<T>(undoBuffer: JSONUndoBuffer<T>, file: T, actionType?: number) {
    undoBuffer.timer = -1;

    const currentProgramJSON = undoBuffer.serializeFn(file)
    const entry: UndoBufferEntry = {
        json: currentProgramJSON,
        actionType,
    };

    if (undoBuffer.fileVersionsJSON.length > 0) {
        const lastProgram = undoBuffer.fileVersionsJSON[undoBuffer.fileVersionsJSON.length - 1];
        if (lastProgram.json === currentProgramJSON) {
            // Don't write anything if its literally the same program
            return;
        }

        if (lastProgram.actionType !== undefined && actionType !== undefined) {
            if (lastProgram.actionType === actionType) {
                // Overwrite last entry instead of appending new entry
                undoBuffer.fileVersionsJSON[undoBuffer.fileVersionsJSON.length - 1] = entry;
                return;
            }
        }
    }

    if (undoBuffer.position < undoBuffer.maxVersions - 1) {
        undoBuffer.position++;
        if (undoBuffer.position > undoBuffer.fileVersionsJSON.length) {
            undoBuffer.position = undoBuffer.fileVersionsJSON.length;
        }

        if (undoBuffer.position + 1 !== undoBuffer.fileVersionsJSON.length) {
            undoBuffer.fileVersionsJSON.length = undoBuffer.position + 1;
        }
    } else {
        undoBuffer.fileVersionsJSON.shift();
    }

    undoBuffer.fileVersionsJSON[undoBuffer.position] = entry;

    // track size for the lolz
    let sizeBytes = 0;
    for (const entry of undoBuffer.fileVersionsJSON) {
        sizeBytes += utf16ByteLength(entry.json);
    }
    undoBuffer.fileVersionsJSONSizeMb = bytesToMegabytes(sizeBytes);
}

function writePendingUndoToUndoBuffer<T>(undoBuffer: JSONUndoBuffer<T>, file: T) {
    if (undoBuffer.timer > 0) {
        writeToUndoBuffer(undoBuffer, file);
    }
}

export function canUndo<T>(undoBuffer: JSONUndoBuffer<T>): boolean {
    return undoBuffer.position > 0;
}

export function undo<T>(undoBuffer: JSONUndoBuffer<T>, file: T): T {
    writePendingUndoToUndoBuffer(undoBuffer, file);

    if (canUndo(undoBuffer)) {
        undoBuffer.position--;
    }

    return getCurrentFile(undoBuffer);
}

export function getCurrentFile<T>(undoBuffer: JSONUndoBuffer<T>): T {
    assert(!undoBufferIsEmpty(undoBuffer));
    return undoBuffer.deserializeFn(undoBuffer.fileVersionsJSON[undoBuffer.position].json);
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

    return getCurrentFile(undoBuffer);
}

