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
import { imCheckbox } from "src/components/checkbox";
import {
    BLOCK,
    COL,
    DisplayType,
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
    imLayoutBegin,
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
    ROW_REVERSE,
    SPACE_EVENLY,
    STRETCH
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
    defaultBindings,
    deserializeEffectRack,
    EFFECT_RACK_ITEM__BIQUAD_FILTER,
    EFFECT_RACK_ITEM__DELAY,
    EFFECT_RACK_ITEM__ENVELOPE,
    EFFECT_RACK_ITEM__MATHS,
    EFFECT_RACK_ITEM__NOISE,
    EFFECT_RACK_ITEM__OSCILLATOR,
    EFFECT_RACK_ITEM__SWITCH,
    EffectId,
    EffectRack,
    EffectRackItem,
    EffectRackOscillatorWaveType,
    EffectRackRegisters,
    getEffectRackOscillatorWaveTypeName,
    newEffectRack,
    newEffectRackBiquadFilter,
    newEffectRackDelay,
    newEffectRackEnvelope,
    newEffectRackItem,
    newEffectRackMaths,
    newEffectRackMathsItemCoefficient,
    newEffectRackMathsItemTerm,
    newEffectRackNoise,
    newEffectRackOscillator,
    newEffectRackRegisters,
    newEffectRackSwitch,
    newEffectRackSwitchCondition,
    OSC_WAVE__SAWTOOTH,
    OSC_WAVE__SAWTOOTH2,
    OSC_WAVE__SIN,
    OSC_WAVE__SQUARE,
    OSC_WAVE__TRIANGLE,
    REG_IDX_EFFECT_BINDINGS_START,
    RegisterIdx,
    RegisterIdxUi,
    serializeEffectRack,
    SWITCH_OP_GT,
    SWITCH_OP_LT,
    ValueRef
} from "src/dsp/dsp-loop-effect-rack";
import { getCurrentPlaySettings, getDspInfo, pressKey, updatePlaySettings } from "src/dsp/dsp-loop-interface";
import { createEffectRackPreset, deleteEffectRackPreset, EffectRackPreset, effectRackToPreset, loadAllEffectRackPresets, updateEffectRackPreset } from "src/state/data-repository";
import { getKeyForKeyboardKey } from "src/state/keyboard-state";
import { arrayMove, copyArray, filterInPlace, removeItem, resizeObjectPool, resizeValuePool } from "src/utils/array-utils";
import { assert, unreachable } from "src/utils/assert";
import { CssColor, newColor, newColorFromHsv, rgbaToCssString } from "src/utils/colour";
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
import { EL_B, EL_I, EL_SVG_PATH, elHasMouseOver, elHasMousePress, elSetAttr, elSetClass, elSetStyle, getGlobalEventSystem, imEl, imElBeginExisting, imElBeginSvg, imElEnd, imElEndExisting, imElEndSvg, imStr, imStrFmt, imSvgContext, SvgContext } from "src/utils/im-dom";
import { arrayMax, arrayMin } from "src/utils/math-utils";
import { getNoteFrequency, getNoteIndex } from "src/utils/music-theory-utils";
import { newAsyncContext, waitFor, waitForOne } from "src/utils/promise-utils";
import { canRedo, canUndo, JSONUndoBuffer, newJSONUndoBuffer, redo, stepUndoBufferTimer, undo, undoBufferIsEmpty, writeToUndoBuffer, writeToUndoBufferDebounced } from "src/utils/undo-buffer-json";
import { utf16ByteLength } from "src/utils/utf8";
import { GlobalContext, setViewChartSelect } from "./app";
import { imExportModal, imImportModal } from "./import-export-modals";
import { imKeyboard } from "./keyboard";
import { drawSamples, imPlotBegin, imPlotEnd } from "./plotting";
import { DRAG_TYPE_CIRCULAR, imParameterSliderInteraction } from "./sound-lab-drag-slider";
import { cssVarsApp, getCurrentTheme } from "./styling";

const MAX_NUM_FREQUENCIES = 4096 * 2 * 2;

const MOCK_SAMPLE_RATE = 44100;

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
        dsp: newDspState(MOCK_SAMPLE_RATE),

        allSamples: [0],
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

const MODAL_NONE = 0;
const MODAL_EXPORT = 1;
const MODAL_IMPORT = 2;
const MODAL_NEW_PRESET = 3;

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
    };

    ui: {
        modal: number;
        presetsPanel: boolean;

        wires: BindingSvgWire;
    };

    version: number;

    highlightedValueRef: ValueRef;
    highlightedValueRefNext: ValueRef;

    svgCtx: SvgContext | null;

    deferredAction: (() => void) | null;
};

type BindingSvgWire = {
    outputPositions: {
        x: number[];
        y: number[]
        registerIdx: number[];
        colours: CssColor[];
        signalBuffers: Ringbuffer[];
    };

    drag: {
        // must always be the output of an effect.
        // right now, all effects just have 1 output.
        // -1 if not dragging.
        outputEffectId: EffectId | undefined;

        registerInput: RegisterIdxUi | undefined;
        registerInputEffectId: EffectId | undefined;

        registerInputClientX: number;
        registerInputClientY: number;

        toRegisterInput: boolean;
    }
};

