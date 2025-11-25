import { closeContextMenu, contextMenuIsOpen, ContextMenuState, imContextMenuBegin, imContextMenuEnd, imContextMenuItemBegin, imContextMenuItemEnd, newContextMenuState, openContextMenuAtMouse } from "src/app-components/context-menu";
import { imCompactCircularDragSlideInteraction, imCompactCircularDragSlideInteractionFeedback, imCompactLinearDragSlideInteraction } from "src/app-components/drag-slider-interaction";
import { imModalBegin, imModalEnd } from "src/app-components/modal";
import { imButtonBegin, imButtonEnd, imButtonIsClicked } from "src/components/button";
import { imBeginCanvasRenderingContext2D, imEndCanvasRenderingContext2D } from "src/components/canvas2d";
import {
    BLOCK,
    COL,
    imAbsolute,
    imAlign,
    imBg,
    imFlex,
    imFlex1,
    imGap,
    imJustify,
    imLayout,
    imLayoutEnd,
    imNoWrap,
    imPadding,
    imRelative,
    imSize,
    INLINE_BLOCK,
    NA,
    PERCENT,
    PX,
    ROW,
    START,
    STRETCH
} from "src/components/core/layout";
import { cssVars } from "src/components/core/stylesheets";
import { imLine, LINE_HORIZONTAL_PADDING, LINE_VERTICAL, LINE_VERTICAL_PADDING } from "src/components/im-line";
import { imRangeSlider } from "src/components/range-slider";
import { imScrollContainerBegin, imScrollContainerEnd, newScrollContainer } from "src/components/scroll-container";
import { copyInstruction, getDefaultInstructions } from "src/dsp/dsp-loop";
import {
    computeSample,
    DspSynthInstructionItem,
    fixInstructionPartInstructionPartArgument,
    IDX_COUNT,
    IDX_OUTPUT,
    IDX_USER,
    INSTR_ADD,
    INSTR_ADD_DT,
    INSTR_DIVIDE,
    INSTR_EQ,
    INSTR_GT,
    INSTR_GTE,
    INSTR_LT,
    INSTR_LTE,
    INSTR_MULTIPLY,
    INSTR_MULTIPLY_DT,
    INSTR_NEQ,
    INSTR_SIN,
    INSTR_SQUARE,
    INSTR_SUBTRACT,
    instrToString,
    InstructionPart,
    InstructionPartArgument,
    InstructionType,
    newDspInstruction,
    newSampleContext,
    REGISTER_INFO,
    registerIdxToString,
    updateSampleContext,
    WaveProgram
} from "src/dsp/dsp-loop-instruction-set";
import { getCurrentPlaySettings } from "src/dsp/dsp-loop-interface";
import { arrayAt, arraySwap, filterInPlace } from "src/utils/array-utils";
import { newCssBuilder } from "src/utils/cssb";
import {
    ImCache,
    imElse,
    imEndIf,
    imFor,
    imForEnd,
    imGet,
    imIf,
    imIfElse,
    imIfEnd,
    imMemo,
    imSet,
    imState,
    isFirstishRender
} from "src/utils/im-core";
import { EL_B, elHasMouseOver, elHasMousePress, elSetClass, elSetStyle, getGlobalEventSystem, imEl, imElEnd, imStr, imStrFmt } from "src/utils/im-dom";
import { clamp, gridsnapRound } from "src/utils/math-utils";
import { getNoteFrequency } from "src/utils/music-theory-utils";
import { bytesToMegabytes, utf16ByteLength } from "src/utils/utf8";
import { GlobalContext } from "./app";
import { drawSamples, newPlotState } from "./plotting";
import { SoundLabState } from "./sound-lab-view";
import { cssVarsApp } from "./styling";

const cssb = newCssBuilder();
const cnWaveProgramEditor = cssb.cn("waveProgramEditor", [
    // TODO: better styling xD
    ` .hoverable:hover { cursor: pointer; outline: 2px solid ${cssVars.fg}; border-radius: 4px; }`
]);


