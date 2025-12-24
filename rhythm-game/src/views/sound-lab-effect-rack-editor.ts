import {
    imContextMenu,
    imContextMenuBegin,
    imContextMenuEnd,
    imContextMenuItemBegin,
    imContextMenuItemEnd,
    openContextMenuAtMouse
} from "src/app-components/context-menu";
import { imVerticalText } from "src/app-components/misc";
import { imModalBegin, imModalEnd } from "src/app-components/modal";
import { imTextInputOneLine } from "src/app-components/text-input-one-line";
import { imButtonIsClicked } from "src/components/button";
import { imBeginCanvasRenderingContext2D, imEndCanvasRenderingContext2D } from "src/components/canvas2d";
import { imCheckbox } from "src/components/checkbox";
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
import { cssVars } from "src/components/core/stylesheets";
import { imDragAndDrop, imDragHandle, imDragZoneBegin, imDragZoneEnd, imDropZoneForPrototyping } from "src/components/drag-and-drop";
import { imLine, LINE_VERTICAL, LINE_VERTICAL_PADDING } from "src/components/im-line";
import { imRangeSlider } from "src/components/range-slider";
import { imScrollContainerBegin, imScrollContainerEnd, newScrollContainer } from "src/components/scroll-container";
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
    SWITCH_OP_GT,
    SWITCH_OP_LT
} from "src/dsp/dsp-loop-effect-rack";
import { getDspInfo } from "src/dsp/dsp-loop-interface";
import { arrayMove, filterInPlace, removeItem } from "src/utils/array-utils";
import { assert, unreachable } from "src/utils/assert";
import { newCssBuilder } from "src/utils/cssb";
import {
    ImCache,
    imFor,
    imForEnd,
    imGetInline,
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
import { EL_B, EL_I, elHasMouseOver, elHasMousePress, elSetClass, elSetStyle, imEl, imElEnd, imStr, imStrFmt } from "src/utils/im-dom";
import { getNoteFrequency, getNoteIndex } from "src/utils/music-theory-utils";
import { canRedo, canUndo, JSONUndoBuffer, newUndoBuffer, redo, stepUndoBufferTimer, undo, writeToUndoBufferDebounced } from "src/utils/undo-buffer";
import { GlobalContext } from "./app";
import { imExportModal, imImportModal } from "./import-export-modals";
import { drawSamples, newPlotState } from "./plotting";
import { DRAG_TYPE_CIRCULAR, imParameterSliderInteraction } from "./sound-lab-drag-slider";
import { cssVarsApp } from "./styling";

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

    compileTime: number;
    computeSamplesTime: number;

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

        compileTime: 0,
        computeSamplesTime: 0,

        registers: newEffectRackRegisters(),
    }
}

export type EffectRackEditorState = {
    effectRack: EffectRack;
    undoBuffer: JSONUndoBuffer<EffectRack>;

    oscilloscopeState: OscilloscopeState;

    modal: number;

    edited: boolean;
    version: number;

    highlightedRegister: number;
    highlightedRegisterNext: number;

    deferredAction: (() => void) | null;
};

export function newEffectRackEditorState(effectRack: EffectRack): EffectRackEditorState {
    const state: EffectRackEditorState = {
        effectRack: effectRack,
        undoBuffer: newUndoBuffer<EffectRackEditorState>(),

        oscilloscopeState: newOscilloscopeState(),

        modal: MODAL_NONE,

        edited: false,

        version: 0,

        highlightedRegister: 0,
        highlightedRegisterNext: 0,

        deferredAction: null,
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
    ` .hoverable:hover { cursor: pointer; outline: 2px solid ${cssVars.fg}; border-radius: 4px; }`
]);

