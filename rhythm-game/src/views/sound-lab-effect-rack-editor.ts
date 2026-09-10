import {
    imContextMenu,
    imContextMenuBegin,
    imContextMenuDivider,
    imContextMenuEnd,
    imContextMenuItemBegin,
    imContextMenuItemEnd,
    openContextMenuAtMouse
} from "app-components/context-menu";
import { imVerticalText } from "app-components/misc";
import { imTextInputOneLine } from "app-components/text-input-one-line";
import { imButtonBegin, imButtonEnd, imButtonIsClicked } from "components/button";
import { imCheckbox } from "components/checkbox";
import { BLOCK, COL, CssColor, cssVars, DisplayType, EM, imui, INLINE_BLOCK, NA, PERCENT, PX, ROW, ROW_REVERSE, SPACE_EVENLY, STRETCH } from "imcf/im-ui";

import { DragAndDropState, imDragAndDrop, imDragHandle, imDragZoneBegin, imDragZoneEnd, imDropZoneForPrototyping } from "components/drag-and-drop";
import { imLine, LINE_HORIZONTAL, LINE_VERTICAL } from "components/im-line";
import { imRangeSlider } from "components/range-slider";
import { imScrollContainerBegin, imScrollContainerEnd, newScrollContainer } from "components/scroll-container";
import { DspLoopMessage, dspProcess, dspReceiveMessage, DspState, newDspState } from "dsp/dsp-loop";
import { applyPlaySettingsDefaults, getCurrentPlaySettings, getDspInfo, newKeyboardConfigOnePreset, pressKey, updatePlaySettings } from "dsp/dsp-loop-interface";
import { createEffectRackPreset, DEFAULT_GROUP_NAME, deleteEffectRackPreset, updateEffectRackPreset } from "state/data-repository";
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
} from "state/effect-rack";
import { EffectRackPreset, effectRackToPreset, getDefaultSineWaveEffectRack, presetToEffectRack } from "state/keyboard-config";
import { getKeyForKeyboardKey } from "state/keyboard-state";
import { arrayAt, arrayMove, copyArray, filterInPlace, removeItem } from "utils/array-utils";
import { assert, unreachable } from "utils/assert";

import { fft, fftToReal, resizeNumberArrayPowerOf2 } from "utils/fft";
import { el, elsvg, im, ImCache, imdom } from "imcf";

import { arrayMax, arrayMin } from "utils/math-utils";
import { getNoteFrequency, getNoteIndex } from "utils/music-theory-utils";
import { canRedo, canUndo, JSONUndoBuffer, newJSONUndoBuffer, redo, stepUndoBufferTimer, undo, undoBufferIsEmpty, writeToUndoBuffer, writeToUndoBufferDebounced } from "utils/undo-buffer-json";
import { GlobalContext } from "./app";
import { imExportModal, imImportModal } from "./import-export-modals";
import { drawSamples, imPlotBegin, imPlotEnd } from "./plotting";
import { SoundLabState } from "./sound-lab";
import { DRAG_TYPE_CIRCULAR, imParameterSliderInteraction } from "./sound-lab-drag-slider";
import { imEffectRackList, newPresetsListState, selectEffectRackPreset, startRenamingPreset } from "./sound-lab-effect-rack-list";
import { imKeyboardConfigEditorKeyboard, KeyboardConfigEditorState } from "./sound-lab-keyboard-editor";
import { SvgContext } from "components/svg-context";
import { cssVarsApp } from "./styling";
import { CANCELLED, DONE } from "utils/async-utils";

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
        rightPanel: {
            presets: boolean;
        }
    };

    version: number;

    highlightedValueRef: ValueRef;
    highlightedValueRefNext: ValueRef;

    svgCtx: SvgContext | null;

    deferredAction: (() => void) | null;
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

export function newEffectRackEditorState(effectRackPreset: EffectRackPreset): EffectRackEditorState {
    const state: EffectRackEditorState = {
        effectRack: presetToEffectRack(effectRackPreset),
        undoBuffer: newJSONUndoBuffer<EffectRack>(
            newEffectRack(),
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

            rightPanel: {
                presets: false,
            }
        },

        version: 0,

        highlightedValueRef: {},
        highlightedValueRefNext: {},

        deferredAction: null,

        svgCtx: null,
    };

    return state;
}

function onEdited(editor: EffectRackEditorState, wasUndoTraversed = false, editUndoActionId?: number) {
    editor.version++;

    compileEffectRack(editor.effectRack);

    if (editUndoActionId !== undefined) {
        // We actually want to write to the undo buffer immediately
        writeToUndoBuffer(editor.undoBuffer, editor.effectRack);
        editUndoActionId = undefined;
    } else {
        if (!wasUndoTraversed) {
            writeToUndoBufferDebounced(editor.undoBuffer, editor.effectRack, UNDO_DEBOUNCE_SECONDS);
        }
    }
}

export function imHeading(c: ImCache, text: string) {
    imHeadingBegin(c); imdom.Str(c, text); imHeadingEnd(c);
}

export function imHeadingBegin(c: ImCache) {
    imui.Begin(c, ROW); imui.Justify(c); imdom.ElBegin(c, el.B); {
    } // imdom.ElEnd(c, el.B); imui.End(c);
}

export function imHeadingEnd(c: ImCache) {
    // imui.Begin(c, ROW); imui.Justify(c); imdom.ElBegin(c, el.B); 
    {
    } imdom.ElEnd(c, el.B); imui.End(c);
}


const cssb = imui.newCssBuilder();
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

const dragColour = imui.newColor(0, 0, 0, 1);



        // // TODO: can make it more performant by updating just the specific register being edited
        // // rather than the entire effect rack if we're editing a value in realtime
        //
        // settings.parameters.rack = rack;
        // updatePlaySettings();

type EffectRackEditorEvent = null | {
    updatedPreset?: EffectRackPreset;
}