const instructionChoices: InstructionType[] = [
    INSTR_SIN,
    INSTR_SQUARE,
    INSTR_ADD,
    INSTR_ADD_DT,
    INSTR_SUBTRACT,
    INSTR_MULTIPLY,
    INSTR_MULTIPLY_DT,
    INSTR_DIVIDE,
    INSTR_LT,
    INSTR_LTE,
    INSTR_GT,
    INSTR_GTE,
    INSTR_EQ,
    INSTR_NEQ,
];

const UNDO_DEBOUNCE_SECONDS = 0.2;

export type WaveProgramEditorState = {
    waveProgram: WaveProgram;
    undoBuffer: {
        // JSON is actually smarter than objects here - we can compare if two programs are the same or not, 
        // estimate undo buffer size easier, and the `string` datatype will enforce immutability for us
        programVersionsJSON: string[];
        programVersionsJSONSizeMb: number;
        position: number;
        timer: number;
    };

    instructionsVersion: number;
    registersInUseWrite: Set<number>;
    registersInUseRead: Set<number>;

    highlightedRegister: number;
    highlightedRegisterNext: number;

    contextMenu: ContextMenuState;
};

const CONTEXT_MENU_FIELD__TYPE = 1;
const CONTEXT_MENU_FIELD__VAL1 = 2;
const CONTEXT_MENU_FIELD__VAL2 = 3;
const CONTEXT_MENU_FIELD__DST = 4;

export function newWaveProgramEditorState(): WaveProgramEditorState {
    return {
        waveProgram: {
            instructions: getDefaultInstructions(),
        },
        instructionsVersion: 0,
        registersInUseWrite: new Set(),
        registersInUseRead: new Set(),
        highlightedRegister: -1,
        highlightedRegisterNext: -1,
        contextMenu: newContextMenuState(),
        undoBuffer: {
            programVersionsJSON: [],
            programVersionsJSONSizeMb: 0,
            position: 0,
            timer: -1,
        }
    };
}


