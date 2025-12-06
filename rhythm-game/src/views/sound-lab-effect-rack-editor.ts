import {
    contextMenuIsOpen,
    ContextMenuState,
    imContextMenuBegin,
    imContextMenuEnd,
    imContextMenuItemBegin,
    imContextMenuItemEnd,
    newContextMenuState,
    openContextMenuAtMouse
} from "src/app-components/context-menu";
import { imVerticalText } from "src/app-components/misc";
import { imModalBegin, imModalEnd } from "src/app-components/modal";
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
import { imDragAndDrop, imDragCssTransform, imDragHandle, imDropZoneForPrototyping } from "src/components/drag-and-drop";
import { imLine, LINE_VERTICAL, LINE_VERTICAL_PADDING } from "src/components/im-line";
import { imRangeSlider } from "src/components/range-slider";
import { imScrollContainerBegin, imScrollContainerEnd, newScrollContainer } from "src/components/scroll-container";
import {
    asRegisterIdx,
    compileEffectRack,
    computeEffectRackIteration,
    copyEffectRackItem,
    EFFECT_RACK_ITEM__ENVELOPE,
    EFFECT_RACK_ITEM__MATHS,
    EFFECT_RACK_ITEM__OSCILLATOR,
    EFFECT_RACK_ITEM__SWITCH,
    EffectRack,
    EffectRackRegisters,
    getRegisterIdxForUIValue,
    newEffectRackBinding,
    newEffectRackEnvelope,
    newEffectRackItem,
    newEffectRackMathsItem,
    newEffectRackMathsItemCoefficient,
    newEffectRackMathsItemTerm,
    newEffectRackOscillator,
    newEffectRackRegisters,
    newEffectRackSwitch,
    newEffectRackSwitchCondition,
    RegisterIdx,
    RegisterIdxUiMetadata,
    SWITCH_OP_GT,
    SWITCH_OP_LT
} from "src/dsp/dsp-loop-effect-rack";
import { IDX_OUTPUT, WaveProgram } from "src/dsp/dsp-loop-instruction-set";
import { arrayMove, filterInPlace, removeItem } from "src/utils/array-utils";
import { assert, unreachable } from "src/utils/assert";
import { newCssBuilder } from "src/utils/cssb";
import {
    ImCache,
    imFor,
    imForEnd,
    imIf,
    imIfElse,
    imIfEnd,
    imMemo,
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
import { getDspInfo } from "src/dsp/dsp-loop-interface";

const MODAL_NONE = 0;
const MODAL_EXPORT = 1;
const MODAL_IMPORT = 2;

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

    contextMenu: ContextMenuState;

    modal: number;

    edited: boolean;
    version: number;

    highlightedRegister: number;
    highlightedRegisterNext: number;
};