export function newEffectRackEditorState(effectRack: EffectRack): EffectRackEditorState {
    const state: EffectRackEditorState = {
        effectRack: effectRack,
        undoBuffer: newJSONUndoBuffer<EffectRackEditorState>(1000),

        mockDspHarness: dspMockHarnessState(),

        signalPreview: {
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
        },

        ui: {
            modal: MODAL_NONE,
            presetsPanel: false,

            wires: {
                outputPositions: {
                    x: [],
                    y: [],
                    registerIdx: [],
                    colours: [],
                    signalBuffers: [],
                },

                drag: {
                    outputEffectId: undefined,
                    registerInput: undefined,
                    registerInputEffectId: undefined,
                    registerInputClientX: 0,
                    registerInputClientY: 0,
                    toRegisterInput: false,
                }
            },
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
        writeToUndoBuffer(editor.undoBuffer, editor.effectRack, editUndoActionId);
        editUndoActionId = undefined;
    } else {
        if (!wasUndoTraversed) {
            writeToUndoBufferDebounced(editor.undoBuffer, editor.effectRack, UNDO_DEBOUNCE_SECONDS);
        }
    }
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

function createConnection(editor: EffectRackEditorState, src: EffectId, dst: RegisterIdxUi) {
    dst.valueRef = { effectId: src };
    onEdited(editor);
}

const dragColour = newColor(0, 0, 0, 1);

export function imEffectRackEditor(c: ImCache, ctx: GlobalContext) {
    const settings = getCurrentPlaySettings();

    let editor = imGet(c, newEffectRackEditorState);
    if (!editor) {
        editor = imSet(c, newEffectRackEditorState(settings.parameters.rack));
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
            if (wires.drag.outputEffectId !== undefined && !mouse.leftMouseButton) {
                if (wires.drag.registerInput) {
                    createConnection(editor, wires.drag.outputEffectId, wires.drag.registerInput);
                }

                wires.drag.registerInput = undefined;
                wires.drag.outputEffectId = undefined;
            }

            wires.drag.registerInput = undefined;
        } else {
            if (wires.drag.registerInput !== undefined && !mouse.leftMouseButton) {
                if (wires.drag.outputEffectId !== undefined) {
                    createConnection(editor, wires.drag.outputEffectId, wires.drag.registerInput);
                }

                wires.drag.registerInput = undefined;
                wires.drag.outputEffectId = undefined;
            }

            wires.drag.outputEffectId = undefined;
        }

        resizeValuePool(wires.outputPositions.x, editor.effectRack.effects.length, 0);
        resizeValuePool(wires.outputPositions.y, editor.effectRack.effects.length, 0);
        resizeValuePool(wires.outputPositions.registerIdx, editor.effectRack.effects.length, 0);

        resizeObjectPool(wires.outputPositions.signalBuffers, () => newRingbuffer(10), editor.effectRack.effects.length);
        for(let i = 0; i < editor.effectRack.effects.length; i++) {
            let total = 0;

            for (const [num, osc] of editor.mockDspHarness.dsp.playingOscillators) {
                total += osc.state._effectRackRegisters.values[REG_IDX_EFFECT_BINDINGS_START + i];
            }

            const effect = editor.effectRack.effects[i];
            const rb = wires.outputPositions.signalBuffers[effect.id]; assert(!!rb);
            pushValueToRingbuffer(rb, total);
            rb.metric = arrayMax(rb.buff);
        }


        if (wires.outputPositions.colours.length !== editor.effectRack.effects.length) {
            resizeObjectPool(wires.outputPositions.colours, () => newColor(0, 0, 0, 0), editor.effectRack.effects.length);
            for (let i = 0; i < editor.effectRack.effects.length; i++) {
                const effect = editor.effectRack.effects[i];
                wires.outputPositions.colours[effect.id] = newColorFromHsv((effect.id / editor.effectRack.effects.length) % 1, 1, 0.5);
            }
        }

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

    editor.highlightedValueRef.regIdx = editor.highlightedValueRefNext.regIdx;
    editor.highlightedValueRef.effectId = editor.highlightedValueRefNext.effectId;
    editor.highlightedValueRefNext.regIdx = undefined;
    editor.highlightedValueRefNext.effectId = undefined;

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
            let keyFrequency = getNoteFrequency(s.noteIdx);

            const t0 = performance.now();

            compileEffectRack(editor.effectRack);

            const t1 = performance.now();
            editor.compileStats.compileTime = t1 - t0;
            editor.compileStats.numSamples = s.samples.length;

            const samplePressedIdx = s.signalPressRange.idx;
            const sampleReleasedIdx = s.signalPressRange.idx + s.signalPressRange.len;

            for (let i = 0; i < s.samples.length; i++) {
                let signal = 0;
                if (samplePressedIdx < i && i < sampleReleasedIdx) {
                    signal = 1;
                }

                s.samples[i] = computeEffectRackIteration(
                    rack,
                    s.registers,
                    keyFrequency,
                    signal,
                    MOCK_SAMPLE_RATE,
                    i === 0
                );
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
                    state.allSamples.length = 0;

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
                        if (imButtonIsClicked(c, "Undo", false, canUndo(editor.undoBuffer))) {
                            editor.deferredAction = () => editorUndo(editor);
                        }

                        if (imButtonIsClicked(c, "Redo", false, canRedo(editor.undoBuffer))) {
                            editor.deferredAction = () => editorRedo(editor);
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

                        if (imIf(c) && wires.drag.outputEffectId !== undefined || wires.drag.registerInput !== undefined) {
                            imElBeginExisting(c, editor.svgCtx.root); {
                                const mouse = getGlobalEventSystem().mouse;
                                let srcX = mouse.X, srcY = mouse.Y;
                                let dstX = mouse.X, dstY = mouse.Y;

                                if (wires.drag.toRegisterInput && wires.drag.outputEffectId !== undefined) {
                                    srcX = wires.outputPositions.x[wires.drag.outputEffectId];
                                    srcY = wires.outputPositions.y[wires.drag.outputEffectId];
                                } else {
                                    dstX = wires.drag.registerInputClientX;
                                    dstY = wires.drag.registerInputClientY;
                                }

                                imWire(
                                    c,
                                    srcX, srcY, dstX, dstY,
                                    dragColour.r, dragColour.g, dragColour.b, 1,
                                );
                            } imElEndExisting(c, editor.svgCtx.root);
                        } imIfEnd(c);

                        // don't mutate effects while iterating - assign to this instead
                        let deferredAction: (() => void) | undefined;

                        const effectsDnd = imDragAndDrop(c);
                        if (effectsDnd.moved) {
                            const { a, b } = effectsDnd.moved;
                            arrayMove(editor.effectRack.effects, a, b);
                            onEdited(editor);
                        }

                        imFor(c); for (let effectPos = 0; effectPos < rack.effects.length; effectPos++) {
                            const effect = rack.effects[effectPos];

                            imKeyedBegin(c, effect); {
                                const effectDisabled = (rack._debugEffectPos !== -1 && effectPos > rack._debugEffectPos);editor

                                const z = imDragZoneBegin(c, effectsDnd, effectPos); {
                                    imLayout(c, COL); imFlex(c); {
                                        imLayout(c, ROW); imAlign(c);
                                        imPadding(c, 5, PX, 5, PX, 0, PX, 5, PX); imGap(c, 5, PX); {
                                            imFg(c, effectDisabled ? cssVars.mg : "");

                                            imDropZoneForPrototyping(c, effectsDnd, effectPos);

                                            let name = "???";
                                            switch (effect.value.type) {
                                                case EFFECT_RACK_ITEM__OSCILLATOR: name = "OSC";    break;
                                                case EFFECT_RACK_ITEM__ENVELOPE:   name = "ENV";    break;
                                                case EFFECT_RACK_ITEM__MATHS:      name = "MATHS";  break;
                                                case EFFECT_RACK_ITEM__SWITCH:     name = "SWITCH"; break;
                                                case EFFECT_RACK_ITEM__NOISE:      name = "NOISE";  break;
                                                case EFFECT_RACK_ITEM__DELAY:      name = "DELAY";  break;
                                                case EFFECT_RACK_ITEM__BIQUAD_FILTER: name = "FILTER";  break;
                                                default: unreachable(effect.value);
                                            }

                                            imVerticalText(c); imAlign(c); imGap(c, 10, PX); {
                                                imLayout(c, ROW); {
                                                    const isDebugging = effectPos === rack._debugEffectPos;
                                                    const ev = imCheckbox(c, isDebugging);
                                                    if (ev) {
                                                        if (ev.checked) {
                                                            rack._debugEffectPos = effectPos;
                                                        } else {
                                                            rack._debugEffectPos = -1;
                                                        }
                                                        onEdited(editor);
                                                    }
                                                } imLayoutEnd(c);

                                                imLayout(c, ROW); {
                                                    imDragHandle(c, effectsDnd, effectPos);

                                                    imStr(c, name);
                                                } imLayoutEnd(c);
                                            } imLayoutEnd(c);

                                            imLine(c, LINE_VERTICAL, 5);

                                            // imLine(c, LINE_VERTICAL, 5);

                                            imDspVisualGroupBegin(c, ROW); imFlex(c); imJustify(c); {
                                                imLayout(c, ROW); imFlex(c); {
                                                    if (isFirstishRender(c)) {
                                                        elSetStyle(c, "flexWrap", "wrap");
                                                    }

                                                    const effectValue = effect.value;
                                                    imSwitch(c, effectValue.type); switch (effectValue.type) {
                                                        case EFFECT_RACK_ITEM__OSCILLATOR: {
                                                            const osc = effectValue;

                                                            imValueOrBindingEditor(c, editor, effectPos, osc.amplitudeUI, BINDING_UI_ROW);

                                                            imSpacingSymbol(c, " * ", true);

                                                            const contextMenu = imContextMenu(c);
                                                            if (imIf(c) && contextMenu.open) {
                                                                imContextMenuBegin(c, contextMenu); {
                                                                    imFor(c); for (const type of allWaveTypes) {
                                                                        imEditorContextMenuItemBegin(c); {
                                                                            if (elHasMousePress(c)) {
                                                                                osc.waveType = type;
                                                                                onEdited(editor);
                                                                            }
                                                                            imStrFmt(c, type, getEffectRackOscillatorWaveTypeName);
                                                                        } imEditorContextMenuItemEnd(c);
                                                                    } imForEnd(c);
                                                                } imContextMenuEnd(c, contextMenu);
                                                            } imIfEnd(c);

                                                            if (imButtonIsClicked(c, getEffectRackOscillatorWaveTypeName(osc.waveType))) {
                                                                openContextMenuAtMouse(contextMenu);
                                                            }

                                                            imSpacingSymbol(c, "");

                                                            imDspVisualGroupBegin(c, ROW); {
                                                                imDspVisualGroupBegin(c, ROW); {
                                                                    imValueOrBindingEditor(c, editor, effectPos, osc.frequencyUI, BINDING_UI_ROW);
                                                                    imValueOrBindingEditor(c, editor, effectPos, osc.frequencyMultUI, BINDING_UI_ROW);
                                                                } imDspVisualGroupEnd(c);
                                                                imValueOrBindingEditor(c, editor, effectPos, osc.phaseUI, BINDING_UI_ROW);
                                                            } imDspVisualGroupEnd(c);

                                                            imSpacingSymbol(c, " + ", true);

                                                            imValueOrBindingEditor(c, editor, effectPos, osc.offsetUI, BINDING_UI_ROW);
                                                        } break;
                                                        case EFFECT_RACK_ITEM__ENVELOPE: {
                                                            const envelope = effectValue;

                                                            imValueOrBindingEditor(c, editor, effectPos, envelope.toModulateUI);

                                                            imSpacingSymbol(c, " * ");

                                                            imDspVisualGroupBegin(c, ROW); imFlex(c); imJustify(c, SPACE_EVENLY); {
                                                                imValueOrBindingEditor(c, editor, effectPos, envelope.signalUI);
                                                                imValueOrBindingEditor(c, editor, effectPos, envelope.attackUI);
                                                                imValueOrBindingEditor(c, editor, effectPos, envelope.decayUI);
                                                                imValueOrBindingEditor(c, editor, effectPos, envelope.sustainUI);
                                                                imValueOrBindingEditor(c, editor, effectPos, envelope.releaseUI);
                                                            } imDspVisualGroupEnd(c);
                                                        } break;
                                                        case EFFECT_RACK_ITEM__MATHS: {
                                                            const math = effectValue;

                                                            imLayout(c, COL); imAlign(c); imGap(c, 10, PX); {
                                                                imFor(c); for (let termIdx = 0; termIdx < math.terms.length; termIdx++) {
                                                                    const term = math.terms[termIdx];
                                                                    imDspVisualGroupBegin(c, ROW); imAlign(c); imGap(c, 10, PX); {
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
                                                                                    onEdited(editor);
                                                                                };
                                                                            }
                                                                        } imLayoutEnd(c);

                                                                        imFor(c); for (let coIdx = 0; coIdx < term.coefficients.length; coIdx++) {
                                                                            const co = term.coefficients[coIdx];
                                                                            imLayout(c, ROW); imJustify(c); {
                                                                                if (imMemo(c, co)) co.valueUI._name = "x" + termIdx.toString() + coIdx.toString();
                                                                                imValueOrBindingEditor(c, editor, effectPos, co.valueUI, BINDING_UI_ROW);

                                                                                if (imButtonIsClicked(c, "-")) {
                                                                                    deferredAction = () => {
                                                                                        filterInPlace(term.coefficients, coOther => coOther !== co);
                                                                                        onEdited(editor);
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
                                                                            onEdited(editor);
                                                                        }
                                                                    } imDspVisualGroupEnd(c);

                                                                    if (imIf(c) && termIdx < math.terms.length - 1) {
                                                                        imStr(c, " + ");
                                                                    } imIfEnd(c);

                                                                } imForEnd(c);

                                                                if (imButtonIsClicked(c, "+")) {
                                                                    const term = newEffectRackMathsItemTerm();
                                                                    math.terms.push(term);
                                                                    onEdited(editor);
                                                                }
                                                            } imLayoutEnd(c);
                                                        } break;
                                                        case EFFECT_RACK_ITEM__SWITCH: {
                                                            const switchEffect = effectValue;

                                                            imFlex1(c);

                                                            imLayout(c, COL); {
                                                                imFor(c); for (let i = 0; i < switchEffect.conditions.length; i++) {
                                                                    const cond = switchEffect.conditions[i];

                                                                    imDspVisualGroupBegin(c, ROW); {
                                                                        imValueOrBindingEditor(c, editor, effectPos, cond.aUi, BINDING_UI_ROW);

                                                                        if (imButtonIsClicked(c, cond.operator === SWITCH_OP_LT ? "<" : ">")) {
                                                                            if (cond.operator === SWITCH_OP_LT) {
                                                                                cond.operator = SWITCH_OP_GT;
                                                                                onEdited(editor);
                                                                            } else {
                                                                                cond.operator = SWITCH_OP_LT;
                                                                                onEdited(editor);
                                                                            }
                                                                        }

                                                                        imValueOrBindingEditor(c, editor, effectPos, cond.bUi, BINDING_UI_ROW);

                                                                        imValueOrBindingEditor(c, editor, effectPos, cond.valUi, BINDING_UI_ROW);

                                                                        if (imButtonIsClicked(c, "-")) {
                                                                            deferredAction = () => {
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
                                                                    imValueOrBindingEditor(c, editor, effectPos, switchEffect.defaultUi, BINDING_UI_ROW);
                                                                } imDspVisualGroupEnd(c);
                                                            } imLayoutEnd(c);
                                                        } break;
                                                        case EFFECT_RACK_ITEM__NOISE: {
                                                            const noise = effectValue;

                                                            imValueOrBindingEditor(c, editor, effectPos, noise.amplitudeUi);
                                                        } break;
                                                        case EFFECT_RACK_ITEM__DELAY: {
                                                            const delay = effectValue;

                                                            imLayout(c, BLOCK); {
                                                                imDspVisualGroupBegin(c, ROW); {
                                                                    imValueOrBindingEditor(c, editor, effectPos, delay.signalUi);

                                                                    imSpacingSymbol(c, " -> ");

                                                                    imValueOrBindingEditor(c, editor, effectPos, delay.secondsUi);

                                                                    imSpacingSymbol(c, " -> ");
                                                                } imDspVisualGroupEnd(c);

                                                                imLayout(c, BLOCK); {
                                                                    imStr(c, "Due to the high memory usage of this effect, the max delay has been artifically limited to 1 second");
                                                                } imLayoutEnd(c);
                                                            } imLayoutEnd(c);
                                                        } break;
                                                        case EFFECT_RACK_ITEM__BIQUAD_FILTER: {
                                                            const filter = effectValue;

                                                            const filterUi = imGet(c, imEffectRackEditor) ?? imSet(c, {
                                                                analyzing: false,
                                                                compact: false,
                                                            });
                                                            if (imMemo(c, filterUi)) filterUi.compact = true;

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

                                                                        assert(filter.type === EFFECT_RACK_ITEM__BIQUAD_FILTER);
                                                                        const registers = newEffectRackRegisters();

                                                                        compileEffectRack(rack);
                                                                        const keyFrequency = getNoteIndex("A", 3);

                                                                        rack._registersTemplate.values[filter._signal] = 1;
                                                                        s.impulseResponse[0] = computeEffectRackIteration(
                                                                            rack,
                                                                            registers,
                                                                            keyFrequency,
                                                                            1,
                                                                            MOCK_SAMPLE_RATE,
                                                                            true
                                                                        );

                                                                        rack._registersTemplate.values[filter._signal] = 0;
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

                                                                    imLayout(c, BLOCK); imStr(c, "Impulse response (time)"); imLayoutEnd(c);
                                                                    imLayoutBegin(c, COL); imSize(c, 0, NA, 200, PX); {
                                                                        imOscilloscope(c, s.osc, s.impulseResponse, "blue");
                                                                    } imLayoutEnd(c);
                                                                    imLayout(c, BLOCK); imStr(c, "Impulse response (frequency)"); imLayoutEnd(c);
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
                                                                } imIfEnd(c);
                                                            } imLayoutEnd(c);
                                                        } break;
                                                        default: unreachable(effectValue);
                                                    } imSwitchEnd(c);
                                                } imLayoutEnd(c);

                                                imSpacingSymbol(c, " -> ");

                                                imDspVisualGroupBegin(c, ROW); imRelative(c); {
                                                    elDropWireToEffectOutput(c, editor, effect.id);

                                                    imRegisterHighlightBg(c, editor, undefined, effect.id);

                                                    imResultName(c, editor, effectPos, effectPos + 1);

                                                    imLayout(c, BLOCK); imSize(c, 4, PX, 10, NA); imLayoutEnd(c);

                                                    const root = imWireDragEndpoint(c, editor, effect, null);
                                                    const rect = root.getBoundingClientRect();
                                                    const x = rect.x + rect.width / 2;
                                                    const y = rect.y + rect.height / 2;

                                                    wires.outputPositions.x[effect.id] = x;
                                                    wires.outputPositions.y[effect.id] = y;
                                                    wires.outputPositions.registerIdx[effect.id] = effect._dst;
                                                } imLayoutEnd(c);


                                            } imDspVisualGroupEnd(c);

                                            imLayout(c, COL); imGap(c, 5, PX); imJustify(c); {
                                                if (imButtonIsClicked(c, "-")) {
                                                    deferredAction = () => {
                                                        effect._toDelete = true;
                                                        onEdited(editor);
                                                    }
                                                }

                                                imInsertButton(c, editor, effectPos);
                                            } imLayoutEnd(c);
                                        } imLayoutEnd(c);
                                    } imLayoutEnd(c);
                                } imDragZoneEnd(c, z, effectPos);
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

            imLayout(c, BLOCK); imSize(c, 0, NA, 5, PX); imBg(c, cssVars.bg); imRelative(c); {
                const percentage = 100 * editor.undoBuffer.fileVersionsJSONSizeMb / 5.0;
                imLayout(c, BLOCK); imBg(c, cssVars.fg);
                imAbsolute(c, 0, PX, 0, NA, 0, PX, 0, PX); imSize(c, percentage, PERCENT, 5, PX); {
                } imLayoutEnd(c);
            } imLayoutEnd(c);
        } imLayoutEnd(c);

        imLine(c, LINE_VERTICAL_PADDING);
        imLine(c, LINE_VERTICAL);
        imLine(c, LINE_VERTICAL_PADDING);

        imLayout(c, COL); imFlex(c, 2); {
            imLayout(c, ROW); imHeading(c, "Actual waveform"); imLayoutEnd(c);

            imLayout(c, COL); imFlex(c, 2); {
                imOscilloscope2(c, editor.mockDspHarness)
            } imLayoutEnd(c);

            imLayout(c, COL); imFlex(c, 3); {
                imLine(c, LINE_HORIZONTAL, 2);
                
                imLayout(c, ROW); imGap(c, 5, PX); {
                    if (imButtonIsClicked(c, "Wave preview", !editor.ui.presetsPanel)) {
                        editor.ui.presetsPanel = false;
                    }

                    if (imButtonIsClicked(c, "Presets", editor.ui.presetsPanel)) {
                        editor.ui.presetsPanel = true;
                    }
                } imLayoutEnd(c);

                if (imIf(c) && editor.ui.presetsPanel) {
                    imLayout(c, COL); imFlex(c); {
                        imPresetsList(c, ctx, editor);
                    } imLayoutEnd(c);
                } else {
                    imIfElse(c);

                    imLayout(c, ROW); imHeading(c, "Waveform preview"); imLayoutEnd(c);

                    imLayout(c, COL); imFlex(c); {
                        const s = editor.signalPreview;
                        imOscilloscope(c, s.oscilloscope, s.samples);
                        imSampleRangeSlider(c, s.signalPressRange, s.samples.length, "Signal: ");
                    } imLayoutEnd(c);

                    imLayout(c, ROW); imAlign(c); imJustify(c); imFlex(c, 1); {
                        imKeyboard(c, ctx);
                    } imLayoutEnd(c);
                } imIfEnd(c);
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


function imSpacingSymbol(c: ImCache, symbol: string, flex = false) {
    imLayout(c, ROW); imAlign(c); imJustify(c); imNoWrap(c); imSize(c, 50, PX, 0, NA); imFlex(c, flex ? 1 : - 1); {
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

function editorImport(editor: EffectRackEditorState, json: string) {
    const effectRack: EffectRack = deserializeEffectRack(json);
    if (!effectRack.effects || !Array.isArray(effectRack.effects)) {
        throw new Error("Wrong JSON format");
    }

    // Try computing a sample. Does it work??
    compileEffectRack(effectRack);
    const registers = newEffectRackRegisters();
    const f = getNoteFrequency(getNoteIndex("C", 4));
    computeEffectRackIteration(effectRack, registers, f, 1, 48000, true);

    // If we reach here, then yeah its probably legit...
    editor.effectRack = effectRack;
    onEdited(editor, false, ACTION_ID_IMPORT);
}

function registerValueToString(num: number) {
    return num.toFixed(4);
}

// @deprecated.
const BINDING_UI_ROW = 1 << 0;
const BINDING_IS_OUTPUT = 1 << 1;

function imDspVisualGroupBegin(c: ImCache, type: DisplayType, enabled: boolean = true) {
    imLayout(c, type); imAlign(c); imJustify(c); imNoWrap(c); imGap(c, 5, PX); {
        if (imMemo(c, enabled)) {
            elSetStyle(c, "border", !enabled ? "" : "1px solid " + cssVars.fg);
            elSetStyle(c, "padding", !enabled ? "" :"5px");
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
    reg: RegisterIdxUi,
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
        elDropWireToRegisterInput(c, editor, reg);

        imRegisterHighlightBg(c, editor, undefined, reg.valueRef.effectId);

        if (imIf(c) && !isOutput) {
            const effect = rack.effects[effectPos]; assert(!!effect);
            imWireDragEndpoint(c, editor, effect, reg);
        } imIfEnd(c);

        imLayout(c, row ? ROW_REVERSE : COL); imAlign(c); imJustify(c); imGap(c, 4, row ? PX : NA); {
            imLayout(c, BLOCK); {
                if (imIf(c) && reg.valueRef.value !== undefined && !isOutput) {
                    imStrFmt(c, reg.valueRef.value, registerValueToString);

                    let dragEvent = imParameterSliderInteraction(c, reg._min, reg._max, 0.0001, reg.valueRef.value, 0, DRAG_TYPE_CIRCULAR);
                    if (dragEvent) {
                        reg.valueRef.value = dragEvent.val;
                        onEdited(editor);
                    }
                } else if (imIfElse(c) && reg.valueRef.regIdx !== undefined && !isOutput) {
                    imLayout(c, ROW); {
                        imRegisterHighlightBg(c, editor, reg.valueRef.regIdx, reg.valueRef.effectId);

                        imStr(c, "<var=");
                        imStr(c, defaultBindings[reg.valueRef.regIdx].name);
                        imStr(c, ">");
                    } imLayoutEnd(c);
                } else if (imIfElse(c) && reg.valueRef.effectId !== undefined) {
                    imLayout(c, ROW); {
                        imRegisterHighlightBg(c, editor, reg.valueRef.regIdx, reg.valueRef.effectId);

                        imResultName(c, editor, editor.effectRack._effectIdToEffectPos[reg.valueRef.effectId], effectPos);
                    } imLayoutEnd(c);
                    imIfElse(c);
                } else {
                    imIfElse(c);

                    imStr(c, "????");
                } imIfEnd(c);
            } imLayoutEnd(c);

            imLayout(c, BLOCK); {
                if (isFirstishRender(c)) {
                    elSetStyle(c, "fontSize", "1rem");
                    elSetStyle(c, "userSelect", "none");
                    elSetStyle(c, "fontWeight", "bold");
                    elSetClass(c, "hoverable");
                }

                imStr(c, reg._name);
                imStr(c, row ? ":" : "");

                imBindingEditorContextMenu(
                    c,
                    editor,
                    effectPos,
                    reg,
                    isOutput ? reg.valueRef.value : null,
                );
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
    currentEffectPos: number,
    reg: RegisterIdxUi,
    value: number | null | undefined,
) {
    const rack = editor.effectRack;

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


            imFor(c); for (
                let effectPos = 0;
                effectPos < currentEffectPos; // can't depend on results after this effect
                effectPos++
            ) {
                const effect = rack.effects[effectPos]; assert(!!effect);

                imEditorContextMenuItemBegin(c); {
                    imRegisterHighlightBg(c, editor, undefined, effect.id);

                    imResultName(c, editor, effectPos, currentEffectPos);

                    if (elHasMousePress(c)) {
                        reg.valueRef = { effectId: effect.id };
                        onEdited(editor);
                        contextMenu.open = false;
                    }
                } imContextMenuItemEnd(c);
            } imForEnd(c);
        } imContextMenuEnd(c, contextMenu);
    } imIfEnd(c);

    if (elHasMousePress(c)) {
        openContextMenuAtMouse(contextMenu);
    }
}

function imResultName(
    c: ImCache,
    editor: EffectRackEditorState,
    effectPos: number,
    thisEffectPos: number,
) {
    imStr(c, "r");
    imStr(c, effectPos);

    if (imIf(c) && thisEffectPos <= effectPos) {
        imStr(c, "(!)");
    } imIfEnd(c);
}

function getSrcEffectIdx(rack: EffectRack, dstEffectIdx: number, regIdx: RegisterIdx) {
    let srcEffectIdx = -1;
    for (let i = dstEffectIdx - 1; i >= 0; i--) {
        const effect = rack.effects[i];
        if (effect._dst === regIdx) {
            srcEffectIdx = i;
            break;
        }
    }
    return srcEffectIdx;
}

type Ringbuffer = {
    buff: number[];
    i: number;
    metric: number;
}

function newRingbuffer(count: number): Ringbuffer {
    return {
        buff: new Array(count).fill(0),
        i: 0,
        metric: 0,
    };
}

function pushValueToRingbuffer(rb: Ringbuffer, val: number) {
    rb.buff[rb.i] = val;
    rb.i += 1;
    if (rb.i >= rb.buff.length) {
        rb.i = 0;
    }
}

function imWireDragEndpoint(
    c: ImCache,
    editor: EffectRackEditorState,
    effect: EffectRackItem,
    reg: RegisterIdxUi | null, // if null, it's an output
) {
    const wires = editor.ui.wires;

    let isEligibleDropZone = false;
    if (wires.drag.registerInput !== undefined && !wires.drag.toRegisterInput) {
        isEligibleDropZone = false;

        assert(wires.drag.registerInputEffectId !== undefined);

        if (reg === null) {
            isEligibleDropZone = true;
        }
    } else if (wires.drag.outputEffectId !== undefined && wires.drag.toRegisterInput) {
        if (reg) {
            isEligibleDropZone = true;
        }
    }

    const root = imLayout(c, ROW); imAlign(c); imJustify(c); imSize(c, 30, PX, 30, PX); 
    imBg(c, isEligibleDropZone ? cssVars.mg : cssVars.bg2); {
        if (isFirstishRender(c)) {
            elSetStyle(c, "borderRadius", "1000px");
            elSetStyle(c, "cursor", "move");
        }

        if (!reg) {
            elDragWireToRegisterInput(c, editor, effect.id, null);
        } else {
            if (reg.valueRef.effectId !== undefined) {
                elDragWireToRegisterInput(c, editor, reg.valueRef.effectId, reg);
            } else {
                const rect = root.getBoundingClientRect();
                const dstX = rect.x + rect.width / 2;
                const dstY = rect.y + rect.height / 2;
                elDragWireToEffectOutput(c, editor, reg, effect.id, dstX, dstY);
            }
        }

        if (imIf(c) && reg?.valueRef.effectId !== undefined) {
            const srcX = wires.outputPositions.x[reg.valueRef.effectId];
            const srcY = wires.outputPositions.y[reg.valueRef.effectId];

            const rect = root.getBoundingClientRect();
            const dstX = rect.x + rect.width / 2;
            const dstY = rect.y + rect.height / 2;

            assert(editor.svgCtx != null);

            imElBeginExisting(c, editor.svgCtx.root); {
                const color = wires.outputPositions.colours[reg.valueRef.effectId]
                const signalValues = wires.outputPositions.signalBuffers[reg.valueRef.effectId];

                imWire(
                    c,
                    srcX, srcY, dstX, dstY,
                    color.r, color.g, color.b, 0.3 + (1 - 0.3) * signalValues.metric,
                );
            } imElEndExisting(c, editor.svgCtx.root);
        } imIfEnd(c);
    } imLayoutEnd(c);

    return root;
}

function elDragWireToRegisterInput(
    c: ImCache,
    editor: EffectRackEditorState,
    effectIdToDrag: EffectId | undefined,
    reg: RegisterIdxUi | null,
) {
    const wires = editor.ui.wires;
    const mouse = getGlobalEventSystem().mouse;
    if (wires.drag.outputEffectId === undefined && elHasMousePress(c) && mouse.leftMouseButton) {
        if (effectIdToDrag !== undefined) {
            if (reg) {
                reg.valueRef = { value: reg._defaultValue };
                onEdited(editor);
            }
            wires.drag.outputEffectId = effectIdToDrag;
            wires.drag.toRegisterInput = true;
        }
    }
}

function elDragWireToEffectOutput(
    c: ImCache,
    editor: EffectRackEditorState,
    reg: RegisterIdxUi,
    effectId: EffectId,
    clientX: number, clientY: number
) {
    const wires = editor.ui.wires;
    const mouse = getGlobalEventSystem().mouse;
    if (wires.drag.registerInput === undefined && elHasMousePress(c) && mouse.leftMouseButton) {
        wires.drag.registerInput = reg;
        wires.drag.registerInputEffectId = effectId;
        wires.drag.toRegisterInput = false;
    }

    if (wires.drag.registerInput === reg) {
        wires.drag.registerInputClientX = clientX;
        wires.drag.registerInputClientY = clientY;
    }
}

function elDropWireToRegisterInput(c: ImCache, editor: EffectRackEditorState, reg: RegisterIdxUi) {
    const wires = editor.ui.wires;

    if (wires.drag.outputEffectId !== undefined && elHasMouseOver(c)) {
        wires.drag.registerInput = reg;
    }
}

function elDropWireToEffectOutput(c: ImCache, editor: EffectRackEditorState, effectIdToDrop: EffectId) {
    const wires = editor.ui.wires;
    if (wires.drag.registerInput !== undefined && elHasMouseOver(c)) {
        wires.drag.outputEffectId = effectIdToDrop;
    }
}

function imWire(
    c: ImCache,
    srcX: number, srcY: number,
    dstX: number, dstY: number,
    r: number, g: number, b: number, a: number,
) {
    imElBeginSvg(c, EL_SVG_PATH); {
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
    } imElEndSvg(c, EL_SVG_PATH);
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
    imLayout(c, COL); imFlex(c); {
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

    imLayout(c, ROW); imAlign(c); {
        imLayout(c, BLOCK); imSize(c, 150, PX, 0, NA); {
            imStr(c, label);
        } imLayoutEnd(c);
        imLayout(c, COL); imFlex(c); {
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
    effectIdx: EffectId | undefined,
) {
    const hv = editor.highlightedValueRef;
    const isHighlighted = 
        (hv.regIdx !== undefined && hv.regIdx === regIdx) || 
        (hv.effectId !== undefined && hv.effectId === effectIdx);

    imBg(c, isHighlighted ? cssVarsApp.codeHighlight : "");

    if (elHasMouseOver(c)) {
        editor.highlightedValueRefNext.effectId = effectIdx;
        editor.highlightedValueRefNext.regIdx = regIdx;
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
            imEditorContextMenuItemBegin(c); {
                imStr(c, "Noise");
                if (elHasMousePress(c)) {
                    toAdd = newEffectRackItem(newEffectRackNoise());
                }
            } imContextMenuItemEnd(c);
            imEditorContextMenuItemBegin(c); {
                imStr(c, "Delay");
                if (elHasMousePress(c)) {
                    toAdd = newEffectRackItem(newEffectRackDelay());
                }
            } imContextMenuItemEnd(c);
            imEditorContextMenuItemBegin(c); {
                imStr(c, "Filter");
                if (elHasMousePress(c)) {
                    toAdd = newEffectRackItem(newEffectRackBiquadFilter());
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
    if (imMemo(c, true)) {
        loadAllEffectRackPresets(ctx.repo);
    }

    const s = imState(c, presetsListState);
    const presets = ctx.repo.effectRackPresets.allEffectRackPresets;
    const loading = ctx.repo.effectRackPresets.allEffectRackPresetsLoading.isPending();

    // UI could be better but for now I don't care too much.
    imLayout(c, COL); imFlex(c); {
        imLayout(c, ROW); imGap(c, 5, PX); {
            imHeading(c, "Presets");

            imFlex1(c);

            const selectedPreset = presets.find(p => p.id === s.selectedId);

            if (imButtonIsClicked(c, "Rename", false, !!selectedPreset) && selectedPreset) {
                startRenamingPreset(s, selectedPreset);
            }

            if (imButtonIsClicked(c, "Delete", false, !!selectedPreset) && selectedPreset) {
                deleteEffectRackPreset(ctx.repo, selectedPreset);
                s.selectedId = 0;
            }

            if (imButtonIsClicked(c, "Create new preset")) {
                const a = newAsyncContext("Saving preset");
                const preset = effectRackToPreset(editor.effectRack);
                const saved = waitForOne(a, createEffectRackPreset(ctx.repo, preset));
                waitFor(a, [saved], () => startRenamingPreset(s, preset));
            }
        } imLayoutEnd(c);

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

                                    imStr(c, utf16ByteLength(preset.serialized)); imStr(c, "b");
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
    } imLayoutEnd(c);
}

// Almost 2000 lines! keep going! you can do it.