export function imEffectRackEditor(
    c: ImCache,
    ctx: GlobalContext,
    lab: SoundLabState,
    editor: EffectRackEditorState,
    keyboardEditor: KeyboardConfigEditorState,
): EffectRackEditorEvent {
    let result: EffectRackEditorEvent = null;

    const rack = editor.effectRack;

    const versionChanged = im.Memo(c, editor.version);
    if (versionChanged) {
        // Needs to be every frame, so we can edit while playing
        const settings = getCurrentPlaySettings();
        const preset = effectRackToPreset(editor.effectRack);
        settings.parameters.keyboardConfig = newKeyboardConfigOnePreset(preset);
        updatePlaySettings();
        result = { updatedPreset: preset };
    }

    if (im.Memo(c, true)) {
        if (undoBufferIsEmpty(editor.undoBuffer)) {
            writeToUndoBuffer(editor.undoBuffer, editor.effectRack);
        }
    }

    const wires = editor.ui.wires; {
        const mouse = imdom.getMouse();
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
                        colour: imui.newColor(0, 0, 0, 1),
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
                outputUi.colour = imui.newColorFromHsv((i / editor.effectRack.effects.length) % 1, 1, 0.5)
                i += 1;
            }
        }
    }

    editor.highlightedValueRef.regIdx = editor.highlightedValueRefNext.regIdx;
    editor.highlightedValueRef.regOutputId = editor.highlightedValueRefNext.regOutputId;
    editor.highlightedValueRefNext.regIdx = undefined;
    editor.highlightedValueRefNext.regOutputId = undefined;

    stepUndoBufferTimer(editor.undoBuffer, ctx.deltaTime);

    // Recompute oscilloscope as neeed, just once instead of per oscilloscope.
    // Wanted to have one oscilloscpe per UI but prob not worth it I reckon.
    {
        const s = editor.signalPreview;

        const noteChanged = im.Memo(c, s.noteIdx);
        const pressedChanged = im.Memo(c, s.signalPressRange.idx);
        const releasedChanged = im.Memo(c, s.signalPressRange.len);
        const editorChanged = im.Memo(c, editor.version);

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

            const fps = im.getFpsCounterState(c);
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
        const sampleRateChanged = im.Memo(c, sampleRate);
        const infoCurrentlyPlaying = info.currentlyPlaying.length > 0;
        const infoCurrentlyPlayingChanged = im.Memo(c, infoCurrentlyPlaying);

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

                const dt = im.getDeltaTimeSeconds(c);

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

    if (im.If(c) && editor.ui.modal === MODAL_EXPORT) {
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
    } else if (im.IfElse(c) && editor.ui.modal === MODAL_IMPORT) {
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

    } im.IfEnd(c);

    const svgCtx = editor.svgCtx;
    assert(!!svgCtx);

    imui.Begin(c, ROW); imui.Flex(c); {
        imui.Begin(c, COL); imui.Flex(c, 4); {
            imui.Begin(c, COL); imui.Flex(c); {
                if (im.IsFirstRender(c)) imdom.setStyle(c, "fontSize", "20px");
                if (im.IsFirstRender(c)) imdom.setClass(c, cnEffectRackEditor);

                imui.Begin(c, COL); imui.Flex(c); {
                    imui.Begin(c, ROW); imui.Align(c); {
                        imui.Begin(c, ROW); imui.Gap(c, 10, PX); {
                            if (imButtonIsClicked(c, "Import")) {
                                editor.ui.modal = MODAL_IMPORT;
                            }

                            if (imButtonIsClicked(c, "Export")) {
                                editor.ui.modal = MODAL_EXPORT;
                            }

                            if (imButtonIsClicked(c, "Reset to default rack")) {
                                editor.deferredAction = () => {
                                    const playSettings = getCurrentPlaySettings();

                                    applyPlaySettingsDefaults(playSettings);
                                    updatePlaySettings();

                                    editor.effectRack = getDefaultSineWaveEffectRack();

                                    onEdited(editor);
                                }
                            }
                        } imui.End(c);

                        imui.Flex1(c);

                        imHeadingBegin(c); {
                            if (im.If(c) && lab.keyboardConfig) {
                                imdom.Str(c, lab.keyboardConfig.name);
                                imdom.Str(c, " -> ");
                            } im.IfEnd(c);
                            imdom.Str(c, " Slot ");
                            imdom.Str(c, lab.editingSlotIdx);

                            imui.Begin(c, INLINE_BLOCK); {
                                const ev = imTextInputOneLine(c, rack.name, undefined, false);
                                if (ev) {
                                    if (ev.newName !== undefined) {
                                        rack.name = ev.newName;
                                        onEdited(editor);
                                    }
                                }
                            } imui.End(c);
                        } imHeadingEnd(c);

                        imui.Flex1(c);

                        imui.Begin(c, ROW); imui.Gap(c, 10, PX); {
                            if (imButtonIsClicked(c, "Undo", false, canUndo(editor.undoBuffer))) {
                                editor.deferredAction = () => editorUndo(editor);
                            }

                            if (imButtonIsClicked(c, "Redo", false, canRedo(editor.undoBuffer))) {
                                editor.deferredAction = () => editorRedo(editor);
                            }

                            if (imButtonIsClicked(c, "Back")) {
                                lab.editingSlotIdx = -1;
                            }
                        } imui.End(c);
                    } imui.End(c);

                    imui.Begin(c, COL); imui.Flex(c); {
                        const sc = im.State(c, newScrollContainer);
                        imScrollContainerBegin(c, sc); {

                            // The wire we are currently dragging
                            if (im.If(c) && wires.drag.registerOutputId !== undefined || wires.drag.registerInput !== undefined) {
                                imdom.RootExistingBegin(c, svgCtx.root); {
                                    const mouse = imdom.getMouse();
                                    let srcX = mouse.x, srcY = mouse.y;
                                    let dstX = mouse.x, dstY = mouse.y;

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
                                } imdom.RootExistingEnd(c, svgCtx.root);
                            } im.IfEnd(c);

                            const effectsDnd = imDragAndDrop(c);
                            if (effectsDnd.moved) {
                                const { a, b } = effectsDnd.moved;
                                arrayMove(editor.effectRack.effects, a, b);
                                onEdited(editor);
                            }

                            im.For(c); for (let effectPos = 0; effectPos < rack.effects.length; effectPos++) {
                                const effect = rack.effects[effectPos];

                                im.KeyedBegin(c, effect); {
                                    imEffectRackEditorEffect(c, editor, effectPos, effectsDnd);
                                } im.KeyedEnd(c);
                            } im.ForEnd(c);

                            imui.Begin(c, ROW); imui.Justify(c); {
                                imDropZoneForPrototyping(c, effectsDnd, rack.effects.length);
                                imInsertButton(c, editor, rack.effects.length - 1);
                            } imui.End(c);

                        } imScrollContainerEnd(c);
                    } imui.End(c);
                } imui.End(c);

                imui.Begin(c, ROW); {
                    const s = editor.compileStats;
                    const samplesPerMs = s.numSamples / s.computeSamplesTime;
                    imui.Begin(c, ROW); imui.Align(c); imui.Flex(c); {
                        if (im.If(c) && s.completed) {
                            imdom.Str(c, "Compiled in ");
                            imdom.Str(c, s.compileTime.toFixed(3))
                            imdom.Str(c, "ms, ");
                            imdom.Str(c, "Ran in ");
                            imdom.Str(c, samplesPerMs.toFixed(3))
                            imdom.Str(c, s.numSamples); imdom.Str(c, " computed over "); imdom.Str(c, s.framesRequired);
                            imdom.Str(c, " frames. Expect glitching if over "); imdom.Str(c, s.maxFramesRequired);
                            // want to compute ~ 0.1 seconds ahead of time
                            // const wantedSamplesPerMs = (dspInfo.sampleRate / 10);
                            // imdom.Str(c, " (budget = " + wantedSamplesPerMs.toFixed(3) + ")");
                        } else {
                            im.IfElse(c);
                            imdom.Str(c, "...");
                        } im.IfEnd(c);
                    } imui.End(c);

                    imui.Begin(c, COL); {
                        if (im.IsFirstRender(c)) imdom.setStyle(c, "borderTop", "1px solid " + cssVars.fg);
                        if (im.IsFirstRender(c)) imdom.setStyle(c, "borderLeft", "1px solid " + cssVars.fg);
                        if (im.IsFirstRender(c)) imdom.setStyle(c, "borderTopLeftRadius", "5px");
                        if (im.IsFirstRender(c)) imdom.setStyle(c, "padding", "5px");
                        imValueOrBindingEditor(c, editor, rack.effects.length, rack.output);
                    } imui.End(c);
                } imui.End(c);
            } imui.End(c);
        } imui.End(c);

        imLine(c, LINE_VERTICAL);

        imui.Begin(c, COL); imui.Flex(c, 2); {
            imEffectRackRightPanel(c, ctx, editor, keyboardEditor, lab);
        } imui.End(c);
    } imui.End(c);

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

    return result;
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
    imui.Begin(c, COL); imui.Flex(c); {
        const s = editor.signalPreview;
        imOscilloscope(c, s.oscilloscope, s.samples);
        imSampleRangeSlider(c, s.signalPressRange, s.samples.length, "Signal: ");
    } imui.End(c);
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
        imui.Begin(c, COL); imui.Flex(c); {
            imui.Begin(c, ROW); imui.Align(c);
            imui.Padding(c, 5, PX, 5, PX, 0, PX, 5, PX); imui.Gap(c, 5, PX); {
                imDropZoneForPrototyping(c, effectsDnd, effectPos);

                imVerticalText(c); imui.Align(c); imui.Gap(c, 10, PX); {
                    imui.Begin(c, ROW); {
                        imDragHandle(c, effectsDnd, effectPos);

                        imdom.StrFmt(c, effect.value.type, getEffectTypeShortName);
                    } imui.End(c);
                } imui.End(c);

                imLine(c, LINE_VERTICAL, 5);

                // imLine(c, LINE_VERTICAL, 5);

                imDspVisualGroupBegin(c, ROW); imui.Flex(c); imui.FlexWrap(c); imui.Justify(c); {
                    imui.Begin(c, ROW); imui.Flex(c); imui.Gap(c, 10, PX);  {
                        const effectValue = effect.value;
                        im.Switch(c, effectValue.type); switch (effectValue.type) {
                            case EFFECT_RACK_ITEM__OSCILLATOR: {
                                const osc = effectValue;

                                imValueOrBindingEditor(c, editor, effectPos, osc.amplitudeUI);

                                imDspVisualGroupBegin(c, COL); imui.Flex(c); {
                                    imui.Begin(c, ROW); imui.Gap(c, 20, PX); imui.Align(c); {
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

                                        imdom.Str(c, "+");

                                        imValueOrBindingEditor(c, editor, effectPos, osc.offsetUI);
                                    } imui.End(c);

                                    imDspVisualGroupBegin(c, ROW); imui.Gap(c, 20, PX); imui.Align(c);  {
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

                                imDspVisualGroupBegin(c, ROW); imui.Flex(c); imui.Justify(c, SPACE_EVENLY); {
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

                                imui.Begin(c, COL); imui.Align(c); imui.Flex(c); {
                                    // dont want the contents to be aligned, but I do want this thing's
                                    // final size to be aligned. like
                                    // [   |[           ]   |   ]
                                    // [   |[         ]     |   ]
                                    // [   |[              ]|   ]
                                    
                                    imui.Begin(c, COL); imui.Gap(c, 10, PX); {
                                        im.For(c); for (let termIdx = 0; termIdx < math.terms.length; termIdx++) {
                                            const term = math.terms[termIdx];

                                            imui.Begin(c, ROW); imui.Align(c); imui.Gap(c, 10, PX); {
                                                imDspVisualGroupBegin(c, ROW); imui.Align(c); imui.Gap(c, 10, PX); {

                                                    imui.Begin(c, ROW); imui.Align(c); imui.Gap(c, 10, PX); {
                                                        imMathsCoefficientsList(c, editor, effectPos, math, termIdx, term.coefficients, true);

                                                        if (im.If(c) && term.coefficientsDivide.length === 0) {
                                                            if (imButtonIsClicked(c, "/")) {
                                                                const co = newEffectRackMathsItemCoefficient();
                                                                term.coefficientsDivide.push(co);
                                                                onEdited(editor);
                                                            }
                                                        } im.IfEnd(c);

                                                        if (im.If(c) && term.coefficientsDivide.length > 0) {
                                                            imdom.Str(c, " / ");

                                                            imMathsCoefficientsList(c, editor, effectPos, math, termIdx, term.coefficientsDivide, false);
                                                        } im.IfEnd(c);

                                                        imDspVisualGroupBegin(c, COL); {
                                                            term.termOut._name = "";
                                                            imRegisterOutput(c, editor, effectPos, term.termOut);
                                                        } imDspVisualGroupEnd(c);
                                                    } imui.End(c);

                                                } imDspVisualGroupEnd(c);

                                                if (im.If(c) && termIdx < math.terms.length - 1) {
                                                    imdom.Str(c, " + ");
                                                } im.IfEnd(c);
                                            } imui.End(c);
                                        } im.ForEnd(c);

                                        if (imButtonIsClicked(c, "+")) {
                                            const term = newEffectRackMathsItemTerm();
                                            math.terms.push(term);
                                            onEdited(editor);
                                        }
                                    } imui.End(c);
                                } imui.End(c);

                                imDspVisualGroupBegin(c, COL); {
                                    imRegisterOutput(c, editor, effectPos, math.sumOut);
                                } imDspVisualGroupEnd(c);
                            } break;
                            case EFFECT_RACK_ITEM__SWITCH: {
                                const switchEffect = effectValue;

                                imui.Flex1(c);

                                imui.Begin(c, COL); {
                                    im.For(c); for (let i = 0; i < switchEffect.conditions.length; i++) {
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
                                    } im.ForEnd(c);

                                    if (imButtonIsClicked(c, "+")) {
                                        const condition = newEffectRackSwitchCondition();
                                        switchEffect.conditions.push(condition);
                                        onEdited(editor);
                                    }

                                    imDspVisualGroupBegin(c, BLOCK); {
                                        imValueOrBindingEditor(c, editor, effectPos, switchEffect.defaultUi);
                                    } imDspVisualGroupEnd(c);
                                } imui.End(c);

                                imDspVisualGroupBegin(c, COL); {
                                    imRegisterOutput(c, editor, effectPos, switchEffect.valueOut);
                                } imDspVisualGroupEnd(c);
                            } break;
                            case EFFECT_RACK_ITEM__NOISE: {
                                const noise = effectValue;

                                imDspVisualGroupBegin(c, ROW); imui.Flex(c); imui.Justify(c, SPACE_EVENLY); {
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

                                imui.Begin(c, BLOCK); {
                                    imDspVisualGroupBegin(c, ROW); {
                                        imValueOrBindingEditor(c, editor, effectPos, delay.signalUi);

                                        imSpacingSymbol(c, " -> ");

                                        imValueOrBindingEditor(c, editor, effectPos, delay.secondsUi);

                                        imSpacingSymbol(c, " -> ");

                                        imDspVisualGroupBegin(c, ROW); imui.Justify(c, SPACE_EVENLY); {
                                            imValueOrBindingEditor(c, editor, effectPos, delay.originalUi);

                                            imValueOrBindingEditor(c, editor, effectPos, delay.delayedUi);

                                            imSpacingSymbol(c, " -> ");
                                        } imDspVisualGroupEnd(c);
                                    } imDspVisualGroupEnd(c);
                                    imui.Begin(c, BLOCK); {
                                        imdom.Str(c, "Due to the high memory usage of this effect, the max delay has been artifically limited to 1 second");
                                    } imui.End(c);
                                } imui.End(c);

                                imDspVisualGroupBegin(c, COL); {
                                    imRegisterOutput(c, editor, effectPos, delay.delayedOut);
                                } imDspVisualGroupEnd(c);
                            } break;
                            case EFFECT_RACK_ITEM__BIQUAD_FILTER: {
                                const filter = effectValue;

                                const filterUi = im.GetInline(c, imEffectRackEditor) ?? im.Set(c, {
                                    analyzing: false,
                                    compact: false,
                                });
                                if (im.Memo(c, effect)) filterUi.compact = true;

                                imui.Begin(c, COL); imui.Flex(c); {
                                    imui.Begin(c, ROW); {

                                        imui.Begin(c, filterUi.compact ? ROW : COL); imui.Justify(c); imui.Gap(c, 20, PX); {

                                            imValueOrBindingEditor(c, editor, effectPos, filter.signalUi);

                                            if (imButtonIsClicked(c, filterUi.analyzing ? "Analyzing" : "Analyze", filterUi.analyzing)) {
                                                filterUi.analyzing = !filterUi.analyzing;
                                            }
                                            if (imButtonIsClicked(c, "Compact", filterUi.compact)) {
                                                filterUi.compact = !filterUi.compact;
                                            }

                                        } imui.End(c);

                                        imSpacingSymbol(c, " -> ");

                                        imDspVisualGroupBegin(c, ROW); imui.Flex(c); {
                                            if (im.If(c) && filterUi.compact) {
                                                imui.Begin(c, ROW); imui.Align(c); imui.Justify(c); imui.Flex(c); {
                                                    imValueOrBindingEditor(c, editor, effectPos, filter.a1Ui);
                                                    imValueOrBindingEditor(c, editor, effectPos, filter.a2Ui);
                                                } imui.End(c);
                                                imui.Begin(c, ROW); imui.Align(c); imui.Justify(c); imui.Flex(c); {
                                                    imValueOrBindingEditor(c, editor, effectPos, filter.b0Ui);
                                                    imValueOrBindingEditor(c, editor, effectPos, filter.b1Ui);
                                                    imValueOrBindingEditor(c, editor, effectPos, filter.b2Ui);
                                                } imui.End(c);
                                            } else {
                                                im.IfElse(c);

                                                imui.Begin(c, COL); imui.Flex(c); {
                                                    function imCellBegin(c: ImCache, height: number = 2) {
                                                        imui.Begin(c, ROW); imui.Size(c, 20, PERCENT, height, EM); imui.Align(c); imui.Justify(c); imui.Relative(c); {
                                                        } // imui.End
                                                    }

                                                    function imCellEnd(c: ImCache) {
                                                        // imui.Begin
                                                        imui.End(c);
                                                    }

                                                    // there was an attempt. xd
                                                    imui.Begin(c, COL); imui.Flex(c); imui.Align(c, STRETCH); {
                                                        imui.Begin(c, ROW); imui.Justify(c); {
                                                            imCellBegin(c); {
                                                                imSpacingSymbol(c, " -> ");
                                                            } imCellEnd(c);
                                                            imCellBegin(c); {
                                                                imSpacingSymbol(c, " -> ");
                                                            } imCellEnd(c);
                                                            imCellBegin(c); {
                                                                imValueOrBindingEditor(c, editor, effectPos, filter.b0Ui);
                                                            } imCellEnd(c);
                                                        } imui.End(c);
                                                        imui.Begin(c, ROW); imui.Justify(c); {
                                                            imCellBegin(c, 1.2); {
                                                                imLine(c, LINE_VERTICAL);
                                                            } imCellEnd(c);
                                                            imCellBegin(c); {
                                                            } imCellEnd(c);
                                                            imCellBegin(c, 1.2); {
                                                                imLine(c, LINE_VERTICAL);
                                                            } imCellEnd(c);
                                                        } imui.End(c);
                                                        imui.Begin(c, ROW); imui.Justify(c); {
                                                            imCellBegin(c); {
                                                                imValueOrBindingEditor(c, editor, effectPos, filter.a1Ui);
                                                            } imCellEnd(c);
                                                            imCellBegin(c); {
                                                                imSpacingSymbol(c, " <-> ");
                                                            } imCellEnd(c);
                                                            imCellBegin(c); {
                                                                imValueOrBindingEditor(c, editor, effectPos, filter.b1Ui);
                                                            } imCellEnd(c);
                                                        } imui.End(c);
                                                        imui.Begin(c, ROW); imui.Justify(c); {
                                                            imCellBegin(c, 1.2); {
                                                                imLine(c, LINE_VERTICAL);
                                                            } imCellEnd(c);
                                                            imCellBegin(c); {
                                                            } imCellEnd(c);
                                                            imCellBegin(c, 1.2); {
                                                                imLine(c, LINE_VERTICAL);
                                                            } imCellEnd(c);
                                                        } imui.End(c);
                                                        imui.Begin(c, ROW); imui.Justify(c); {
                                                            imCellBegin(c); {
                                                                imValueOrBindingEditor(c, editor, effectPos, filter.a2Ui);
                                                            } imCellEnd(c);
                                                            imCellBegin(c); {
                                                                imSpacingSymbol(c, " <-> ");
                                                            } imCellEnd(c);
                                                            imCellBegin(c); {
                                                                imValueOrBindingEditor(c, editor, effectPos, filter.b2Ui);
                                                            } imCellEnd(c);
                                                        } imui.End(c);
                                                    } imui.End(c);
                                                } imui.End(c);
                                            } im.IfEnd(c);

                                        } imDspVisualGroupEnd(c);
                                    } imui.End(c);

                                    if (im.If(c) && filterUi.analyzing) {
                                        let hasAllManualInputs =
                                            filter.a1Ui.valueRef.value !== undefined &&
                                            filter.a2Ui.valueRef.value !== undefined &&
                                            filter.b0Ui.valueRef.value !== undefined &&
                                            filter.b1Ui.valueRef.value !== undefined &&
                                            filter.b2Ui.valueRef.value !== undefined;

                                        imFilterAnalyzer(c, editor, hasAllManualInputs, effect);
                                    } im.IfEnd(c);
                                } imui.End(c);

                                imDspVisualGroupBegin(c, COL); {
                                    imRegisterOutput(c, editor, effectPos, filter.filterOut);
                                } imDspVisualGroupEnd(c);
                            } break;
                            case EFFECT_RACK_ITEM__SINC_FILTER: {
                                const conv = effectValue;

                                const filterUi = im.GetInline(c, imEffectRackEditor) ?? im.Set(c, {
                                    analyzing: false,
                                });

                                imui.Begin(c, COL); imui.Flex(c); {
                                    imui.Begin(c, ROW); imui.Align(c); {
                                        imui.Begin(c, COL); imui.Justify(c); imui.Gap(c, 20, PX); {
                                            imValueOrBindingEditor(c, editor, effectPos, conv.signalUi);

                                            if (imButtonIsClicked(c, filterUi.analyzing ? "Analyzing" : "Analyze", filterUi.analyzing)) {
                                                filterUi.analyzing = !filterUi.analyzing;
                                            }
                                        } imui.End(c);

                                        imSpacingSymbol(c, " -> ");

                                        imDspVisualGroupBegin(c, ROW); imui.Flex(c); {
                                            imui.Begin(c, ROW); imui.Align(c); imui.Justify(c); imui.Flex(c); imui.Gap(c, 10, PX); {

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

                                                imui.Begin(c, ROW); imui.Align(c); imui.Gap(c, 10, PX); {
                                                    const ev = imCheckbox(c, conv.highpass);
                                                    if (ev) {
                                                        conv.highpass = ev.checked
                                                        onEdited(editor);
                                                    }

                                                    imdom.Str(c, "Highpass"); effect
                                                } imui.End(c);
                                            } imui.End(c);
                                        } imDspVisualGroupEnd(c);
                                    } imui.End(c);

                                    const isHighStopband =
                                        conv.stopbandUi.valueRef.value === undefined ||
                                        conv.stopbandUi.valueRef.value > 20;
                                    if (im.If(c) && isHighStopband) {
                                        imui.Begin(c, BLOCK); {
                                            imdom.Str(c, "WARNING: a high stopband will cripple the efficiency of this filter");
                                        } imui.End(c);
                                    } im.IfEnd(c);

                                    if (im.If(c) && filterUi.analyzing) {
                                        let hasAllManualInputs =
                                            conv.cutoffFrequencyMultUi.valueRef.value !== undefined &&
                                            conv.cutoffFrequencyUi.valueRef.value !== undefined &&
                                            conv.stopbandUi.valueRef.value !== undefined;

                                        imFilterAnalyzer(c, editor, hasAllManualInputs, effect);
                                    } im.IfEnd(c);
                                } imui.End(c);

                                imDspVisualGroupBegin(c, COL); {
                                    imRegisterOutput(c, editor,  effectPos, conv.filterOut);
                                } imDspVisualGroupEnd(c);
                            } break;
                            case EFFECT_RACK_ITEM__REVERB_BAD: {
                                const reverb = effectValue;


                                imui.Begin(c, ROW); imui.Align(c); {
                                    imValueOrBindingEditor(c, editor, effectPos, reverb.signalUi);

                                    imSpacingSymbol(c, " -> ", true);

                                    imDspVisualGroupBegin(c, ROW); imui.Flex(c); {
                                        imValueOrBindingEditor(c, editor, effectPos, reverb.densityUi);
                                        imValueOrBindingEditor(c, editor, effectPos, reverb.decayUi);
                                    } imDspVisualGroupEnd(c);

                                    imSpacingSymbol(c, " -> ", true);
                                } imui.End(c);
                            } break;
                            case EFFECT_RACK_ITEM__BIQUAD_FILTER_2: {
                                const filter = effectValue;

                                const filterUi = im.GetInline(c, imEffectRackEditor) ?? im.Set(c, {
                                    analyzing: false,
                                });

                                imui.Begin(c, COL); imui.Flex(c); {
                                    imui.Begin(c, ROW); imui.Align(c); {
                                        imui.Begin(c, COL); imui.Justify(c); imui.Gap(c, 20, PX); {
                                            imValueOrBindingEditor(c, editor, effectPos, filter.signalUi);

                                            if (imButtonIsClicked(c, filterUi.analyzing ? "Analyzing" : "Analyze", filterUi.analyzing)) {
                                                filterUi.analyzing = !filterUi.analyzing;
                                            }
                                        } imui.End(c);

                                        imSpacingSymbol(c, " -> ", true);

                                        imDspVisualGroupBegin(c, ROW); imui.Flex(c); {
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

                                            if (im.If(c) && biquad2IsUsingDbGain(filter)) {
                                                imValueOrBindingEditor(c, editor, effectPos, filter.dbGain);
                                            } im.IfEnd(c);
                                        } imDspVisualGroupEnd(c);

                                        imSpacingSymbol(c, " -> ", true);
                                    } imui.End(c);


                                    if (im.If(c) && filterUi.analyzing) {
                                        let hasAllManualInputs = filter.f0.valueRef.value !== undefined &&
                                            filter.dbGain.valueRef.value !== undefined &&
                                            filter.qOrBWOrS.valueRef.value !== undefined;

                                        imFilterAnalyzer(c, editor, hasAllManualInputs, effect);
                                    } im.IfEnd(c);
                                } imui.End(c);

                                imDspVisualGroupBegin(c, COL); {
                                    imRegisterOutput(c, editor, effectPos, filter.filterOut);
                                } imDspVisualGroupEnd(c);
                            } break;
                            case EFFECT_RACK_ITEM__WAVE_TABLE: {
                                const table = effectValue;
                                let wavePos = table.wavePosUi.valueRef.value;
                                const falloff = table.falloffUi.valueRef.value;

                                imui.Begin(c, COL); imui.Align(c, STRETCH); imui.Gap(c, 10, PX); imui.Flex(c); {
                                    im.For(c); for (let i = 0; i < table.items.length; i++) {
                                        const item = table.items[i];
                                        imDspVisualGroupBegin(c, ROW); imui.Flex(c); imui.Align(c); {
                                            if (im.If(c) && falloff !== undefined && wavePos !== undefined) {
                                                wavePos = wavePos % table.items.length;
                                                if (wavePos < 0) {
                                                    wavePos = table.items.length + wavePos;
                                                }

                                                imui.Begin(c, BLOCK); imui.Size(c, 30, PX, 30, PX); imui.Bg(c, cssVars.fg); {
                                                    let mask = 1 - falloff * Math.abs(i - wavePos);
                                                    if (mask < 0) mask = 0;
                                                    imui.Opacity(c, mask);
                                                } imui.End(c);
                                            } im.IfEnd(c);

                                            imui.Flex1(c);

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
                                    } im.ForEnd(c);

                                    if (imButtonIsClicked(c, "+")) {
                                        editor.deferredAction = () => {
                                            table.items.push(newEffectRackWaveTableItem());
                                            onEdited(editor);
                                        };
                                    }

                                    imDspVisualGroupBegin(c, ROW); imui.Gap(c, 10, PX); {
                                        imValueOrBindingEditor(c, editor, effectPos, table.gainUi);
                                        imValueOrBindingEditor(c, editor, effectPos, table.falloffUi);
                                        imValueOrBindingEditor(c, editor, effectPos, table.wavePosUi);
                                    } imDspVisualGroupEnd(c);
                                } imui.End(c);

                                imDspVisualGroupBegin(c, ROW); {
                                    imRegisterOutput(c, editor, effectPos, table.totalOut);
                                } imDspVisualGroupEnd(c);
                            } break;
                            default: unreachable(effectValue);
                        } im.SwitchEnd(c);
                    } imui.End(c);

                    // Might want to put something else here later ...
                } imDspVisualGroupEnd(c);

                imui.Begin(c, COL); imui.Gap(c, 5, PX); imui.Justify(c); {
                    if (imButtonIsClicked(c, "-")) {
                        editor.deferredAction = () => {
                            effect._toDelete = true;
                            onEdited(editor);
                        }
                    }

                    imInsertButton(c, editor, effectPos);
                } imui.End(c);
            } imui.End(c);
        } imui.End(c);
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

    imui.Begin(c, ROW); imui.Align(c); {
        imSpacingSymbol(c, " -> ");

        elDropWireToEffectOutput(c, editor, output.id);

        imRegisterHighlightBg(c, editor, undefined, output.id);

        imResultName(c, output, effectPos + 1);

        imui.Begin(c, BLOCK); imui.Size(c, 4, PX, 10, NA); imui.End(c);

        const root = imWireDragEndpoint(c, editor, null, output);
        const rect = root.getBoundingClientRect();
        const x = rect.x + rect.width / 2;
        const y = rect.y + rect.height / 2;

        outputUi.x = x;
        outputUi.y = y;
    } imui.End(c);
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
    imDspVisualGroupBegin(c, ROW); imui.Align(c); imui.Gap(c, 10, PX); {
        if (im.IsFirstRender(c)) {
            imdom.setStyle(c, "flexFlow", "wrap");
        }

        if (im.If(c) && isFirst) {
            imui.Begin(c, ROW); imui.Justify(c); imui.Align(c); imui.Gap(c, 10, PX); {
                imdom.ElBegin(c, el.I); {
                    imdom.ElBegin(c, el.B); imdom.Str(c, termIdx); imdom.ElEnd(c, el.B);
                } imdom.ElEnd(c, el.I);
            } imui.End(c);
        } im.IfEnd(c);

        im.For(c); for (let coIdx = 0; coIdx < coefficients.length; coIdx++) {
            const co = coefficients[coIdx];
            imui.Begin(c, ROW); imui.Justify(c); imui.Gap(c, 5, PX); {
                if (
                    im.Memo(c, termIdx) |
                    im.Memo(c, coIdx) 
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
            } imui.End(c);
            if (im.If(c) && coIdx < coefficients.length - 1) {
                imui.Begin(c, ROW); imui.Justify(c); {
                    imdom.Str(c, " * ");
                } imui.End(c);
            } im.IfEnd(c);
        } im.ForEnd(c);

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
    if (im.If(c) && contextMenu.open) {
        imContextMenuBegin(c, contextMenu); {
            im.For(c); for (const type of choices) {
                imEditorContextMenuItemBegin(c); {
                    if (imdom.hasMousePress(c)) {
                        result = { choice: type };
                        // Let's keep it open, so we can make multiple choices without having
                        // to keep re-opening it
                    }
                    imdom.StrFmt(c, type, fmt);
                } imEditorContextMenuItemEnd(c);
            } im.ForEnd(c);
        } imContextMenuEnd(c, contextMenu);
    } im.IfEnd(c);

    const clicked = imButtonBegin(c, fmt(currentChoice)); {
        imdom.Str(c, " | v");

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
    if (im.If(c) && !hasAllManualInputs) {
        imui.Begin(c, ROW); imui.Justify(c); {
            imdom.Str(c, "Analysis will only work as expected when all value inputs are manual");
        } imui.End(c);
    } im.IfEnd(c);

    const effectChanged = im.Memo(c, effect);
    let s; s = im.GetInline(c, imEffectRackEditor);
    if (!s || effectChanged) {
        const numSamples = MAX_NUM_FREQUENCIES;

        s = im.Set(c, {
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

    if (im.Memo(c, editor.version) || effectChanged) {

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

    imui.Begin(c, BLOCK); imdom.Str(c, "Impulse response (time)"); imui.End(c);
    imui.Begin(c, COL); imui.Size(c, 0, NA, 200, PX); {
        imOscilloscope(c, s.osc, s.impulseResponse, "blue");
    } imui.End(c);
    imui.Begin(c, BLOCK); imdom.Str(c, "Impulse response (frequency)"); imui.End(c);
    imui.Begin(c, COL); imui.Size(c, 0, NA, 200, PX); {
        imOscilloscope(
            c,
            s.impulseResponseFft.osc,
            s.impulseResponseFft.frequencies,
            "red",
            s.impulseResponseFft.frequenciesMin,
            s.impulseResponseFft.frequenciesMax
        );
    } imui.End(c);
}


function imSpacingSymbol(c: ImCache, symbol: string, flex = false) {
    imui.Begin(c, ROW); imui.Align(c); imui.Justify(c); imui.NoWrap(c); imui.Size(c, 50, PX, 0, NA); imui.Flex(c, flex ? 1 : - 1); {
        imdom.Str(c, symbol);
    } imui.End(c);
}

function editorUndo(editor: EffectRackEditorState): boolean {
    if (!canUndo(editor.undoBuffer)) return false;

    editor.effectRack = undo(editor.undoBuffer);
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
    effectRack.name = editor.effectRack.name;
    editor.effectRack = effectRack;
    onEdited(editor, false, ACTION_ID_IMPORT);
}

function registerValueToString(num: number) {
    return num.toFixed(4);
}

const BINDING_IS_OUTPUT = 1 << 1;

function imDspVisualGroupBegin(c: ImCache, type: DisplayType, enabled: boolean = true) {
    imui.Begin(c, type); imui.Align(c); imui.Justify(c); imui.Gap(c, 5, PX); {
        if (im.Memo(c, enabled)) {
            imdom.setStyle(c, "flexWrap", "wrap");
            imdom.setStyle(c, "border", !enabled ? "" : "1px solid " + cssVars.fg);
            imdom.setStyle(c, "padding", !enabled ? "" : "5px");
            imdom.setStyle(c, "borderRadius", !enabled ? "" : "5px");
        }

    } // imui.End
}

function imDspVisualGroupEnd(c: ImCache) {
    // imui.Layout
    {
    } imui.End(c);
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

    imDspVisualGroupBegin(c, ROW, false); imui.NoWrap(c); imui.Gap(c, 4, row ? PX : NA); {
        if (im.IsFirstRender(c)) {
            imdom.setStyle(c, "fontSize", "1.25rem");
        }

        // Much easier to connect things.
        elDropWireToRegisterInput(c, editor, regIdxUi);

        imRegisterHighlightBg(c, editor, undefined, regIdxUi.valueRef.regOutputId);

        if (im.If(c) && !isOutput) {
            imWireDragEndpoint(c, editor, regIdxUi, null);
        } im.IfEnd(c);

        imui.Begin(c, row ? ROW_REVERSE : COL); imui.Align(c); imui.Justify(c); imui.Gap(c, 4, row ? PX : NA); {
            imui.Begin(c, BLOCK); {
                if (im.If(c) && regIdxUi.valueRef.value !== undefined && !isOutput) {
                    imdom.StrFmt(c, regIdxUi.valueRef.value, registerValueToString);

                    let dragEvent = imParameterSliderInteraction(c, regIdxUi._min, regIdxUi._max, 0.0001, regIdxUi.valueRef.value, 0, DRAG_TYPE_CIRCULAR);
                    if (dragEvent) {
                        regIdxUi.valueRef.value = dragEvent.val;
                        onEdited(editor);
                        // Specifically when we're tweaking values, we probably want
                        // to see the preview waveform and not the list of presets.
                        editor.ui.rightPanel.presets = false;
                    }
                } else if (im.IfElse(c) && regIdxUi.valueRef.regIdx !== undefined && !isOutput) {
                    imui.Begin(c, ROW); {
                        imRegisterHighlightBg(c, editor, regIdxUi.valueRef.regIdx, regIdxUi.valueRef.regOutputId);

                        imdom.Str(c, "<var=");
                        imdom.Str(c, defaultBindings[regIdxUi.valueRef.regIdx].name);
                        imdom.Str(c, ">");
                    } imui.End(c);
                } else if (im.IfElse(c) && regIdxUi.valueRef.regOutputId !== undefined) {
                    imui.Begin(c, ROW); {
                        imRegisterHighlightBg(c, editor, regIdxUi.valueRef.regIdx, regIdxUi.valueRef.regOutputId);

                        const regOutput = rack._effectRackOutputIdToRegOutput.get(regIdxUi.valueRef.regOutputId);
                        assert(regOutput !== undefined);

                        imResultName(c, regOutput, effectPos);
                    } imui.End(c);
                    im.IfElse(c);
                } else {
                    im.IfElse(c);

                    imdom.Str(c, "????");
                } im.IfEnd(c);
            } imui.End(c);

            imui.Begin(c, BLOCK); {
                if (im.IsFirstRender(c)) {
                    imdom.setStyle(c, "fontSize", "1rem");
                    imdom.setStyle(c, "userSelect", "none");
                    imdom.setStyle(c, "fontWeight", "bold");
                    imdom.setClass(c, "hoverable");
                }

                imdom.Str(c, regIdxUi._name);
                imdom.Str(c, row ? ":" : "");

                imBindingEditorContextMenu(c, editor, regIdxUi);
            } imui.End(c);
        } imui.End(c);
    } imDspVisualGroupEnd(c);
}

function imEditorContextMenuItemBegin(c: ImCache) {
    imContextMenuItemBegin(c); {
        if (im.IsFirstRender(c)) {
            // TODO: things in apps should be non-selectable by default, and opt-in to the selection process.
            // This is a webapp, not a document.
            imdom.setStyle(c, "userSelect", "none");
            imdom.setClass(c, "hoverable");
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
    if (im.If(c) && contextMenu.open) {
        imContextMenuBegin(c, contextMenu); {
            imEditorContextMenuItemBegin(c); {
                imdom.Str(c, "default value");
                imdom.Str(c, " (");
                imdom.Str(c, reg._defaultValue);
                imdom.Str(c, ")");

                if (imdom.hasMousePress(c)) {
                    reg.valueRef = { value: reg._defaultValue };
                    onEdited(editor);
                    contextMenu.open = false;
                }
            } imEditorContextMenuItemEnd(c);

            im.For(c); for (
                let bindingIdx = 0 as RegisterIdx;
                bindingIdx < defaultBindings.length;
                bindingIdx++
            ) {
                const binding = defaultBindings[bindingIdx];

                imEditorContextMenuItemBegin(c); {
                    imRegisterHighlightBg(c, editor, bindingIdx, undefined);

                    imdom.Str(c, "<"); imdom.Str(c, binding.name); imdom.Str(c, ">");

                    if (imdom.hasMousePress(c)) {
                        reg.valueRef = { regIdx: asRegisterIdx(bindingIdx) };
                        onEdited(editor);
                        contextMenu.open = false;
                    }
                } imContextMenuItemEnd(c);
            } im.ForEnd(c);
        } imContextMenuEnd(c, contextMenu);
    } im.IfEnd(c);

    if (imdom.hasMousePress(c)) {
        openContextMenuAtMouse(c, contextMenu);
    }
}

function imResultName(
    c: ImCache,
    output: RegisterOutput,
    effectPos: number,
) {
    if (im.If(c) && output._name.length > 0) {
        imdom.Str(c, "r");
        imdom.Str(c, output._effectPos);

        imdom.Str(c, ".");
        imdom.Str(c, output._name);

        if (im.If(c) && effectPos <= output._effectPos) {
            imdom.Str(c, "(-1)");
        } im.IfEnd(c);
    } im.IfEnd(c);
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

    const root = imui.Begin(c, ROW); imui.Align(c); imui.Justify(c); imui.Size(c, 30, PX, 30, PX);
    imui.Bg(c, isEligibleDropZone ? cssVars.mg : cssVars.bg2); {
        if (im.IsFirstRender(c)) {
            imdom.setStyle(c, "borderRadius", "1000px");
            imdom.setStyle(c, "cursor", "move");
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

        if (im.If(c) && reg?.valueRef.regOutputId !== undefined) {
            const outputUi = wires.outputPositions.get(reg.valueRef.regOutputId);
            assert(outputUi !== undefined);

            const srcX = outputUi.x;
            const srcY = outputUi.y;

            const rect = root.getBoundingClientRect();
            const dstX = rect.x + rect.width / 2;
            const dstY = rect.y + rect.height / 2;

            assert(editor.svgCtx != null);

            imdom.RootExistingBegin(c, editor.svgCtx.root); {
                const color = outputUi.colour;

                imWire(
                    c,
                    srcX, srcY, dstX, dstY,
                    color.r, color.g, color.b, 0.3 + (1 - 0.3) * 0.5,
                );
            } imdom.RootExistingEnd(c, editor.svgCtx.root);
        } im.IfEnd(c);
    } imui.End(c);

    return root;
}

function elDragWireToRegisterInput(
    c: ImCache,
    editor: EffectRackEditorState,
    registerOutputIdToDrag: RegisterOutputId | undefined,
    reg: RegisterIdxUi | null,
) {
    const wires = editor.ui.wires;
    const mouse = imdom.getMouse();
    if (wires.drag.registerOutputId === undefined && imdom.hasMousePress(c) && mouse.leftMouseButton) {
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
    const mouse = imdom.getMouse();
    if (wires.drag.registerInput === undefined && imdom.hasMousePress(c) && mouse.leftMouseButton) {
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

    if (wires.drag.registerOutputId !== undefined && imdom.hasMouseOver(c)) {
        wires.drag.registerInput = reg;
    }
}

function elDropWireToEffectOutput(c: ImCache, editor: EffectRackEditorState, outputIdToDrop: RegisterOutputId) {
    const wires = editor.ui.wires;
    if (wires.drag.registerInput !== undefined && imdom.hasMouseOver(c)) {
        wires.drag.registerOutputId = outputIdToDrop;
    }
}

function imWire(
    c: ImCache,
    srcX: number, srcY: number,
    dstX: number, dstY: number,
    r: number, g: number, b: number, a: number,
) {
    imdom.ElSvgBegin(c, elsvg.PATH); {
        if (im.Memo(c, r) | im.Memo(c, g) | im.Memo(c, b) | im.Memo(c, a)) {
            imdom.setAttr(c, "stroke", imui.rgbaToCssString(r, g, b, a));
        }

        if (im.IsFirstRender(c)) {
            imdom.setAttr(c, "fill", "none");
            imdom.setAttr(c, "stroke-width", "10");
        }

        if (im.Memo(c, srcX) | im.Memo(c, srcY) | im.Memo(c, dstX) | im.Memo(c, dstY)) {
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

            imdom.setAttr(c, "d", newPath);
        }
    } imdom.ElSvgEnd(c, elsvg.PATH);
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
    imui.Begin(c, COL); imui.Flex(c); {
        const plotState = imPlotBegin(c); {
            const { ctx, width, height } = plotState;

            if (ctx) {
                const viewChanged = im.Memo(c, s.viewVersion);
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
    } imui.End(c);

    const dragged = imSampleRangeSlider(c, s.range, samples.length, "Samples: ");

    return dragged;
}

function imSampleRangeSlider(c: ImCache, range: SampleRange, samplesLen: number, label: string): boolean {
    let dragged = false;

    imui.Begin(c, ROW); imui.Align(c); {
        imui.Begin(c, BLOCK); imui.Size(c, 150, PX, 0, NA); {
            imdom.Str(c, label);
        } imui.End(c);
        imui.Begin(c, COL); imui.Flex(c); {
            const [start, end, draggingStart, draggingEnd] = imRangeSlider(
                c,
                0, samplesLen,
                range.idx, range.idx + range.len, 1,
                100,
            ).value;

            range.idx = start;
            range.len = end - start;
            dragged = draggingStart || draggingEnd;
        } imui.End(c);
    } imui.End(c);

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

    imui.Bg(c, isHighlighted ? cssVarsApp.highlight : "");

    if (imdom.hasMouseOver(c)) {
        editor.highlightedValueRefNext.regOutputId = regOutId;
        editor.highlightedValueRefNext.regIdx = regIdx;
    }
}

function imInsertButton(c: ImCache, editor: EffectRackEditorState, insertIdx: number) {
    const rack = editor.effectRack;

    let toAdd: EffectRackItem | undefined;

    const contextMenu = imContextMenu(c);
    if (im.If(c) && contextMenu.open) {
        imContextMenuBegin(c, contextMenu); {
            const effect = arrayAt(rack.effects, insertIdx);
            if (im.If(c) && !!effect) {
                imEditorContextMenuItemBegin(c); {
                    imdom.Str(c, "Duplicate");
                    if (imdom.hasMousePress(c)) {
                        toAdd = copyEffectRackItem(effect);
                    }
                } imContextMenuItemEnd(c);
            } im.IfEnd(c);

            imContextMenuDivider(c);

            imEditorContextMenuItemBegin(c); {
                imdom.Str(c, "+ Oscillator");
                if (imdom.hasMousePress(c)) {
                    toAdd = newEffectRackItem(newEffectRackOscillator());
                }
            } imContextMenuItemEnd(c);

            imEditorContextMenuItemBegin(c); {
                imdom.Str(c, "+ Wave-Table");
                if (imdom.hasMousePress(c)) {
                    toAdd = newEffectRackItem(newEffectRackWaveTable());
                }
            } imContextMenuItemEnd(c);

            imEditorContextMenuItemBegin(c); {
                imdom.Str(c, "+ Envelope");
                if (imdom.hasMousePress(c)) {
                    toAdd = newEffectRackItem(newEffectRackEnvelope());
                }
            } imContextMenuItemEnd(c);

            imEditorContextMenuItemBegin(c); {
                imdom.Str(c, "+ Noise");
                if (imdom.hasMousePress(c)) {
                    toAdd = newEffectRackItem(newEffectRackNoise());
                }
            } imContextMenuItemEnd(c);

            imContextMenuDivider(c);

            imEditorContextMenuItemBegin(c); {
                imdom.Str(c, "+ Biquad Filter - Manual");
                if (imdom.hasMousePress(c)) {
                    toAdd = newEffectRackItem(newEffectRackBiquadFilter());
                }
            } imContextMenuItemEnd(c);

            imEditorContextMenuItemBegin(c); {
                imdom.Str(c, "+ Biquad Filter - Parameterized");
                if (imdom.hasMousePress(c)) {
                    toAdd = newEffectRackItem(newEffectRackBiquadFilter2());
                }
            } imContextMenuItemEnd(c);

            imEditorContextMenuItemBegin(c); {
                imdom.Str(c, "+ Sinc wall filter");
                if (imdom.hasMousePress(c)) {
                    toAdd = newEffectRackItem(newEffectRackConvolutionFilter());
                }
            } imContextMenuItemEnd(c);

            imContextMenuDivider(c);

            imEditorContextMenuItemBegin(c); {
                imdom.Str(c, "+ Maths");
                if (imdom.hasMousePress(c)) {
                    toAdd = newEffectRackItem(newEffectRackMaths());
                }
            } imContextMenuItemEnd(c);

            imEditorContextMenuItemBegin(c); {
                imdom.Str(c, "+ Switch");
                if (imdom.hasMousePress(c)) {
                    toAdd = newEffectRackItem(newEffectRackSwitch());
                }
            } imContextMenuItemEnd(c);

            imEditorContextMenuItemBegin(c); {
                imdom.Str(c, "+ Delay");
                if (imdom.hasMousePress(c)) {
                    toAdd = newEffectRackItem(newEffectRackDelay());
                }
            } imContextMenuItemEnd(c);

            imEditorContextMenuItemBegin(c); {
                imdom.Str(c, "+ Reverb");
                if (imdom.hasMousePress(c)) {
                    toAdd = newEffectRackItem(newEffectRackReverbBadImpl());
                }
            } imContextMenuItemEnd(c);
        } imContextMenuEnd(c, contextMenu);
    } im.IfEnd(c);

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
    const visibleStartChanged = im.Memo(c, state.allSamplesVisibleStart);
    const visibleEndChanged = im.Memo(c, state.allSamplesVisibleEnd);
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

    imui.Begin(c, COL); imui.Flex(c); {
        imui.Begin(c, COL); imui.Flex(c); {
            imui.Begin(c, BLOCK); {
                imdom.Str(c, "Frequencies (hz) (?)");
                imdom.Str(c, " -> ");
                imdom.Str(c, state.frequenciesReal.length);
                imdom.Str(c, "hz (?)");
            } imui.End(c);

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
        } imui.End(c);
        imui.Begin(c, COL); imui.Flex(c); {
            imui.Begin(c, ROW); imui.Align(c); {
                imdom.Str(c, "Waveform ");

                imdom.Str(c, " t=");
                imdom.Str(c, (state.allSamplesStartIdx / state.dsp.sampleRate).toPrecision(3));
                imdom.Str(c, " sample ");
                imdom.Str(c, state.allSamplesStartIdx);
                imdom.Str(c, " -> ");
                imdom.Str(c, state.allSamplesStartIdx + state.allSamplesWindowLength);
            } imui.End(c);

            const plotState = imPlotBegin(c); {
                const { ctx, width, height, isNewFrame } = plotState;
                if (ctx && isNewFrame) {
                    ctx.clearRect(0, 0, width, height);

                    const samples = state.allSamples;

                    const theme = imui.getCurrentTheme();
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


        } imui.End(c);
    } imui.End(c);
}


function imEffectRackRightPanel(
    c: ImCache,
    ctx: GlobalContext,
    effectRackEditor: EffectRackEditorState,
    keyboardEditorForKeyboard: KeyboardConfigEditorState,
    labForKeyboard: SoundLabState,
) {
    imui.Begin(c, COL); imui.Flex(c, 3); {
        imLine(c, LINE_HORIZONTAL, 2);

        imui.Begin(c, ROW); imui.Gap(c, 5, PX); {
            if (imButtonIsClicked(c, "Wave preview", !effectRackEditor.ui.rightPanel.presets)) {
                effectRackEditor.ui.rightPanel.presets = false;
            }

            if (imButtonIsClicked(c, "Presets", effectRackEditor.ui.rightPanel.presets)) {
                effectRackEditor.ui.rightPanel.presets = true;
            }
        } imui.End(c);

        if (im.If(c) && effectRackEditor.ui.rightPanel.presets) {
            imui.Begin(c, COL); imui.Flex(c); {
                imHeading(c, "Effect rack presets");

                const presetsList = im.State(c, newPresetsListState);

                imui.Begin(c, ROW); imui.Gap(c, 5, PX); imui.FlexWrap(c); {
                    imui.Flex1(c);

                    let selectedPreset = presetsList.selectedLoaded;

                    if (imButtonIsClicked(c, "Overwrite", false, !!selectedPreset) && selectedPreset) {
                        selectedPreset.serialized = serializeEffectRack(effectRackEditor.effectRack);
                        updateEffectRackPreset(ctx.repo, selectedPreset, () => DONE);
                    }

                    if (imButtonIsClicked(c, "Rename", false, !!presetsList.selectedLoaded) && presetsList.selected && presetsList.selected) {
                        startRenamingPreset(ctx, presetsList, presetsList.selected);
                    }

                    if (imButtonIsClicked(c, "Delete", false, !!selectedPreset) && selectedPreset) {
                        deleteEffectRackPreset(ctx.repo, selectedPreset, () => DONE);
                        selectEffectRackPreset(ctx, presetsList, null);
                    }

                    if (imButtonIsClicked(c, "New")) {
                        const preset = effectRackToPreset(effectRackEditor.effectRack);
                        preset.name = "Unnamed";
                        createEffectRackPreset(ctx.repo, preset, (val) => {
                            if (!val) return CANCELLED;

                            presetsList.openGroup = DEFAULT_GROUP_NAME;
                            startRenamingPreset(ctx, presetsList, val.metadata)
                            return DONE;
                        });
                    }
                } imui.End(c);

                const ev = imEffectRackList(c, ctx, presetsList);
                if (ev) {
                    if (ev.selectionLoaded) {
                        // Discard the name/id of the preset - we just want the contents
                        editorImport(effectRackEditor, ev.selectionLoaded.serialized);
                    }
                }
            } imui.End(c);
        } else {
            im.IfElse(c);

            imui.Begin(c, ROW); imHeading(c, "Waveform preview"); imui.End(c);

            imEffectRackEditorWaveformPreview(c, ctx, effectRackEditor);

            // May seem useless rn, but I want to eventually assign different effect rack presets to 
            // different keys or key ranges, and that is when this will become handy.
            imKeyboardConfigEditorKeyboard(c, ctx, keyboardEditorForKeyboard, false, labForKeyboard.editingSlotIdx);
        } im.IfEnd(c);
    } imui.End(c);

    imLine(c, LINE_HORIZONTAL);

    imui.Begin(c, ROW); imHeading(c, "Actual waveform"); imui.End(c);

    imui.Begin(c, COL); imui.Flex(c, 2); {
        imEffectRackActualWaveform(c, ctx, effectRackEditor);
    } imui.End(c);
}