export function imWaveProgramEditor(c: ImCache, ctx: GlobalContext, state: SoundLabState) {
    const editor = state.instructionBuilder;
    const playSettings = getCurrentPlaySettings();

    editor.highlightedRegister = editor.highlightedRegisterNext;
    editor.highlightedRegisterNext = -1;

    let updateSettings = false;
    const instructionsChanged = imMemo(c, editor.instructionsVersion);

    if (instructionsChanged) {
        editor.registersInUseRead.clear();
        editor.registersInUseWrite.clear();

        const dfs = (instructions: DspSynthInstructionItem[]) => {
            for (const instr of instructions) {
                if (instr.instruction) {
                    if (instr.instruction.arg1.reg) editor.registersInUseRead.add(instr.instruction.arg1.val);
                    if (instr.instruction.arg2.reg) editor.registersInUseRead.add(instr.instruction.arg2.val);
                    editor.registersInUseWrite.add(instr.instruction.dst);
                }

                if (instr.ifelseInnerBlock) {
                    dfs(instr.ifelseInnerBlock.inner);
                }
            }
        }
        dfs(editor.waveProgram.instructions);
    }

    const undoBuffer = editor.undoBuffer;
    if (undoBuffer.timer > 0) {
        undoBuffer.timer -= ctx.deltaTime;
        if (undoBuffer.timer <= 0) {
            writeProgramToUndoBuffer(editor);
        }
    } else if (undoBuffer.programVersionsJSON.length === 0) {
        // We need to write the very first version ourselves, and then let the debounce handle successive writes.
        writeProgramToUndoBuffer(editor);
    }

    imModalBegin(c); imPadding(c, 10, PX, 10, PX, 10, PX, 10, PX); {
        imLayout(c, ROW); imSize(c, 100, PERCENT, 100, PERCENT); imBg(c, cssVars.bg); {

            if (isFirstishRender(c)) {
                elSetClass(c, cnWaveProgramEditor);
            }

            const sc = imState(c, newScrollContainer);

            imLayout(c, COL); imFlex(c); {
                imHeading(c, "Instructions");

                imScrollContainerBegin(c, sc); {
                    if (isFirstishRender(c)) {
                        elSetStyle(c, "fontFamily", "monospace");
                        elSetStyle(c, "fontSize", "20px");
                        elSetStyle(c, "padding", "3px");
                    }

                    const edited = imInstructionArrayEditor(c, editor, editor.waveProgram.instructions);
                    if (edited) {
                        updateSettings = true;
                    }
                } imScrollContainerEnd(c);

                imLayout(c, BLOCK); imSize(c, 0, NA, 5, PX); imBg(c, cssVars.bg); imRelative(c); {
                    // Will the undo buffer reach 5 mb doe ??. (it will totally reach 1mb.)
                    const percentage = 100 * undoBuffer.programVersionsJSONSizeMb / 5.0;
                    imLayout(c, BLOCK); imBg(c, cssVars.fg);
                    imAbsolute(c, 0, PX, 0, NA, 0, PX, 0, PX); imSize(c, percentage, PERCENT, 0, NA); {
                    } imLayoutEnd(c);
                } imLayoutEnd(c);
            } imLayoutEnd(c);

            imLine(c, LINE_VERTICAL_PADDING);
            imLine(c, LINE_VERTICAL);
            imLine(c, LINE_VERTICAL_PADDING);

            imLayout(c, COL); imFlex(c); {
                // want to visualize the program somehow. 
                {
                    const mockSampleRate = 44800;

                    const s = imGet(c, imWaveProgramEditor) ?? imSet(c, {
                        noteIdx: 0,
                        ctx: newSampleContext(),

                        samples: Array(mockSampleRate * 3).fill(0) as number[],
                        viewingIdx: 0,
                        viewingLen: 58071,
                        viewingInvalidated: true,

                        samplePressedIdx: 14430,
                        sampleReleasedIdx: 28090,
                    });

                    if (imMemo(c, s.noteIdx)) s.viewingInvalidated = true;
                    if (instructionsChanged) s.viewingInvalidated = true;

                    imHeading(c, "Wave program");

                    imLayout(c, BLOCK); {
                        imStr(c, "Computational cost: ");
                        imStr(c, playSettings.parameters.instructions.length);
                    } imLayoutEnd(c);

                    const params = playSettings.parameters;
                    let samplesRecomputed = false;
                    if (s.viewingInvalidated) {
                        s.viewingInvalidated = false;
                        samplesRecomputed = true;

                        s.ctx.isPressed = false;
                        for (let i = 0; i < s.samples.length; i++) {
                            let frequency = getNoteFrequency(s.noteIdx);
                            let signal = 0;
                            if(s.samplePressedIdx < i && i < s.sampleReleasedIdx) {
                                signal = 1;
                            }

                            updateSampleContext(s.ctx, frequency, signal, 1 / mockSampleRate);
                            s.samples[i] = computeSample(s.ctx, params.instructions);
                        }
                    }

                    imLayout(c, COL); imSize(c, 0, NA, 200, PX); {
                        const [_, ctx, width, height, dpi] = imBeginCanvasRenderingContext2D(c); {
                            const plotState = imState(c, newPlotState);
                            const widthChanged = imMemo(c, width);
                            const heightChanged = imMemo(c, height);
                            const dpiChanged = imMemo(c, dpi);

                            const resize = widthChanged || heightChanged || dpiChanged;
                            if (resize) {
                                plotState.width = width;
                                plotState.height = height;
                                plotState.dpi = dpi;
                                s.viewingInvalidated = true;
                            }

                            if (samplesRecomputed) {
                                ctx.clearRect(0, 0, width, height);

                                ctx.strokeStyle = "black";
                                ctx.lineWidth = 2;
                                drawSamples(
                                    s.samples,
                                    plotState,
                                    ctx,
                                    s.viewingIdx,
                                    s.viewingLen
                                );
                            }
                        } imEndCanvasRenderingContext2D(c);
                    } imLayoutEnd(c);

                    imLayout(c, ROW); imAlign(c); {
                        imLayout(c, BLOCK); imSize(c, 150, PX, 0, NA); {
                            imStr(c, "Samples: ");
                        } imLayoutEnd(c);
                        imLayout(c, COL); imFlex(c); {
                            const [start, end, draggingStart, draggingEnd] = imRangeSlider(
                                c,
                                0, s.samples.length,
                                s.viewingIdx, s.viewingIdx + s.viewingLen, 1,
                                100,
                            ).value;

                            s.viewingIdx = start;
                            s.viewingLen = end - start;
                            if (draggingStart || draggingEnd) {
                                s.viewingInvalidated = true;
                            }
                        } imLayoutEnd(c);
                    } imLayoutEnd(c);
                    imLayout(c, ROW); imAlign(c); {
                        imLayout(c, BLOCK); imSize(c, 150, PX, 0, NA); {
                            imStr(c, "Signal: ");
                        } imLayoutEnd(c);
                        imLayout(c, COL); imFlex(c); {
                            const [start, end, draggingStart, draggingEnd] = imRangeSlider(
                                c,
                                0, s.samples.length,
                                s.samplePressedIdx, s.sampleReleasedIdx, 1,
                                100,
                            ).value;
                            s.samplePressedIdx = start;
                            s.sampleReleasedIdx = end;
                            if (draggingStart || draggingEnd) {
                                s.viewingInvalidated = true;
                            }
                        } imLayoutEnd(c);
                    } imLayoutEnd(c);
                }

                imHeading(c, "Parameters");

                const sc = imState(c, newScrollContainer);
                imScrollContainerBegin(c, sc); {
                    if (isFirstishRender(c)) {
                        elSetStyle(c, "fontFamily", "monospace");
                        elSetStyle(c, "fontSize", "20px");
                    }

                    let numUnused = 0;

                    imLayout(c, ROW); {
                        imLayout(c, COL); imFlex(c); {
                            imFor(c); for (let i = 0; i < Math.floor(IDX_COUNT / 2); i++) {
                                const isRead = editor.registersInUseRead.has(i);
                                const isWrite = editor.registersInUseWrite.has(i);
                                if (!isRead && !isWrite) {
                                    numUnused++;
                                    continue;
                                }

                                imBindableParameter(c, editor, i, isRead, isWrite);
                            } imForEnd(c);
                        } imLayoutEnd(c);
                        imLayout(c, COL); imFlex(c); {
                            imFor(c); for (let i = Math.floor(IDX_COUNT / 2); i < IDX_COUNT; i++) {
                                const isRead = editor.registersInUseRead.has(i);
                                const isWrite = editor.registersInUseWrite.has(i);
                                if (!isRead && !isWrite) {
                                    numUnused++;
                                    continue;
                                }

                                imBindableParameter(c, editor, i, isRead, isWrite);
                            } imForEnd(c);
                        } imLayoutEnd(c);
                    } imLayoutEnd(c);
                    imLayout(c, BLOCK); {
                        imStr(c, numUnused);
                        imStr(c, " unused");
                    } imLayoutEnd(c);
                } imScrollContainerEnd(c);
            } imLayoutEnd(c);
        } imLayoutEnd(c);
    } imModalEnd(c);

    let wasUndoTraversal = false;

    if (!ctx.handled) {
        if (ctx.keyPressState) {
            const { key, keyUpper, ctrlPressed, shiftPressed } = ctx.keyPressState;
            if (key === "Escape") {
                state.isEditingInstructions = false;
                ctx.handled = true;
            } else if (keyUpper === "Z" && ctrlPressed && !shiftPressed) {
                writePendingUndoToUndoBuffer(editor);

                if (undoBuffer.position > 0) {
                    undoBuffer.position--;
                    editor.waveProgram = JSON.parse(undoBuffer.programVersionsJSON[undoBuffer.position]);
                    updateSettings = true;
                    wasUndoTraversal = true;
                }
                ctx.handled = true;
            } else if (
                (keyUpper === "Z" && ctrlPressed && shiftPressed) ||
                (keyUpper === "Y" && ctrlPressed && !shiftPressed)
            ) {
                if (undoBuffer.position < undoBuffer.programVersionsJSON.length - 1) {
                    undoBuffer.position++;
                    editor.waveProgram = JSON.parse(undoBuffer.programVersionsJSON[undoBuffer.position]);
                    updateSettings = true;
                    wasUndoTraversal = true;
                }
                ctx.handled = true;
            }
        }
    }

    if (updateSettings) {
        state.instructionBuilder.instructionsVersion++;

        if (!wasUndoTraversal) {
            undoBuffer.timer = UNDO_DEBOUNCE_SECONDS;
        }
    }
}

