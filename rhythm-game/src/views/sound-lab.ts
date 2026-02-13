import {
    imContextMenu,
    imContextMenuBegin,
    imContextMenuDivider,
    imContextMenuEnd,
    imContextMenuItemBegin,
    imContextMenuItemEnd,
    openContextMenuAtMouse
} from "src/app-components/context-menu";
import { imVerticalText } from "src/app-components/misc";
import { imButtonBegin, imButtonEnd, imButtonIsClicked } from "src/components/button";
import { imCheckbox } from "src/components/checkbox";
import {
    BLOCK,
    COL,
    DisplayType,
    EM,
    imAlign,
    imBg,
    imFlex,
    imFlex1,
    imFlexWrap,
    imGap,
    imJustify,
    imLayoutBegin,
    imLayoutEnd,
    imNoWrap,
    imOpacity,
    imPadding,
    imRelative,
    imSize,
    NA,
    PERCENT,
    PX,
    ROW,
    ROW_REVERSE,
    SPACE_EVENLY,
    STRETCH
} from "src/components/core/layout";
import { cn, cssVars } from "src/components/core/stylesheets";
import { DragAndDropState, imDragAndDrop, imDragHandle, imDragZoneBegin, imDragZoneEnd, imDropZoneForPrototyping } from "src/components/drag-and-drop";
import { imLine, LINE_HORIZONTAL, LINE_VERTICAL } from "src/components/im-line";
import { imRangeSlider } from "src/components/range-slider";
import { imScrollContainerBegin, imScrollContainerEnd, newScrollContainer } from "src/components/scroll-container";
import { DspLoopMessage, dspProcess, dspReceiveMessage, DspState, newDspState } from "src/dsp/dsp-loop";
import {
    asRegisterIdx,
    BIQUAD2_TYPE__ALLPASS,
    BIQUAD2_TYPE__BANDPASS_1,
    BIQUAD2_TYPE__BANDPASS_2,
    BIQUAD2_TYPE__HIGH_SHELF,
    BIQUAD2_TYPE__HIGHPASS,
    BIQUAD2_TYPE__LOW_SHELF,
    BIQUAD2_TYPE__LOWPASS,
    BIQUAD2_TYPE__NOTCH,
    BIQUAD2_TYPE__PEAKINGEQ,
    Biquad2FilterType,
    biquad2IsUsingDbGain,
    compileEffectRack,
    computeEffectRackIteration,
    CONVOLUTION_SINC_WINDOW__BLACKMAN,
    CONVOLUTION_SINC_WINDOW__HAMMING,
    CONVOLUTION_SINC_WINDOW__RECTANGLE,
    ConvolutionSincWindowType,
    copyEffectRackItem,
    defaultBindings,
    deserializeEffectRack,
    EFFECT_RACK_ITEM__BIQUAD_FILTER,
    EFFECT_RACK_ITEM__BIQUAD_FILTER_2,
    EFFECT_RACK_ITEM__DELAY,
    EFFECT_RACK_ITEM__ENVELOPE,
    EFFECT_RACK_ITEM__MATHS,
    EFFECT_RACK_ITEM__NOISE,
    EFFECT_RACK_ITEM__OSCILLATOR,
    EFFECT_RACK_ITEM__REVERB_BAD,
    EFFECT_RACK_ITEM__SINC_FILTER,
    EFFECT_RACK_ITEM__SWITCH,
    EFFECT_RACK_ITEM__WAVE_TABLE,
    EffectRack,
    EffectRackItem,
    EffectRackItemType,
    EffectRackMaths,
    EffectRackMathsItemTermCoefficient,
    EffectRackOscillatorWaveType,
    EffectRackRegisters,
    getBiquad2FilterTypeName,
    getConvolutionSincWindowTypeName,
    getEffectRackOscillatorWaveTypeName,
    newEffectRack,
    newEffectRackBiquadFilter,
    newEffectRackBiquadFilter2,
    newEffectRackConvolutionFilter,
    newEffectRackDelay,
    newEffectRackEnvelope,
    newEffectRackItem,
    newEffectRackMaths,
    newEffectRackMathsItemCoefficient,
    newEffectRackMathsItemTerm,
    newEffectRackNoise,
    newEffectRackOscillator,
    newEffectRackRegisters,
    newEffectRackReverbBadImpl,
    newEffectRackSwitch,
    newEffectRackSwitchCondition,
    newEffectRackWaveTable,
    newEffectRackWaveTableItem,
    OSC_WAVE__SAWTOOTH,
    OSC_WAVE__SAWTOOTH2,
    OSC_WAVE__SIN,
    OSC_WAVE__SQUARE,
    OSC_WAVE__TRIANGLE,
    RegisterIdx,
    RegisterIdxUi,
    RegisterOutput,
    RegisterOutputId,
    serializeEffectRack,
    SWITCH_OP_GT,
    SWITCH_OP_LT,
    ValueRef
} from "src/dsp/dsp-loop-effect-rack";
import { applyPlaySettingsDefaults, getCurrentPlaySettings, getDspInfo, pressKey, updatePlaySettings } from "src/dsp/dsp-loop-interface";
import { effectRackToPreset, getLoadedPreset, updateAutosavedEffectRackPreset } from "src/state/data-repository";
import { getKeyForKeyboardKey } from "src/state/keyboard-state";
import { arrayAt, arrayMove, copyArray, filterInPlace, removeItem } from "src/utils/array-utils";
import { assert, unreachable } from "src/utils/assert";
import { done } from "src/utils/async-utils";
import { CssColor, newColor, newColorFromHsv, rgbaToCssString } from "src/utils/colour";
import { newCssBuilder } from "src/utils/cssb";
import { fft, fftToReal, resizeNumberArrayPowerOf2 } from "src/utils/fft";
import {
    getDeltaTimeSeconds,
    getFpsCounterState,
    getRenderCount,
    ImCache,
    imFor,
    imForEnd,
    imGet,
    imIf,
    imIfElse,
    imIfEnd,
    imKeyedBegin,
    imKeyedEnd,
    imMemo,
    imSet,
    imState,
    imSwitch,
    imSwitchEnd,
    isFirstishRender
} from "src/utils/im-core";
import { EL_B, EL_I, EL_SVG_PATH, elHasMouseOver, elHasMousePress, elSetAttr, elSetClass, elSetStyle, getGlobalEventSystem, imDomRootExistingBegin, imDomRootExistingEnd, imElBegin, imElEnd, imElSvgBegin, imElSvgEnd, imStr, imStrFmt, imSvgContext, SvgContext } from "src/utils/im-dom";
import { arrayMax, arrayMin } from "src/utils/math-utils";
import { getNoteFrequency, getNoteIndex } from "src/utils/music-theory-utils";
import { canRedo, canUndo, JSONUndoBuffer, newJSONUndoBuffer, redo, stepUndoBufferTimer, undo, undoBufferIsEmpty, writeToUndoBuffer, writeToUndoBufferDebounced } from "src/utils/undo-buffer-json";
import { GlobalContext, setViewChartSelect } from "./app";
import { imExportModal, imImportModal } from "./import-export-modals";
import { imKeyboard } from "./keyboard";
import { drawSamples, imPlotBegin, imPlotEnd } from "./plotting";
import { DRAG_TYPE_CIRCULAR, imParameterSliderInteraction } from "./sound-lab-drag-slider";
import { imEffectRackList, presetsListState, PresetsListState } from "./sound-lab-effect-rack-list";
import { cssVarsApp, getCurrentTheme } from "./styling";

