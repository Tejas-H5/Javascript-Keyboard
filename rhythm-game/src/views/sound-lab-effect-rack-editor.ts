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
} from "src/state/effect-rack";
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

const MAX_NUM_FREQUENCIES = 16384;

const MOCK_SAMPLE_RATE = 44100;

type DspMockHarnessState = {
    dsp: DspState;
    allSamples: number[]
    allSamplesIdx: number;
    allSamplesLen: number;

    allSamplesStartIdx:     number;
    allSamplesWindowLength: number;
    allSamplesVisibleStart: number;
    allSamplesVisibleEnd:   number;

    frequenciesStartIdx: number;
    frequenciesLength:   number;
    signalFftWindow:     number[];
    frequenciesReal:     number[];
    frequenciesIm:       number[];
    frequencies:         number[];

    autoPan: boolean;
    // This is just the format that the audo worker script needs to output.
    // [output(? not sure)][channel][sample] I think
    output: [[number[]]];

    effectRackEditor: EffectRackEditorState | null;

    messagesToSend: DspLoopMessage[];
}

export function dspMockHarnessState(): DspMockHarnessState {
    return {
        dsp: newDspState(MOCK_SAMPLE_RATE),

        allSamples: [0],
        allSamplesIdx: 0,
        allSamplesLen: 0,
        allSamplesStartIdx: 0,
        allSamplesWindowLength: 5000,
        allSamplesVisibleStart: 0,
        allSamplesVisibleEnd: 0,
        frequenciesStartIdx: 0,
        frequenciesLength: 2048,
        signalFftWindow: [0],
        frequenciesReal: [0],
        frequenciesIm: [0],
        frequencies: [0],
        autoPan: true,
        output: [[[]]],
        effectRackEditor: null,

        messagesToSend: [],
    }
}

const allWaveTypes: EffectRackOscillatorWaveType[] = [
    OSC_WAVE__SIN,
    OSC_WAVE__SQUARE,
    OSC_WAVE__SAWTOOTH,
    OSC_WAVE__SAWTOOTH2,
    OSC_WAVE__TRIANGLE,
];

const allWindowTypes: ConvolutionSincWindowType[] = [
    CONVOLUTION_SINC_WINDOW__RECTANGLE,
    CONVOLUTION_SINC_WINDOW__HAMMING,
    CONVOLUTION_SINC_WINDOW__BLACKMAN,
];

const MODAL_NONE = 0;
const MODAL_EXPORT = 1;
const MODAL_IMPORT = 2;

const UNDO_DEBOUNCE_SECONDS = 0.2;

type OscilloscopeState = {
    viewVersion: number;
    range: SampleRange;
};

type SampleRange = {
    idx: number;
    len: number;
}


function newOscilloscopeState(): OscilloscopeState {
    return {
        range: {
            idx: 0,
            len: 58071,
        },
        viewVersion: 0,
    }
}

// NOTE: this is currently the 'sound lab'
// Maybe in the future, it will go back to being just a tiny editor again. 
// I won't assume anything for now
export type EffectRackEditorState = {
    effectRack: EffectRack;
    undoBuffer: JSONUndoBuffer<EffectRack>;

    mockDspHarness: DspMockHarnessState;

    signalPreview: {
        calculatedUpToIdx: number;

        noteIdx: number;
        signalPressRange: SampleRange;
        samplesPerEffect: number[];
        oscilloscope: OscilloscopeState;
        samples: number[];
        registers: EffectRackRegisters;
    };

    compileStats: {
        numSamples: number;
        compileTime: number;
        computeSamplesTime: number;
        framesRequired: number;
        maxFramesRequired: number;
        completed: boolean;
    };

    ui: {
        modal: number;
        wires: BindingSvgWires;
        touchedAnyWidgetCounter: number;
    };

    version: number;

    highlightedValueRef: ValueRef;
    highlightedValueRefNext: ValueRef;

    svgCtx: SvgContext | null;

    deferredAction: (() => void) | null;
    autosaveDebounceSeconds: number;

    presetsListState: PresetsListState;
};

type BindingSvgWires = {
    outputPositions: Map<RegisterOutputId, {
        inUse: boolean;
        x: number;
        y: number;
        colour: CssColor;
    }>;

    drag: {
        // must always be the output of an effect.
        // right now, all effects just have 1 output.
        // -1 if not dragging.
        registerOutputId: RegisterOutputId | undefined;

        registerInput: RegisterIdxUi | undefined;

        registerInputClientX: number;
        registerInputClientY: number;

        // true  -> we are dragging to from output to input
        // false -> we are dragging from input to output
        toRegisterInput: boolean;
    }
};

export function newEffectRackEditorState(effectRack: EffectRack): EffectRackEditorState {
    const state: EffectRackEditorState = {
        effectRack: effectRack,
        undoBuffer: newJSONUndoBuffer<EffectRack>(
            1000,
            serializeEffectRack,
            deserializeEffectRack,
        ),

        mockDspHarness: dspMockHarnessState(),

        signalPreview: {
            calculatedUpToIdx: 0,
            oscilloscope: newOscilloscopeState(),
            samples: Array(MOCK_SAMPLE_RATE * 3).fill(0),
            registers: newEffectRackRegisters(),
            noteIdx: getNoteIndex("A", 3),
            samplesPerEffect: [],
            signalPressRange: {
                idx: 14430,
                len: 28090,
            }
        },

        compileStats: {
            compileTime: 0,
            numSamples: 0,
            computeSamplesTime: 0,
            framesRequired: 0,
            maxFramesRequired: 0,
            completed: false,
        },

        ui: {
            modal: MODAL_NONE,

            wires: {
                outputPositions: new Map(),

                drag: {
                    registerOutputId: undefined,
                    registerInput: undefined,
                    registerInputClientX: 0,
                    registerInputClientY: 0,
                    toRegisterInput: false,
                }
            },

            touchedAnyWidgetCounter: 0,
        },

        version: 0,

        highlightedValueRef: {},
        highlightedValueRefNext: {},

        deferredAction: null,
        autosaveDebounceSeconds: -1,

        svgCtx: null,

        presetsListState: presetsListState(),
    };

    return state;
}

function onEdited(editor: EffectRackEditorState, wasUndoTraversed = false, editUndoActionId?: number) {
    editor.version++;

    compileEffectRack(editor.effectRack);

    editor.autosaveDebounceSeconds = 1;

    if (editUndoActionId !== undefined) {
        // We actually want to write to the undo buffer immediately
        writeToUndoBuffer(editor.undoBuffer, editor.effectRack, editUndoActionId);
        editUndoActionId = undefined;
    } else {
        if (!wasUndoTraversed) {
            writeToUndoBufferDebounced(editor.undoBuffer, editor.effectRack, UNDO_DEBOUNCE_SECONDS);
        }
    }
}

export function imHeading(c: ImCache, text: string) {
    imHeadingBegin(c); imStr(c, text); imHeadingEnd(c);
}

export function imHeadingBegin(c: ImCache) {
    imLayoutBegin(c, ROW); imJustify(c); imElBegin(c, EL_B); {
    } // imElEnd(c, EL_B); imLayoutEnd(c);
}

export function imHeadingEnd(c: ImCache) {
    // imLayoutBegin(c, ROW); imJustify(c); imElBegin(c, EL_B); 
    {
    } imElEnd(c, EL_B); imLayoutEnd(c);
}


const cssb = newCssBuilder();
const cnEffectRackEditor = cssb.cn("effectRackEditor", [
    // TODO: better styling xD
    ` .hoverable { cursor: pointer; margin: 2px; border-radius: 4px; }`,
    ` .hoverable:hover { outline: 2px solid ${cssVars.fg}; }`
]);

const ACTION_ID_IMPORT = 1;

function createConnection(editor: EffectRackEditorState, src: RegisterOutputId, dst: RegisterIdxUi) {
    dst.valueRef = { regOutputId: src };
    onEdited(editor);
}

const dragColour = newColor(0, 0, 0, 1);