function imHeading(c: ImCache, text: string) {
    imLayout(c, ROW); imJustify(c); {
        imEl(c, EL_B); imStr(c, text); imElEnd(c, EL_B);
    } imLayoutEnd(c);
}


const DRAG_TYPE_LINEAR = 1;
const DRAG_TYPE_CIRCULAR = 2;

function imParameterSliderInteraction(
    c: ImCache,
    min: number,
    max: number,
    step: number,
    val: number,
    defaultValue: number,
    dragType = DRAG_TYPE_LINEAR,
): { val: number } | null {
    let initialVal = val;

    const { mouse } = getGlobalEventSystem();

    if (mouse.ev?.shiftKey) {
        step = 0.1
    }

    if (imIf(c) && dragType === DRAG_TYPE_CIRCULAR) {
        const state = imCompactCircularDragSlideInteraction(c, val, min, max, 100, 1);
        imCompactCircularDragSlideInteractionFeedback(c, state);

        val = state.value;
    } else {
        imElse(c);
        val = imCompactLinearDragSlideInteraction(c, 100, val, min, max);
    } imEndIf(c);

    val = gridsnapRound(val, step);
    val = clamp(val, min, max);

    if (elHasMousePress(c) && mouse.rightMouseButton) {
        // Reset to default value on rightclick
        mouse.ev?.preventDefault();
        val = defaultValue;
    }

    if (val !== initialVal) {
        return { val };
    }

    return null;
}
function imBindableParameter(
    c: ImCache,
    editor: WaveProgramEditorState,
    varIdx: number,
    isRead: boolean,
    isWrite: boolean
) {
    imLayout(c, ROW); imRegisterHighlightBg(c, editor, varIdx); {
        if (elHasMouseOver(c)) {
            editor.highlightedRegisterNext = varIdx;
        }

        imLayout(c, ROW); imSize(c, 40, PX, 0, NA); imJustify(c); {
            imStr(c, varIdx);
        } imLayoutEnd(c);
        imStr(c, " -> ");

        imStrFmt(c, varIdx, registerIdxToString);

        let used = false;
        if (imIf(c) && isRead) {
            used = true;
            imStr(c, "[r]");
        } imIfEnd(c);
        if (imIf(c) && isWrite) {
            used = true;
            imStr(c, "[w]");
        } imIfEnd(c);
    } imLayoutEnd(c);
}

