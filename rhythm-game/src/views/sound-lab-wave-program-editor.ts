import { imCompactDragSlider } from "src/app-components/drag-slider";
import { imModalBegin, imModalEnd } from "src/app-components/modal";
import { imButtonIsClicked } from "src/components/button";
import { imBeginCanvasRenderingContext2D, imEndCanvasRenderingContext2D } from "src/components/canvas2d";
import {
    BLOCK,
    COL,
    EM,
    imAbsolute,
    imAlign,
    imBg,
    imFg,
    imFlex,
    imFlex1,
    imGap,
    imJustify,
    imLayout,
    imLayoutEnd,
    imPadding,
    imSize,
    NA,
    PERCENT,
    PX,
    ROW,
    START
} from "src/components/core/layout";
import { cssVars } from "src/components/core/stylesheets";
import { imLine, LINE_HORIZONTAL_PADDING, LINE_VERTICAL, LINE_VERTICAL_PADDING } from "src/components/im-line";
import { imRangeSlider } from "src/components/range-slider";
import { imScrollContainerBegin, imScrollContainerEnd, newScrollContainer } from "src/components/scroll-container";
import { imSliderInput } from "src/components/slider";
import { getDefaultInstructions } from "src/dsp/dsp-loop";
import {
    compileInstructions,
    computeSample,
    DspSynthInstructionItem,
    IDX_MAX,
    INDEX_DESCRIPTORS,
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
    instrToString,
    newSampleContext,
    registerIdxToString,
    updateSampleContext,
    InstructionType
} from "src/dsp/dsp-loop-instruction-set";
import { getCurrentPlaySettings, updatePlaySettings } from "src/dsp/dsp-loop-interface";
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
import { cssVarsApp } from "./styling";
import { SoundLabState } from "./sound-lab-view";
import { newPlotState, drawSamples } from "./plotting";
import { imExtraDiagnosticInfo } from "src/components/fps-counter";
import { arrayAt } from "src/utils/array-utils";
import { assert } from "src/utils/assert";

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

export type WaveProgramEditorState = {
    instructions: DspSynthInstructionItem[]
    instructionsVersion: number;

    contextMenu: ContextMenuState;
};

export function newWaveProgramEditorState(): WaveProgramEditorState {
    return {
        instructions: getDefaultInstructions(),
        instructionsVersion: 0,
        contextMenu: {
            choices: [],
            currentChoice: -1,
            position: { x: 0, y: 0 },
            reciever: null,
        }
    };
}