export function imEffectRackEditor(c: ImCache, ctx: GlobalContext, editor: EffectRackEditorState) {
    const rack = editor.effectRack;

    const settings = getCurrentPlaySettings();

    const versionChanged = imMemo(c, editor.version);
    if (versionChanged) {
        compileEffectRack(rack);

        // TODO: can make it more performant by updating just the specific register being edited
        // rather than the entire effect rack if we're editing a value in realtime

        settings.parameters.rack = rack;
        updatePlaySettings();
    }

    if (editor.autosaveDebounceSeconds > 0) {
        const dt = getDeltaTimeSeconds(c);
        editor.autosaveDebounceSeconds -= dt;
        if (editor.autosaveDebounceSeconds <= 0) {
            editor.autosaveDebounceSeconds = -1;

            const preset = effectRackToPreset(editor.effectRack);
            updateAutosavedEffectRackPreset(ctx.repo, preset, done);
        }
    }

    if (imMemo(c, true)) {
        if (undoBufferIsEmpty(editor.undoBuffer)) {
            writeToUndoBuffer(editor.undoBuffer, editor.effectRack);
        }
    }

    const wires = editor.ui.wires; {
        const mouse = getGlobalEventSystem().mouse;
        const wires = editor.ui.wires;

        if (wires.drag.toRegisterInput) {
            if (wires.drag.registerOutputId !== undefined && !mouse.leftMouseButton) {
                if (wires.drag.registerInput) {
                    createConnection(editor, wires.drag.registerOutputId, wires.drag.registerInput);
                }

                wires.drag.registerInput = undefined;
                wires.drag.registerOutputId = undefined;
            }

            wires.drag.registerInput = undefined;
        } else {
            if (wires.drag.registerInput !== undefined && !mouse.leftMouseButton) {
                if (wires.drag.registerOutputId !== undefined) {
                    createConnection(editor, wires.drag.registerOutputId, wires.drag.registerInput);
                }

                wires.drag.registerInput = undefined;
                wires.drag.registerOutputId = undefined;
            }

            wires.drag.registerOutputId = undefined;
        }

        // Clean up unused wires, make new wires
        let wireUiChanged = false;
        {
            for (const outputUi of wires.outputPositions.values()) {
                outputUi.inUse = false;
            }

            for (const outputId of rack.effectRackOutputIds) {
                let outputUi = wires.outputPositions.get(outputId);
                if (!outputUi) {
                    outputUi = {
                        inUse: false,
                        x: 0,
                        y: 0,
                        colour: newColor(0, 0, 0, 1),
                    }
                    wires.outputPositions.set(outputId, outputUi);
                    wireUiChanged = true;
                }

                outputUi.inUse = true;
            }

            for (const [outputId, outputUi] of wires.outputPositions) {
                if (!outputUi.inUse) {
                    wires.outputPositions.delete(outputId);
                    wireUiChanged = true;
                }
            }
        }

        if (wireUiChanged) {
            let i = 0;
            for (const [outputId, outputUi] of wires.outputPositions) {
                outputUi.colour = newColorFromHsv((i / editor.effectRack.effects.length) % 1, 1, 0.5)
                i += 1;
            }
        }
    }

    editor.highlightedValueRef.regIdx = editor.highlightedValueRefNext.regIdx;
    editor.highlightedValueRef.regOutputId = editor.highlightedValueRefNext.regOutputId;
    editor.highlightedValueRefNext.regIdx = undefined;
    editor.highlightedValueRefNext.regOutputId = undefined;

    stepUndoBufferTimer(editor.undoBuffer, ctx.deltaTime, editor.effectRack);

    // Recompute oscilloscope as neeed, just once instead of per oscilloscope.
    // Wanted to have one oscilloscpe per UI but prob not worth it I reckon.
    {
        const s = editor.signalPreview;

        const noteChanged = imMemo(c, s.noteIdx);
        const pressedChanged = imMemo(c, s.signalPressRange.idx);
        const releasedChanged = imMemo(c, s.signalPressRange.len);
        const editorChanged = imMemo(c, editor.version);

        if (noteChanged || pressedChanged || releasedChanged || editorChanged) {
            const t0 = performance.now();

            compileEffectRack(editor.effectRack);

            const t1 = performance.now();
            editor.compileStats.compileTime = t1 - t0;
            editor.compileStats.numSamples = s.samples.length;

            s.calculatedUpToIdx = 0;
            editor.compileStats.framesRequired = 0;
            s.samples.fill(0);
            editor.compileStats.completed = false;
        }

        // Calculating a couple seconds of audio can actually be very computationally expensive,
        // so it's being done over multiple frames.
        if (s.calculatedUpToIdx < s.samples.length) {
            let keyFrequency = getNoteFrequency(s.noteIdx);

            const samplePressedIdx = s.signalPressRange.idx;
            const sampleReleasedIdx = s.signalPressRange.idx + s.signalPressRange.len;

            const batchSize = 4096;

            const fps = getFpsCounterState(c);
            const remainingTime = fps.frameMs - (performance.now() - fps.renderStart);
            const allowedTimeMs = Math.min(remainingTime * 0.5, 8);

            const t0 = performance.now();
            while (
                performance.now() - t0 < allowedTimeMs &&
                s.calculatedUpToIdx < s.samples.length
            ) {
                for (let i = 0; i < batchSize && s.calculatedUpToIdx < s.samples.length; i++) {
                    let signal = 0;
                    if (samplePressedIdx < s.calculatedUpToIdx && s.calculatedUpToIdx < sampleReleasedIdx) {
                        signal = 1;
                    }

                    s.samples[s.calculatedUpToIdx] = computeEffectRackIteration(
                        rack,
                        s.registers,
                        keyFrequency,
                        signal,
                        MOCK_SAMPLE_RATE,
                        s.calculatedUpToIdx === 0
                    );
                    s.calculatedUpToIdx += 1;
                }
            }

            editor.compileStats.framesRequired += 1;
            // worst case - only 1 batch was possible per frame
            editor.compileStats.maxFramesRequired = Math.ceil(s.samples.length / batchSize);
            editor.compileStats.computeSamplesTime += performance.now() - t0;
        } else {
            editor.compileStats.completed = true;
        }
    }


    // DSP harness code
    {
        const state = editor.mockDspHarness;

        const isPlaying = state.dsp.playingOscillators.length > 0;

        const info = getDspInfo();
        const sampleRate = info.sampleRate;
        const sampleRateChanged = imMemo(c, sampleRate);
        const infoCurrentlyPlaying = info.currentlyPlaying.length > 0;
        const infoCurrentlyPlayingChanged = imMemo(c, infoCurrentlyPlaying);

        if (sampleRateChanged || infoCurrentlyPlayingChanged) {
            if (sampleRate !== 1) {
                if (infoCurrentlyPlayingChanged && infoCurrentlyPlaying) {
                    state.dsp = newDspState(MOCK_SAMPLE_RATE);
                    state.dsp.sampleRate = sampleRate;
                    dspReceiveMessage(state.dsp, {
                        playSettings: getCurrentPlaySettings(),
                    });

                    // divide by 2 bc we cant measure frequencies above sampleRate / 2
                    const numFrequencies = Math.floor(sampleRate / 2);
                    state.frequencies = Array(numFrequencies).fill(0);
                    state.frequenciesReal = Array(numFrequencies).fill(0);
                    state.frequenciesIm = Array(numFrequencies).fill(0);
                    state.allSamplesLen = 0;
                    state.allSamplesIdx = 0;

                    state.autoPan = true;
                }
            }
        }

        // compute one frame of the dsp 
        {
            for (let i = 0; i < state.messagesToSend.length; i++) {
                const m = state.messagesToSend[i];
                dspReceiveMessage(state.dsp, m);
            }
            state.messagesToSend.length = 0;

            // Only step the DSP if we have things playing
            if (isPlaying) {
                if (state.allSamples.length !== 1_000_000) {
                    state.allSamples.length = 1_000_000;
                    state.allSamples.fill(0);
                }

                const samples = state.output[0][0];

                const dt = getDeltaTimeSeconds(c);

                // The DSP we're running here is purely for visuals.
                // It is the exact same code that runs in the DSP loop.
                // We can actually just resize the array to be exactly the size we want
                // based on the current deltatime. 
                // NOTE: the real code will be dealing with a Float32Array buffer, but
                // we can't resize that as easily. so for now, just passing in a number array.
                // The code doesn't really care about the difference anyway.
                const numSamples = Math.floor(dt * state.dsp.sampleRate);
                let lastLength = state.output[0][0].length;
                samples.length = numSamples;
                for (let i = lastLength; i < samples.length; i++) {
                    samples[i] = 0;
                }

                dspProcess(state.dsp, state.output);

                for (const f of samples) {
                    state.allSamples[state.allSamplesIdx] = f;
                    state.allSamplesIdx += 1;
                    state.allSamplesLen = Math.max(state.allSamplesLen, state.allSamplesIdx + 1);
                }
            }
        }
    }

    if (imIf(c) && editor.ui.modal === MODAL_EXPORT) {
        imExportModal(c, editor.effectRack, serializeEffectRack);

        if (!ctx.handled) {
            if (ctx.keyPressState) {
                const { key } = ctx.keyPressState;
                if (key === "Escape") {
                    editor.ui.modal = MODAL_NONE;
                    ctx.handled = true;
                } else {
                    // We need to be able to copy the text. fr fr.
                    ctx.handled = true;
                    ctx.dontPreventDefault = true;
                }
            }
        }
    } else if (imIfElse(c) && editor.ui.modal === MODAL_IMPORT) {
        const importModal = imImportModal(c);
        const ev = importModal.event;
        importModal.event = null
        if (ev) {
            if (ev.previewUpdated) {
                importModal.importError = "";
            } else if (ev.import) {
                // Try running it
                try {
                    editorImport(editor, importModal.json);

                    importModal.importError = "";
                    editor.ui.modal = MODAL_NONE;
                } catch (e) {
                    console.error(e);
                    importModal.importError = "" + e;
                }
            }
        }

        if (!ctx.handled) {
            if (ctx.keyPressState) {
                if (ctx.keyPressState.key === "Escape") {
                    editor.ui.modal = MODAL_NONE;
                    ctx.handled = true;
                }
            }
        }

    } imIfEnd(c);

    const svgCtx = editor.svgCtx;
    assert(!!svgCtx);

    imLayoutBegin(c, COL); imFlex(c); {
        if (isFirstishRender(c)) elSetStyle(c, "fontSize", "20px");
        if (isFirstishRender(c)) elSetClass(c, cnEffectRackEditor);

        imLayoutBegin(c, COL); imFlex(c); {
            imLayoutBegin(c, ROW); imAlign(c); {
                imLayoutBegin(c, ROW); imGap(c, 10, PX); {
                    if (imButtonIsClicked(c, "Import")) {
                        editor.ui.modal = MODAL_IMPORT;
                    }

                    if (imButtonIsClicked(c, "Export")) {
                        editor.ui.modal = MODAL_EXPORT;
                    }

                    if (imButtonIsClicked(c, "Reset")) {
                        editor.deferredAction = () => {
                            const playSettings = getCurrentPlaySettings();

                            applyPlaySettingsDefaults(playSettings);
                            updatePlaySettings();

                            editor.effectRack = playSettings.parameters.rack;

                            onEdited(editor);
                        }
                    }
                } imLayoutEnd(c);

                imFlex1(c);

                imHeadingBegin(c); {
                    imStr(c, "Effect rack");

                    let selectedPreset = getLoadedPreset(ctx.repo, editor.presetsListState.selectedId);

                    if (imIf(c) && selectedPreset) {
                        imStr(c, " - ");
                        imStr(c, selectedPreset.name);
                    } imIfEnd(c);

                } imHeadingEnd(c);

                imFlex1(c);

                imLayoutBegin(c, ROW); imGap(c, 10, PX); {
                    if (imButtonIsClicked(c, "Undo", false, canUndo(editor.undoBuffer))) {
                        editor.deferredAction = () => editorUndo(editor);
                    }

                    if (imButtonIsClicked(c, "Redo", false, canRedo(editor.undoBuffer))) {
                        editor.deferredAction = () => editorRedo(editor);
                    }
                } imLayoutEnd(c);
            } imLayoutEnd(c);

            imLayoutBegin(c, COL); imFlex(c); {
                const sc = imState(c, newScrollContainer);
                imScrollContainerBegin(c, sc); {

                    // The wire we are currently dragging
                    if (imIf(c) && wires.drag.registerOutputId !== undefined || wires.drag.registerInput !== undefined) {
                        imDomRootExistingBegin(c, svgCtx.root); {
                            const mouse = getGlobalEventSystem().mouse;
                            let srcX = mouse.X, srcY = mouse.Y;
                            let dstX = mouse.X, dstY = mouse.Y;

                            if (wires.drag.toRegisterInput && wires.drag.registerOutputId !== undefined) {
                                const outputUi = wires.outputPositions.get(wires.drag.registerOutputId);
                                assert(outputUi !== undefined);

                                srcX = outputUi.x;
                                srcY = outputUi.y;
                            } else {
                                dstX = wires.drag.registerInputClientX;
                                dstY = wires.drag.registerInputClientY;
                            }

                            imWire(
                                c,
                                srcX, srcY, dstX, dstY,
                                dragColour.r, dragColour.g, dragColour.b, 1,
                            );
                        } imDomRootExistingEnd(c, svgCtx.root);
                    } imIfEnd(c);

                    const effectsDnd = imDragAndDrop(c);
                    if (effectsDnd.moved) {
                        const { a, b } = effectsDnd.moved;
                        arrayMove(editor.effectRack.effects, a, b);
                        onEdited(editor);
                    }

                    imFor(c); for (let effectPos = 0; effectPos < rack.effects.length; effectPos++) {
                        const effect = rack.effects[effectPos];

                        imKeyedBegin(c, effect); {
                            imEffectRackEditorEffect(c, editor, effectPos, effectsDnd);
                        } imKeyedEnd(c);
                    } imForEnd(c);

                    imLayoutBegin(c, ROW); imJustify(c); {
                        imDropZoneForPrototyping(c, effectsDnd, rack.effects.length);
                        imInsertButton(c, editor, rack.effects.length - 1);
                    } imLayoutEnd(c);

                } imScrollContainerEnd(c);
            } imLayoutEnd(c);
        } imLayoutEnd(c);

        imLayoutBegin(c, ROW); {
            const s = editor.compileStats;
            const samplesPerMs = s.numSamples / s.computeSamplesTime;
            imLayoutBegin(c, ROW); imAlign(c); imFlex(c); {
                if (imIf(c) && s.completed) {
                    imStr(c, "Compiled in ");
                    imStr(c, s.compileTime.toFixed(3))
                    imStr(c, "ms, ");
                    imStr(c, "Ran in ");
                    imStr(c, samplesPerMs.toFixed(3))
                    imStr(c, s.numSamples); imStr(c, " computed over "); imStr(c, s.framesRequired);
                    imStr(c, " frames. Expect glitching if over "); imStr(c, s.maxFramesRequired);
                    // want to compute ~ 0.1 seconds ahead of time
                    // const wantedSamplesPerMs = (dspInfo.sampleRate / 10);
                    // imStr(c, " (budget = " + wantedSamplesPerMs.toFixed(3) + ")");
                } else {
                    imIfElse(c);
                    imStr(c, "...");
                } imIfEnd(c);
            } imLayoutEnd(c);

            imLayoutBegin(c, COL); {
                if (isFirstishRender(c)) elSetStyle(c, "borderTop", "1px solid " + cssVars.fg);
                if (isFirstishRender(c)) elSetStyle(c, "borderLeft", "1px solid " + cssVars.fg);
                if (isFirstishRender(c)) elSetStyle(c, "borderTopLeftRadius", "5px");
                if (isFirstishRender(c)) elSetStyle(c, "padding", "5px");
                imValueOrBindingEditor(c, editor, rack.effects.length, rack.output);
            } imLayoutEnd(c);
        } imLayoutEnd(c);
    } imLayoutEnd(c);

    if (editor.deferredAction) {
        const action = editor.deferredAction;
        editor.deferredAction = null;
        action();
    }

    if (!ctx.handled) {
        if (ctx.blurredState) {
            editor.mockDspHarness.messagesToSend.push({ clearAllOscilatorSignals: true });
        }

        if (ctx.keyReleaseState) {
            const { key } = ctx.keyReleaseState;

            const instrumentKey = getKeyForKeyboardKey(ctx.keyboard, key);
            if (instrumentKey) {
                editor.mockDspHarness.messagesToSend.push({
                    setOscilatorSignal: [instrumentKey.index, { noteId: instrumentKey.noteId, signal: 0 }]
                });
            }
        }

        if (ctx.keyPressState) {
            const { keyUpper, ctrlPressed, shiftPressed, key } = ctx.keyPressState;

            if (keyUpper === "Z" && ctrlPressed && !shiftPressed) {
                editor.deferredAction = () => editorUndo(editor);
                ctx.handled = true;
            } else if (
                (keyUpper === "Z" && ctrlPressed && shiftPressed) ||
                (keyUpper === "Y" && ctrlPressed && !shiftPressed)
            ) {
                editor.deferredAction = () => editorRedo(editor);
                ctx.handled = true;
            } else if (key === "Escape") {
                setViewChartSelect(ctx);
                ctx.handled = true;
            }

            if (!ctx.handled) {
                const instrumentKey = getKeyForKeyboardKey(ctx.keyboard, key);
                if (instrumentKey) {
                    pressKey(instrumentKey.index, instrumentKey.noteId, ctx.keyPressState.isRepeat);
                    if (!ctx.keyPressState.isRepeat) {
                        editor.mockDspHarness.messagesToSend.push({
                            setOscilatorSignal: [instrumentKey.index, { noteId: instrumentKey.noteId, signal: 1 }]
                        });
                    }
                    ctx.handled = true;
                }
            }

            if (ctx.handled) {
                ctx.keyPressState.e.preventDefault();
                ctx.keyPressState = null;
            }
        }
    }
}