export function imInstructionArrayEditor(
    c: ImCache,
    editor: WaveProgramEditorState,
    instructions: DspSynthInstructionItem[],
): boolean {
    let edited = false;

    imFor(c); for (let i = 0; i < instructions.length; i++) {
        const prevInstruction = arrayAt(instructions, i - 1);
        const instruction = instructions[i];

        if (imIf(c) && (instruction.instruction || instruction.ifelseInnerBlock)) {
            const instr = instruction.instruction;

            imLayout(c, ROW); imAlign(c, STRETCH); imGap(c, 10, PX); {
                if (isFirstishRender(c)) {
                    elSetStyle(c, "lineHeight", "1");
                    elSetStyle(c, "userSelect", "none");
                }

                // If-statement toggle
                {
                    let text = "if";
                    if (instruction.ifelseInnerBlock?.isElseBlock) {
                        if (!instruction.instruction) {
                            text = "else";
                        } else {
                            text = "else if";
                        }
                    }

                    const ifButtonClicked = imButtonBegin(c, text, !!instruction.ifelseInnerBlock); imNoWrap(c); {
                        if (ifButtonClicked) {
                            if (instruction.ifelseInnerBlock) {
                                let becameElseBock = false;

                                const canTransitionToElse = prevInstruction && prevInstruction.ifelseInnerBlock;
                                if (canTransitionToElse) {
                                    if (!instruction.ifelseInnerBlock.isElseBlock) {
                                        becameElseBock = true;
                                        instruction.ifelseInnerBlock.isElseBlock = true;
                                    } else if (instruction.instruction) {
                                        becameElseBock = true;
                                        instruction.instruction = undefined;
                                    }
                                }

                                if (!becameElseBock) {
                                    instruction.ifelseInnerBlock = undefined;
                                }
                            } else {
                                instruction.ifelseInnerBlock = {
                                    isElseBlock: false,
                                    inner: [],
                                };
                            }
                            edited = true;
                        }
                    } imButtonEnd(c);
                }

                if (imIf(c) && instr) {
                    // register value 1
                    const editedValue1 = imRegisterArgumentEditor(c, editor, instr, instr.arg1);
                    if (editedValue1) {
                        edited = true;
                    }

                    // Instruction type dropdown
                    imLayout(c, ROW); imAlign(c); imJustify(c); imSize(c, 10, PERCENT, 0, NA); {
                        if (isFirstishRender(c)) elSetClass(c, "hoverable");

                        if (elHasMousePress(c)) {
                            openContextMenuAtMouse(editor.contextMenu, instr, CONTEXT_MENU_FIELD__TYPE);
                        }

                        if (
                            imIf(c) &&
                            editor.contextMenu.item === instr &&
                            editor.contextMenu.field === CONTEXT_MENU_FIELD__TYPE
                        ) {
                            imContextMenuBegin(c, editor.contextMenu); {
                                imFor(c); for (const instrType of instructionChoices) {
                                    imContextMenuItemBegin(c); {
                                        if (isFirstishRender(c)) elSetClass(c, "hoverable");
                                        imStrFmt(c, instrType, instrToString);

                                        if (elHasMousePress(c)) {
                                            instr.type = instrType;
                                            edited = true;
                                        }
                                    } imLayoutEnd(c);
                                } imForEnd(c);
                            } imContextMenuEnd(c, editor.contextMenu);
                        } imIfEnd(c);

                        imLayout(c, INLINE_BLOCK); imNoWrap(c); {
                            imStrFmt(c, instr.type, instrToString);
                        } imLayoutEnd(c);
                    } imLayoutEnd(c);

                    // register value 2
                    const editedValue2 = imRegisterArgumentEditor(c, editor, instr, instr.arg2);
                    if (editedValue2) {
                        edited = true;
                    }

                    if (imIf(c) && instruction.ifelseInnerBlock) {
                        imLayout(c, ROW); imAlign(c); imNoWrap(c); {
                            imStr(c, ":");
                        } imLayoutEnd(c);
                    } else {
                        imIfElse(c);

                        imLayout(c, ROW); imSize(c, 20, PX, 0, NA); imAlign(c); imJustify(c); imNoWrap(c); {
                            imStr(c, "->");
                        } imLayoutEnd(c);

                        imLayout(c, ROW); imAlign(c, STRETCH); imJustify(c, START); imSize(c, 15, PERCENT, 0, NA); imGap(c, 10, PX); {
                            const newRegister = imRegisterContextMenu(c, editor, instr.dst, instr, CONTEXT_MENU_FIELD__DST);
                            if (newRegister !== null) {
                                instr.dst = newRegister;
                                edited = true;
                            }
                        } imLayoutEnd(c);
                    } imIfEnd(c);

                    imFlex1(c);

                    if (imButtonIsClicked(c, "+")) {
                        const copy = copyInstruction(instruction);
                        instructions.splice(i, 0, copy);
                        edited = true;
                    }

                    const canMoveUp = i > 0;
                    const moveUpClicked = imButtonBegin(c, "^"); {
                        if (moveUpClicked && canMoveUp) {
                            arraySwap(instructions, i, i - 1)
                            edited = true;
                        }
                        elSetStyle(c, "opacity", canMoveUp ? "1" : "0");
                    } imButtonEnd(c);

                    const canMoveDown = i < instructions.length - 1;
                    const moveDownClicked = imButtonBegin(c, "v"); {
                        if (moveDownClicked && canMoveDown) {
                            arraySwap(instructions, i, i + 1)
                            edited = true;
                        }
                        elSetStyle(c, "opacity", canMoveDown ? "1" : "0");
                    } imButtonEnd(c);

                    if (imButtonIsClicked(c, "x")) {
                        filterInPlace(instructions, i => i !== instruction);
                        edited = true;
                    }
                } imIfEnd(c);
            } imLayoutEnd(c);
        } imIfEnd(c);

        if (imIf(c) && instruction.ifelseInnerBlock) {
            imLayout(c, BLOCK); imPadding(c, 0, NA, 0, NA, 0, NA, 30, PX); {
                const ifEdited = imInstructionArrayEditor(c, editor, instruction.ifelseInnerBlock.inner);
                if (ifEdited) {
                    edited = true;
                }
            } imLayoutEnd(c);
        } imIfEnd(c);
    } imForEnd(c);

    imLayout(c, ROW); {
        if (imButtonIsClicked(c, "Add line")) {
            if (instructions.length > 0) {
                const lastInstruction = instructions[instructions.length - 1];
                const copy = copyInstruction(lastInstruction);
                instructions.push(copy);
                edited = true;
            } else {
                const benignInstr = { instruction: newDspInstruction(0, false, INSTR_ADD, 0, false, IDX_OUTPUT) };
                instructions.push(benignInstr);
                edited = true;
            }
        }
    } imLayoutEnd(c);

    return edited;
}