import { EffectRackEditorState, imEffectRackActualWaveform, imEffectRackEditor, imEffectRackEditorWaveformPreview, imHeading, newEffectRackEditorState } from "./sound-lab-effect-rack-editor";

type SoundLabState = {
    rightPanel: {
        presets: boolean;
    },
};

function newSoundLabState(): SoundLabState {
    return {
        rightPanel: {
            presets: false,
        },
    };
}


export function imSoundLab(c: ImCache, ctx: GlobalContext) {
    const settings = getCurrentPlaySettings();

    const lab = imState(c, newSoundLabState);
    let editor = imGet(c, newEffectRackEditorState);
    if (!editor) {
        const rack = settings.parameters.rack;
        editor = imSet(c, newEffectRackEditorState(rack));
    }

    if (imMemo(c, editor.ui.touchedAnyWidgetCounter)) {
        // Specifically when we're tweaking values, we probably want 
        // to see the preview waveform and not the list of presets.
        lab.rightPanel.presets = false;
    }

    imLayoutBegin(c, ROW); imSize(c, 100, PERCENT, 100, PERCENT); imBg(c, cssVars.bg); {
        if (isFirstishRender(c)) {
            // Should be the default for web apps tbh. Only on documents, would you ever want to select the text ...
            elSetClass(c, cn.userSelectNone);
        }

        const svgCtx = imSvgContext(c);
        editor.svgCtx = svgCtx;

        imLayoutBegin(c, COL); imFlex(c, 4); {
            imEffectRackEditor(c, ctx, editor);
        } imLayoutEnd(c);

        imLine(c, LINE_VERTICAL);

        imLayoutBegin(c, COL); imFlex(c, 2); {
            imSoundLabRightPanel(c, ctx, editor, lab);
        } imLayoutEnd(c);

        editor.svgCtx = null;
    } imLayoutEnd(c);
}

function imSoundLabRightPanel(
    c: ImCache,
    ctx: GlobalContext,
    editor: EffectRackEditorState,
    lab: SoundLabState,
) {
    imLayoutBegin(c, COL); imFlex(c, 3); {
        imLine(c, LINE_HORIZONTAL, 2);

        imLayoutBegin(c, ROW); imGap(c, 5, PX); {
            if (imButtonIsClicked(c, "Wave preview", !lab.rightPanel.presets)) {
                lab.rightPanel.presets = false;
            }

            if (imButtonIsClicked(c, "Effect racks", lab.rightPanel.presets)) {
                lab.rightPanel.presets = true;
            }

            if (imButtonIsClicked(c, "Keyboards", lab.rightPanel.presets)) {
                lab.rightPanel.presets = true;
            }
        } imLayoutEnd(c);

        if (imIf(c) && lab.rightPanel.presets) {
            imLayoutBegin(c, COL); imFlex(c); {
                imEffectRackList(c, ctx, editor.presetsListState, editor);
            } imLayoutEnd(c);
        } else {
            imIfElse(c);

            imLayoutBegin(c, ROW); imHeading(c, "Waveform preview"); imLayoutEnd(c);

            imEffectRackEditorWaveformPreview(c, ctx, editor);

            // May seem useless rn, but I want to eventually assign different effect rack presets to 
            // different keys or key ranges, and that is when this will become handy.
            imLayoutBegin(c, ROW); imAlign(c); imJustify(c); imFlex(c, 1); {
                imKeyboard(c, ctx);
            } imLayoutEnd(c);
        } imIfEnd(c);
    } imLayoutEnd(c);

    imLine(c, LINE_HORIZONTAL);

    imLayoutBegin(c, ROW); imHeading(c, "Actual waveform"); imLayoutEnd(c);

    imLayoutBegin(c, COL); imFlex(c, 2); {
        imEffectRackActualWaveform(c, ctx, editor);
    } imLayoutEnd(c);
}
