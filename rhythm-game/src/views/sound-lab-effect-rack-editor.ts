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
import {
    BLOCK,
    COL,
    imAlign,
    imBg,
    imFlex,
    imFlex1,
    imGap,
    imJustify,
    imLayout,
    imLayoutEnd,
    imNoWrap,
    imPadding,
    imScrollOverflow,
    imSize,
    NA,
    PERCENT,
    PX,
    ROW,
    ROW_REVERSE
} from "src/components/core/layout";
import { cssVars } from "src/components/core/stylesheets";
import { imLine, LINE_VERTICAL, LINE_VERTICAL_PADDING } from "src/components/im-line";
import { imRangeSlider } from "src/components/range-slider";
import { imScrollContainerBegin, imScrollContainerEnd, newScrollContainer } from "src/components/scroll-container";
import {
    asRegisterIdx,
    compileEffectRack,
    computeEffectsRackIteration,
    EFFECT_RACK_ITEM__ENVELOPE,
    EFFECT_RACK_ITEM__MATHS,
    EFFECT_RACK_ITEM__OSCILLATOR,
    EffectRack,
    EffectRackMathsItemOperator,
    getRegisterIdxForUIValue,
    MATH_OPERATOR_ADD,
    MATH_OPERATOR_DIVIDE,
    MATH_OPERATOR_MULTIPLY,
    MATH_OPERATOR_SUBTRACT,
    mathOperatorToString,
    newEffectRack,
    newEffectRackBinding,
    newEffectRackMathsItem,
    newEffectRackRegisters,
    newEffectRackEnvelope,
    newEffectRackOscillator,
    RegisterIdx,
    RegisterIdxUiMetadata,
    newEffectRackMathsItemOperation
} from "src/dsp/dsp-loop-effect-rack";
import { arraySwap, filterInPlace } from "src/utils/array-utils";
import { assert, unreachable } from "src/utils/assert";
import { newCssBuilder } from "src/utils/cssb";
import {
    ImCache,
    imFor,
    imForEnd,
    imGet,
    imIf,
    imIfElse,
    imIfEnd,
    imMemo,
    imSet,
    imState,
    imSwitch,
    imSwitchEnd,
    isFirstishRender
} from "src/utils/im-core";
import { EL_B, elHasMousePress, elSetClass, elSetStyle, imEl, imElEnd, imStr, imStrFmt } from "src/utils/im-dom";
import { getNoteFrequency, getNoteIndex } from "src/utils/music-theory-utils";
import { GlobalContext } from "./app";
import { drawSamples, newPlotState } from "./plotting";
import { DRAG_TYPE_CIRCULAR, imParameterSliderInteraction } from "./sound-lab-drag-slider";


export type EffectRackEditorState = {
    effectRack: EffectRack;
    currentViewingRegisterInOscilloscope: RegisterIdx;

    version: number;

    contextMenu: ContextMenuState;

    edited: boolean;
};

