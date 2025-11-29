import { closeContextMenu, contextMenuIsOpen, ContextMenuState, imContextMenuBegin, imContextMenuEnd, imContextMenuItemBegin, imContextMenuItemEnd, newContextMenuState, openContextMenuAtMouse } from "src/app-components/context-menu";
import { imCompactCircularDragSlideInteraction, imCompactCircularDragSlideInteractionFeedback, imCompactLinearDragSlideInteraction } from "src/app-components/drag-slider-interaction";
import { imModalBegin, imModalEnd } from "src/app-components/modal";
import { imButtonBegin, imButtonEnd, imButtonIsClicked } from "src/components/button";
import { imBeginCanvasRenderingContext2D, imEndCanvasRenderingContext2D } from "src/components/canvas2d";
import { imCheckboxBegin, imCheckboxCheckBegin, imCheckboxCheckEnd, imCheckboxEnd } from "src/components/checkbox";
import {
    BLOCK,
    COL,
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
    imNoWrap,
    imOpacity,
    imPadding,
    imRelative,
    imScrollOverflow,
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
import { imTextAreaBegin, imTextAreaEnd } from "src/components/editable-text-area";
import { imLine, LINE_HORIZONTAL_PADDING, LINE_VERTICAL, LINE_VERTICAL_PADDING } from "src/components/im-line";
import { imRangeSlider } from "src/components/range-slider";
import { imScrollContainerBegin, imScrollContainerEnd, newScrollContainer } from "src/components/scroll-container";
import { copyInstruction, getDefaultInstructions } from "src/dsp/dsp-loop";
import {
    compileInstructions,
    computeSample,
    fixInstructionPartInstructionPartArgument,
    fixInstructions,
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
    INSTR_RECIPR_DT,
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
    WaveProgram,
    WaveProgramInstructionItem,
    INSTR_ADD_RECIPR_DT
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
import { EL_B, elHasMouseClick, elHasMouseOver, elHasMousePress, elSetClass, elSetStyle, EV_INPUT, getGlobalEventSystem, imEl, imElEnd, imOn, imStr, imStrFmt } from "src/utils/im-dom";
import { clamp, gridsnapRound } from "src/utils/math-utils";
import { getNoteFrequency, getNoteIndex } from "src/utils/music-theory-utils";
import { bytesToMegabytes, utf16ByteLength } from "src/utils/utf8";
import { GlobalContext } from "./app";
import { drawSamples, newPlotState } from "./plotting";
import { SoundLabState } from "./sound-lab-view";
import { cssVarsApp } from "./styling";



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