export function imWaveProgramPreview(
    c: ImCache,
    _ctx: GlobalContext,
    state: SoundLabState
) {
    imLayout(c, COL); imFlex(c); {
        imLayout(c, ROW); {
            imStr(c, "Wave program"); 

            imFlex1(c);

            if (imButtonIsClicked(c, "Edit")) {
                state.isEditingInstructions = true;
            }
        } imLayoutEnd(c);

        imLine(c, LINE_HORIZONTAL_PADDING);

        const sc = imState(c, newScrollContainer);
        imScrollContainerBegin(c, sc); {
            imFor(c); for (const instr of state.instructionBuilder.waveProgram.instructions) {
                imLayout(c, ROW); imGap(c, 6, PX); {
                    imStrFmt(c, instr.instruction?.type, instrToString);

                    imStr(c, " TODO: Implement this");
                } imLayoutEnd(c);
            } imForEnd(c);
        } imScrollContainerEnd(c);

    } imLayoutEnd(c);
}


function imRegisterContextMenu(
    c: ImCache,
    editor: WaveProgramEditorState,
    currentRegister: number,
    instr: InstructionPart,
    field: unknown,
): number | null {
    let newRegister: number | null = null;
    
    imLayout(c, ROW); imAlign(c); imRegisterHighlightBg(c, editor, currentRegister); {
        if (elHasMouseOver(c)) {
            editor.highlightedRegisterNext = currentRegister;
        }

        if (isFirstishRender(c)) {
            elSetClass(c, "hoverable");
        }

        if (elHasMousePress(c)) {
            openContextMenuAtMouse(editor.contextMenu, instr, field);
        }

        if (imIf(c) && contextMenuIsOpen(editor.contextMenu, instr, field)) {
            imContextMenuBegin(c, editor.contextMenu); {
                let allowNewRegister = true;
                let regIdx = 0;
                imFor(c); for (
                    ;
                    regIdx < REGISTER_INFO.totalCount;
                    regIdx++
                ) {
                    if (regIdx >= IDX_USER) {
                        // Don't show all 32 user registers. just show one new one at a time.
                        const inUse = editor.registersInUseRead.has(regIdx) || editor.registersInUseWrite.has(regIdx);
                        if (!inUse) {
                            if (!allowNewRegister) break;
                            allowNewRegister = false;
                        }
                    }

                    imContextMenuItemBegin(c); imRegisterHighlightBg(c, editor, regIdx); {
                        if (isFirstishRender(c)) elSetClass(c, "hoverable");

                        imStrFmt(c, regIdx, registerIdxToString);
                        if (imIf(c) && !allowNewRegister) {
                            imStr(c, " [new]");
                        } imIfEnd(c);

                        if (elHasMousePress(c)) {
                            newRegister = regIdx;
                            closeContextMenu(editor.contextMenu);
                        }
                    } imContextMenuItemEnd(c);
                } imForEnd(c);

                if (!allowNewRegister) {
                    imLayout(c, BLOCK); { 
                        imStr(c, REGISTER_INFO.totalCount - regIdx);
                        imStr(c, " registers remaining");
                    } imLayoutEnd(c);
                }
            } imContextMenuEnd(c, editor.contextMenu);
        } imIfEnd(c);
        imStrFmt(c, currentRegister, registerIdxToString);
    } imLayoutEnd(c);

    return newRegister;
}