export function newEffectRackEditorState(): EffectRackEditorState {
    const state: EffectRackEditorState = {
        effectRack: newEffectRack(),
        currentViewingRegisterInOscilloscope: asRegisterIdx(0),

        contextMenu: newContextMenuState(),

        edited: false,

        version: 0,
    };


    // Good default:
    {
        const env = newEffectRackEnvelope();
        state.effectRack.effects.push(env);

        const osc = newEffectRackOscillator();
        state.effectRack.effects.push(osc);
    }

    // Rest are for testing purposes

    const math = newEffectRackMathsItem();
    state.effectRack.effects.push(math);

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

const allMathsOperators: EffectRackMathsItemOperator[] = [
    MATH_OPERATOR_ADD,
    MATH_OPERATOR_SUBTRACT,
    MATH_OPERATOR_MULTIPLY,
    MATH_OPERATOR_DIVIDE,
];

export function imEffectRackEditor(c: ImCache, ctx: GlobalContext, editor: EffectRackEditorState) {
    const rack = editor.effectRack;

    const FIELD_OSC_DST = 1;
    const FIELD_EDITOR_ADD_EFFECT = 2;
    const FIELD_MATHS_OPERATOR = 3;

    imModalBegin(c); imPadding(c, 10, PX, 10, PX, 10, PX, 10, PX); {
        if (isFirstishRender(c)) {
            elSetStyle(c, "fontSize", "20px");
        }

        imLayout(c, ROW); imSize(c, 100, PERCENT, 100, PERCENT); imBg(c, cssVars.bg); {
            if (isFirstishRender(c)) {
                elSetClass(c, cnEffectRackEditor);
            }

            imLayout(c, COL); imFlex(c, 3); {
                imLayout(c, COL); imFlex(c, 2); {
                    imLayout(c, ROW); imAlign(c); {
                        imFlex1(c); imHeading(c, "Effects rack"); imFlex1(c);
                    } imLayoutEnd(c);

                    const sc = imState(c, newScrollContainer);
                    imScrollContainerBegin(c, sc); {
                        if (isFirstishRender(c)) {
                            elSetStyle(c, "fontFamily", "monospace");
                            elSetStyle(c, "padding", "3px");
                        }

                        // don't mutate effects while iterating - assign to this instead
                        let deferredAction: (() => void) | undefined;

                        imFor(c); for (let effectIdx = 0; effectIdx < editor.effectRack.effects.length; effectIdx++) {
                            const effect = rack.effects[effectIdx];

                            imLayout(c, ROW); imAlign(c); 
                            imPadding(c, 10, PX, 10, PX, 10, PX, 10, PX); imGap(c, 10, PX); {
                                let name = "???";
                                switch (effect.type) {
                                    case EFFECT_RACK_ITEM__OSCILLATOR: name = "OSC";   break;
                                    case EFFECT_RACK_ITEM__ENVELOPE:   name = "ENV";   break;
                                    case EFFECT_RACK_ITEM__MATHS:      name = "MATHS"; break;
                                    default: unreachable(effect);
                                } 

                                imVerticalText(c); imAlign(c); {
                                    const canMoveDown = effectIdx < rack.effects.length - 1;
                                    if (imButtonIsClicked(c, "<", false, !canMoveDown)) {
                                        deferredAction = () => {
                                            // don't mutate effects while iterating
                                            arraySwap(rack.effects, effectIdx, effectIdx + 1);
                                            editor.edited = true;
                                        }
                                    }

                                    imStr(c, name);

                                    const canMoveUp = effectIdx > 0;
                                    if (imButtonIsClicked(c, ">", false, !canMoveUp)) {
                                        deferredAction = () => {
                                            // don't mutate effects while iterating
                                            arraySwap(rack.effects, effectIdx, effectIdx - 1);
                                            editor.edited = true;
                                        }
                                    }
                                } imLayoutEnd(c);

                                imLine(c, LINE_VERTICAL, 5);

                                imSwitch(c, effect.type); switch (effect.type) {
                                    case EFFECT_RACK_ITEM__OSCILLATOR: {
                                        const oscillator = effect;
                                        const wave = oscillator.wave;
                                        imValueOrBindingEditor(c, editor, wave.amplitudeUI);

                                        imFlex1(c);

                                        imValueOrBindingEditor(c, editor, wave.phaseUI);
                                        imValueOrBindingEditor(c, editor, wave.frequencyUI);
                                        imValueOrBindingEditor(c, editor, wave.sinUI);
                                        imValueOrBindingEditor(c, editor, wave.squareUI);
                                        imValueOrBindingEditor(c, editor, wave.triangleUI);
                                        imValueOrBindingEditor(c, editor, wave.sawUI);
                                    } break;
                                    case EFFECT_RACK_ITEM__ENVELOPE: {
                                        const envelope = effect;
                                        imValueOrBindingEditor(c, editor, envelope.signalUI);

                                        imFlex1(c);

                                        imValueOrBindingEditor(c, editor, envelope.attackUI);
                                        imValueOrBindingEditor(c, editor, envelope.decayUI);
                                        imValueOrBindingEditor(c, editor, envelope.sustainUI);
                                        imValueOrBindingEditor(c, editor, envelope.releaseUI);
                                    } break;
                                    case EFFECT_RACK_ITEM__MATHS: {
                                        // TODO: UI to write a math expression, and convert it into a linear sequence of instructions

                                        const maths = effect;
                                        imLayout(c, ROW); imAlign(c); imJustify(c); {
                                            const newSrc = imBindingEditor(c, editor, effect, FIELD_OSC_DST, effect.src);
                                            if (newSrc !== effect.src) {
                                                effect.src = newSrc;
                                                editor.edited = true;
                                            }
                                        } imLayoutEnd(c);

                                        imFlex1(c);

                                        imLayout(c, COL); imFlex(c); imAlign(c); {
                                            imFor(c); for (const op of maths.operations) {
                                                imLayout(c, ROW); {
                                                    imValueOrBindingEditor(c, editor, op.valueUI, BINDING_UI_ROW);

                                                    if (imButtonIsClicked(c, mathOperatorToString(op.operator))) {
                                                        openContextMenuAtMouse(editor.contextMenu, op, FIELD_MATHS_OPERATOR);
                                                    }

                                                    if (imIf(c) && contextMenuIsOpen(editor.contextMenu, op, FIELD_MATHS_OPERATOR)) {
                                                        imContextMenuBegin(c, editor.contextMenu); {
                                                            imFor(c); for (const operator of allMathsOperators) {
                                                                imEditorContextMenuItemBegin(c); imPadding(c, 10, PX, 10, PX, 10, PX, 10, PX); {
                                                                    imStrFmt(c, operator, mathOperatorToString);
                                                                    if (elHasMousePress(c)) {
                                                                        op.operator = operator;
                                                                        editor.edited = true;
                                                                    }
                                                                } imEditorContextMenuItemEnd(c);
                                                            } imForEnd(c);
                                                        } imContextMenuEnd(c, editor.contextMenu);
                                                    } imIfEnd(c);
                                                } imLayoutEnd(c);
                                            } imForEnd(c);

                                            if (imButtonIsClicked(c, "Add operation")) {
                                                maths.operations.push(newEffectRackMathsItemOperation());
                                                editor.edited = true;
                                            }
                                        } imLayoutEnd(c);
                                    } break;
                                    default: unreachable(effect);
                                } imSwitchEnd(c);

                                imLayout(c, ROW); imAlign(c); imJustify(c); imFlex(c); {
                                    imStr(c, " -> ");
                                } imLayoutEnd(c);

                                imLayout(c, ROW); imAlign(c); {
                                    const newDst = imBindingEditor(c, editor, effect, FIELD_OSC_DST, effect.dst);
                                    if (newDst !== effect.dst) {
                                        effect.dst = newDst;
                                        editor.edited = true;
                                    }
                                } imLayoutEnd(c);


                                imLayout(c, ROW); {
                                    if (imButtonIsClicked(c, "x")) {
                                        deferredAction = () => {
                                            filterInPlace(rack.effects, e => e !== effect)
                                            editor.edited = true;
                                        }
                                    }
                                } imLayoutEnd(c);
                            } imLayoutEnd(c);
                        } imForEnd(c);

                        if (deferredAction) {
                            deferredAction();
                        }


                        if (imButtonIsClicked(c, "Add")) {
                            openContextMenuAtMouse(editor.contextMenu, editor, FIELD_EDITOR_ADD_EFFECT);
                        }

                        if (imIf(c) && contextMenuIsOpen(editor.contextMenu, editor, FIELD_EDITOR_ADD_EFFECT)) {
                            imContextMenuBegin(c, editor.contextMenu); {
                                imEditorContextMenuItemBegin(c); {
                                    imStr(c, "Oscillator");
                                    if (elHasMousePress(c)) {
                                        editor.effectRack.effects.push(newEffectRackOscillator());
                                        editor.edited = true;
                                    }
                                } imContextMenuItemEnd(c);
                                imEditorContextMenuItemBegin(c); {
                                    imStr(c, "Envelope");
                                    if (elHasMousePress(c)) {
                                        editor.effectRack.effects.push(newEffectRackEnvelope());
                                        editor.edited = true;
                                    }
                                } imContextMenuItemEnd(c);
                                imEditorContextMenuItemBegin(c); {
                                    imStr(c, "Maths");
                                    if (elHasMousePress(c)) {
                                        editor.effectRack.effects.push(newEffectRackMathsItem());
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
                    imFor(c); for (const binding of rack.bindings) {
                        imLayout(c, BLOCK); {
                            imStr(c, binding.name);
                            imStr(c, binding.r ? " [read]" : "");
                            imStr(c, binding.w ? " [write]" : "");
                        } imLayoutEnd(c);
                    } imForEnd(c);

                    if (imButtonIsClicked(c, "Add binding")) {
                        // TODO: rename the bindings
                        newBindingForEditor(editor);
                    }
                } imLayoutEnd(c);
            } imLayoutEnd(c);
        } imLayoutEnd(c);
    } imModalEnd(c);

    if (!ctx.handled) {
        if (ctx.keyPressState) {
            // Soon. I guess
            // const { key, keyUpper, ctrlPressed, shiftPressed } = ctx.keyPressState;
        }
    }

    if (editor.edited) {
        editor.edited = false;
        editor.version++;
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

                const binding = rack.bindings[reg.bindingIdx]; assert(!!binding);
                imStr(c, "<"); imStr(c, binding.name); imStr(c, ">");
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

        const binding = rack.bindings[currentIdx]; assert(!!binding);
        imStr(c, binding.name);
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
    const rack = editor.effectRack;

    const mockSampleRate = 44800;

    const s = imGet(c, imEffectRackEditor) ?? imSet(c, {
        noteIdx: getNoteIndex("A", 3),

        samples: Array(mockSampleRate * 3).fill(0) as number[],
        viewingIdx: 0,
        viewingLen: 58071,
        viewingInvalidated: true,

        samplePressedIdx: 14430,
        sampleReleasedIdx: 28090,

        registers: newEffectRackRegisters(),
    });

    if (imMemo(c, s.noteIdx)) s.viewingInvalidated = true;
    if (imMemo(c, editor.currentViewingRegisterInOscilloscope)) s.viewingInvalidated = true;
    if (imMemo(c, editor.version)) s.viewingInvalidated = true;

    let samplesRecomputed = false;
    if (s.viewingInvalidated) {
        s.viewingInvalidated = false;
        samplesRecomputed = true;

        const dt = 1 / 44100;
        let keyFrequency = getNoteFrequency(s.noteIdx);

        compileEffectRack(editor.effectRack);

        for (let i = 0; i < s.samples.length; i++) {
            assert(editor.currentViewingRegisterInOscilloscope < rack.registersTemplate.length);

            let signal = 0;
            if (s.samplePressedIdx < i && i < s.sampleReleasedIdx) {
                signal = 1;
            }

            computeEffectsRackIteration(rack, s.registers, keyFrequency, signal, dt);
            s.samples[i] = s.registers.values[editor.currentViewingRegisterInOscilloscope];
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