function getEffectTypeShortName(type: EffectRackItemType): string {
    switch (type) {
        case EFFECT_RACK_ITEM__OSCILLATOR:    return  "OSC";
        case EFFECT_RACK_ITEM__ENVELOPE:      return  "ENV";
        case EFFECT_RACK_ITEM__MATHS:         return  "MATHS";
        case EFFECT_RACK_ITEM__SWITCH:        return  "SWITCH";
        case EFFECT_RACK_ITEM__NOISE:         return  "NOISE";
        case EFFECT_RACK_ITEM__DELAY:         return  "DELAY";
        case EFFECT_RACK_ITEM__BIQUAD_FILTER: return  "BIQUAD";
        case EFFECT_RACK_ITEM__BIQUAD_FILTER_2: return  "BIQUAD2";
        case EFFECT_RACK_ITEM__SINC_FILTER:   return  "SINC";
        case EFFECT_RACK_ITEM__REVERB_BAD:    return  "REVERB";
        case EFFECT_RACK_ITEM__WAVE_TABLE:    return  "WAVETABL";
        default: unreachable(type);
    }
}

export function imEffectRackEditorWaveformPreview(c: ImCache, ctx: GlobalContext, editor: EffectRackEditorState) {
    imLayoutBegin(c, COL); imFlex(c); {
        const s = editor.signalPreview;
        imOscilloscope(c, s.oscilloscope, s.samples);
        imSampleRangeSlider(c, s.signalPressRange, s.samples.length, "Signal: ");
    } imLayoutEnd(c);
}

export function imEffectRackActualWaveform(c: ImCache, ctx: GlobalContext, editor: EffectRackEditorState) {
    imOscilloscope2(c, editor.mockDspHarness)
}


const allFilterTypeChoices: Biquad2FilterType[] = [
    BIQUAD2_TYPE__LOWPASS,
    BIQUAD2_TYPE__HIGHPASS,
    BIQUAD2_TYPE__BANDPASS_1,
    BIQUAD2_TYPE__BANDPASS_2,
    BIQUAD2_TYPE__NOTCH,
    BIQUAD2_TYPE__ALLPASS,
    BIQUAD2_TYPE__PEAKINGEQ,
    BIQUAD2_TYPE__LOW_SHELF,
    BIQUAD2_TYPE__HIGH_SHELF,
];