function imRegisterArgumentEditor(
    c: ImCache,
    editor: WaveProgramEditorState,
    instr: InstructionPart,
    arg: InstructionPartArgument,
): boolean {
    let edited = false;

    // TODO: TABLE LAYOUT!! IT KEEPS REAPPEARING EVERYWHERE!!
    // we need to make an API for it.

    imLayout(c, ROW); imAlign(c, STRETCH); imGap(c, 10, PX);
    imSize(c, 19, PERCENT, 0, NA); {
        imLayout(c, ROW); imAlign(c, STRETCH); imFlex(c); imGap(c, 10, PX); {
            if (imButtonIsClicked(c, arg.reg ? "reg:" : "val:", arg.reg)) {
                arg.reg = !arg.reg;
                fixInstructionPartInstructionPartArgument(arg);
                edited = true;
            }

            if (imIf(c) && arg.reg) {
                // Reinterpret this thing as an index.
                const newRegister = imRegisterContextMenu(c, editor, arg.val, instr, arg);
                if (newRegister !== null) {
                    arg.val = newRegister;
                    edited = true;
                }
            } else {
                imElse(c);

                imLayout(c, ROW); imAlign(c); {
                    imStr(c, arg.val.toFixed(3));

                    let dragEvent = imParameterSliderInteraction(
                        c,
                        -1_000_000, 1_000_000, 0.0001, arg.val, 0,
                        DRAG_TYPE_CIRCULAR
                    );

                    if (dragEvent) {
                        arg.val = dragEvent.val;
                        edited = true;
                    }
                } imLayoutEnd(c);
            } imEndIf(c);
        } imLayoutEnd(c);
    } imLayoutEnd(c);

    return edited;
}

