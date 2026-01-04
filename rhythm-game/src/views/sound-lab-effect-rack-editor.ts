import {
    imContextMenu,
    imContextMenuBegin,
    imContextMenuEnd,
    imContextMenuItemBegin,
    imContextMenuItemEnd,
    openContextMenuAtMouse
} from "src/app-components/context-menu";
import { imVerticalText } from "src/app-components/misc";
import { imTextInputOneLine } from "src/app-components/text-input-one-line";
import { imButtonIsClicked } from "src/components/button";
import { imBeginCanvasRenderingContext2D, imEndCanvasRenderingContext2D } from "src/components/canvas2d";
import { imCheckbox } from "src/components/checkbox";
import {
    BLOCK,
    COL,
    DisplayType,
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
    imPadding,
    imRelative,
    imScrollOverflow,
    imSize,
    NA,
    PERCENT,
    PX,
    ROW,
    ROW_REVERSE
} from "src/components/core/layout";
import { cn, cssVars } from "src/components/core/stylesheets";
import { imDragAndDrop, imDragHandle, imDragZoneBegin, imDragZoneEnd, imDropZoneForPrototyping } from "src/components/drag-and-drop";
import { imLine, LINE_HORIZONTAL, LINE_VERTICAL, LINE_VERTICAL_PADDING } from "src/components/im-line";
import { imRangeSlider } from "src/components/range-slider";
import { imScrollContainerBegin, imScrollContainerEnd, newScrollContainer } from "src/components/scroll-container";
import { DspLoopMessage, dspProcess, dspReceiveMessage, DspState, newDspState } from "src/dsp/dsp-loop";
import {
    asRegisterIdx,
    compileEffectRack,
    computeEffectRackIteration,
    copyEffectRackItem,
    deserializeEffectRack,
    EFFECT_RACK_ITEM__ENVELOPE,
    EFFECT_RACK_ITEM__MATHS,
    EFFECT_RACK_ITEM__OSCILLATOR,
    EFFECT_RACK_ITEM__SWITCH,
    EffectRack,
    EffectRackItem,
    EffectRackOscillatorWaveType,
    EffectRackRegisters,
    getEffectRackOscillatorWaveTypeName,
    getRegisterIdxForUIValue,
    newEffectRackBinding,
    newEffectRackEnvelope,
    newEffectRackItem,
    newEffectRackMaths,
    newEffectRackMathsItemCoefficient,
    newEffectRackMathsItemTerm,
    newEffectRackOscillator,
    newEffectRackRegisters,
    newEffectRackSwitch,
    newEffectRackSwitchCondition,
    OSC_WAVE__SAWTOOTH,
    OSC_WAVE__SAWTOOTH2,
    OSC_WAVE__SIN,
    OSC_WAVE__SQUARE,
    OSC_WAVE__TRIANGLE,
    REG_IDX_OUTPUT,
    RegisterIdx,
    RegisterIdxUiMetadata,
    serializeEffectRack,
    sortEffectRack,
    SWITCH_OP_GT,
    SWITCH_OP_LT
} from "src/dsp/dsp-loop-effect-rack";
import { getCurrentPlaySettings, getDspInfo, pressKey, updatePlaySettings } from "src/dsp/dsp-loop-interface";
import { createEffectRackPreset, deleteEffectRackPreset, EffectRackPreset, effectRackToPreset, loadAllEffectRackPresets, updateEffectRackPreset } from "src/state/data-repository";
import { getKeyForKeyboardKey } from "src/state/keyboard-state";
import { arrayMove, copyArray, filterInPlace, removeItem, resizeValuePool } from "src/utils/array-utils";
import { assert, unreachable } from "src/utils/assert";
import { newCssBuilder } from "src/utils/cssb";
import { fft, fftToReal, resizeNumberArrayPowerOf2 } from "src/utils/fft";
import {
    getDeltaTimeSeconds,
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
import { EL_B, EL_I, EL_SVG_PATH, elGet, elHasMouseOver, elHasMousePress, elSetAttr, elSetClass, elSetStyle, imEl, imElBeginExisting, imElBeginSvg, imElEnd, imElEndExisting, imElEndSvg, imStr, imStrFmt, imSvgContext, SvgContext } from "src/utils/im-dom";
import { arrayMax, arrayMin } from "src/utils/math-utils";
import { getNoteFrequency, getNoteIndex } from "src/utils/music-theory-utils";
import { newAsyncContext, waitFor, waitForOne } from "src/utils/promise-utils";
import { canRedo, canUndo, JSONUndoBuffer, newUndoBuffer, redo, stepUndoBufferTimer, undo, writeToUndoBuffer, writeToUndoBufferDebounced } from "src/utils/undo-buffer";
import { GlobalContext, setViewChartSelect } from "./app";
import { imExportModal, imImportModal } from "./import-export-modals";
import { imKeyboard } from "./keyboard";
import { drawSamples, newPlotState } from "./plotting";
import { DRAG_TYPE_CIRCULAR, imParameterSliderInteraction } from "./sound-lab-drag-slider";
import { cssVarsApp, getCurrentTheme } from "./styling";

type DspMockHarnessState = {
    dsp: DspState;
    allSamples: number[]

    allSamplesStartIdx: number;
    allSamplesWindowLength: number;
    allSamplesVisibleStart: number;
    allSamplesVisibleEnd: number;
    
    frequenciesStartIdx: number;
    frequenciesLength: number;
    signalFftWindow: number[];
    frequenciesReal: number[];
    frequenciesIm: number[];
    frequencies: number[];

    autoPan: boolean;
    // This is just the format that the audo worker script needs to output.
    // [output(? not sure)][channel][sample] I think
    output: [[number[]]]; 

    effectRackEditor: EffectRackEditorState | null;

    messagesToSend: DspLoopMessage[];
}

export function dspMockHarnessState(): DspMockHarnessState {
    return {
        dsp: newDspState(44800),

        allSamples: [0],
        allSamplesStartIdx: 0,
        allSamplesWindowLength: 5000,
        allSamplesVisibleStart: 0,
        allSamplesVisibleEnd: 0,
        frequenciesStartIdx: 0,
        frequenciesLength: 500,
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

const MODAL_NONE = 0;
const MODAL_EXPORT = 1;
const MODAL_IMPORT = 2;
const MODAL_NEW_PRESET = 3;

const UNDO_DEBOUNCE_SECONDS = 0.2;

type OscilloscopeState = {
    noteIdx: number;
    samplePressedIdx: number;
    sampleReleasedIdx: number;
    sampleRate: number;

    samples: number[];
    samplesPerEffect: number[];

    viewingIdx: number;
    viewingLen: number;
    viewVersion: number;


    registers: EffectRackRegisters;
};

function newOscilloscopeState(): OscilloscopeState {
    const mockSampleRate = 44800;
    return {
        noteIdx: getNoteIndex("A", 3),

        sampleRate: mockSampleRate,
        samples: Array(mockSampleRate * 3).fill(0) as number[],
        samplesPerEffect: [],
        viewingIdx: 0,
        viewingLen: 58071,
        viewVersion: 0,

        samplePressedIdx: 14430,
        sampleReleasedIdx: 28090,

        registers: newEffectRackRegisters(),
    }
}

// NOTE: this is currently the 'sound lab'
// Maybe in the future, it will go back to being just a tiny editor again. 
// I won't assume anything for now
export type EffectRackEditorState = {
    effectRack: EffectRack;
    undoBuffer: JSONUndoBuffer<EffectRack>;

    mockDspHarness: DspMockHarnessState;

    theoreticalSignalOscilloscopeState: OscilloscopeState;

    compileStats: {
        numSamples: number;
        compileTime: number;
        computeSamplesTime: number;
    };

    ui: {
        modal: number;
        presetsPanel: boolean;

        wires: BindingSvgWire;
    };

    edited: boolean;
    editUndoActionId: number | undefined;

    version: number;

    highlightedRegister: number;
    highlightedRegisterNext: number;

    svgCtx: SvgContext | null;

    deferredAction: (() => void) | null;
};

type BindingSvgWire = {
    outputPositions: {
        x: number[];
        y: number[]
        registerIdx: number[];
    };
};

export function newEffectRackEditorState(effectRack: EffectRack): EffectRackEditorState {
    const state: EffectRackEditorState = {
        effectRack: effectRack,
        undoBuffer: newUndoBuffer<EffectRackEditorState>(),

        mockDspHarness: dspMockHarnessState(),

        theoreticalSignalOscilloscopeState: newOscilloscopeState(),

        compileStats: {
            compileTime: 0,
            numSamples: 0,
            computeSamplesTime: 0,
        },

        ui: {
            modal: MODAL_NONE,
            presetsPanel: false,

            wires: {
                outputPositions: {
                    x: [],
                    y: [],
                    registerIdx: [],
                },
            },
        },

        edited: false,
        editUndoActionId: undefined,

        version: 0,

        highlightedRegister: 0,
        highlightedRegisterNext: 0,

        deferredAction: null,

        svgCtx: null,
    };

    return state;
}

function imHeading(c: ImCache, text: string) {
    imLayout(c, ROW); imJustify(c); {
        imEl(c, EL_B); imStr(c, text); imElEnd(c, EL_B);
    } imLayoutEnd(c);
}


const cssb = newCssBuilder();
const cnEffectRackEditor = cssb.cn("effectRackEditor", [
    // TODO: better styling xD
    ` .hoverable { cursor: pointer; margin: 2px; border-radius: 4px; }`,
    ` .hoverable:hover { outline: 2px solid ${cssVars.fg}; }`
]);

const ACTION_ID_IMPORT = 1;

export function imEffectRackEditor(c: ImCache, ctx: GlobalContext) {
    const settings = getCurrentPlaySettings();

    let editor = imGet(c, newEffectRackEditorState);
    if (!editor) {
        editor = imSet(c, newEffectRackEditorState(settings.parameters.rack));
    }

    const wires = editor.ui.wires; {
        resizeValuePool(wires.outputPositions.x, editor.effectRack.effects.length, 0);
        resizeValuePool(wires.outputPositions.y, editor.effectRack.effects.length, 0);
        resizeValuePool(wires.outputPositions.registerIdx, editor.effectRack.effects.length, 0);
    }

    const rack = editor.effectRack;

    const dspInfo = getDspInfo();

    const versionChanged = imMemo(c, editor.version);
    if (versionChanged) {
        compileEffectRack(rack);

        // TODO: can make it more performant by updating just the specific register being edited
        // rather than the entire effect rack if we're editing a value in realtime

        settings.parameters.rack = rack;
        updatePlaySettings();
    }

    editor.highlightedRegister = editor.highlightedRegisterNext;
    editor.highlightedRegisterNext = -1;
    editor.theoreticalSignalOscilloscopeState.sampleRate = dspInfo.sampleRate;

    let hasUndoCommand = false;
    let hasRedoCommand = false;

    stepUndoBufferTimer(editor.undoBuffer, ctx.deltaTime, editor.effectRack);

    // Recompute oscilloscope as neeed, just once instead of per oscilloscope.
    // Wanted to have one oscilloscpe per UI but prob not worth it I reckon.
    {
        const s = editor.theoreticalSignalOscilloscopeState;

        const noteChanged = imMemo(c, s.noteIdx);
        const pressedChanged = imMemo(c, s.samplePressedIdx);
        const releasedChanged = imMemo(c, s.sampleReleasedIdx);
        const editorChanged = imMemo(c, editor.version);

        if (noteChanged || pressedChanged || releasedChanged || editorChanged) {
            s.viewVersion++;

            const dt = 1 / 44100;
            let keyFrequency = getNoteFrequency(s.noteIdx);

            const t0 = performance.now();

            compileEffectRack(editor.effectRack);

            const t1 = performance.now();
            editor.compileStats.compileTime = t1 - t0;
            editor.compileStats.numSamples = s.samples.length;

            let register = REG_IDX_OUTPUT;
            if (rack._debugEffectIdx !== -1) {
                register = rack.effects[rack._debugEffectIdx].dst;
            }

            for (let i = 0; i < s.samples.length; i++) {
                let signal = 0;
                if (s.samplePressedIdx < i && i < s.sampleReleasedIdx) {
                    signal = 1;
                }

                computeEffectRackIteration(rack, s.registers, keyFrequency, signal, dt, false);

                s.samples[i] = s.registers.values[register];
            }

            editor.compileStats.computeSamplesTime = performance.now() - t1;
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
                    state.dsp = newDspState(44800);
                    state.dsp.sampleRate = sampleRate;
                    dspReceiveMessage(state.dsp, {
                        playSettings: getCurrentPlaySettings(),
                    });

                    // divide by 2 bc we cant measure frequencies above sampleRate / 2
                    const numFrequencies = Math.floor(sampleRate / 2);
                    state.frequencies = Array(numFrequencies).fill(0);
                    state.frequenciesReal = Array(numFrequencies).fill(0);
                    state.frequenciesIm = Array(numFrequencies).fill(0);
                    state.allSamples.length = 0;
                    state.signalFftWindow

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
            if (isPlaying && state.allSamples.length < 1_000_000) {
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
                    state.allSamples.push(f);
                }
            }
        }
    }


    if (isFirstishRender(c)) {
        elSetStyle(c, "fontSize", "20px");
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
        if (importModal.event) {
            if (importModal.event.previewUpdated) {
                importModal.importError = "";
            } else if (importModal.event.import) {
                // Try running it
                try {
                    editorImport(editor, importModal.json);

                    importModal.importError = "";
                    editor.ui.modal = MODAL_NONE;
                } catch (e) {
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

    imLayout(c, ROW); imSize(c, 100, PERCENT, 100, PERCENT); imBg(c, cssVars.bg); {
        if (isFirstishRender(c)) elSetClass(c, cnEffectRackEditor);
        if (isFirstishRender(c)) {
            // Should be the default for web apps tbh. Only on documents, would you ever want to select the text ...
            elSetClass(c, cn.userSelectNone); 
        }

        imLayout(c, COL); imFlex(c, 4); {
            imLayout(c, COL); imFlex(c, 2); {
                imLayout(c, ROW); imAlign(c); {
                    imLayout(c, ROW); imGap(c, 10, PX); {
                        if (imButtonIsClicked(c, "Import")) {
                            editor.ui.modal = MODAL_IMPORT;
                        }

                        if (imButtonIsClicked(c, "Export")) {
                            editor.ui.modal = MODAL_EXPORT;
                        }
                    } imLayoutEnd(c);

                    imFlex1(c);

                    imHeading(c, "Effects rack");

                    imFlex1(c);

                    imLayout(c, ROW); imGap(c, 10, PX); {
                        if (imButtonIsClicked(c, "Sort", false)) {
                            editor.deferredAction = () => {
                                sortEffectRack(rack);
                                editor.edited = true;
                            }
                        }

                        if (imButtonIsClicked(c, "Undo", false, canUndo(editor.undoBuffer))) {
                            hasUndoCommand = true;
                        }

                        if (imButtonIsClicked(c, "Redo", false, canRedo(editor.undoBuffer))) {
                            hasRedoCommand = true;
                        }
                    } imLayoutEnd(c);
                } imLayoutEnd(c);

                imLayout(c, COL); imFlex(c); {
                    const sc = imState(c, newScrollContainer);
                    editor.svgCtx = null;
                    imScrollContainerBegin(c, sc); {
                        const svgCtx = imSvgContext(c);

                        editor.svgCtx = svgCtx;

                        imElBeginExisting(c, svgCtx.root); {
                            if (isFirstishRender(c)) {
                                // Dont want to be able to touch the SVG actually.
                                // It's just for the wires visual.
                                elSetStyle(c, "pointerEvents", "none");
                            }
                        } imElEndExisting(c, svgCtx.root);



                        // don't mutate effects while iterating - assign to this instead
                        let deferredAction: (() => void) | undefined;

                        const effectsDnd = imDragAndDrop(c);
                        if (effectsDnd.moved) {
                            const { a, b } = effectsDnd.moved;
                            arrayMove(editor.effectRack.effects, a, b);
                            editor.edited = true;
                        }

                        imFor(c); for (let effectIdx = 0; effectIdx < rack.effects.length; effectIdx++) {
                            const effect = rack.effects[effectIdx];

                            imKeyedBegin(c, effect); {
                                const effectDisabled = !effect.enabled ||
                                    (rack._debugEffectIdx !== -1 && effectIdx > rack._debugEffectIdx);

                                const z = imDragZoneBegin(c, effectsDnd, effectIdx); {
                                    imLayout(c, COL); imFlex(c); {
                                        imLayout(c, ROW); imAlign(c);
                                        imPadding(c, 5, PX, 5, PX, 5, PX, 5, PX); imGap(c, 5, PX); {
                                            imFg(c, effectDisabled ? cssVars.mg : "");

                                            imDropZoneForPrototyping(c, effectsDnd, effectIdx);

                                            imLayout(c, COL); imGap(c, 10, PX); {
                                                imLayout(c, ROW); {
                                                    const ev = imCheckbox(c, effect.enabled);
                                                    if (ev) {
                                                        effect.enabled = ev.checked;
                                                        editor.edited = true;
                                                    }
                                                } imLayoutEnd(c);
                                                imLayout(c, ROW); {
                                                    const isDebugging = effectIdx === rack._debugEffectIdx;
                                                    const ev = imCheckbox(c, isDebugging);
                                                    if (ev) {
                                                        if (ev.checked) {
                                                            rack._debugEffectIdx = effectIdx;
                                                        } else {
                                                            rack._debugEffectIdx = -1;
                                                        }
                                                        editor.edited = true;
                                                    }
                                                } imLayoutEnd(c);
                                            } imLayoutEnd(c);

                                            let name = "???";
                                            switch (effect.value.type) {
                                                case EFFECT_RACK_ITEM__OSCILLATOR: name = "OSC";    break;
                                                case EFFECT_RACK_ITEM__ENVELOPE:   name = "ENV";    break;
                                                case EFFECT_RACK_ITEM__MATHS:      name = "MATHS";  break;
                                                case EFFECT_RACK_ITEM__SWITCH:     name = "SWITCH"; break;
                                                default: unreachable(effect.value);
                                            }

                                            imVerticalText(c); imAlign(c); {
                                                imDragHandle(c, effectsDnd, effectIdx);
                                                imStr(c, name);
                                            } imLayoutEnd(c);

                                            imLine(c, LINE_VERTICAL, 5);

                                            // imLine(c, LINE_VERTICAL, 5);


                                            imDspVisualGroupBegin(c, ROW); imFlex(c); {
                                                const effectValue = effect.value;
                                                imSwitch(c, effectValue.type); switch (effectValue.type) {
                                                    case EFFECT_RACK_ITEM__OSCILLATOR: {
                                                        const osc = effectValue;

                                                        imValueOrBindingEditor(c, editor, effectIdx, osc.amplitudeUI, BINDING_UI_ROW);

                                                        imStr(c, "*");

                                                        const contextMenu = imContextMenu(c);
                                                        if (imIf(c) && contextMenu.open) {
                                                            imContextMenuBegin(c, contextMenu); {
                                                                imFor(c); for (const type of allWaveTypes) {
                                                                    imEditorContextMenuItemBegin(c); {
                                                                        if (elHasMousePress(c)) {
                                                                            osc.waveType = type;
                                                                            editor.edited = true;
                                                                        }
                                                                        imStrFmt(c, type, getEffectRackOscillatorWaveTypeName);
                                                                    } imEditorContextMenuItemEnd(c);
                                                                } imForEnd(c);
                                                            } imContextMenuEnd(c, contextMenu);
                                                        } imIfEnd(c);

                                                        imDspVisualGroupBegin(c, ROW); {
                                                            imDspVisualGroupBegin(c, ROW); {
                                                                if (imButtonIsClicked(c, getEffectRackOscillatorWaveTypeName(osc.waveType))) {
                                                                    openContextMenuAtMouse(contextMenu);
                                                                }

                                                                imValueOrBindingEditor(c, editor, effectIdx, osc.frequencyUI, BINDING_UI_ROW);
                                                                imValueOrBindingEditor(c, editor, effectIdx, osc.frequencyMultUI, BINDING_UI_ROW);
                                                                imValueOrBindingEditor(c, editor, effectIdx, osc.phaseUI, BINDING_UI_ROW);
                                                            } imDspVisualGroupEnd(c);

                                                            imValueOrBindingEditor(c, editor, effectIdx, osc.offsetUI, BINDING_UI_ROW);
                                                        } imDspVisualGroupEnd(c);
                                                    } break;
                                                    case EFFECT_RACK_ITEM__ENVELOPE: {
                                                        const envelope = effectValue;

                                                        const newTarget = imBindingEditor(c, editor, envelope.toModulate, effectIdx);
                                                        if (newTarget !== envelope.toModulate) {
                                                            envelope.toModulate = newTarget;
                                                            editor.edited = true;
                                                        }

                                                        imLayout(c, ROW); imFlex(c); imJustify(c); {
                                                            imStr(c, " * ");
                                                        } imLayoutEnd(c);

                                                        imValueOrBindingEditor(c, editor, effectIdx, envelope.signalUI);
                                                        imValueOrBindingEditor(c, editor, effectIdx, envelope.attackUI);
                                                        imValueOrBindingEditor(c, editor, effectIdx, envelope.decayUI);
                                                        imValueOrBindingEditor(c, editor, effectIdx, envelope.sustainUI);
                                                        imValueOrBindingEditor(c, editor, effectIdx, envelope.releaseUI);
                                                    } break;
                                                    case EFFECT_RACK_ITEM__MATHS: {
                                                        const math = effectValue;

                                                        imLayout(c, COL); imAlign(c); imGap(c, 10, PX); {
                                                            imFor(c); for (let termIdx = 0; termIdx < math.terms.length; termIdx++) {
                                                                const term = math.terms[termIdx];
                                                                imLayout(c, ROW); imAlign(c); imGap(c, 10, PX); {
                                                                    if (isFirstishRender(c)) {
                                                                        elSetStyle(c, "flexFlow", "wrap");
                                                                    }

                                                                    imLayout(c, ROW); imJustify(c); imAlign(c); imGap(c, 10, PX); {
                                                                        imEl(c, EL_I); {
                                                                            imEl(c, EL_B); imStr(c, "x"); imStr(c, termIdx); imElEnd(c, EL_B);
                                                                        } imElEnd(c, EL_I);

                                                                        if (imButtonIsClicked(c, "-")) {
                                                                            deferredAction = () => {
                                                                                filterInPlace(math.terms, termOther => termOther !== term);
                                                                                editor.edited = true;
                                                                            };
                                                                        }
                                                                    } imLayoutEnd(c);

                                                                    imFor(c); for (let coIdx = 0; coIdx < term.coefficients.length; coIdx++) {
                                                                        const co = term.coefficients[coIdx];
                                                                        imLayout(c, ROW); imJustify(c); {
                                                                            if (imMemo(c, co)) co.valueUI._name = "x" + termIdx.toString() + coIdx.toString();
                                                                            imValueOrBindingEditor(c, editor, effectIdx, co.valueUI, BINDING_UI_ROW);

                                                                            if (imButtonIsClicked(c, "-")) {
                                                                                deferredAction = () => {
                                                                                    filterInPlace(term.coefficients, coOther => coOther !== co);
                                                                                    editor.edited = true;
                                                                                };
                                                                            }
                                                                        } imLayoutEnd(c);
                                                                        if (imIf(c) && coIdx < term.coefficients.length - 1) {
                                                                            imLayout(c, ROW); imJustify(c); {
                                                                                imStr(c, " * ");
                                                                            } imLayoutEnd(c);
                                                                        } imIfEnd(c);
                                                                    } imForEnd(c);
                                                                    if (imButtonIsClicked(c, "+")) {
                                                                        const co = newEffectRackMathsItemCoefficient();
                                                                        term.coefficients.push(co);
                                                                        editor.edited = true;
                                                                    }
                                                                } imLayoutEnd(c);

                                                                if (imIf(c) && termIdx < math.terms.length - 1) {
                                                                    imStr(c, " + ");
                                                                } imIfEnd(c);

                                                            } imForEnd(c);

                                                            if (imButtonIsClicked(c, "+")) {
                                                                const term = newEffectRackMathsItemTerm();
                                                                math.terms.push(term);
                                                                editor.edited = true;
                                                            }
                                                        } imLayoutEnd(c);
                                                    } break;
                                                    case EFFECT_RACK_ITEM__SWITCH: {
                                                        const switchEffect = effectValue;

                                                        imFlex1(c);

                                                        imLayout(c, COL); {
                                                            imFor(c); for (let i = 0; i < switchEffect.conditions.length; i++) {
                                                                const cond = switchEffect.conditions[i];

                                                                imLayout(c, ROW); {
                                                                    imValueOrBindingEditor(c, editor, effectIdx, cond.aUi, BINDING_UI_ROW);

                                                                    if (imButtonIsClicked(c, cond.operator === SWITCH_OP_LT ? "<" : ">")) {
                                                                        if (cond.operator === SWITCH_OP_LT) {
                                                                            cond.operator = SWITCH_OP_GT;
                                                                            editor.edited = true;
                                                                        } else {
                                                                            cond.operator = SWITCH_OP_LT;
                                                                            editor.edited = true;
                                                                        }
                                                                    }

                                                                    imValueOrBindingEditor(c, editor, effectIdx, cond.bUi, BINDING_UI_ROW);

                                                                    imValueOrBindingEditor(c, editor, effectIdx, cond.valUi, BINDING_UI_ROW);

                                                                    if (imButtonIsClicked(c, "-")) {
                                                                        deferredAction = () => {
                                                                            removeItem(switchEffect.conditions, cond);
                                                                            editor.edited = true;
                                                                        };
                                                                    }
                                                                } imLayoutEnd(c);
                                                            } imForEnd(c);

                                                            if (imButtonIsClicked(c, "+")) {
                                                                const condition = newEffectRackSwitchCondition();
                                                                switchEffect.conditions.push(condition);
                                                                editor.edited = true;
                                                            }

                                                            imValueOrBindingEditor(c, editor, effectIdx, switchEffect.defaultUi, BINDING_UI_ROW);
                                                        } imLayoutEnd(c);
                                                    } break;
                                                    default: unreachable(effectValue);
                                                } imSwitchEnd(c);

                                                imLayout(c, ROW); imAlign(c); imJustify(c); imNoWrap(c); imFlex(c); {
                                                    imStr(c, " -> ");
                                                } imLayoutEnd(c);

                                                const root = imLayout(c, ROW); imAlign(c); imRelative(c); {
                                                    const rect = root.getBoundingClientRect();
                                                    const x = rect.x + rect.width / 2;
                                                    const y = rect.y + rect.height / 2;

                                                    wires.outputPositions.x[effectIdx] = x;
                                                    wires.outputPositions.y[effectIdx] = y;
                                                    wires.outputPositions.registerIdx[effectIdx] = effect.dst;

                                                    const newDst = imBindingEditor(c, editor, effect.dst, effectIdx, true);
                                                    if (newDst !== effect.dst) {
                                                        effect.dst = newDst;
                                                        editor.edited = true;
                                                    }
                                                } imLayoutEnd(c);
                                            } imDspVisualGroupEnd(c);

                                            imLayout(c, COL); imGap(c, 5, PX); imJustify(c); {
                                                if (imButtonIsClicked(c, "-")) {
                                                    deferredAction = () => {
                                                        filterInPlace(rack.effects, e => e !== effect)
                                                        editor.edited = true;
                                                    }
                                                }

                                                imInsertButton(c, editor, effectIdx);
                                            } imLayoutEnd(c);
                                        } imLayoutEnd(c);
                                    } imLayoutEnd(c);
                                } imDragZoneEnd(c, z, effectIdx);
                            } imKeyedEnd(c);
                        } imForEnd(c);

                        if (deferredAction) {
                            deferredAction();
                        }

                        imLayout(c, ROW); imJustify(c); {
                            imDropZoneForPrototyping(c, effectsDnd, rack.effects.length);
                            imInsertButton(c, editor, rack.effects.length - 1);
                        } imLayoutEnd(c);

                    } imScrollContainerEnd(c);
                    editor.svgCtx = null;
                } imLayoutEnd(c);
            } imLayoutEnd(c);

            {
                const s = editor.compileStats;
                const samplesPerMs = s.numSamples / s.computeSamplesTime;
                imLayout(c, ROW); imAlign(c); {
                    imStr(c, "Compiled in ");
                    imStr(c, s.compileTime.toFixed(3))
                    imStr(c, "ms, ");
                    imStr(c, "Ran in ");
                    imStr(c, samplesPerMs.toFixed(3))
                    imStr(c, " samples per ms");
                    // want to compute ~ 0.1 seconds ahead of time
                    // const wantedSamplesPerMs = (dspInfo.sampleRate / 10);
                    // imStr(c, " (budget = " + wantedSamplesPerMs.toFixed(3) + ")");
                } imLayoutEnd(c);
            }
        } imLayoutEnd(c);

        imLine(c, LINE_VERTICAL_PADDING);
        imLine(c, LINE_VERTICAL);
        imLine(c, LINE_VERTICAL_PADDING);

        imLayout(c, COL); imFlex(c, 2); {
            imLayout(c, ROW); imGap(c, 5, PX); {
                if (imButtonIsClicked(c, "Scopes", !editor.ui.presetsPanel)) {
                    editor.ui.presetsPanel = false;
                }

                if (imButtonIsClicked(c, "Presets", editor.ui.presetsPanel)) {
                    editor.ui.presetsPanel = true;
                }
            } imLayoutEnd(c);

            imLayout(c, ROW); imHeading(c, "Expected waveform"); imLayoutEnd(c);

            imLayout(c, COL); imFlex(c); {
                imOscilloscope(c, editor.theoreticalSignalOscilloscopeState);
            } imLayoutEnd(c);

            imLayout(c, COL); imFlex(c, 3); {
                if (imIf(c) && editor.ui.presetsPanel) {
                    imLayout(c, COL); imFlex(c); {
                        imPresetsList(c, ctx, editor);
                    } imLayoutEnd(c);
                } else {
                    imIfElse(c);

                    imLayout(c, ROW); imHeading(c, "Actual waveform"); imLayoutEnd(c);

                    imLayout(c, COL); imFlex(c, 2); {
                        imOscilloscope2(c, editor.mockDspHarness)
                    } imLayoutEnd(c);

                    imLine(c, LINE_HORIZONTAL, 2);
                    imLayout(c, ROW); imAlign(c); imJustify(c); imFlex(c, 1); {
                        imKeyboard(c, ctx);
                    } imLayoutEnd(c);
                } imIfEnd(c);
            } imLayoutEnd(c);
        } imLayoutEnd(c);

        imLayout(c, BLOCK); imSize(c, 0, NA, 5, PX); imBg(c, cssVars.bg); imRelative(c); {
            // Will the undo buffer reach 5 mb doe ??. (it will totally reach 1mb.)
            const percentage = 100 * editor.undoBuffer.fileVersionsJSONSizeMb / 5.0;
            imLayout(c, BLOCK); imBg(c, cssVars.fg);
            imAbsolute(c, 0, PX, 0, NA, 0, PX, 0, PX); imSize(c, percentage, PERCENT, 0, NA); {
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
                hasUndoCommand = true;
                ctx.handled = true;
            } else if (
                (keyUpper === "Z" && ctrlPressed && shiftPressed) ||
                (keyUpper === "Y" && ctrlPressed && !shiftPressed)
            ) {
                hasRedoCommand = true;
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

    let wasUndoTraversed = false;

    if (hasUndoCommand) {
        wasUndoTraversed = editorUndo(editor);
    } else if (hasRedoCommand) {
        wasUndoTraversed = editorRedo(editor);
    }

    if (editor.edited) {
        editor.edited = false;
        editor.version++;

        if (editor.editUndoActionId !== undefined) {
            // We actually want to write to the undo buffer immediately
            writeToUndoBuffer(editor.undoBuffer, editor.effectRack, editor.editUndoActionId);
            editor.editUndoActionId = undefined;
        } else {
            if (!wasUndoTraversed) {
                writeToUndoBufferDebounced(editor.undoBuffer, editor.effectRack, UNDO_DEBOUNCE_SECONDS);
            }
        }
    }
}

function editorUndo(editor: EffectRackEditorState): boolean {
    if (!canUndo(editor.undoBuffer)) return false;

    editor.effectRack = undo(editor.undoBuffer, editor.effectRack);
    editor.edited = true;
    return true;
}

function editorRedo(editor: EffectRackEditorState): boolean {
    if (!canRedo(editor.undoBuffer)) return false;

    editor.effectRack = redo(editor.undoBuffer);
    editor.edited = true;
    return true;
}

function editorImport(editor: EffectRackEditorState, json: string) {
    const effectRack: EffectRack = deserializeEffectRack(json);
    if (!effectRack.effects || !Array.isArray(effectRack.effects)) {
        throw new Error("Wrong JSON format");
    }

    // Try computing a sample. Does it work??
    compileEffectRack(effectRack);
    const registers = newEffectRackRegisters();
    const f = getNoteFrequency(getNoteIndex("C", 4));
    computeEffectRackIteration(effectRack, registers, f, 1, 1 / 48000, false);

    // If we reach here, then yeah its probably legit...
    const version = editor.effectRack._version;
    editor.effectRack = effectRack;
    editor.effectRack._version = version + 1;
    editor.edited = true;
    editor.editUndoActionId = ACTION_ID_IMPORT;
}

function registerValueToString(num: number) {
    return num.toFixed(4);
}

const BINDING_UI_ROW = 1 << 0;

function imDspVisualGroupBegin(c: ImCache, type: DisplayType) {
    imLayout(c, type); imAlign(c); imJustify(c); imNoWrap(c); imGap(c, 5, PX); {
        if (isFirstishRender(c)) {
            elSetStyle(c, "border", "1px solid " + cssVars.fg);
            elSetStyle(c, "padding", "5px");
            elSetStyle(c, "borderRadius", "5px");
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
    effectIdx: number,
    reg: RegisterIdxUiMetadata,
    flags: number = 0
) {
    const row = true;// !!(flags & BINDING_UI_ROW);

    imDspVisualGroupBegin(c, row ? ROW_REVERSE : COL); imNoWrap(c); imGap(c, 10, row ? PX : NA); {
        imLayout(c, BLOCK); {
            if (imIf(c) && reg.bindingIdx === -1) {
                const value = getRegisterIdxForUIValue(editor.effectRack, reg);
                imStrFmt(c, value, registerValueToString);

                let dragEvent = imParameterSliderInteraction(c, reg._min, reg._max, 0.0001, value, 0, DRAG_TYPE_CIRCULAR);
                if (dragEvent) {
                    reg.value = dragEvent.val;
                    editor.edited = true;
                }
            } else {
                imIfElse(c);

                imLayout(c, ROW); {
                    imBindingName(c, editor, reg.bindingIdx, effectIdx, false);
                } imLayoutEnd(c);

            } imIfEnd(c);
        } imLayoutEnd(c);

        // imLine(c, LINE_HORIZONTAL);

        imLayout(c, BLOCK); {
            if (isFirstishRender(c)) {
                elSetStyle(c, "userSelect", "none");
                elSetStyle(c, "fontWeight", "bold");
                elSetClass(c, "hoverable");
            }

            imStr(c, reg._name);
            imStr(c, row ? ":" : "");

            const newBindingIdx = imBindingEditorContextMenu(c, editor, reg.bindingIdx, FIELD_READ, reg.bindingIdx);
            if (newBindingIdx !== reg.bindingIdx) {
                reg.bindingIdx = newBindingIdx;
                editor.edited = true;
            }
        } imLayoutEnd(c);
    } imDspVisualGroupEnd(c);
}

const FIELD_WRITE = 1;
const FIELD_READ = 2;

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
    currentIdx: RegisterIdx,
    perms = FIELD_READ,
    value: number | null
): RegisterIdx {
    const rack = editor.effectRack;

    const contextMenu = imContextMenu(c);
    if (imIf(c) && contextMenu.open) {
        imContextMenuBegin(c, contextMenu); {
        if (imIf(c) && value !== null) {
            imEditorContextMenuItemBegin(c); {
                imStr(c, "value: ");
                imStrFmt(c, value, registerValueToString);

                if (elHasMousePress(c)) {
                    currentIdx = asRegisterIdx(-1);
                    contextMenu.open = false;
                }
            } imEditorContextMenuItemEnd(c);
        } imIfEnd(c);

        imFor(c); for (
            let bindingIdx = 0;
            bindingIdx < rack.bindings.length;
            bindingIdx++
        ) {
            const binding = rack.bindings[bindingIdx];
            if (perms === FIELD_WRITE && !binding.w) continue;
            if (perms === FIELD_READ && !binding.r) continue;

            imEditorContextMenuItemBegin(c); {
                imRegisterHighlightBg(c, editor, bindingIdx);

                imStr(c, "<"); imStr(c, binding.name); imStr(c, ">");

                if (elHasMousePress(c)) {
                    currentIdx = asRegisterIdx(bindingIdx);
                    contextMenu.open = false;
                }
            } imContextMenuItemEnd(c);
        } imForEnd(c);

        imEditorContextMenuItemBegin(c); {
            imStr(c, "+New binding");
            if (elHasMousePress(c)) {
                const idx = newBindingForEditor(editor);
                currentIdx = idx;
                contextMenu.open = false;
            }
        } imContextMenuItemEnd(c);
    } imContextMenuEnd(c, contextMenu);
    } imIfEnd(c);

    if (elHasMousePress(c)) {
        openContextMenuAtMouse(contextMenu);
    }

    if (value === null) {
        assert(currentIdx !== -1);
    }

    return currentIdx;
}

function imBindingEditor(
    c: ImCache,
    editor: EffectRackEditorState,
    currentIdx: RegisterIdx,
    effectIdx: number,
    hideWires = false,
): RegisterIdx {
    imLayout(c, ROW); {
        imBindingName(c, editor, currentIdx, effectIdx, hideWires);

        currentIdx = imBindingEditorContextMenu(c, editor, currentIdx, FIELD_WRITE, null);
    } imLayoutEnd(c);

    return currentIdx;
}

function imBindingName(
    c: ImCache,
    editor: EffectRackEditorState,
    currentIdx: RegisterIdx,
    effectIdx: number,
    hideWires: boolean,
) {
    const rack = editor.effectRack;

    if (isFirstishRender(c)) {
        elSetClass(c, "hoverable");
    }

    imRegisterHighlightBg(c, editor, currentIdx);

    if (imIf(c) && !hideWires) {
        let srcEffectIdx = -1, found = false;
        for (let i = effectIdx - 1; i >= 0; i--) {
            const effect = rack.effects[i];
            if (effect.dst === currentIdx) {
                srcEffectIdx = i;
                found = true;
                break;
            }
        }

        if (imIf(c) && found) {
            const wires = editor.ui.wires;
            const srcX = wires.outputPositions.x[srcEffectIdx];
            const srcY = wires.outputPositions.y[srcEffectIdx];

            const root = elGet(c);
            const rect = root.getBoundingClientRect();
            const dstX = rect.x + rect.width / 2;
            const dstY = rect.y + rect.height / 2;

            assert(editor.svgCtx != null);

            imElBeginExisting(c, editor.svgCtx.root); {
                imWire(c, srcX, srcY, dstX, dstY);
            } imElEndExisting(c, editor.svgCtx.root);
        } imIfEnd(c);
    } imIfEnd(c);

    const binding = rack.bindings[currentIdx]; assert(!!binding);
    imStr(c, "<");
    imStr(c, binding.name);
    imStr(c, ">");
}

function imWire(
    c: ImCache,
    srcX: number, srcY: number,
    dstX: number, dstY: number,
) {
    imElBeginSvg(c, EL_SVG_PATH); {
        if (isFirstishRender(c)) {
            elSetAttr(c, "stroke", "red");
            elSetAttr(c, "fill", "none");
            elSetAttr(c, "opacity", "0.3");
            elSetAttr(c, "stroke-width", "10");
        }

        if (imMemo(c, srcX) | imMemo(c, srcY) | imMemo(c, dstX) | imMemo(c, dstY)) {
            const mY = srcY + (dstY - srcY) / 2;
            const mX = srcX + (dstX - srcX) / 2;
            const bowing = 300;

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
                = `M ${srcX} ${srcY} Q ${srcX + bowing} ${mY}, ${mX} ${mY} T ${dstX} ${dstY}`

            elSetAttr(c, "d", newPath);
        }
    } imElEndSvg(c, EL_SVG_PATH);
}

function newBindingForEditor(editor: EffectRackEditorState): RegisterIdx {
    const newBinding = newEffectRackBinding("binding " + editor.effectRack.bindings.length, true, true);
    const idx = asRegisterIdx(editor.effectRack.bindings.length);
    editor.effectRack.bindings.push(newBinding);
    editor.edited = true;
    return idx;
}

// want to visualize the program somehow. 
function imOscilloscope(c: ImCache, s: OscilloscopeState) {
    imLayout(c, COL); imFlex(c); {
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
                s.viewVersion++;
            }

            let viewChanged = imMemo(c, s.viewVersion);
            if (viewChanged) {
                ctx.clearRect(0, 0, width, height);

                ctx.strokeStyle = "black";
                ctx.lineWidth = 3;
                drawSamples(
                    s.samples,
                    // Too performance-intensive to use arrayMax and arrayMin here over millions of samples.
                    -1, 1,
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
                s.viewVersion++;
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
                s.viewVersion++;
            }
        } imLayoutEnd(c);
    } imLayoutEnd(c);
}


function imRegisterHighlightBg(c: ImCache, editor: EffectRackEditorState, regIdx: number) {
    const isHighlighted = regIdx === editor.highlightedRegister;
    imBg(c, isHighlighted ? cssVarsApp.codeHighlight : "");

    if (elHasMouseOver(c)) {
        editor.highlightedRegisterNext = regIdx;
    }
}

function imInsertButton(c: ImCache, editor: EffectRackEditorState, insertIdx: number) {
    const rack = editor.effectRack;

    let toAdd: EffectRackItem | undefined;

    const contextMenu = imContextMenu(c);
    if (imIf(c) && contextMenu.open) {
        imContextMenuBegin(c, contextMenu); {
            if (imIf(c) && insertIdx !== -1) {
                imEditorContextMenuItemBegin(c); {
                    imStr(c, "Duplicate");
                    if (elHasMousePress(c)) {
                        const effect = rack.effects[insertIdx]; assert(!!effect);
                        toAdd = copyEffectRackItem(effect);
                    }
                } imContextMenuItemEnd(c);
            } imIfEnd(c);
            imEditorContextMenuItemBegin(c); {
                imStr(c, "Oscillator");
                if (elHasMousePress(c)) {
                    toAdd = newEffectRackItem(newEffectRackOscillator());
                }
            } imContextMenuItemEnd(c);
            imEditorContextMenuItemBegin(c); {
                imStr(c, "Envelope");
                if (elHasMousePress(c)) {
                    toAdd = newEffectRackItem(newEffectRackEnvelope());
                }
            } imContextMenuItemEnd(c);
            imEditorContextMenuItemBegin(c); {
                imStr(c, "Maths");
                if (elHasMousePress(c)) {
                    toAdd = newEffectRackItem(newEffectRackMaths());
            }
            } imContextMenuItemEnd(c);
            imEditorContextMenuItemBegin(c); {
                imStr(c, "Switch");
                if (elHasMousePress(c)) {
                    toAdd = newEffectRackItem(newEffectRackSwitch());
                }
            } imContextMenuItemEnd(c);
        } imContextMenuEnd(c, contextMenu);
    } imIfEnd(c);

    if (toAdd) {
        editor.deferredAction = () => {
            rack.effects.splice(insertIdx + 1, 0, toAdd);
            editor.edited = true;
        }
    }

    if (imButtonIsClicked(c, "+")) {
        openContextMenuAtMouse(contextMenu);
    }
}

type PresetsListState = {
    selectedId: number;
    renaming: boolean;

    error:         string;
    newName:       string;
};

function presetsListState(): PresetsListState {
    return {
        selectedId: 0,
        renaming: false,
        error: "",
        newName: "",
    };
}

function startRenamingPreset(s: PresetsListState, preset: EffectRackPreset) {
    assert(preset.id !== 0);
    s.selectedId = preset.id;
    s.renaming = true;
    s.newName = preset.name;
}

function stopRenaming(s: PresetsListState) {
    s.renaming = false;
}

function imPresetsList(
    c: ImCache,
    ctx: GlobalContext,
    editor: EffectRackEditorState
) {
    imHeading(c, "Presets");

    if (imMemo(c, true)) {
        loadAllEffectRackPresets(ctx.repo);
    }

    const s = imState(c, presetsListState);
    const presets = ctx.repo.effectRackPresets.allEffectRackPresets;
    const loading = ctx.repo.effectRackPresets.allEffectRackPresetsLoading.isPending();

    // UI could be better but for now I don't care too much.
    imLayout(c, COL); imFlex(c); {
        if (imIf(c) && loading) {
            imLayout(c, COL); imFlex(c, 2); {
                imStr(c, "Loading...");
            } imLayoutEnd(c);
        } else {
            imIfElse(c);

            if (imIf(c) && s.error) {
                imLayout(c, BLOCK); {
                    imStr(c, s.error);
                } imLayoutEnd(c);
            } imIfEnd(c);

            imLayout(c, ROW); imGap(c, 5, PX); imJustify(c); {
                if (imButtonIsClicked(c, "Create new preset")) {
                    const a = newAsyncContext("Saving preset");
                    const preset = effectRackToPreset(editor.effectRack);
                    const saved = waitForOne(a, createEffectRackPreset(ctx.repo, preset));
                    waitFor(a, [saved], () => startRenamingPreset(s, preset));
                }

                const selectedPreset = presets.find(p => p.id === s.selectedId);

                if (imButtonIsClicked(c, "Rename", false, !!selectedPreset) && selectedPreset) {
                    startRenamingPreset(s, selectedPreset);
                }

                if (imButtonIsClicked(c, "Delete", false, !!selectedPreset) && selectedPreset) {
                    deleteEffectRackPreset(ctx.repo, selectedPreset);
                    s.selectedId = 0;
                }
            } imLayoutEnd(c);

            imLayout(c, COL); imFlex(c); imScrollOverflow(c); {
                imFor(c); for (const preset of presets) {
                    const selected = preset.id === s.selectedId;

                    imKeyedBegin(c, preset); {
                        imLayout(c, BLOCK); imBg(c, selected ? cssVars.bg2 : ""); {
                            if (isFirstishRender(c)) {
                                elSetStyle(c, "cursor", "pointer");
                                elSetClass(c, "hoverable");
                                elSetClass(c, cn.userSelectNone);
                            }

                            if (elHasMousePress(c)) {
                                if (s.selectedId === preset.id) {
                                    s.selectedId = 0;
                                } else {
                                    try {
                                        editorImport(editor, preset.serialized);
                                        s.selectedId = preset.id;
                                        s.error = "";
                                    } catch (err) {
                                        s.error = "" + err;
                                    }
                                }
                            }

                            if (imIf(c) && selected && s.renaming) {
                                const ev = imTextInputOneLine(c, s.newName, "Enter preset name");
                                if (ev) {
                                    if (ev.newName) {
                                        s.newName = ev.newName;
                                        ctx.handled = true;
                                    }

                                    if (ev.submit) {
                                        preset.name = s.newName;
                                        stopRenaming(s);

                                        const a = newAsyncContext("Renaming preset " + preset.id);
                                        waitFor(a, [], () => updateEffectRackPreset(ctx.repo, preset));

                                        ctx.handled = true;
                                    }

                                    if (ev.cancel) {
                                        stopRenaming(s);
                                        editor.ui.modal = MODAL_NONE;
                                        ctx.handled = true;
                                    }
                                }
                            } else {
                                imIfElse(c);

                                imLayout(c, ROW); {
                                    imStr(c, preset.name);

                                    imFlex1(c);

                                    imStr(c, preset.serialized.length);
                                } imLayoutEnd(c);
                            } imIfEnd(c);
                        } imLayoutEnd(c);

                    } imKeyedEnd(c);
                } imForEnd(c);
            } imLayoutEnd(c);
        } imIfEnd(c);
    } imLayoutEnd(c);
}

// TODO: consolidate with imOscilloscope.
// Got like this because the 'sound lab' and 'effect rack editor' were two separate widgets for a while, 
// then I decided they shouldn't be. but I can;t be bothered consolidating these two yet.
function imOscilloscope2(c: ImCache, state: DspMockHarnessState) {
    const isNewFrame = imMemo(c, getRenderCount(c));

    const visibleStartChanged = imMemo(c, state.allSamplesVisibleStart);
    const visibleEndChanged = imMemo(c, state.allSamplesVisibleEnd);
    const numFrequencies = Math.min(state.allSamplesWindowLength, 1000);
    const numFrequenciesToView = Math.floor(numFrequencies / 2);
    // compute frequencies of what we're looking at
    if (visibleStartChanged || visibleEndChanged) {
        resizeNumberArrayPowerOf2(state.signalFftWindow, numFrequencies);
        copyArray(state.signalFftWindow, state.allSamples, state.allSamplesStartIdx, state.signalFftWindow.length);
        fft(state.frequenciesReal, state.frequenciesIm, state.signalFftWindow);
        fftToReal(state.frequencies, state.frequenciesReal, state.frequenciesIm);
    }

    imLayout(c, COL); imFlex(c); {
        imLayout(c, COL); imFlex(c); {
            imLayout(c, ROW); imAlign(c); {
                imStr(c, "Waveform ");

                imStr(c, " t=");
                imStr(c, (state.allSamplesStartIdx / state.dsp.sampleRate).toPrecision(3));
                imStr(c, " sample ");
                imStr(c, state.allSamplesStartIdx);
                imStr(c, " -> ");
                imStr(c, state.allSamplesStartIdx + state.allSamplesWindowLength);
            } imLayoutEnd(c);

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

                if (isNewFrame || resize) {
                    ctx.clearRect(0, 0, width, height);

                    const samples = state.allSamples;

                    const theme = getCurrentTheme();
                    ctx.strokeStyle = theme.fg.toString();
                    ctx.lineWidth = 3;
                    drawSamples(samples, -1, 1, plotState, ctx, state.allSamplesStartIdx, state.allSamplesWindowLength);
                }

            } imEndCanvasRenderingContext2D(c);

            if (state.autoPan) {
                state.allSamplesStartIdx = state.allSamples.length - 1 - state.allSamplesWindowLength
            }

            let [start, end, draggingStart, draggingEnd] = imRangeSlider(
                c,
                0, state.allSamples.length,
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
        imLayout(c, COL); imFlex(c); {
            imLayout(c, BLOCK); {
                imStr(c, "Frequencies (hz) (?)");
                imStr(c, " -> ");
                imStr(c, state.frequenciesReal.length);
                imStr(c, "hz (?)");
            } imLayoutEnd(c);

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

                if (resize || isNewFrame) {
                    ctx.clearRect(0, 0, width, height);

                    ctx.strokeStyle = "red";
                    ctx.lineWidth = 2;
                    const min = arrayMin(state.frequencies);;
                    const max = arrayMax(state.frequencies);
                    drawSamples(state.frequencies, min, max, plotState, ctx, state.frequenciesStartIdx, state.frequenciesLength);
                }

            } imEndCanvasRenderingContext2D(c);

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
    } imLayoutEnd(c);
}