function imEffectRackEditorEffect(
    c: ImCache,
    editor: EffectRackEditorState,
    effectPos: number,
    effectsDnd: DragAndDropState,
) {
    const rack = editor.effectRack;
    const effect = rack.effects[effectPos];

    const z = imDragZoneBegin(c, effectsDnd, effectPos); {
        imLayoutBegin(c, COL); imFlex(c); {
            imLayoutBegin(c, ROW); imAlign(c);
            imPadding(c, 5, PX, 5, PX, 0, PX, 5, PX); imGap(c, 5, PX); {
                imDropZoneForPrototyping(c, effectsDnd, effectPos);

                imVerticalText(c); imAlign(c); imGap(c, 10, PX); {
                    imLayoutBegin(c, ROW); {
                        imDragHandle(c, effectsDnd, effectPos);

                        imStrFmt(c, effect.value.type, getEffectTypeShortName);
                    } imLayoutEnd(c);
                } imLayoutEnd(c);

                imLine(c, LINE_VERTICAL, 5);

                // imLine(c, LINE_VERTICAL, 5);

                imDspVisualGroupBegin(c, ROW); imFlex(c); imFlexWrap(c); imJustify(c); {
                    imLayoutBegin(c, ROW); imFlex(c); imGap(c, 10, PX);  {
                        const effectValue = effect.value;
                        imSwitch(c, effectValue.type); switch (effectValue.type) {
                            case EFFECT_RACK_ITEM__OSCILLATOR: {
                                const osc = effectValue;

                                imValueOrBindingEditor(c, editor, effectPos, osc.amplitudeUI);

                                imDspVisualGroupBegin(c, COL); imFlex(c); {
                                    imLayoutBegin(c, ROW); imGap(c, 20, PX); imAlign(c); {
                                        const ev = imSelectChoice(c, osc.waveType, allWaveTypes, getEffectRackOscillatorWaveTypeName);
                                        if (ev) {
                                            osc.waveType = ev.choice;
                                            onEdited(editor);
                                        }

                                        imDspVisualGroupBegin(c, ROW); {
                                            imValueOrBindingEditor(c, editor, effectPos, osc.frequencyUI);
                                            imValueOrBindingEditor(c, editor, effectPos, osc.frequencyMultUI);
                                        } imDspVisualGroupEnd(c);

                                        imValueOrBindingEditor(c, editor, effectPos, osc.phaseUI);

                                        imStr(c, "+");

                                        imValueOrBindingEditor(c, editor, effectPos, osc.offsetUI);
                                    } imLayoutEnd(c);

                                    imDspVisualGroupBegin(c, ROW); imGap(c, 20, PX); imAlign(c);  {
                                        imHeading(c, "unison");
                                        imValueOrBindingEditor(c, editor, effectPos, osc.unisonPhaseOffsetUi);
                                        imValueOrBindingEditor(c, editor, effectPos, osc.unisonCountUi);
                                        imValueOrBindingEditor(c, editor, effectPos, osc.unisionWidthUi);
                                        imValueOrBindingEditor(c, editor, effectPos, osc.unisonMixUi);
                                    } imDspVisualGroupEnd(c);
                                } imDspVisualGroupEnd(c);

                                imDspVisualGroupBegin(c, COL); {
                                    imRegisterOutput(c, editor, effectPos, osc.waveOut);
                                    imRegisterOutput(c, editor, effectPos, osc.tOut);
                                } imDspVisualGroupEnd(c);
                            } break;
                            case EFFECT_RACK_ITEM__ENVELOPE: {
                                const envelope = effectValue;

                                imDspVisualGroupBegin(c, ROW); imFlex(c); imJustify(c, SPACE_EVENLY); {
                                    imValueOrBindingEditor(c, editor, effectPos, envelope.amplitudeUi);
                                    imValueOrBindingEditor(c, editor, effectPos, envelope.signalUI);
                                    imValueOrBindingEditor(c, editor, effectPos, envelope.attackUI);
                                    imValueOrBindingEditor(c, editor, effectPos, envelope.decayUI);
                                    imValueOrBindingEditor(c, editor, effectPos, envelope.sustainUI);
                                    imValueOrBindingEditor(c, editor, effectPos, envelope.releaseUI);
                                } imDspVisualGroupEnd(c);

                                imDspVisualGroupBegin(c, COL); {
                                    imRegisterOutput(c, editor, effectPos, envelope.valueOut);
                                    imRegisterOutput(c, editor, effectPos, envelope.stageOut);
                                } imDspVisualGroupEnd(c);
                            } break;
                            case EFFECT_RACK_ITEM__MATHS: {
                                const math = effectValue;

                                imLayoutBegin(c, COL); imAlign(c); imFlex(c); {
                                    // dont want the contents to be aligned, but I do want this thing's
                                    // final size to be aligned. like
                                    // [   |[           ]   |   ]
                                    // [   |[         ]     |   ]
                                    // [   |[              ]|   ]
                                    
                                    imLayoutBegin(c, COL); imGap(c, 10, PX); {
                                        imFor(c); for (let termIdx = 0; termIdx < math.terms.length; termIdx++) {
                                            const term = math.terms[termIdx];

                                            imLayoutBegin(c, ROW); imAlign(c); imGap(c, 10, PX); {
                                                imDspVisualGroupBegin(c, ROW); imAlign(c); imGap(c, 10, PX); {

                                                    imLayoutBegin(c, ROW); imAlign(c); imGap(c, 10, PX); {
                                                        imMathsCoefficientsList(c, editor, effectPos, math, termIdx, term.coefficients, true);

                                                        if (imIf(c) && term.coefficientsDivide.length === 0) {
                                                            if (imButtonIsClicked(c, "/")) {
                                                                const co = newEffectRackMathsItemCoefficient();
                                                                term.coefficientsDivide.push(co);
                                                                onEdited(editor);
                                                            }
                                                        } imIfEnd(c);

                                                        if (imIf(c) && term.coefficientsDivide.length > 0) {
                                                            imStr(c, " / ");

                                                            imMathsCoefficientsList(c, editor, effectPos, math, termIdx, term.coefficientsDivide, false);
                                                        } imIfEnd(c);

                                                        imDspVisualGroupBegin(c, COL); {
                                                            term.termOut._name = "";
                                                            imRegisterOutput(c, editor, effectPos, term.termOut);
                                                        } imDspVisualGroupEnd(c);
                                                    } imLayoutEnd(c);

                                                } imDspVisualGroupEnd(c);

                                                if (imIf(c) && termIdx < math.terms.length - 1) {
                                                    imStr(c, " + ");
                                                } imIfEnd(c);
                                            } imLayoutEnd(c);
                                        } imForEnd(c);

                                        if (imButtonIsClicked(c, "+")) {
                                            const term = newEffectRackMathsItemTerm();
                                            math.terms.push(term);
                                            onEdited(editor);
                                        }
                                    } imLayoutEnd(c);
                                } imLayoutEnd(c);

                                imDspVisualGroupBegin(c, COL); {
                                    imRegisterOutput(c, editor, effectPos, math.sumOut);
                                } imDspVisualGroupEnd(c);
                            } break;
                            case EFFECT_RACK_ITEM__SWITCH: {
                                const switchEffect = effectValue;

                                imFlex1(c);

                                imLayoutBegin(c, COL); {
                                    imFor(c); for (let i = 0; i < switchEffect.conditions.length; i++) {
                                        const cond = switchEffect.conditions[i];

                                        imDspVisualGroupBegin(c, ROW); {
                                            imValueOrBindingEditor(c, editor, effectPos, cond.aUi);

                                            if (imButtonIsClicked(c, cond.operator === SWITCH_OP_LT ? "<" : ">")) {
                                                if (cond.operator === SWITCH_OP_LT) {
                                                    cond.operator = SWITCH_OP_GT;
                                                    onEdited(editor);
                                                } else {
                                                    cond.operator = SWITCH_OP_LT;
                                                    onEdited(editor);
                                                }
                                            }

                                            imValueOrBindingEditor(c, editor, effectPos, cond.bUi);

                                            imValueOrBindingEditor(c, editor, effectPos, cond.valUi);

                                            if (imButtonIsClicked(c, "-")) {
                                                editor.deferredAction = () => {
                                                    removeItem(switchEffect.conditions, cond);
                                                    onEdited(editor);
                                                };
                                            }
                                        } imDspVisualGroupEnd(c);
                                    } imForEnd(c);

                                    if (imButtonIsClicked(c, "+")) {
                                        const condition = newEffectRackSwitchCondition();
                                        switchEffect.conditions.push(condition);
                                        onEdited(editor);
                                    }

                                    imDspVisualGroupBegin(c, BLOCK); {
                                        imValueOrBindingEditor(c, editor, effectPos, switchEffect.defaultUi);
                                    } imDspVisualGroupEnd(c);
                                } imLayoutEnd(c);

                                imDspVisualGroupBegin(c, COL); {
                                    imRegisterOutput(c, editor, effectPos, switchEffect.valueOut);
                                } imDspVisualGroupEnd(c);
                            } break;
                            case EFFECT_RACK_ITEM__NOISE: {
                                const noise = effectValue;

                                imDspVisualGroupBegin(c, ROW); imFlex(c); imJustify(c, SPACE_EVENLY); {
                                    imValueOrBindingEditor(c, editor, effectPos, noise.amplitudeUi);
                                    imValueOrBindingEditor(c, editor, effectPos, noise.amplitudeMultUi);

                                    imValueOrBindingEditor(c, editor, effectPos, noise.midpointUi);

                                    imValueOrBindingEditor(c, editor, effectPos, noise.anchorUi);
                                } imDspVisualGroupEnd(c);

                                imDspVisualGroupBegin(c, COL); {
                                    imRegisterOutput(c, editor, effectPos, noise.noiseOut);
                                } imDspVisualGroupEnd(c);
                            } break;
                            case EFFECT_RACK_ITEM__DELAY: {
                                const delay = effectValue;

                                imLayoutBegin(c, BLOCK); {
                                    imDspVisualGroupBegin(c, ROW); {
                                        imValueOrBindingEditor(c, editor, effectPos, delay.signalUi);

                                        imSpacingSymbol(c, " -> ");

                                        imValueOrBindingEditor(c, editor, effectPos, delay.secondsUi);

                                        imSpacingSymbol(c, " -> ");

                                        imDspVisualGroupBegin(c, ROW); imJustify(c, SPACE_EVENLY); {
                                            imValueOrBindingEditor(c, editor, effectPos, delay.originalUi);

                                            imValueOrBindingEditor(c, editor, effectPos, delay.delayedUi);

                                            imSpacingSymbol(c, " -> ");
                                        } imDspVisualGroupEnd(c);
                                    } imDspVisualGroupEnd(c);
                                    imLayoutBegin(c, BLOCK); {
                                        imStr(c, "Due to the high memory usage of this effect, the max delay has been artifically limited to 1 second");
                                    } imLayoutEnd(c);
                                } imLayoutEnd(c);

                                imDspVisualGroupBegin(c, COL); {
                                    imRegisterOutput(c, editor, effectPos, delay.delayedOut);
                                } imDspVisualGroupEnd(c);
                            } break;
                            case EFFECT_RACK_ITEM__BIQUAD_FILTER: {
                                const filter = effectValue;

                                const filterUi = imGet(c, imEffectRackEditor) ?? imSet(c, {
                                    analyzing: false,
                                    compact: false,
                                });
                                if (imMemo(c, effect)) filterUi.compact = true;

                                imLayoutBegin(c, COL); imFlex(c); {
                                    imLayoutBegin(c, ROW); {

                                        imLayoutBegin(c, filterUi.compact ? ROW : COL); imJustify(c); imGap(c, 20, PX); {

                                            imValueOrBindingEditor(c, editor, effectPos, filter.signalUi);

                                            if (imButtonIsClicked(c, filterUi.analyzing ? "Analyzing" : "Analyze", filterUi.analyzing)) {
                                                filterUi.analyzing = !filterUi.analyzing;
                                            }
                                            if (imButtonIsClicked(c, "Compact", filterUi.compact)) {
                                                filterUi.compact = !filterUi.compact;
                                            }

                                        } imLayoutEnd(c);

                                        imSpacingSymbol(c, " -> ");

                                        imDspVisualGroupBegin(c, ROW); imFlex(c); {
                                            if (imIf(c) && filterUi.compact) {
                                                imLayoutBegin(c, ROW); imAlign(c); imJustify(c); imFlex(c); {
                                                    imValueOrBindingEditor(c, editor, effectPos, filter.a1Ui);
                                                    imValueOrBindingEditor(c, editor, effectPos, filter.a2Ui);
                                                } imLayoutEnd(c);
                                                imLayoutBegin(c, ROW); imAlign(c); imJustify(c); imFlex(c); {
                                                    imValueOrBindingEditor(c, editor, effectPos, filter.b0Ui);
                                                    imValueOrBindingEditor(c, editor, effectPos, filter.b1Ui);
                                                    imValueOrBindingEditor(c, editor, effectPos, filter.b2Ui);
                                                } imLayoutEnd(c);
                                            } else {
                                                imIfElse(c);

                                                imLayoutBegin(c, COL); imFlex(c); {
                                                    function imCellBegin(c: ImCache, height: number = 2) {
                                                        imLayoutBegin(c, ROW); imSize(c, 20, PERCENT, height, EM); imAlign(c); imJustify(c); imRelative(c); {
                                                        } // imLayoutEnd
                                                    }

                                                    function imCellEnd(c: ImCache) {
                                                        // imLayoutBegin
                                                        imLayoutEnd(c);
                                                    }

                                                    // there was an attempt. xd
                                                    imLayoutBegin(c, COL); imFlex(c); imAlign(c, STRETCH); {
                                                        imLayoutBegin(c, ROW); imJustify(c); {
                                                            imCellBegin(c); {
                                                                imSpacingSymbol(c, " -> ");
                                                            } imCellEnd(c);
                                                            imCellBegin(c); {
                                                                imSpacingSymbol(c, " -> ");
                                                            } imCellEnd(c);
                                                            imCellBegin(c); {
                                                                imValueOrBindingEditor(c, editor, effectPos, filter.b0Ui);
                                                            } imCellEnd(c);
                                                        } imLayoutEnd(c);
                                                        imLayoutBegin(c, ROW); imJustify(c); {
                                                            imCellBegin(c, 1.2); {
                                                                imLine(c, LINE_VERTICAL);
                                                            } imCellEnd(c);
                                                            imCellBegin(c); {
                                                            } imCellEnd(c);
                                                            imCellBegin(c, 1.2); {
                                                                imLine(c, LINE_VERTICAL);
                                                            } imCellEnd(c);
                                                        } imLayoutEnd(c);
                                                        imLayoutBegin(c, ROW); imJustify(c); {
                                                            imCellBegin(c); {
                                                                imValueOrBindingEditor(c, editor, effectPos, filter.a1Ui);
                                                            } imCellEnd(c);
                                                            imCellBegin(c); {
                                                                imSpacingSymbol(c, " <-> ");
                                                            } imCellEnd(c);
                                                            imCellBegin(c); {
                                                                imValueOrBindingEditor(c, editor, effectPos, filter.b1Ui);
                                                            } imCellEnd(c);
                                                        } imLayoutEnd(c);
                                                        imLayoutBegin(c, ROW); imJustify(c); {
                                                            imCellBegin(c, 1.2); {
                                                                imLine(c, LINE_VERTICAL);
                                                            } imCellEnd(c);
                                                            imCellBegin(c); {
                                                            } imCellEnd(c);
                                                            imCellBegin(c, 1.2); {
                                                                imLine(c, LINE_VERTICAL);
                                                            } imCellEnd(c);
                                                        } imLayoutEnd(c);
                                                        imLayoutBegin(c, ROW); imJustify(c); {
                                                            imCellBegin(c); {
                                                                imValueOrBindingEditor(c, editor, effectPos, filter.a2Ui);
                                                            } imCellEnd(c);
                                                            imCellBegin(c); {
                                                                imSpacingSymbol(c, " <-> ");
                                                            } imCellEnd(c);
                                                            imCellBegin(c); {
                                                                imValueOrBindingEditor(c, editor, effectPos, filter.b2Ui);
                                                            } imCellEnd(c);
                                                        } imLayoutEnd(c);
                                                    } imLayoutEnd(c);
                                                } imLayoutEnd(c);
                                            } imIfEnd(c);

                                        } imDspVisualGroupEnd(c);
                                    } imLayoutEnd(c);

                                    if (imIf(c) && filterUi.analyzing) {
                                        let hasAllManualInputs =
                                            filter.a1Ui.valueRef.value !== undefined &&
                                            filter.a2Ui.valueRef.value !== undefined &&
                                            filter.b0Ui.valueRef.value !== undefined &&
                                            filter.b1Ui.valueRef.value !== undefined &&
                                            filter.b2Ui.valueRef.value !== undefined;

                                        imFilterAnalyzer(c, editor, hasAllManualInputs, effect);
                                    } imIfEnd(c);
                                } imLayoutEnd(c);

                                imDspVisualGroupBegin(c, COL); {
                                    imRegisterOutput(c, editor, effectPos, filter.filterOut);
                                } imDspVisualGroupEnd(c);
                            } break;
                            case EFFECT_RACK_ITEM__SINC_FILTER: {
                                const conv = effectValue;

                                const filterUi = imGet(c, imEffectRackEditor) ?? imSet(c, {
                                    analyzing: false,
                                });

                                imLayoutBegin(c, COL); imFlex(c); {
                                    imLayoutBegin(c, ROW); imAlign(c); {
                                        imLayoutBegin(c, COL); imJustify(c); imGap(c, 20, PX); {
                                            imValueOrBindingEditor(c, editor, effectPos, conv.signalUi);

                                            if (imButtonIsClicked(c, filterUi.analyzing ? "Analyzing" : "Analyze", filterUi.analyzing)) {
                                                filterUi.analyzing = !filterUi.analyzing;
                                            }
                                        } imLayoutEnd(c);

                                        imSpacingSymbol(c, " -> ");

                                        imDspVisualGroupBegin(c, ROW); imFlex(c); {
                                            imLayoutBegin(c, ROW); imAlign(c); imJustify(c); imFlex(c); imGap(c, 10, PX); {

                                                imDspVisualGroupBegin(c, ROW); {
                                                    imValueOrBindingEditor(c, editor, effectPos, conv.cutoffFrequencyUi);
                                                    imValueOrBindingEditor(c, editor, effectPos, conv.cutoffFrequencyMultUi);
                                                } imDspVisualGroupEnd(c);

                                                imValueOrBindingEditor(c, editor, effectPos, conv.stopbandUi);
                                                imValueOrBindingEditor(c, editor, effectPos, conv.gainUi);

                                                const windowTypeChanged = imSelectChoice(c, conv.windowType, allWindowTypes, getConvolutionSincWindowTypeName);
                                                if (windowTypeChanged) {
                                                    conv.windowType = windowTypeChanged.choice;
                                                    onEdited(editor);
                                                }

                                                imLayoutBegin(c, ROW); imAlign(c); imGap(c, 10, PX); {
                                                    const ev = imCheckbox(c, conv.highpass);
                                                    if (ev) {
                                                        conv.highpass = ev.checked
                                                        onEdited(editor);
                                                    }

                                                    imStr(c, "Highpass"); effect
                                                } imLayoutEnd(c);
                                            } imLayoutEnd(c);
                                        } imDspVisualGroupEnd(c);
                                    } imLayoutEnd(c);

                                    const isHighStopband =
                                        conv.stopbandUi.valueRef.value === undefined ||
                                        conv.stopbandUi.valueRef.value > 20;
                                    if (imIf(c) && isHighStopband) {
                                        imLayoutBegin(c, BLOCK); {
                                            imStr(c, "WARNING: a high stopband will cripple the efficiency of this filter");
                                        } imLayoutEnd(c);
                                    } imIfEnd(c);

                                    if (imIf(c) && filterUi.analyzing) {
                                        let hasAllManualInputs =
                                            conv.cutoffFrequencyMultUi.valueRef.value !== undefined &&
                                            conv.cutoffFrequencyUi.valueRef.value !== undefined &&
                                            conv.stopbandUi.valueRef.value !== undefined;

                                        imFilterAnalyzer(c, editor, hasAllManualInputs, effect);
                                    } imIfEnd(c);
                                } imLayoutEnd(c);

                                imDspVisualGroupBegin(c, COL); {
                                    imRegisterOutput(c, editor,  effectPos, conv.filterOut);
                                } imDspVisualGroupEnd(c);
                            } break;
                            case EFFECT_RACK_ITEM__REVERB_BAD: {
                                const reverb = effectValue;


                                imLayoutBegin(c, ROW); imAlign(c); {
                                    imValueOrBindingEditor(c, editor, effectPos, reverb.signalUi);

                                    imSpacingSymbol(c, " -> ", true);

                                    imDspVisualGroupBegin(c, ROW); imFlex(c); {
                                        imValueOrBindingEditor(c, editor, effectPos, reverb.densityUi);
                                        imValueOrBindingEditor(c, editor, effectPos, reverb.decayUi);
                                    } imDspVisualGroupEnd(c);

                                    imSpacingSymbol(c, " -> ", true);
                                } imLayoutEnd(c);
                            } break;
                            case EFFECT_RACK_ITEM__BIQUAD_FILTER_2: {
                                const filter = effectValue;

                                const filterUi = imGet(c, imEffectRackEditor) ?? imSet(c, {
                                    analyzing: false,
                                });

                                imLayoutBegin(c, COL); imFlex(c); {
                                    imLayoutBegin(c, ROW); imAlign(c); {
                                        imLayoutBegin(c, COL); imJustify(c); imGap(c, 20, PX); {
                                            imValueOrBindingEditor(c, editor, effectPos, filter.signalUi);

                                            if (imButtonIsClicked(c, filterUi.analyzing ? "Analyzing" : "Analyze", filterUi.analyzing)) {
                                                filterUi.analyzing = !filterUi.analyzing;
                                            }
                                        } imLayoutEnd(c);

                                        imSpacingSymbol(c, " -> ", true);

                                        imDspVisualGroupBegin(c, ROW); imFlex(c); {
                                            const ev = imSelectChoice(c, filter.filterType, allFilterTypeChoices, getBiquad2FilterTypeName);
                                            if (ev) {
                                                filter.filterType = ev.choice;
                                                onEdited(editor);
                                            }

                                            imDspVisualGroupBegin(c, ROW); {
                                                imValueOrBindingEditor(c, editor, effectPos, filter.f0);
                                                imValueOrBindingEditor(c, editor, effectPos, filter.fMult);
                                            } imDspVisualGroupEnd(c);

                                            // Not used outside shelving filters, whatever those are
                                            // imValueOrBindingEditor(c, editor, effectPos, filter.dbGain);

                                            imValueOrBindingEditor(c, editor, effectPos, filter.qOrBWOrS);

                                            if (imIf(c) && biquad2IsUsingDbGain(filter)) {
                                                imValueOrBindingEditor(c, editor, effectPos, filter.dbGain);
                                            } imIfEnd(c);
                                        } imDspVisualGroupEnd(c);

                                        imSpacingSymbol(c, " -> ", true);
                                    } imLayoutEnd(c);


                                    if (imIf(c) && filterUi.analyzing) {
                                        let hasAllManualInputs = filter.f0.valueRef.value !== undefined &&
                                            filter.dbGain.valueRef.value !== undefined &&
                                            filter.qOrBWOrS.valueRef.value !== undefined;

                                        imFilterAnalyzer(c, editor, hasAllManualInputs, effect);
                                    } imIfEnd(c);
                                } imLayoutEnd(c);

                                imDspVisualGroupBegin(c, COL); {
                                    imRegisterOutput(c, editor, effectPos, filter.filterOut);
                                } imDspVisualGroupEnd(c);
                            } break;
                            case EFFECT_RACK_ITEM__WAVE_TABLE: {
                                const table = effectValue;
                                let wavePos = table.wavePosUi.valueRef.value;
                                const falloff = table.falloffUi.valueRef.value;

                                imLayoutBegin(c, COL); imAlign(c, STRETCH); imGap(c, 10, PX); imFlex(c); {
                                    imFor(c); for (let i = 0; i < table.items.length; i++) {
                                        const item = table.items[i];
                                        imDspVisualGroupBegin(c, ROW); imFlex(c); imAlign(c); {
                                            if (imIf(c) && falloff !== undefined && wavePos !== undefined) {
                                                wavePos = wavePos % table.items.length;
                                                if (wavePos < 0) {
                                                    wavePos = table.items.length + wavePos;
                                                }

                                                imLayoutBegin(c, BLOCK); imSize(c, 30, PX, 30, PX); imBg(c, cssVars.fg); {
                                                    let mask = 1 - falloff * Math.abs(i - wavePos);
                                                    if (mask < 0) mask = 0;
                                                    imOpacity(c, mask);
                                                } imLayoutEnd(c);
                                            } imIfEnd(c);

                                            imFlex1(c);

                                            const ev = imSelectChoice(c, item.waveType, allWaveTypes, getEffectRackOscillatorWaveTypeName);
                                            if (ev) {
                                                item.waveType = ev.choice;
                                                onEdited(editor);
                                            }

                                            imValueOrBindingEditor(c, editor, effectPos, item.amplitudeUi);
                                            imValueOrBindingEditor(c, editor, effectPos, item.frequencyUi);
                                            imValueOrBindingEditor(c, editor, effectPos, item.frequencyMultUi);
                                            imValueOrBindingEditor(c, editor, effectPos, item.phaseUi);

                                            imRegisterOutput(c, editor, effectPos, item.waveOut);

                                            if (imButtonIsClicked(c, "x")) {
                                                editor.deferredAction = () => {
                                                    filterInPlace(table.items, otherItem => otherItem !== item);
                                                    onEdited(editor);
                                                };
                                            }
                                        } imDspVisualGroupEnd(c);
                                    } imForEnd(c);

                                    if (imButtonIsClicked(c, "+")) {
                                        editor.deferredAction = () => {
                                            table.items.push(newEffectRackWaveTableItem());
                                            onEdited(editor);
                                        };
                                    }

                                    imDspVisualGroupBegin(c, ROW); imGap(c, 10, PX); {
                                        imValueOrBindingEditor(c, editor, effectPos, table.gainUi);
                                        imValueOrBindingEditor(c, editor, effectPos, table.falloffUi);
                                        imValueOrBindingEditor(c, editor, effectPos, table.wavePosUi);
                                    } imDspVisualGroupEnd(c);
                                } imLayoutEnd(c);

                                imDspVisualGroupBegin(c, ROW); {
                                    imRegisterOutput(c, editor, effectPos, table.totalOut);
                                } imDspVisualGroupEnd(c);
                            } break;
                            default: unreachable(effectValue);
                        } imSwitchEnd(c);
                    } imLayoutEnd(c);

                    // Might want to put something else here later ...
                } imDspVisualGroupEnd(c);

                imLayoutBegin(c, COL); imGap(c, 5, PX); imJustify(c); {
                    if (imButtonIsClicked(c, "-")) {
                        editor.deferredAction = () => {
                            effect._toDelete = true;
                            onEdited(editor);
                        }
                    }

                    imInsertButton(c, editor, effectPos);
                } imLayoutEnd(c);
            } imLayoutEnd(c);
        } imLayoutEnd(c);
    } imDragZoneEnd(c, z, effectPos);
}

