import { imCompactCircularDragSlideInteraction, imCompactCircularDragSlideInteractionFeedback, imCompactLinearDragSlideInteraction } from "src/app-components/drag-slider-interaction";
import { imModalBegin, imModalEnd } from "src/app-components/modal";
import { imButtonBegin, imButtonEnd, imButtonIsClicked } from "src/components/button";
import { imBeginCanvasRenderingContext2D, imEndCanvasRenderingContext2D } from "src/components/canvas2d";
import {
    BLOCK,
    COL,
    EM,
    imAbsolute,
    imAlign,
    imBg,
    imFixed,
    imFlex,
    imFlex1,
    imGap,
    imJustify,
    imLayout,
    imLayoutEnd,
    imNoWrap,
    imPadding,
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
import { imSliderInput } from "src/components/slider";
import { copyInstruction, getDefaultInstructions } from "src/dsp/dsp-loop";
import {
    computeSample,
    DspSynthInstructionItem,
    IDX_COUNT,
    IDX_OUTPUT,
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
    InstructionType,
    newDspInstruction,
    newSampleContext,
    REGISTER_INFO,
    registerIdxToString,
    updateSampleContext
} from "src/dsp/dsp-loop-instruction-set";
import { getCurrentPlaySettings } from "src/dsp/dsp-loop-interface";
import { arrayAt, arraySwap, filterInPlace } from "src/utils/array-utils";
import { assert } from "src/utils/assert";
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
import { EL_B, elHasMousePress, elSetClass, elSetStyle, getGlobalEventSystem, imEl, imElEnd, imStr, imStrFmt } from "src/utils/im-dom";
import { clamp, gridsnapRound } from "src/utils/math-utils";
import { getNoteFrequency } from "src/utils/music-theory-utils";
import { GlobalContext } from "./app";
import { drawSamples, newPlotState } from "./plotting";
import { SoundLabState } from "./sound-lab-view";

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
const instructionChoicesNames = instructionChoices.map(instrToString);

const newRegisterChoicesNames = Array(REGISTER_INFO.totalCount)
    .fill(null)
    .map((_, i) => registerIdxToString(i));

export type WaveProgramEditorState = {
    instructions: DspSynthInstructionItem[]
    instructionsVersion: number;
    registersInUseWrite: Set<number>;
    registersInUseRead: Set<number>;

    contextMenu: ContextMenuState;
};

const CONTEXT_MENU_FIELD__TYPE = 1;
const CONTEXT_MENU_FIELD__VAL1 = 2;
const CONTEXT_MENU_FIELD__VAL2 = 3;
const CONTEXT_MENU_FIELD__DST = 4;

export function newWaveProgramEditorState(): WaveProgramEditorState {
    return {
        instructions: getDefaultInstructions(),
        instructionsVersion: 0,
        registersInUseWrite: new Set(),
        registersInUseRead: new Set(),
        contextMenu: newContextMenuState(),
    };
}


function fixRegisterValueIndexes(instr: InstructionPart) {
    if (instr.reg1) {
        instr.val1 = Math.round(instr.val1);
    }

    if (instr.reg2) {
        instr.val2 = Math.round(instr.val2);
    }
}

export function imWaveProgramEditor(c: ImCache, ctx: GlobalContext, state: SoundLabState) {
    const editor = state.instructionBuilder;
    const playSettings = getCurrentPlaySettings();

    let updateSettings = false;
    const instructionsChanged = imMemo(c, editor.instructionsVersion);

    if (instructionsChanged) {
        editor.registersInUseRead.clear();
        editor.registersInUseWrite.clear();

        const dfs = (instructions: DspSynthInstructionItem[]) => {
            for (const instr of instructions) {
                if (instr.instruction) {
                    if (instr.instruction.reg1) editor.registersInUseRead.add(instr.instruction.val1);
                    if (instr.instruction.reg2) editor.registersInUseRead.add(instr.instruction.val2);
                    editor.registersInUseWrite.add(instr.instruction.dst);
                }

                if (instr.ifelseInnerBlock) {
                    dfs(instr.ifelseInnerBlock.inner);
                }
            }
        }
        dfs(editor.instructions);
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

                    let i = 0;
                    imFor(c); for (const instruction of editor.instructions) {
                        if (imIf(c) && instruction.instruction) {
                            const instr = instruction.instruction;

                            imLayout(c, ROW); imAlign(c); imGap(c, 10, PX); {
                                if (isFirstishRender(c)) {
                                    elSetStyle(c, "lineHeight", "1");
                                    elSetStyle(c, "userSelect", "none");
                                }

                                imLayout(c, ROW); imAlign(c); imJustify(c); imFlex(c); {
                                    if (isFirstishRender(c)) {
                                        elSetStyle(c, "cursor", "ns-resize");
                                    }

                                    // TODO: Drag handle

                                    imStr(c, i);
                                } imLayoutEnd(c);

                                // register value 1
                                {
                                    imLayout(c, ROW); imAlign(c); imGap(c, 10, PX);
                                    imSize(c, 20, PERCENT, 0, NA); {
                                        imLayout(c, ROW); imAlign(c); imJustify(c); imFlex(c); imGap(c, 10, PX); {
                                            if (imButtonIsClicked(c, instr.reg1 ? "reg:" : "val:", true, BLOCK)) {
                                                instr.reg1 = !instr.reg1;
                                                fixRegisterValueIndexes(instr);
                                                updateSettings = true;
                                            }

                                            if (imIf(c) && instr.reg1) {
                                                // Reinterpret this thing as an index.
                                                const newRegister = imRegisterContextMenu(c, editor, instr.val1, instr, CONTEXT_MENU_FIELD__VAL1);
                                                if (newRegister !== null) {
                                                    instr.val1 = newRegister;
                                                    updateSettings = true;
                                                }
                                            } else {
                                                imElse(c);

                                                let dragEvent = imParameterSliderCompact(c, "", -1_000_000, 1_000_000, 0.0001, instr.val1, 0, DRAG_TYPE_CIRCULAR);
                                                if (dragEvent) {
                                                    instr.val1 = dragEvent.val;
                                                    updateSettings = true;
                                                }
                                            } imEndIf(c);
                                        } imLayoutEnd(c);
                                    } imLayoutEnd(c);
                                }

                                // Instruction type dropdown
                                imLayout(c, ROW); imAlign(c); imJustify(c); imSize(c, 10, PERCENT, 0, NA); {
                                    if (isFirstishRender(c)) {
                                        elSetClass(c, "hoverable");
                                    }

                                    if (elHasMousePress(c)) {
                                        const currentChoice = instructionChoices.indexOf(instr.type);
                                        openContextMenuAtMouse(editor.contextMenu, instructionChoicesNames, currentChoice, instr, CONTEXT_MENU_FIELD__TYPE);
                                    }

                                    if (imIf(c) && contextMenuIsOpen(editor.contextMenu, instr, CONTEXT_MENU_FIELD__TYPE)) {
                                        const newChoiceIdx = imContextMenu(c, editor.contextMenu);
                                        if (newChoiceIdx !== null) {
                                            if (newChoiceIdx !== -1) {
                                                const newChoice = arrayAt(instructionChoices, newChoiceIdx); assert(newChoice !== undefined);
                                                instr.type = newChoice;
                                                updateSettings = true;
                                            }
                                            closeContextMenu(editor.contextMenu);
                                        }
                                    } imIfEnd(c);

                                    imLayout(c, INLINE_BLOCK); imNoWrap(c); {
                                        imStrFmt(c, instr.type, instrToString);
                                    } imLayoutEnd(c);
                                } imLayoutEnd(c);

                                // register value 2
                                {
                                    imLayout(c, ROW); imAlign(c); imGap(c, 10, PX);
                                    imSize(c, 20, PERCENT, 0, NA); {
                                        imLayout(c, ROW); imAlign(c); imJustify(c); imFlex(c); imGap(c, 10, PX); {
                                            if (imButtonIsClicked(c, instr.reg2 ? "reg:" : "val:", true, BLOCK)) {
                                                instr.reg2 = !instr.reg2;
                                                fixRegisterValueIndexes(instr);
                                                updateSettings = true;
                                            }

                                            if (imIf(c) && instr.reg2) {
                                                // Reinterpret this thing as an index.
                                                const newRegister = imRegisterContextMenu(c, editor, instr.val2, instr, CONTEXT_MENU_FIELD__VAL2);
                                                if (newRegister !== null) {
                                                    instr.val2 = newRegister;
                                                    updateSettings = true;
                                                }
                                            } else {
                                                imElse(c);

                                                let dragEvent = imParameterSliderCompact(c, "", -1_000_000, 1_000_000, 0.0001, instr.val2, 0, DRAG_TYPE_CIRCULAR);
                                                if (dragEvent) {
                                                    instr.val2 = dragEvent.val;
                                                    updateSettings = true;
                                                }
                                            } imEndIf(c);
                                        } imLayoutEnd(c);
                                    } imLayoutEnd(c);
                                }

                                imLayout(c, ROW); imFlex(c); imAlign(c); imJustify(c); imNoWrap(c); {
                                    imStr(c, " -> ");
                                } imLayoutEnd(c);

                                imLayout(c, ROW); imAlign(c, STRETCH); imJustify(c, START); imSize(c, 15, PERCENT, 0, NA); imGap(c, 10, PX); {
                                    const newRegister = imRegisterContextMenu(c, editor, instr.dst, instr, CONTEXT_MENU_FIELD__DST);
                                    if (newRegister !== null) {
                                        instr.dst = newRegister;
                                        updateSettings = true;
                                    }
                                } imLayoutEnd(c);

                                imFlex1(c);

                                const canMoveUp = i > 0;
                                const moveUpClicked = imButtonBegin(c, "^"); {
                                    if (moveUpClicked && canMoveUp) {
                                        arraySwap(editor.instructions, i, i - 1)
                                        updateSettings = true;
                                    } 
                                    elSetStyle(c, "opacity", canMoveUp ? "1" : "0");
                                } imButtonEnd(c);

                                const canMoveDown = i < editor.instructions.length - 1;
                                const moveDownClicked = imButtonBegin(c, "v"); {
                                    if (moveDownClicked && canMoveDown) {
                                        arraySwap(editor.instructions, i, i + 1)
                                        updateSettings = true;
                                    } 
                                    elSetStyle(c, "opacity", canMoveDown ? "1" : "0");
                                } imButtonEnd(c);

                                if (imButtonIsClicked(c, "x")) {
                                    filterInPlace(editor.instructions, i => i !== instruction);
                                    updateSettings = true;
                                }
                            } imLayoutEnd(c);
                        } else {
                            imIfElse(c);

                            imStr(c, "No UI for if-statements currently");
                        } imIfEnd(c);

                        i++;
                    } imForEnd(c);

                    if (imButtonIsClicked(c, "Add line")) {
                        if (editor.instructions.length > 0) {
                            const lastInstruction = editor.instructions[editor.instructions.length - 1];
                            const copy = copyInstruction(lastInstruction);
                            editor.instructions.push(copy);
                            updateSettings = true;
                        } else {
                            const benignInstr = { instruction: newDspInstruction(0, false, INSTR_ADD, 0, false, IDX_OUTPUT) };
                            editor.instructions.push(benignInstr);
                            updateSettings = true;
                        }
                    }
                } imScrollContainerEnd(c);
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

    if (updateSettings) {
        state.instructionBuilder.instructionsVersion++;
    }

    if (!ctx.handled) {
        if (ctx.keyPressState) {
            if (ctx.keyPressState.key === "Escape") {
                state.isEditingInstructions = false;
                ctx.handled = true;
            } 
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

function imParameterSliderCompact(
    c: ImCache,
    name: string,
    min: number,
    max: number,
    step: number,
    val: number,
    defaultValue: number,
    dragType = DRAG_TYPE_LINEAR,
): { val: number } | null {
    let initialVal = val;

    const { mouse } = getGlobalEventSystem();

    imLayout(c, BLOCK); imAlign(c); {
        imLayout(c, BLOCK); {
            if (imIf(c) && name) {
                imStr(c, name);
            } imIfEnd(c);
            imStr(c, val.toFixed(3));
        } imLayoutEnd(c);

        if (mouse.ev?.shiftKey) {
            step = 0.1
        }

        if (imIf(c) && dragType === DRAG_TYPE_CIRCULAR) {
            const state = imCompactCircularDragSlideInteraction(c, val, min, max, 100, 1.4);
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
    } imLayoutEnd(c);

    if (val !== initialVal) {
        return { val };
    }

    return null;
}
function imBindableParameter(
    c: ImCache,
    _editor: WaveProgramEditorState,
    varIdx: number,
    isRead: boolean,
    isWrite: boolean
) {
    imLayout(c, ROW); {
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
            imFor(c); for (const instr of state.instructionBuilder.instructions) {
                imLayout(c, ROW); imGap(c, 6, PX); {
                    imStrFmt(c, instr.instruction?.type, instrToString);

                    imStr(c, " TODO: Implement this");
                } imLayoutEnd(c);
            } imForEnd(c);
        } imScrollContainerEnd(c);

    } imLayoutEnd(c);
}

type ContextMenuState = {
    choiceNames: string[]; 

    x: number, y: number;

    currentChoiceIdx: number;
    item: unknown | null;
    field: unknown | null;
};


function newContextMenuState(): ContextMenuState {
    return {
        choiceNames: [],
        x: 0, y: 0,
        currentChoiceIdx: -1,
        item: null,
        field: null,
    };
}

function imContextMenu(c: ImCache, s: ContextMenuState): number | null {
    let result = null;

    if (imIf(c) && s.currentChoiceIdx !== -1 && s.choiceNames.length > 0) {
        imLayout(c, COL); imFixed(c, 0, PX, 0, PX, 0, PX, 0, PX); {
            imLayout(c, COL); imAbsolute(c, s.y, PX, 0, NA, 0, NA, s.x, PX); {
                if (isFirstishRender(c)) {
                    elSetStyle(c, "fontFamily", "monospace");
                    elSetStyle(c, "fontSize", "20px");

                    elSetStyle(c, "userSelect", "none");
                    elSetStyle(c, "backgroundColor", cssVars.bg);
                    elSetStyle(c, "boxShadow", "4px 4px 5px 0px rgba(0,0,0,0.37)");
                    elSetStyle(c, "border", "1px solid rgba(0,0,0,0.37)");
                    elSetStyle(c, "padding", "3px");
                }

                imFor(c); for (let i = 0; i < s.choiceNames.length; i++) {
                    const choice = s.choiceNames[i];

                    imLayout(c, ROW); imJustify(c); {
                        if (isFirstishRender(c)) {
                            elSetClass(c, "hoverable");
                            elSetStyle(c, "borderBottom", "1px solid rgba(0,0,0,0.37)");
                        }

                        imStr(c, choice);

                        if (elHasMousePress(c)) {
                            result = i;
                        }
                    } imLayoutEnd(c);
                } imForEnd(c);
            } imLayoutEnd(c);

            if (elHasMousePress(c) && result === null) {
                result = -1;
            }
        } imLayoutEnd(c);
    } imIfEnd(c);

    return result;
}

function imRegisterContextMenu(
    c: ImCache,
    editor: WaveProgramEditorState,
    currentRegister: number,
    instr: InstructionPart,
    field: number,
): number | null {
    let newRegister: number | null = null;
    
    imLayout(c, ROW); imAlign(c); {
        if (isFirstishRender(c)) {
            elSetClass(c, "hoverable");
        }

        if (elHasMousePress(c)) {
            openContextMenuAtMouse(editor.contextMenu, newRegisterChoicesNames, currentRegister, instr, field);
        }

        if (imIf(c) && contextMenuIsOpen(editor.contextMenu, instr, field)) {
            const newChoiceIdx = imContextMenu(c, editor.contextMenu);
            if (newChoiceIdx !== null) {
                if (newChoiceIdx !== -1) {
                    newRegister = newChoiceIdx;
                }
                closeContextMenu(editor.contextMenu);
            }
        } imIfEnd(c);
        imStrFmt(c, currentRegister, registerIdxToString);
    } imLayoutEnd(c);

    return newRegister;
}


export function openContextMenu(
    s: ContextMenuState,
    choiceNames: string[], 
    x: number, y: number,
    currentChoiceIdx: number,
    item: unknown,
    field: unknown,
) {
    s.choiceNames = choiceNames;
    s.x = x;
    s.y = y;
    s.currentChoiceIdx = currentChoiceIdx;
    s.item = item;
    s.field = field;
}

export function openContextMenuAtMouse(
    s: ContextMenuState,
    choiceNames: string[], 
    currentChoiceIdx: number,
    item: unknown,
    field: unknown,
) {
    const mouse = getGlobalEventSystem().mouse;
    openContextMenu(
        s,
        choiceNames,
        mouse.X + 20,
        mouse.Y,
        currentChoiceIdx,
        item,
        field,
    );
}

export function closeContextMenu(s: ContextMenuState) {
    s.currentChoiceIdx = -1;
    s.item = null;
    s.field = null;
}

export function contextMenuIsOpen(s: ContextMenuState, item: unknown, field: unknown) {
    return s.currentChoiceIdx !== -1 &&
           s.item === item &&
           s.field === field;
}