export function imWaveProgramEditor(c: ImCache, ctx: GlobalContext, state: SoundLabState) {
    const editor = state.instructionBuilder;
    const sampleRate = state.dsp.sampleRate;
    const playSettings = getCurrentPlaySettings();

    let updateSettings = false;

    imModalBegin(c); imPadding(c, 10, PX, 10, PX, 10, PX, 10, PX); {
        imLayout(c, ROW); imSize(c, 100, PERCENT, 100, PERCENT); imBg(c, cssVars.bg); {

            const editorContextMenuChoice = imContextMenu(c, editor.contextMenu);

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
                    }

                    let i = 0;
                    imFor(c); for (const instruction of editor.instructions) {
                        if (imIf(c) && instruction.instruction) {
                            const instr = instruction.instruction;

                            imLayout(c, ROW); imAlign(c); {
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

                                // Instruction type dropdown
                                imLayout(c, ROW); imAlign(c); imJustify(c); imFlex(c); {
                                    if (isFirstishRender(c)) {
                                        elSetClass(c, "hoverable");
                                    }

                                    if (elHasMousePress(c)) {
                                        const mouse = getGlobalEventSystem().mouse;
                                        editor.contextMenu.position.x = mouse.X;
                                        editor.contextMenu.position.y = mouse.Y;
                                        editor.contextMenu.choices = instructionChoicesNames;
                                        editor.contextMenu.currentChoice = instructionChoices.indexOf(instr.type);
                                        editor.contextMenu.reciever = instr;
                                    }

                                    if (
                                        editor.contextMenu.reciever === instr && 
                                        editorContextMenuChoice !== -1
                                    ) {
                                        editor.contextMenu.currentChoice = -1;
                                        const newChoice = arrayAt(instructionChoices, editorContextMenuChoice);
                                        assert(!!newChoice);
                                        instr.type = newChoice;
                                    }

                                    imStrFmt(c, instr.type, instrToString);
                                } imLayoutEnd(c);

                                // register value 1
                                {
                                    imLayout(c, ROW); imAlign(c); imGap(c, 10, PX);
                                    imPadding(c, 0, NA, 10, PX, 0, NA, 10, PX); imSize(c, 25, PERCENT, 0, NA); {
                                        if (imButtonIsClicked(c, instr.reg1 ? "reg:" : "val:", instr.reg1, BLOCK, true)) {
                                            instr.reg1 = !instr.reg1;
                                            updateSettings = true;
                                        }

                                        imLayout(c, ROW); imAlign(c); imJustify(c); imFlex(c); {
                                            if (imIf(c) && instr.reg1) {
                                                // Reinterpret this thing as an index.
                                                imStr(c, "reg ");
                                                imStrFmt(c, instr.val1, registerIdxToString);
                                            } else {
                                                imElse(c);
                                                imStr(c, instr.val1);
                                            } imEndIf(c);
                                        } imLayoutEnd(c);
                                    } imLayoutEnd(c);
                                }


                                // register value 2
                                {
                                    imLayout(c, ROW); imAlign(c); imGap(c, 10, PX);
                                    imPadding(c, 0, NA, 10, PX, 0, NA, 10, PX); imSize(c, 25, PERCENT, 0, NA); {
                                        if (imButtonIsClicked(c, instr.reg2 ? "reg:" : "val:", instr.reg2, BLOCK, true)) {
                                            instr.reg2 = !instr.reg2;
                                            updateSettings = true;
                                        }

                                        imLayout(c, ROW); imAlign(c); imJustify(c); imFlex(c); {
                                            if (imIf(c) && instr.reg2) {
                                                // Reinterpret this thing as an index.
                                                imStr(c, "reg ");
                                                imStrFmt(c, instr.val2, registerIdxToString);
                                            } else {
                                                imElse(c);
                                                imStr(c, instr.val2);
                                            } imEndIf(c);
                                        } imLayoutEnd(c);
                                    } imLayoutEnd(c);
                                }
                                imLayout(c, ROW); imFlex(c); imJustify(c); {
                                    imStr(c, " -> ");
                                } imLayoutEnd(c);

                                imLayout(c, ROW); imAlign(c); imJustify(c, START); imSize(c, 25, PERCENT, 0, NA); {
                                    imStr(c, "register: ");
                                    imStrFmt(c, instr.dst, registerIdxToString);
                                } imLayoutEnd(c);
                            } imLayoutEnd(c);
                        } else {
                            imIfElse(c);

                            imStr(c, "No UI for if-statements currently");
                        } imIfEnd(c);

                        i++;
                    } imForEnd(c);
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
                        viewingLen: 500,
                        viewingInvalidated: false,
                    });

                    if (imMemo(c, s.noteIdx)) s.viewingInvalidated = true;

                    imHeading(c, "Wave program");

                    const params = playSettings.parameters;
                    let samplesRecomputed = false;
                    if (s.viewingInvalidated) {
                        s.viewingInvalidated = false;
                        samplesRecomputed = true;

                        s.ctx.isPressed = false;
                        for (let i = 0; i < s.samples.length; i++) {
                            let frequency = getNoteFrequency(s.noteIdx);
                            const time = i / mockSampleRate;

                            updateSampleContext(s.ctx, frequency, 1, 1 / mockSampleRate);
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

                    let [start, end, draggingStart, draggingEnd] = imRangeSlider(
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
                }

                imHeading(c, "Parameters");

                const sc = imState(c, newScrollContainer);
                imScrollContainerBegin(c, sc); {
                    if (isFirstishRender(c)) {
                        elSetStyle(c, "fontFamily", "monospace");
                        elSetStyle(c, "fontSize", "20px");
                    }

                    imLayout(c, ROW); {
                        const defaultParams = INDEX_DESCRIPTORS.reserved;
                        imLayout(c, COL); imFlex(c); {
                            imFor(c); for (let i = 0; i < defaultParams.length; i++) {
                                const paramInfo = defaultParams[i];
                                imLayout(c, ROW); imFg(c, cssVarsApp.mg); {
                                    imLayout(c, ROW); imSize(c, 40, PX, 0, NA); imJustify(c); {
                                        imStr(c, i);
                                    } imLayoutEnd(c);
                                    imStr(c, " -> ");
                                    imStr(c, "[Default parameter] ");
                                    imStr(c, paramInfo.name);
                                } imLayoutEnd(c);
                            } imForEnd(c);

                            imFor(c); for (let i = defaultParams.length; i < Math.floor(IDX_MAX / 2); i++) {
                                imBindableParameter(c, i);
                            } imForEnd(c);
                        } imLayoutEnd(c);
                        imLayout(c, COL); imFlex(c); {
                            imFor(c); for (let i = Math.floor(IDX_MAX / 2); i < IDX_MAX; i++) {
                                imBindableParameter(c, i);
                            } imForEnd(c);
                        } imLayoutEnd(c);
                    } imLayoutEnd(c);

                } imScrollContainerEnd(c);
            } imLayoutEnd(c);
        } imLayoutEnd(c);
    } imModalEnd(c);

    if (updateSettings) {
        compileInstructions(state.instructionBuilder.instructions, playSettings.parameters.instructions);
        updatePlaySettings();
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


function imParameterSlider(
    c: ImCache,
    name: string,
    min: number,
    max: number,
    step: number,
    val: number,
    defaultValue: number,
): { val: number } | null {
    let initialVal = val;

    imLayout(c, ROW); imAlign(c); {
        imLayout(c, BLOCK); {
            imStr(c, name);
            imStr(c, ": ");
            imStr(c, val.toFixed(3));
        } imLayoutEnd(c);

        imLayout(c, COL); imSize(c, 0, NA, 1, EM); imFlex(c); {
            val = imSliderInput(c, min, max, step, val);
        } imLayoutEnd(c);

        if (imButtonIsClicked(c, "<")) {
            val = defaultValue;
        }
    } imLayoutEnd(c);

    if (val !== initialVal) {
        return { val };
    }

    return null;
}

function imParameterSliderCompact(
    c: ImCache,
    name: string,
    min: number,
    max: number,
    step: number,
    val: number,
    defaultValue: number,
): { val: number } | null {
    let initialVal = val;

    imLayout(c, BLOCK); imAlign(c); {
        imLayout(c, BLOCK); {
            imStr(c, name);
            imStr(c, val.toFixed(3));
        } imLayoutEnd(c);

        val = imCompactDragSlider(c, 100, val, min, max);
        val = gridsnapRound(val, step);
        val = clamp(val, min, max);

        const mouse = getGlobalEventSystem().mouse;
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

function imBindableParameter(c: ImCache, varIdx: number) {
    imLayout(c, ROW); {
        imLayout(c, ROW); imSize(c, 40, PX, 0, NA); imJustify(c); {
            imStr(c, varIdx);
        } imLayoutEnd(c);
        imStr(c, " -> ");
        imStr(c, "user " + varIdx);
    } imLayoutEnd(c);
}

export function imWaveProgramPreview(
    c: ImCache,
    ctx: GlobalContext,
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
    position: { x: number; y: number };
    choices: string[];
    currentChoice: number; // if -1, then closed
    reciever: unknown | null;
};

function imContextMenu(c: ImCache, s: ContextMenuState): number {
    let resultChoice = -1;

    if (imIf(c) && s.currentChoice !== -1 && s.choices.length > 0) {
        imLayout(c, COL); imAbsolute(c, s.position.y, PX, 0, NA, 0, NA, s.position.x, PX); {
            if (isFirstishRender(c)) {
                elSetStyle(c, "fontFamily", "monospace");
                elSetStyle(c, "fontSize", "20px");

                elSetStyle(c, "userSelect", "none");
                elSetStyle(c, "backgroundColor", cssVars.bg);
                elSetStyle(c, "boxShadow", "4px 4px 5px 0px rgba(0,0,0,0.37)");
                elSetStyle(c, "border", "1px solid rgba(0,0,0,0.37)");
                elSetStyle(c, "padding", "3px");
            }

            imFor(c); for (let i = 0; i < s.choices.length; i++) {
                const choice = s.choices[i];

                imLayout(c, ROW); {
                    if (isFirstishRender(c)) {
                        elSetClass(c, "hoverable");
                        elSetStyle(c, "borderBottom", "1px solid rgba(0,0,0,0.37)");
                    }

                    imStr(c, choice);

                    if (elHasMousePress(c)) {
                        resultChoice = i;
                    }
                } imLayoutEnd(c);
            } imForEnd(c);
        } imLayoutEnd(c);
    } imIfEnd(c);

    return resultChoice;
}