function imRegisterOutput(
    c: ImCache,
    editor: EffectRackEditorState,
    effectPos: number,
    output: RegisterOutput,
) {
    const outputUi = editor.ui.wires.outputPositions.get(output.id);
    assert(outputUi !== undefined);

    imLayoutBegin(c, ROW); imAlign(c); {
        imSpacingSymbol(c, " -> ");

        elDropWireToEffectOutput(c, editor, output.id);

        imRegisterHighlightBg(c, editor, undefined, output.id);

        imResultName(c, output, effectPos + 1);

        imLayoutBegin(c, BLOCK); imSize(c, 4, PX, 10, NA); imLayoutEnd(c);

        const root = imWireDragEndpoint(c, editor, null, output);
        const rect = root.getBoundingClientRect();
        const x = rect.x + rect.width / 2;
        const y = rect.y + rect.height / 2;

        outputUi.x = x;
        outputUi.y = y;
    } imLayoutEnd(c);
}

function imMathsCoefficientsList(
    c: ImCache,
    editor: EffectRackEditorState,
    effectPos: number,
    math: EffectRackMaths,
    termIdx: number,
    coefficients: EffectRackMathsItemTermCoefficient[],
    isFirst: boolean,
) {
    imDspVisualGroupBegin(c, ROW); imAlign(c); imGap(c, 10, PX); {
        if (isFirstishRender(c)) {
            elSetStyle(c, "flexFlow", "wrap");
        }

        if (imIf(c) && isFirst) {
            imLayoutBegin(c, ROW); imJustify(c); imAlign(c); imGap(c, 10, PX); {
                imElBegin(c, EL_I); {
                    imElBegin(c, EL_B); imStr(c, termIdx); imElEnd(c, EL_B);
                } imElEnd(c, EL_I);
            } imLayoutEnd(c);
        } imIfEnd(c);

        imFor(c); for (let coIdx = 0; coIdx < coefficients.length; coIdx++) {
            const co = coefficients[coIdx];
            imLayoutBegin(c, ROW); imJustify(c); imGap(c, 5, PX); {
                if (
                    imMemo(c, termIdx) |
                    imMemo(c, coIdx) 
                ) {
                    co.valueUI._name = "x[" + termIdx + "][" + coIdx + "]";
                }
                imValueOrBindingEditor(c, editor, effectPos, co.valueUI);

                if (imButtonIsClicked(c, "-")) {
                    editor.deferredAction = () => {
                        filterInPlace(coefficients, coOther => coOther !== co);
                        filterInPlace(math.terms, term => term.coefficients.length > 0);
                        onEdited(editor);
                    };
                }
            } imLayoutEnd(c);
            if (imIf(c) && coIdx < coefficients.length - 1) {
                imLayoutBegin(c, ROW); imJustify(c); {
                    imStr(c, " * ");
                } imLayoutEnd(c);
            } imIfEnd(c);
        } imForEnd(c);

        if (imButtonIsClicked(c, "+")) {
            const co = newEffectRackMathsItemCoefficient();
            coefficients.push(co);
            onEdited(editor);
        }
    } imDspVisualGroupEnd(c);
}