function writeProgramToUndoBuffer(editor: WaveProgramEditorState) {
    const undoBuffer = editor.undoBuffer;

    const currentProgramJSON = JSON.stringify(editor.waveProgram);
    if (undoBuffer.programVersionsJSON.length > 0) {
        const lastProgram = undoBuffer.programVersionsJSON[undoBuffer.programVersionsJSON.length - 1];
        if (lastProgram === currentProgramJSON) {
            // Don't write anything if its literally the same program
            return;
        }
    }

    // Truncate undo buffer if needed
    if (undoBuffer.position !== undoBuffer.programVersionsJSON.length) {
        undoBuffer.programVersionsJSON.length = undoBuffer.position;
    }

    undoBuffer.programVersionsJSON.push(currentProgramJSON);
    undoBuffer.position++;

    // for the lolz
    let sizeBytes = 0;
    for (const program of editor.undoBuffer.programVersionsJSON) {
        sizeBytes += utf16ByteLength(program);
    }
    undoBuffer.programVersionsJSONSizeMb = bytesToMegabytes(sizeBytes);
}

function writePendingUndoToUndoBuffer(editor: WaveProgramEditorState) {
    const undoBuffer = editor.undoBuffer;
    if (undoBuffer.timer > 0) {
        writeProgramToUndoBuffer(editor);
        undoBuffer.timer = -1;
    }
}

function imRegisterHighlightBg(c: ImCache, editor: WaveProgramEditorState, regIdx: number) {
    const isHighlighted = regIdx === editor.highlightedRegister;
    imBg(c, isHighlighted ? cssVarsApp.codeHighlight : "");

    if (elHasMouseOver(c)) {
        editor.highlightedRegisterNext = regIdx;
    }
}