export function newEffectRackEditorState(effectRack: EffectRack): EffectRackEditorState {
    const state: EffectRackEditorState = {
        effectRack: effectRack,
        undoBuffer: newUndoBuffer<WaveProgram>(),

        oscilloscopeState: newOscilloscopeState(),

        contextMenu: newContextMenuState(),

        modal: MODAL_NONE,

        edited: false,

        version: 0,

        highlightedRegister: 0,
        highlightedRegisterNext: 0,
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

    const FIELD_OSC_DST = 1;
    const FIELD_EDITOR_ADD_EFFECT = 2;

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

            for (let i = 0; i < s.samples.length; i++) {
                let signal = 0;
                if (s.samplePressedIdx < i && i < s.sampleReleasedIdx) {
                    signal = 1;
                }

                computeEffectRackIteration(rack, s.registers, keyFrequency, signal, dt);
                s.samples[i] = s.registers.values[IDX_OUTPUT];
            }

            s.computeSamplesTime =  performance.now() - t1;
        }
    }

    imModalBegin(c); imPadding(c, 10, PX, 10, PX, 10, PX, 10, PX); {
        if (isFirstishRender(c)) {
            elSetStyle(c, "fontSize", "20px");
        }

        if (imIf(c) && editor.modal === MODAL_EXPORT) {
            imExportModal(c, editor.effectRack);

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
        } else if (imIfElse(c) && editor.modal ===  MODAL_IMPORT) {
            const importModal = imImportModal(c);
            if (importModal.event) {
                if (importModal.event.previewUpdated) {
                    importModal.importError = "";
                } else if (importModal.event.import) {
                    // Try running it
                    try {
                        // TODO: use our custom deserialization utils for proper versioning etc of data.
                        const effectRack: EffectRack = JSON.parse(importModal.json);
                        if (!effectRack.effects || !Array.isArray(effectRack.effects)) {
                            throw new Error("Wrong JSON format");
                        }

                        // Try computing a sample. Does it work??
                        compileEffectRack(effectRack);
                        const registers = newEffectRackRegisters();
                        const f = getNoteFrequency(getNoteIndex("C", 4));
                        computeEffectRackIteration(effectRack, registers, f, 1, 1 / 48000);

                        // If we reach here, then yeah its probably legit...
                        editor.effectRack = effectRack;
                        editor.undoBuffer = newUndoBuffer();
                        editor.modal = MODAL_NONE;
                        editor.edited = true;

                        importModal.importError = "";
                    } catch (e) {
                        importModal.importError = "" + e;
                    }
                }
            }

            if (ctx.keyPressState) {
                if (ctx.keyPressState.key === "Escape") {
                    editor.modal = MODAL_NONE;
                    ctx.handled = true;
                }
            }

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

                            const effectDisabled = !effect.enabled || 
                                (rack.debugEffectIdx !== -1 && effectIdx > rack.debugEffectIdx);

                            imLayout(c, COL); {
                                imLayout(c, ROW); imAlign(c);
                                imPadding(c, 10, PX, 10, PX, 10, PX, 10, PX); imGap(c, 10, PX); {
                                    imFg(c, effectDisabled ? cssVars.mg : "");

                                    imDropZoneForPrototyping(c, effectsDnd, effectIdx);
                                    imDragCssTransform(c, effectsDnd, effectIdx);

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

                                    imLayout(c, COL); imGap(c, 10, PX); {
                                        imLayout(c, ROW); {
                                            const ev = imCheckbox(c, effect.enabled);
                                            if (ev) {
                                                effect.enabled = ev.checked;
                                                editor.edited = true;
                                            }
                                        } imLayoutEnd(c);
                                        imLayout(c, ROW); {
                                            const isDebugging = effectIdx === rack.debugEffectIdx;
                                            const ev = imCheckbox(c, isDebugging);
                                            if (ev) {
                                                if (ev.checked) {
                                                    rack.debugEffectIdx = effectIdx;
                                                } else {
                                                    rack.debugEffectIdx = -1;
                                                }
                                                editor.edited = true;
                                            }
                                        } imLayoutEnd(c);
                                    } imLayoutEnd(c);

                                    imLine(c, LINE_VERTICAL, 5);

                                    const effectValue = effect.value;
                                    imSwitch(c, effectValue.type); switch (effectValue.type) {
                                        case EFFECT_RACK_ITEM__OSCILLATOR: {
                                            const osc = effectValue;

                                            imValueOrBindingEditor(c, editor, osc.amplitudeUI);

                                            imFlex1(c);

                                            imValueOrBindingEditor(c, editor, osc.phaseUI);
                                            imValueOrBindingEditor(c, editor, osc.frequencyUI);
                                            imValueOrBindingEditor(c, editor, osc.sinUI);
                                            imValueOrBindingEditor(c, editor, osc.squareUI);
                                            imValueOrBindingEditor(c, editor, osc.triangleUI);
                                            imValueOrBindingEditor(c, editor, osc.sawUI);
                                        } break;
                                        case EFFECT_RACK_ITEM__ENVELOPE: {
                                            const envelope = effectValue;

                                            const newTarget = imBindingEditor(c, editor, effect, FIELD_OSC_DST, envelope.toModulate);
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

                                            imLayout(c, ROW); imAlign(c); imGap(c, 10, PX); {
                                                if (isFirstishRender(c)) {
                                                    elSetStyle(c, "flexFlow", "wrap");
                                                }

                                                imFor(c); for (let termIdx = 0; termIdx < math.terms.length; termIdx++) {
                                                    const term = math.terms[termIdx];
                                                    imLayout(c, COL); {
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

                                                        // order of coefficients literally doesnt matter here at all. 
                                                        // I have added this just because I can.
                                                        const coefficientsDnd = imDragAndDrop(c);
                                                        if (coefficientsDnd.moved) {
                                                            const a = coefficientsDnd.moved.a;
                                                            const b = coefficientsDnd.moved.b;
                                                            arrayMove(term.coefficients, a, b);
                                                            editor.edited = true;
                                                        }
                                                        imFor(c); for (let coIdx = 0; coIdx < term.coefficients.length; coIdx++) {
                                                            const co = term.coefficients[coIdx];
                                                            imLayout(c, ROW); imJustify(c); imDropZoneForPrototyping(c, coefficientsDnd, coIdx); {
                                                                imDragCssTransform(c, coefficientsDnd, coIdx);

                                                                imLayout(c, ROW); imSize(c, 20, PX, 0, NA); imBg(c, elHasMouseOver(c) ? cssVars.fg : ""); {
                                                                    imDragHandle(c, coefficientsDnd, coIdx);
                                                                } imLayoutEnd(c);

                                                                if (imMemo(c, co)) co.valueUI.name = "x" + termIdx.toString() + coIdx.toString();
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
                                        const newDst = imBindingEditor(c, editor, effect, FIELD_OSC_DST, effect.dst);
                                        if (newDst !== effect.dst) {
                                            effect.dst = newDst;
                                            editor.edited = true;
                                        }
                                    } imLayoutEnd(c);


                                    imLayout(c, COL); {
                                        if (imButtonIsClicked(c, "-")) {
                                            deferredAction = () => {
                                                filterInPlace(rack.effects, e => e !== effect)
                                                editor.edited = true;
                                            }
                                        }

                                        if (imButtonIsClicked(c, "+")) { // Duplicate button
                                            deferredAction = () => {
                                                const copy = copyEffectRackItem(effect);
                                                rack.effects.splice(effectIdx, 0, copy);
                                                editor.edited = true;
                                            }
                                        }
                                    } imLayoutEnd(c);
                                } imLayoutEnd(c);
                            } imLayoutEnd(c);
                        } imForEnd(c);

                        if (deferredAction) {
                            deferredAction();
                        }

                        if (imButtonIsClicked(c, "+")) {
                            openContextMenuAtMouse(editor.contextMenu, editor, FIELD_EDITOR_ADD_EFFECT);
                        }

                        if (imIf(c) && contextMenuIsOpen(editor.contextMenu, editor, FIELD_EDITOR_ADD_EFFECT)) {
                            imContextMenuBegin(c, editor.contextMenu); {
                                imEditorContextMenuItemBegin(c); {
                                    imStr(c, "Oscillator");
                                    if (elHasMousePress(c)) {
                                        editor.effectRack.effects.push(newEffectRackItem(newEffectRackOscillator()));
                                        editor.edited = true;
                                    }
                                } imContextMenuItemEnd(c);
                                imEditorContextMenuItemBegin(c); {
                                    imStr(c, "Envelope");
                                    if (elHasMousePress(c)) {
                                        editor.effectRack.effects.push(newEffectRackItem(newEffectRackEnvelope()));
                                        editor.edited = true;
                                    }
                                } imContextMenuItemEnd(c);
                                imEditorContextMenuItemBegin(c); {
                                    imStr(c, "Maths");
                                    if (elHasMousePress(c)) {
                                        editor.effectRack.effects.push(newEffectRackItem(newEffectRackMathsItem()));
                                        editor.edited = true;
                                    }
                                } imContextMenuItemEnd(c);
                                imEditorContextMenuItemBegin(c); {
                                    imStr(c, "Switch");
                                    if (elHasMousePress(c)) {
                                        editor.effectRack.effects.push(newEffectRackItem(newEffectRackSwitch()));
                                        editor.edited = true;
                                    }
                                } imContextMenuItemEnd(c);
                            } imContextMenuEnd(c, editor.contextMenu);
                        } imIfEnd(c);
                    } imScrollContainerEnd(c);
                } imLayoutEnd(c);
            } imLayoutEnd(c);

            imLine(c, LINE_VERTICAL_PADDING);
            imLine(c, LINE_VERTICAL);
            imLine(c, LINE_VERTICAL_PADDING);

            imLayout(c, COL); imFlex(c, 2); {
                imHeading(c, "Oscilloscope");

                imOscilloscope(c, editor);

                imHeading(c, "Bindings");

                imLayout(c, BLOCK); imScrollOverflow(c); imFlex(c); {
                    imFor(c); for (
                        let bindingIdx = 0;
                        bindingIdx < rack.bindings.length;
                        bindingIdx++
                    ) {
                        const binding = rack.bindings[bindingIdx];
                        imLayout(c, BLOCK); {
                            imRegisterHighlightBg(c, editor, bindingIdx);

                            imStr(c, binding.name);
                            imStr(c, binding.r ? " [read]" : "");
                            imStr(c, binding.w ? " [write]" : "");
                        } imLayoutEnd(c);
                    } imForEnd(c);
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
    const FIELD__REG_VALUE = 0;
    const FIELD__REG_NAME = 1;

    const rack = editor.effectRack;

    const row = !!(flags & BINDING_UI_ROW);
    imLayout(c, row ? ROW_REVERSE : COL); imAlign(c); imJustify(c); imNoWrap(c); imGap(c, 10, row ? PX : NA); 
    imPadding(c, 0, NA, 10, PX, 0, NA, 10, PX); {
        imLayout(c, BLOCK); {
            if (imIf(c) && reg.bindingIdx === -1) {
                const value = getRegisterIdxForUIValue(editor.effectRack, reg);
                imStrFmt(c, value, registerValueToString);

                let dragEvent = imParameterSliderInteraction(c, reg.min, reg.max, 0.0001, value, 0, DRAG_TYPE_CIRCULAR);
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

            imStr(c, reg.name);
            imStr(c, row ? ":" : "");

            const newBindingIdx = imBindingEditorContextMenu(c, editor, reg, FIELD__REG_NAME, reg.bindingIdx, FIELD_READ, reg.value);
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
    item: unknown,
    field: unknown,
    currentIdx: RegisterIdx,
    perms = FIELD_READ,
    value: number | null
): RegisterIdx {
    if (elHasMousePress(c)) {
        openContextMenuAtMouse(editor.contextMenu, item, field);
    }

    const rack = editor.effectRack;

    if (imIf(c) && contextMenuIsOpen(editor.contextMenu, item, field)) {
        imContextMenuBegin(c, editor.contextMenu); {
            if (imIf(c) && value !== null) {
                imEditorContextMenuItemBegin(c); {
                    imStr(c, "value: ");
                    imStrFmt(c, value, registerValueToString);

                    if (elHasMousePress(c)) {
                        currentIdx = asRegisterIdx(-1);
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
                    }
                } imContextMenuItemEnd(c);
            } imForEnd(c);

            imEditorContextMenuItemBegin(c); {
                imStr(c, "+New binding");
                if (elHasMousePress(c)) {
                    const idx = newBindingForEditor(editor);
                    currentIdx = idx;
                }
            } imContextMenuItemEnd(c);
        } imContextMenuEnd(c, editor.contextMenu);
    } imIfEnd(c);

    if (value === null) {
        assert(currentIdx !== -1);
    }

    return currentIdx;
}

function imBindingEditor(
    c: ImCache,
    editor: EffectRackEditorState,
    item: unknown,
    field: unknown,
    currentIdx: RegisterIdx,
): RegisterIdx {
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

        currentIdx = imBindingEditorContextMenu(c, editor, item, field, currentIdx, FIELD_WRITE, null);
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