function imSelectChoice<T>(c: ImCache, currentChoice: T, choices: T[], fmt: (val: T) => string): { choice: T } | null {
    let result: { choice: T } | null = null;

    const contextMenu = imContextMenu(c);
    if (imIf(c) && contextMenu.open) {
        imContextMenuBegin(c, contextMenu); {
            imFor(c); for (const type of choices) {
                imEditorContextMenuItemBegin(c); {
                    if (elHasMousePress(c)) {
                        result = { choice: type };
                        // Let's keep it open, so we can make multiple choices without having
                        // to keep re-opening it
                    }
                    imStrFmt(c, type, fmt);
                } imEditorContextMenuItemEnd(c);
            } imForEnd(c);
        } imContextMenuEnd(c, contextMenu);
    } imIfEnd(c);

    const clicked = imButtonBegin(c, fmt(currentChoice)); {
        imStr(c, " | v");

        if (clicked) {
            openContextMenuAtMouse(c, contextMenu);
        }
    } imButtonEnd(c);

    return result;
}

function imFilterAnalyzer(
    c: ImCache,
    editor: EffectRackEditorState,
    hasAllManualInputs: boolean,
    effect: EffectRackItem,
) {
    if (imIf(c) && !hasAllManualInputs) {
        imLayoutBegin(c, ROW); imJustify(c); {
            imStr(c, "Analysis will only work as expected when all value inputs are manual");
        } imLayoutEnd(c);
    } imIfEnd(c);

    const effectChanged = imMemo(c, effect);
    let s; s = imGet(c, imEffectRackEditor);
    if (!s || effectChanged) {
        const numSamples = MAX_NUM_FREQUENCIES;

        s = imSet(c, {
            osc: newOscilloscopeState(),
            impulseResponse: Array(numSamples),

            impulseResponseFft: {
                osc: newOscilloscopeState(),
                r: Array(numSamples),
                im: Array(numSamples),
                frequencies: Array(numSamples / 2),
                frequenciesMin: 0,
                frequenciesMax: 0,
            }
        });
    }

    if (imMemo(c, editor.version) || effectChanged) {

        const rack = newEffectRack();

        const effectCopy = copyEffectRackItem(effect, true);
        rack.effects.push(effectCopy);
        const filter = effectCopy.value;

        assert(
            filter.type === EFFECT_RACK_ITEM__BIQUAD_FILTER ||
            filter.type === EFFECT_RACK_ITEM__SINC_FILTER ||
            filter.type === EFFECT_RACK_ITEM__BIQUAD_FILTER_2
        );
        const registers = newEffectRackRegisters();

        compileEffectRack(rack);
        const keyNoteId    = getNoteIndex("A", 3);
        const keyFrequency = getNoteFrequency(keyNoteId);

        rack._registersTemplate.values[filter.signalUi._regIdx] = 1;
        s.impulseResponse[0] = computeEffectRackIteration(
            rack,
            registers,
            keyFrequency,
            1,
            MOCK_SAMPLE_RATE,
            true
        );

        rack._registersTemplate.values[filter.signalUi._regIdx] = 0;
        for (let i = 1; i < s.impulseResponse.length; i++) {
            s.impulseResponse[i] = computeEffectRackIteration(
                rack,
                registers,
                keyFrequency,
                1,
                MOCK_SAMPLE_RATE,
                false
            );
        }

        fft(s.impulseResponseFft.r, s.impulseResponseFft.im, s.impulseResponse);
        fftToReal(s.impulseResponseFft.frequencies, s.impulseResponseFft.r, s.impulseResponseFft.im);
        s.impulseResponseFft.frequenciesMax = arrayMax(s.impulseResponseFft.frequencies);
        s.impulseResponseFft.frequenciesMin = arrayMin(s.impulseResponseFft.frequencies);
    }

    imLayoutBegin(c, BLOCK); imStr(c, "Impulse response (time)"); imLayoutEnd(c);
    imLayoutBegin(c, COL); imSize(c, 0, NA, 200, PX); {
        imOscilloscope(c, s.osc, s.impulseResponse, "blue");
    } imLayoutEnd(c);
    imLayoutBegin(c, BLOCK); imStr(c, "Impulse response (frequency)"); imLayoutEnd(c);
    imLayoutBegin(c, COL); imSize(c, 0, NA, 200, PX); {
        imOscilloscope(
            c,
            s.impulseResponseFft.osc,
            s.impulseResponseFft.frequencies,
            "red",
            s.impulseResponseFft.frequenciesMin,
            s.impulseResponseFft.frequenciesMax
        );
    } imLayoutEnd(c);
}


function imSpacingSymbol(c: ImCache, symbol: string, flex = false) {
    imLayoutBegin(c, ROW); imAlign(c); imJustify(c); imNoWrap(c); imSize(c, 50, PX, 0, NA); imFlex(c, flex ? 1 : - 1); {
        imStr(c, symbol);
    } imLayoutEnd(c);
}

function editorUndo(editor: EffectRackEditorState): boolean {
    if (!canUndo(editor.undoBuffer)) return false;

    editor.effectRack = undo(editor.undoBuffer, editor.effectRack);
    onEdited(editor, true);
    return true;
}

function editorRedo(editor: EffectRackEditorState): boolean {
    if (!canRedo(editor.undoBuffer)) return false;

    editor.effectRack = redo(editor.undoBuffer);
    onEdited(editor, true);
    return true;
}

export function editorImport(editor: EffectRackEditorState, json: string) {
    const effectRack: EffectRack = deserializeEffectRack(json);
    if (!effectRack.effects || !Array.isArray(effectRack.effects)) {
        throw new Error("Wrong JSON format");
    }

    // Try computing a sample. Does it work??
    compileEffectRack(effectRack);
    const registers = newEffectRackRegisters();
    const noteId = getNoteIndex("C", 4);
    const f = getNoteFrequency(noteId);
    computeEffectRackIteration(
        effectRack,
        registers,
        f,
        1,
        48000,
        true
    );

    // If we reach here, then yeah its probably legit...
    editor.effectRack = effectRack;
    onEdited(editor, false, ACTION_ID_IMPORT);
}

function registerValueToString(num: number) {
    return num.toFixed(4);
}

const BINDING_IS_OUTPUT = 1 << 1;

function imDspVisualGroupBegin(c: ImCache, type: DisplayType, enabled: boolean = true) {
    imLayoutBegin(c, type); imAlign(c); imJustify(c); imGap(c, 5, PX); {
        if (imMemo(c, enabled)) {
            elSetStyle(c, "flexWrap", "wrap");
            elSetStyle(c, "border", !enabled ? "" : "1px solid " + cssVars.fg);
            elSetStyle(c, "padding", !enabled ? "" : "5px");
            elSetStyle(c, "borderRadius", !enabled ? "" : "5px");
        }

    } // imLayoutEnd
}

function imDspVisualGroupEnd(c: ImCache) {
    // imLayout
    {
    } imLayoutEnd(c);
}

