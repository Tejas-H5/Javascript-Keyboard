import { expect, expectNotNullish, fork, test, tryFn } from "./testing";
import { canRedo, canUndo, getCurrentFile, newJSONUndoBuffer, redo, undo, undoBufferIsEmpty, writeToUndoBuffer } from "./undo-buffer-json";

test("JSON Undo buffer - usage", t => {
    function newTestState(initialValue: string, len: number) {
        const state = {
            file: { val: initialValue },
            buff: newJSONUndoBuffer<{ val: string; }>(len),
        };

        const editFile = (newValue: string, action?: number) => {
            state.file = { val: newValue };
            writeToUndoBuffer(state.buff, state.file, action);
        }

        const undoEdit = () => {
            state.file = undo(state.buff, state.file);
        }

        const redoEdit = () => {
            state.file = redo(state.buff);
        }

        const getFile = () => {
            return getCurrentFile(state.buff);
        }

        return { state, editFile, undoEdit, redoEdit, getFile };
    }

    function testFileAndCanUndoRedo(expected: string, expectUndo: boolean, expectRedo: boolean) {
        expect(t, "Expect file to be " + expected, s.getFile().val === expected);
        expect(t, "Can undo here=" + expectUndo, canUndo(s.state.buff) === expectUndo);
        expect(t, "Can redo here=" + expectRedo, canRedo(s.state.buff) === expectRedo);
    }

    const s = newTestState("a", 3);

    if (fork(t, "Before initial write")) {
        expectNotNullish(t, tryFn(() => s.getFile()));
        return;
    }

    // It's the user's job to write the initial value to the buffer.
    if (undoBufferIsEmpty(s.state.buff)) {
        writeToUndoBuffer(s.state.buff, s.state.file);
    }

    testFileAndCanUndoRedo("a", false, false);

    if (fork(t, "Before any edits")) {
        s.undoEdit();
        testFileAndCanUndoRedo("a", false, false);
        return;
    }

    s.editFile("b");
    testFileAndCanUndoRedo("b", true, false);

    if (fork(t, "After one edit")) {
        s.undoEdit(); 
        testFileAndCanUndoRedo("a", false, true);
        return;
    }

    s.editFile("c");
    testFileAndCanUndoRedo("c", true, false);

    if (fork(t, "After two edits")) {
        expect(t, "Reached max count", s.state.buff.fileVersionsJSON.length === s.state.buff.maxVersions);

        s.undoEdit(); 
        testFileAndCanUndoRedo("b", true, true);
        s.undoEdit(); 
        testFileAndCanUndoRedo("a", false, true);
        return;
    }

    s.editFile("d");
    testFileAndCanUndoRedo("d", true, false);

    if (fork(t, "After three edits (one more than max buffer size)")) {
        expect(t, "Reached max count", s.state.buff.fileVersionsJSON.length === s.state.buff.maxVersions,);

        s.undoEdit(); 
        testFileAndCanUndoRedo("c", true, true);

        s.undoEdit(); 
        testFileAndCanUndoRedo("b", false, true);

        // One more undo shouldn't be a problem
        s.undoEdit(); 
        testFileAndCanUndoRedo("b", false, true);

        return;
    }
});