export function imEffectRackEditor(c: ImCache, ctx: GlobalContext, editor: EffectRackEditorState) {
    const rack = editor.effectRack;

    editor.highlightedRegister = editor.highlightedRegisterNext;
    editor.highlightedRegisterNext = -1;

    editor.oscilloscopeState.sampleRate = getDspInfo().sampleRate;

    stepUndoBufferTimer(editor.undoBuffer, ctx.deltaTime, editor.effectRack);

    // Recompute oscilloscope as neeed, just once instead of per oscilloscope.
    // Wanted to have one oscilloscpe per UI but prob not worth it I reckon.
    {
        const s = editor.oscilloscopeState;

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
            s.compileTime = t1 - t0;

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

            s.computeSamplesTime =  performance.now() - t1;
        }
    }

    imModalBegin(c); imPadding(c, 10, PX, 10, PX, 10, PX, 10, PX); {
        if (isFirstishRender(c)) {
            elSetStyle(c, "fontSize", "20px");
        }

        if (imIf(c) && editor.modal === MODAL_EXPORT) {
            imExportModal(c, editor.effectRack, serializeEffectRack);

            if (!ctx.handled) {
                if (ctx.keyPressState) {
                    const { key } = ctx.keyPressState;
                    if (key === "Escape") {
                        editor.modal = MODAL_NONE;
                        ctx.handled = true;
                    } else {
                        // We need to be able to copy the text. fr fr.
                        ctx.handled = true;
                        ctx.dontPreventDefault = true;
                    }
                }
            }
        } else if (imIfElse(c) && editor.modal ===  MODAL_IMPORT) {
            const importModal = imImportModal(c);
            if (importModal.event) {
                if (importModal.event.previewUpdated) {
                    importModal.importError = "";
                } else if (importModal.event.import) {
                    // Try running it
                    try {
                        // TODO: use our custom deserialization utils for proper versioning etc of data.
                        const effectRack: EffectRack = deserializeEffectRack(importModal.json);
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
                        editor.effectRack._version = version;
                        editor.effectRack._version++;
                        editor.undoBuffer = newUndoBuffer();
                        editor.modal = MODAL_NONE;
                        editor.edited = true;

                        importModal.importError = "";
                    } catch (e) {
                        importModal.importError = "" + e;
                    }
                }
            }

            if (!ctx.handled) {
                if (ctx.keyPressState) {
                    if (ctx.keyPressState.key === "Escape") {
                        editor.modal = MODAL_NONE;
                        ctx.handled = true;
                    }
                }
            }

        } else if (imIfElse(c) && editor.modal ===  MODAL_NEW_PRESET) {
            imModalBegin(c, 201); imPadding(c, 10, PX, 10, PX, 10, PX, 10, PX); {
                imLayout(c, COL); imSize(c, 40, PERCENT, 0, NA); imBg(c, cssVars.bg); imAlign(c); {
                    imLayout(c, BLOCK); {
                        imStr(c, "Enter preset name: ");
                    } imLayoutEnd(c);

                    const s = imGetInline(c, imEffectRackEditor) ?? imSet(c, {
                        newName: "",
                        error: "",
                    });

                    const ev = imTextInputOneLine(c, s.newName);
                    if (ev) {
                        if (ev.newName) {
                            s.newName = ev.newName;
                            ctx.handled = true;
                        }

                        if (ev.submit) {
                            

                            ctx.handled = true;
                        }

                        if (ev.cancel) {
                            editor.modal = MODAL_NONE;
                            ctx.handled = true;
                        }
                    }

                    if (imIf(c) && s.error) {
                        imLayout(c, BLOCK); {
                            imStr(c, s.error);
                        } imLayoutEnd(c);
                    } imIfEnd(c);
                } imLayoutEnd(c);
            } imModalEnd(c);
        } imIfEnd(c);

        imLayout(c, ROW); imSize(c, 100, PERCENT, 100, PERCENT); imBg(c, cssVars.bg); {
            if (isFirstishRender(c)) {
                elSetClass(c, cnEffectRackEditor);
            }

            imLayout(c, COL); imFlex(c, 3); {
                imLayout(c, COL); imFlex(c, 2); {
                    imLayout(c, ROW); imAlign(c); {
                        imLayout(c, ROW); imFlex(c); imGap(c, 10, PX); {
                            if (imButtonIsClicked(c, "Import")) {
                                editor.modal = MODAL_IMPORT;
                            }

                            if (imButtonIsClicked(c, "Export")) {
                                editor.modal = MODAL_EXPORT;
                            }
                        } imLayoutEnd(c);

                        imHeading(c, "Effects rack");

                        imFlex1(c);
                    } imLayoutEnd(c);

                    const sc = imState(c, newScrollContainer);
                    imScrollContainerBegin(c, sc); {
                        if (isFirstishRender(c)) {
                            elSetStyle(c, "fontFamily", "monospace");
                            elSetStyle(c, "padding", "3px");
                        }

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

                                            let name = "???";
                                            switch (effect.value.type) {
                                                case EFFECT_RACK_ITEM__OSCILLATOR: name = "OSC"; break;
                                                case EFFECT_RACK_ITEM__ENVELOPE: name = "ENV"; break;
                                                case EFFECT_RACK_ITEM__MATHS: name = "MATHS"; break;
                                                case EFFECT_RACK_ITEM__SWITCH: name = "SWITCH"; break;
                                                default: unreachable(effect.value);
                                            }

                                            imVerticalText(c); imAlign(c); {
                                                imDragHandle(c, effectsDnd, effectIdx);
                                                imStr(c, name);
                                            } imLayoutEnd(c);

                                            imLine(c, LINE_VERTICAL, 5);

                                            imLayout(c, ROW); imGap(c, 10, PX); {
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

                                            // imLine(c, LINE_VERTICAL, 5);

                                            const effectValue = effect.value;
                                            imSwitch(c, effectValue.type); switch (effectValue.type) {
                                                case EFFECT_RACK_ITEM__OSCILLATOR: {
                                                    const osc = effectValue;

                                                    imValueOrBindingEditor(c, editor, osc.amplitudeUI, BINDING_UI_ROW);

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

                                                    if (imButtonIsClicked(c, getEffectRackOscillatorWaveTypeName(osc.waveType))) {
                                                        openContextMenuAtMouse(contextMenu);
                                                    }

                                                    imValueOrBindingEditor(c, editor, osc.frequencyUI, BINDING_UI_ROW);
                                                    imValueOrBindingEditor(c, editor, osc.phaseUI, BINDING_UI_ROW);
                                                } break;
                                                case EFFECT_RACK_ITEM__ENVELOPE: {
                                                    const envelope = effectValue;

                                                    const newTarget = imBindingEditor(c, editor, envelope.toModulate);
                                                    if (newTarget !== envelope.toModulate) {
                                                        envelope.toModulate = newTarget;
                                                        editor.edited = true;
                                                    }

                                                    imLayout(c, ROW); imFlex(c); imJustify(c); {
                                                        imStr(c, " * ");
                                                    } imLayoutEnd(c);

                                                    imValueOrBindingEditor(c, editor, envelope.signalUI);
                                                    imValueOrBindingEditor(c, editor, envelope.attackUI);
                                                    imValueOrBindingEditor(c, editor, envelope.decayUI);
                                                    imValueOrBindingEditor(c, editor, envelope.sustainUI);
                                                    imValueOrBindingEditor(c, editor, envelope.releaseUI);
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
                                                                        imValueOrBindingEditor(c, editor, co.valueUI, BINDING_UI_ROW);

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
                                                                imValueOrBindingEditor(c, editor, cond.aUi, BINDING_UI_ROW);

                                                                if (imButtonIsClicked(c, cond.operator === SWITCH_OP_LT ? "<" : ">")) {
                                                                    if (cond.operator === SWITCH_OP_LT) {
                                                                        cond.operator = SWITCH_OP_GT;
                                                                        editor.edited = true;
                                                                    } else {
                                                                        cond.operator = SWITCH_OP_LT;
                                                                        editor.edited = true;
                                                                    }
                                                                }

                                                                imValueOrBindingEditor(c, editor, cond.bUi, BINDING_UI_ROW);

                                                                imValueOrBindingEditor(c, editor, cond.valUi, BINDING_UI_ROW);

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

                                                        imValueOrBindingEditor(c, editor, switchEffect.defaultUi, BINDING_UI_ROW);
                                                    } imLayoutEnd(c);
                                                } break;
                                                default: unreachable(effectValue);
                                            } imSwitchEnd(c);

                                            imLayout(c, ROW); imAlign(c); imJustify(c); imFlex(c); imNoWrap(c); {
                                                imStr(c, " -> ");
                                            } imLayoutEnd(c);

                                            imLayout(c, ROW); imAlign(c); {
                                                const newDst = imBindingEditor(c, editor, effect.dst);
                                                if (newDst !== effect.dst) {
                                                    effect.dst = newDst;
                                                    editor.edited = true;
                                                }
                                            } imLayoutEnd(c);


                                            imLayout(c, ROW); imGap(c, 10, PX); {
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
                } imLayoutEnd(c);
            } imLayoutEnd(c);

            imLine(c, LINE_VERTICAL_PADDING);
            imLine(c, LINE_VERTICAL);
            imLine(c, LINE_VERTICAL_PADDING);

            imLayout(c, COL); imFlex(c, 2); {
                imHeading(c, "Oscilloscope");

                imLayout(c, COL); imFlex(c); {
                    imOscilloscope(c, editor);
                } imLayoutEnd(c);

                imHeading(c, "Presets");

                imLayout(c, COL); imFlex(c, 2); {
                    imLayout(c, BLOCK); imScrollOverflow(c); imFlex(c); {
                        // imFor(c); for () {
                        //     imLayout(c, BLOCK); {
                        //     } imLayoutEnd(c);
                        // } imForEnd(c);

                        if (imButtonIsClicked(c, "Save as preset")) {
                            editor.modal = MODAL_NEW_PRESET;
                        }
                    } imLayoutEnd(c);
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
    } imModalEnd(c);

    if (editor.deferredAction) {
        const action = editor.deferredAction;
        editor.deferredAction = null;
        action();
    }

    let wasUndoTraversed = false;

    if (!ctx.handled) {
        if (ctx.keyPressState) {
            const { keyUpper, ctrlPressed, shiftPressed } = ctx.keyPressState;

            if (keyUpper === "Z" && ctrlPressed && !shiftPressed) {
                if (canUndo(editor.undoBuffer)) {
                    editor.effectRack = undo(editor.undoBuffer, editor.effectRack);
                    editor.edited = true;
                    wasUndoTraversed = true;
                }
                ctx.handled = true;
            } else if (
                (keyUpper === "Z" && ctrlPressed && shiftPressed) ||
                (keyUpper === "Y" && ctrlPressed && !shiftPressed)
            ) {
                if (canRedo(editor.undoBuffer)) {
                    editor.effectRack = redo(editor.undoBuffer);
                    editor.edited = true;
                    wasUndoTraversed = true;
                }
                ctx.handled = true;
            }
        }
    }

    if (editor.edited) {
        editor.edited = false;
        editor.version++;

        if (!wasUndoTraversed) {
            writeToUndoBufferDebounced(editor.undoBuffer, editor.effectRack, UNDO_DEBOUNCE_SECONDS);
        }
    }
}

function registerValueToString(num: number) {
    return num.toFixed(4);
}

const BINDING_UI_ROW = 1 << 0;

function imValueOrBindingEditor(
    c: ImCache,
    editor: EffectRackEditorState,
    reg: RegisterIdxUiMetadata,
    flags: number = 0
) {
    const rack = editor.effectRack;

    const row = !!(flags & BINDING_UI_ROW);
    imLayout(c, row ? ROW_REVERSE : COL); imAlign(c); imJustify(c); imNoWrap(c); imGap(c, 10, row ? PX : NA); 
    imPadding(c, 0, NA, 10, PX, 0, NA, 10, PX); {
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

                imLayout(c, BLOCK); imRegisterHighlightBg(c, editor, reg.bindingIdx); {
                    const binding = rack.bindings[reg.bindingIdx]; assert(!!binding);
                    imStr(c, "<"); imStr(c, binding.name); imStr(c, ">");
                } imLayoutEnd(c);

            } imIfEnd(c);
        } imLayoutEnd(c);

        imLayout(c, BLOCK); {
            if (isFirstishRender(c)) {
                elSetStyle(c, "userSelect", "none");
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
    } imLayoutEnd(c);
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

                imStr(c, "<");
                imStr(c, binding.name);
                imStr(c, ">");

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

function imBindingEditor(c: ImCache, editor: EffectRackEditorState, currentIdx: RegisterIdx): RegisterIdx {
    const rack = editor.effectRack;

    imLayout(c, ROW);  {
        if (isFirstishRender(c)) {
            elSetClass(c, "hoverable");
        }

        imRegisterHighlightBg(c, editor, currentIdx);

        const binding = rack.bindings[currentIdx]; assert(!!binding);

        imStr(c, "<");
        imStr(c, binding.name);
        imStr(c, ">");

        currentIdx = imBindingEditorContextMenu(c, editor, currentIdx, FIELD_WRITE, null);
    } imLayoutEnd(c);

    return currentIdx;
}

function newBindingForEditor(editor: EffectRackEditorState): RegisterIdx {
    const newBinding = newEffectRackBinding("binding " + editor.effectRack.bindings.length, true, true);
    const idx = asRegisterIdx(editor.effectRack.bindings.length);
    editor.effectRack.bindings.push(newBinding);
    editor.edited = true;
    return idx;
}

// want to visualize the program somehow. 
function imOscilloscope(c: ImCache, editor: EffectRackEditorState) {
    const s = editor.oscilloscopeState;

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
        imStr(c, "Compiled in ");
        imStr(c, s.compileTime.toFixed(3))
        imStr(c, "ms, ");
        imStr(c, "Ran in ");
        imStr(c, (s.samples.length / s.computeSamplesTime).toFixed(3))
        imStr(c, "samples per ms");
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