function imValueOrBindingEditor(
    c: ImCache,
    editor: EffectRackEditorState,
    effectPos: number,
    regIdxUi: RegisterIdxUi,
    flags: number = 0
) {
    const rack = editor.effectRack;

    const row = false; //!!(flags & BINDING_UI_ROW);
    const isOutput = !!(flags & BINDING_IS_OUTPUT);

    imDspVisualGroupBegin(c, ROW, false); imNoWrap(c); imGap(c, 4, row ? PX : NA); {
        if (isFirstishRender(c)) {
            elSetStyle(c, "fontSize", "1.25rem");
        }

        // Much easier to connect things.
        elDropWireToRegisterInput(c, editor, regIdxUi);

        imRegisterHighlightBg(c, editor, undefined, regIdxUi.valueRef.regOutputId);

        if (imIf(c) && !isOutput) {
            imWireDragEndpoint(c, editor, regIdxUi, null);
        } imIfEnd(c);

        imLayoutBegin(c, row ? ROW_REVERSE : COL); imAlign(c); imJustify(c); imGap(c, 4, row ? PX : NA); {
            imLayoutBegin(c, BLOCK); {
                if (imIf(c) && regIdxUi.valueRef.value !== undefined && !isOutput) {
                    imStrFmt(c, regIdxUi.valueRef.value, registerValueToString);

                    let dragEvent = imParameterSliderInteraction(c, regIdxUi._min, regIdxUi._max, 0.0001, regIdxUi.valueRef.value, 0, DRAG_TYPE_CIRCULAR);
                    if (dragEvent) {
                        regIdxUi.valueRef.value = dragEvent.val;
                        onEdited(editor);
                        editor.ui.touchedAnyWidgetCounter++;
                    }
                } else if (imIfElse(c) && regIdxUi.valueRef.regIdx !== undefined && !isOutput) {
                    imLayoutBegin(c, ROW); {
                        imRegisterHighlightBg(c, editor, regIdxUi.valueRef.regIdx, regIdxUi.valueRef.regOutputId);

                        imStr(c, "<var=");
                        imStr(c, defaultBindings[regIdxUi.valueRef.regIdx].name);
                        imStr(c, ">");
                    } imLayoutEnd(c);
                } else if (imIfElse(c) && regIdxUi.valueRef.regOutputId !== undefined) {
                    imLayoutBegin(c, ROW); {
                        imRegisterHighlightBg(c, editor, regIdxUi.valueRef.regIdx, regIdxUi.valueRef.regOutputId);

                        const regOutput = rack._effectRackOutputIdToRegOutput.get(regIdxUi.valueRef.regOutputId);
                        assert(regOutput !== undefined);

                        imResultName(c, regOutput, effectPos);
                    } imLayoutEnd(c);
                    imIfElse(c);
                } else {
                    imIfElse(c);

                    imStr(c, "????");
                } imIfEnd(c);
            } imLayoutEnd(c);

            imLayoutBegin(c, BLOCK); {
                if (isFirstishRender(c)) {
                    elSetStyle(c, "fontSize", "1rem");
                    elSetStyle(c, "userSelect", "none");
                    elSetStyle(c, "fontWeight", "bold");
                    elSetClass(c, "hoverable");
                }

                imStr(c, regIdxUi._name);
                imStr(c, row ? ":" : "");

                imBindingEditorContextMenu(c, editor, regIdxUi);
            } imLayoutEnd(c);
        } imLayoutEnd(c);
    } imDspVisualGroupEnd(c);
}

function imEditorContextMenuItemBegin(c: ImCache) {
    imContextMenuItemBegin(c); {
        if (isFirstishRender(c)) {
            // TODO: things in apps should be non-selectable by default, and opt-in to the selection process.
            // This is a webapp, not a document.
            elSetStyle(c, "userSelect", "none");
            elSetClass(c, "hoverable");
        }
    } // imContextMenuItemEnd
}

function imEditorContextMenuItemEnd(c: ImCache) {
    // imContextMenuItemBegin 
    {
    } imContextMenuItemEnd(c);
}

function imBindingEditorContextMenu(
    c: ImCache,
    editor: EffectRackEditorState,
    reg: RegisterIdxUi,
) {
    const contextMenu = imContextMenu(c);
    if (imIf(c) && contextMenu.open) {
        imContextMenuBegin(c, contextMenu); {
            imEditorContextMenuItemBegin(c); {
                imStr(c, "default value");
                imStr(c, " (");
                imStr(c, reg._defaultValue);
                imStr(c, ")");

                if (elHasMousePress(c)) {
                    reg.valueRef = { value: reg._defaultValue };
                    onEdited(editor);
                    contextMenu.open = false;
                }
            } imEditorContextMenuItemEnd(c);

            imFor(c); for (
                let bindingIdx = 0 as RegisterIdx;
                bindingIdx < defaultBindings.length;
                bindingIdx++
            ) {
                const binding = defaultBindings[bindingIdx];

                imEditorContextMenuItemBegin(c); {
                    imRegisterHighlightBg(c, editor, bindingIdx, undefined);

                    imStr(c, "<"); imStr(c, binding.name); imStr(c, ">");

                    if (elHasMousePress(c)) {
                        reg.valueRef = { regIdx: asRegisterIdx(bindingIdx) };
                        onEdited(editor);
                        contextMenu.open = false;
                    }
                } imContextMenuItemEnd(c);
            } imForEnd(c);
        } imContextMenuEnd(c, contextMenu);
    } imIfEnd(c);

    if (elHasMousePress(c)) {
        openContextMenuAtMouse(c, contextMenu);
    }
}

function imResultName(
    c: ImCache,
    output: RegisterOutput,
    effectPos: number,
) {
    if (imIf(c) && output._name.length > 0) {
        imStr(c, "r");
        imStr(c, output._effectPos);

        imStr(c, ".");
        imStr(c, output._name);

        if (imIf(c) && effectPos <= output._effectPos) {
            imStr(c, "(-1)");
        } imIfEnd(c);
    } imIfEnd(c);
}

function imWireDragEndpoint(
    c: ImCache,
    editor: EffectRackEditorState,
    reg: RegisterIdxUi | null,        // if null, it's an output
    regOutput: RegisterOutput | null, // if null, it's an input,
) {
    const wires = editor.ui.wires;

    let isEligibleDropZone = false;
    if (wires.drag.registerInput !== undefined && !wires.drag.toRegisterInput) {
        isEligibleDropZone = false;

        if (reg === null) {
            isEligibleDropZone = true;
        }
    } else if (wires.drag.registerOutputId !== undefined && wires.drag.toRegisterInput) {
        if (reg) {
            isEligibleDropZone = true;
        }
    }

    const root = imLayoutBegin(c, ROW); imAlign(c); imJustify(c); imSize(c, 30, PX, 30, PX);
    imBg(c, isEligibleDropZone ? cssVars.mg : cssVars.bg2); {
        if (isFirstishRender(c)) {
            elSetStyle(c, "borderRadius", "1000px");
            elSetStyle(c, "cursor", "move");
        }

        if (!reg && regOutput) {
            elDragWireToRegisterInput(c, editor, regOutput.id, null);
        } else if (reg && !regOutput) {
            if (reg.valueRef.regOutputId !== undefined) {
                elDragWireToRegisterInput(c, editor, reg.valueRef.regOutputId, reg);
            } else {
                const rect = root.getBoundingClientRect();
                const dstX = rect.x + rect.width / 2;
                const dstY = rect.y + rect.height / 2;
                elDragWireToEffectOutput(c, editor, reg, dstX, dstY);
            }
        }

        if (imIf(c) && reg?.valueRef.regOutputId !== undefined) {
            const outputUi = wires.outputPositions.get(reg.valueRef.regOutputId);
            assert(outputUi !== undefined);

            const srcX = outputUi.x;
            const srcY = outputUi.y;

            const rect = root.getBoundingClientRect();
            const dstX = rect.x + rect.width / 2;
            const dstY = rect.y + rect.height / 2;

            assert(editor.svgCtx != null);

            imDomRootExistingBegin(c, editor.svgCtx.root); {
                const color = outputUi.colour;

                imWire(
                    c,
                    srcX, srcY, dstX, dstY,
                    color.r, color.g, color.b, 0.3 + (1 - 0.3) * 0.5,
                );
            } imDomRootExistingEnd(c, editor.svgCtx.root);
        } imIfEnd(c);
    } imLayoutEnd(c);

    return root;
}

function elDragWireToRegisterInput(
    c: ImCache,
    editor: EffectRackEditorState,
    registerOutputIdToDrag: RegisterOutputId | undefined,
    reg: RegisterIdxUi | null,
) {
    const wires = editor.ui.wires;
    const mouse = getGlobalEventSystem().mouse;
    if (wires.drag.registerOutputId === undefined && elHasMousePress(c) && mouse.leftMouseButton) {
        if (registerOutputIdToDrag !== undefined) {
            if (reg) {
                reg.valueRef = { value: reg._defaultValue };
                onEdited(editor);
            }
            wires.drag.registerOutputId = registerOutputIdToDrag;
            wires.drag.toRegisterInput = true;
        }
    }
}

function elDragWireToEffectOutput(
    c: ImCache,
    editor: EffectRackEditorState,
    reg: RegisterIdxUi,
    clientX: number, clientY: number
) {
    const wires = editor.ui.wires;
    const mouse = getGlobalEventSystem().mouse;
    if (wires.drag.registerInput === undefined && elHasMousePress(c) && mouse.leftMouseButton) {
        wires.drag.registerInput = reg;
        wires.drag.toRegisterInput = false;
    }

    if (wires.drag.registerInput === reg) {
        wires.drag.registerInputClientX = clientX;
        wires.drag.registerInputClientY = clientY;
    }
}

function elDropWireToRegisterInput(c: ImCache, editor: EffectRackEditorState, reg: RegisterIdxUi) {
    const wires = editor.ui.wires;

    if (wires.drag.registerOutputId !== undefined && elHasMouseOver(c)) {
        wires.drag.registerInput = reg;
    }
}

function elDropWireToEffectOutput(c: ImCache, editor: EffectRackEditorState, outputIdToDrop: RegisterOutputId) {
    const wires = editor.ui.wires;
    if (wires.drag.registerInput !== undefined && elHasMouseOver(c)) {
        wires.drag.registerOutputId = outputIdToDrop;
    }
}

function imWire(
    c: ImCache,
    srcX: number, srcY: number,
    dstX: number, dstY: number,
    r: number, g: number, b: number, a: number,
) {
    imElSvgBegin(c, EL_SVG_PATH); {
        if (imMemo(c, r) | imMemo(c, g) | imMemo(c, b) | imMemo(c, a)) {
            elSetAttr(c, "stroke", rgbaToCssString(r, g, b, a));
        }

        if (isFirstishRender(c)) {
            elSetAttr(c, "fill", "none");
            elSetAttr(c, "stroke-width", "10");
        }

        if (imMemo(c, srcX) | imMemo(c, srcY) | imMemo(c, dstX) | imMemo(c, dstY)) {
            const mY = srcY + (dstY - srcY) / 2;
            const mX = srcX + (dstX - srcX) / 2;
            const bowing = 100;
            const bowingVertical = 100;

            //  bezier z curve:
            //                          src
            //                           *---     *
            //                  m            )
            //         ----------*-----------
            //        (                   |<----->|--- bowing
            //   *     ---*
            //           dst
            //

            // https://developer.mozilla.org/en-US/docs/Web/SVG/Tutorials/SVG_from_scratch/Paths
            // HINT: prefil this with a preset curve, and then just edit the coordinates. Way easier.
            const newPath
                = `M ${srcX} ${srcY} Q ${srcX + bowing} ${srcY + bowingVertical}, ${mX} ${mY} T ${dstX} ${dstY}`

            elSetAttr(c, "d", newPath);
        }
    } imElSvgEnd(c, EL_SVG_PATH);
}

