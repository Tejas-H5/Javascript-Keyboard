// A simple undo/redo system for JSON-serializable data.
// Also highly inefficient at the moment (although
// I'm sure we could turn it into a sync engine by 
// computing diffs between the JSONs themselves).
// There are no plans on optimizing it.

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


export type JSONUndoBuffer<_T> = {
    // NOTE: Unbounded buffer size! Who cares.
    fileVersionsJSON: UndoBufferEntry[];
    fileVersionsJSONSizeMb: number;
    position: number;

    // NOTE: still some race conditions in here, but it's all good. xD
    timer: number;
};


export function newUndoBuffer<T>(): JSONUndoBuffer<T> {
    return {
        fileVersionsJSON: [],
        fileVersionsJSONSizeMb: 0,
        position: 0,
        timer: -1,
    };
}

// TODO: maybe use javascript timeout ?? xD
export function stepUndoBufferTimer<T>(undoBuffer: JSONUndoBuffer<T>, dt: number, file: T) {
    if (undoBuffer.timer > 0) {
        undoBuffer.timer -= dt;
        if (undoBuffer.timer <= 0) {
            writeToUndoBuffer(undoBuffer, file);
        }
    } else if (undoBuffer.fileVersionsJSON.length === 0) {
        // We need to write the very first version ourselves, and then let the debounce handle successive writes.
        writeToUndoBuffer(undoBuffer, file);
    }
}

export function writeToUndoBufferDebounced<T>(
    undoBuffer: JSONUndoBuffer<T>,
    // Might need later if we want to use setTimeout instead.
    _file: T,
    debounceSeconds: number
) {
    undoBuffer.timer = debounceSeconds;
}

export function writeToUndoBuffer<T>(undoBuffer: JSONUndoBuffer<T>, file: T, actionType?: number) {
    undoBuffer.timer = -1;

    const currentProgramJSON = JSON.stringify(file);
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

    undoBuffer.position++;
    if (undoBuffer.position > undoBuffer.fileVersionsJSON.length) {
        undoBuffer.position = undoBuffer.fileVersionsJSON.length;
    }

    if (undoBuffer.position + 1 !== undoBuffer.fileVersionsJSON.length) {
        undoBuffer.fileVersionsJSON.length = undoBuffer.position + 1;
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
    return JSON.parse(undoBuffer.fileVersionsJSON[undoBuffer.position].json);
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