// want to visualize the program somehow. 
function imOscilloscope(
    c: ImCache,
    s: OscilloscopeState,
    samples: number[] | Float32Array,
    colour = "black",
    min = -1,
    max = 1,
): boolean {
    imLayoutBegin(c, COL); imFlex(c); {
        const plotState = imPlotBegin(c); {
            const { ctx, width, height } = plotState;

            if (ctx) {
                const viewChanged = imMemo(c, s.viewVersion);
                if (plotState.isNewFrame || viewChanged) {
                    ctx.clearRect(0, 0, width, height);

                    ctx.strokeStyle = colour;
                    ctx.lineWidth = 3;
                    drawSamples(
                        samples,
                        min, max,
                        plotState,
                        ctx,
                        s.range.idx,
                        s.range.len
                    );
                }
            }
        } imPlotEnd(c);
    } imLayoutEnd(c);

    const dragged = imSampleRangeSlider(c, s.range, samples.length, "Samples: ");

    return dragged;
}

function imSampleRangeSlider(c: ImCache, range: SampleRange, samplesLen: number, label: string): boolean {
    let dragged = false;

    imLayoutBegin(c, ROW); imAlign(c); {
        imLayoutBegin(c, BLOCK); imSize(c, 150, PX, 0, NA); {
            imStr(c, label);
        } imLayoutEnd(c);
        imLayoutBegin(c, COL); imFlex(c); {
            const [start, end, draggingStart, draggingEnd] = imRangeSlider(
                c,
                0, samplesLen,
                range.idx, range.idx + range.len, 1,
                100,
            ).value;

            range.idx = start;
            range.len = end - start;
            dragged = draggingStart || draggingEnd;
        } imLayoutEnd(c);
    } imLayoutEnd(c);

    return dragged;
}

function imRegisterHighlightBg(
    c: ImCache,
    editor: EffectRackEditorState,
    regIdx: RegisterIdx | undefined,
    regOutId: RegisterOutputId | undefined,
) {
    const hv = editor.highlightedValueRef;
    const isHighlighted =
        (hv.regIdx !== undefined && hv.regIdx === regIdx) ||
        (hv.regOutputId !== undefined && hv.regOutputId === regOutId);

    imBg(c, isHighlighted ? cssVarsApp.codeHighlight : "");

    if (elHasMouseOver(c)) {
        editor.highlightedValueRefNext.regOutputId = regOutId;
        editor.highlightedValueRefNext.regIdx = regIdx;
    }
}

function imInsertButton(c: ImCache, editor: EffectRackEditorState, insertIdx: number) {
    const rack = editor.effectRack;

    let toAdd: EffectRackItem | undefined;

    const contextMenu = imContextMenu(c);
    if (imIf(c) && contextMenu.open) {
        imContextMenuBegin(c, contextMenu); {
            const effect = arrayAt(rack.effects, insertIdx);
            if (imIf(c) && !!effect) {
                imEditorContextMenuItemBegin(c); {
                    imStr(c, "Duplicate");
                    if (elHasMousePress(c)) {
                        toAdd = copyEffectRackItem(effect);
                    }
                } imContextMenuItemEnd(c);
            } imIfEnd(c);

            imContextMenuDivider(c);

            imEditorContextMenuItemBegin(c); {
                imStr(c, "+ Oscillator");
                if (elHasMousePress(c)) {
                    toAdd = newEffectRackItem(newEffectRackOscillator());
                }
            } imContextMenuItemEnd(c);

            imEditorContextMenuItemBegin(c); {
                imStr(c, "+ Wave-Table");
                if (elHasMousePress(c)) {
                    toAdd = newEffectRackItem(newEffectRackWaveTable());
                }
            } imContextMenuItemEnd(c);

            imEditorContextMenuItemBegin(c); {
                imStr(c, "+ Envelope");
                if (elHasMousePress(c)) {
                    toAdd = newEffectRackItem(newEffectRackEnvelope());
                }
            } imContextMenuItemEnd(c);

            imEditorContextMenuItemBegin(c); {
                imStr(c, "+ Noise");
                if (elHasMousePress(c)) {
                    toAdd = newEffectRackItem(newEffectRackNoise());
                }
            } imContextMenuItemEnd(c);

            imContextMenuDivider(c);

            imEditorContextMenuItemBegin(c); {
                imStr(c, "+ Biquad Filter - Manual");
                if (elHasMousePress(c)) {
                    toAdd = newEffectRackItem(newEffectRackBiquadFilter());
                }
            } imContextMenuItemEnd(c);

            imEditorContextMenuItemBegin(c); {
                imStr(c, "+ Biquad Filter - Parameterized");
                if (elHasMousePress(c)) {
                    toAdd = newEffectRackItem(newEffectRackBiquadFilter2());
                }
            } imContextMenuItemEnd(c);

            imEditorContextMenuItemBegin(c); {
                imStr(c, "+ Sinc wall filter");
                if (elHasMousePress(c)) {
                    toAdd = newEffectRackItem(newEffectRackConvolutionFilter());
                }
            } imContextMenuItemEnd(c);

            imContextMenuDivider(c);

            imEditorContextMenuItemBegin(c); {
                imStr(c, "+ Maths");
                if (elHasMousePress(c)) {
                    toAdd = newEffectRackItem(newEffectRackMaths());
                }
            } imContextMenuItemEnd(c);

            imEditorContextMenuItemBegin(c); {
                imStr(c, "+ Switch");
                if (elHasMousePress(c)) {
                    toAdd = newEffectRackItem(newEffectRackSwitch());
                }
            } imContextMenuItemEnd(c);

            imEditorContextMenuItemBegin(c); {
                imStr(c, "+ Delay");
                if (elHasMousePress(c)) {
                    toAdd = newEffectRackItem(newEffectRackDelay());
                }
            } imContextMenuItemEnd(c);

            imEditorContextMenuItemBegin(c); {
                imStr(c, "+ Reverb");
                if (elHasMousePress(c)) {
                    toAdd = newEffectRackItem(newEffectRackReverbBadImpl());
                }
            } imContextMenuItemEnd(c);
        } imContextMenuEnd(c, contextMenu);
    } imIfEnd(c);

    if (toAdd) {
        editor.deferredAction = () => {
            rack.effects.splice(insertIdx + 1, 0, toAdd);
            onEdited(editor);
        }
    }

    if (imButtonIsClicked(c, "+")) {
        openContextMenuAtMouse(c, contextMenu);
    }
}

// TODO: consolidate with imOscilloscope.
// Got like this because the 'sound lab' and 'effect rack editor' were two separate widgets for a while, 
// then I decided they shouldn't be. but I can;t be bothered consolidating these two yet.
function imOscilloscope2(c: ImCache, state: DspMockHarnessState) {
    const visibleStartChanged = imMemo(c, state.allSamplesVisibleStart);
    const visibleEndChanged = imMemo(c, state.allSamplesVisibleEnd);
    const numFrequencies = Math.min(state.allSamplesWindowLength, MAX_NUM_FREQUENCIES);
    // NOTE: fft results are mirrored. Something to do with 'conjugate symmetry', whatever that is. 
    // basically, we can ignore the second half. 
    const numFrequenciesToView = Math.floor(numFrequencies / 2);
    // compute frequencies of what we're looking at
    if (visibleStartChanged || visibleEndChanged) {
        resizeNumberArrayPowerOf2(state.signalFftWindow, numFrequencies);
        copyArray(state.signalFftWindow, state.allSamples, state.allSamplesStartIdx, state.signalFftWindow.length);
        fft(state.frequenciesReal, state.frequenciesIm, state.signalFftWindow);
        fftToReal(state.frequencies, state.frequenciesReal, state.frequenciesIm);
    }

    imLayoutBegin(c, COL); imFlex(c); {
        imLayoutBegin(c, COL); imFlex(c); {
            imLayoutBegin(c, BLOCK); {
                imStr(c, "Frequencies (hz) (?)");
                imStr(c, " -> ");
                imStr(c, state.frequenciesReal.length);
                imStr(c, "hz (?)");
            } imLayoutEnd(c);

            const plotState = imPlotBegin(c); {
                const { ctx, width, height } = plotState;

                if (ctx && plotState.isNewFrame) {
                    ctx.clearRect(0, 0, width, height);

                    ctx.strokeStyle = "red";
                    ctx.lineWidth = 2;
                    const min = arrayMin(state.frequencies);;
                    const max = arrayMax(state.frequencies);
                    drawSamples(state.frequencies, min, max, plotState, ctx, state.frequenciesStartIdx, state.frequenciesLength);
                }

            } imPlotEnd(c);

            const [start, end, draggingStart, draggingEnd] = imRangeSlider(
                c,
                0, numFrequenciesToView,
                state.frequenciesStartIdx, state.frequenciesStartIdx + state.frequenciesLength,
                1, 100
            ).value;

            state.frequenciesStartIdx = start;
            if (draggingStart || draggingEnd) {
                state.frequenciesLength = end - start;
            }
        } imLayoutEnd(c);
        imLayoutBegin(c, COL); imFlex(c); {
            imLayoutBegin(c, ROW); imAlign(c); {
                imStr(c, "Waveform ");

                imStr(c, " t=");
                imStr(c, (state.allSamplesStartIdx / state.dsp.sampleRate).toPrecision(3));
                imStr(c, " sample ");
                imStr(c, state.allSamplesStartIdx);
                imStr(c, " -> ");
                imStr(c, state.allSamplesStartIdx + state.allSamplesWindowLength);
            } imLayoutEnd(c);

            const plotState = imPlotBegin(c); {
                const { ctx, width, height, isNewFrame } = plotState;
                if (ctx && isNewFrame) {
                    ctx.clearRect(0, 0, width, height);

                    const samples = state.allSamples;

                    const theme = getCurrentTheme();
                    ctx.strokeStyle = theme.fg.toString();
                    ctx.lineWidth = 3;
                    drawSamples(samples, -1, 1, plotState, ctx, state.allSamplesStartIdx, state.allSamplesWindowLength);
                }
            } imPlotEnd(c);

            if (state.autoPan) {
                state.allSamplesStartIdx = state.allSamplesLen - 1 - state.allSamplesWindowLength
            }

            let [start, end, draggingStart, draggingEnd] = imRangeSlider(
                c,
                0, state.allSamplesLen,
                state.allSamplesStartIdx, state.allSamplesStartIdx + state.allSamplesWindowLength, 1,
                500,
            ).value;

            state.allSamplesStartIdx = start;
            state.allSamplesVisibleStart = start;
            state.allSamplesVisibleEnd = end;
            if (draggingStart || draggingEnd) {
                state.allSamplesWindowLength = end - start;

                if (draggingEnd) {
                    state.autoPan = false;
                }
            }


        } imLayoutEnd(c);
    } imLayoutEnd(c);
}

