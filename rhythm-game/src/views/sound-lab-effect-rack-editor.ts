import { imModalBegin, imModalEnd } from "src/app-components/modal";
import { imButtonIsClicked } from "src/components/button";
import { imBeginCanvasRenderingContext2D, imEndCanvasRenderingContext2D } from "src/components/canvas2d";
import {
    BLOCK,
    COL,
    imAlign,
    imBg,
    imFlex,
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
    ROW_REVERSE,
    STRETCH
} from "src/components/core/layout";
import { cssVars } from "src/components/core/stylesheets";
import { imLine, LINE_VERTICAL, LINE_VERTICAL_PADDING } from "src/components/im-line";
import { imRangeSlider } from "src/components/range-slider";
import { imScrollContainerBegin, imScrollContainerEnd, newScrollContainer } from "src/components/scroll-container";
import {
    asRegisterIdx,
    computeEffectsRackIteration,
    EFFECT_RACK_ITEM__OSCILLATOR,
    EffectRack,
    getRegisterIdxForUIValue,
    newEffectRackBinding,
    newEffectRack,
    newOscillator,
    RegisterIdx,
    RegisterIdxForUI
} from "src/dsp/dsp-loop-effect-stack";
import { getCurrentPlaySettings } from "src/dsp/dsp-loop-interface";
import { assert } from "src/utils/assert";
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


export type EffectRackEditorState = {
    effectRack: EffectRack;
    currentViewingRegisterInOscilloscope: RegisterIdx;
    version: number;

    contextMenu: ContextMenuState;

    edited: boolean;
};

export function newEffectRackEditorState(): EffectRackEditorState {
    return {
        effectRack: newEffectRack(),
        currentViewingRegisterInOscilloscope: asRegisterIdx(0),
        version: 0,

        contextMenu: newContextMenuState(),

        edited: false,
    };
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
    const playSettings = getCurrentPlaySettings();
    const rack = editor.effectRack;

    const FIELD_OSC_DST = 1;

    imModalBegin(c); imPadding(c, 10, PX, 10, PX, 10, PX, 10, PX); {
        if (isFirstishRender(c)) {
            elSetStyle(c, "fontSize", "20px");
        }

        imLayout(c, ROW); imSize(c, 100, PERCENT, 100, PERCENT); imBg(c, cssVars.bg); {
            if (isFirstishRender(c)) {
                elSetClass(c, cnEffectRackEditor);
            }

            const sc = imState(c, newScrollContainer);

            imLayout(c, COL); imFlex(c); {
                imLayout(c, ROW); imAlign(c); {
                    imHeading(c, "Rack");
                } imLayoutEnd(c);

                imScrollContainerBegin(c, sc); {
                    if (isFirstishRender(c)) {
                        elSetStyle(c, "fontFamily", "monospace");
                        elSetStyle(c, "padding", "3px");
                    }

                    imFor(c); for (let effectIdx = 0; effectIdx < editor.effectRack.effects.length; effectIdx++) {
                        const effect = editor.effectRack.effects[effectIdx];

                        imSwitch(c, effect.type); switch(effect.type) {
                            case EFFECT_RACK_ITEM__OSCILLATOR: {
                                const oscillator = effect;

                                imLayout(c, COL); imAlign(c, STRETCH); imGap(c, 5, PX); {
                                    const wave = oscillator.wave;
                                    imLayout(c, ROW); imAlign(c, STRETCH); imGap(c, 5, PX); {
                                        imLayout(c, ROW); imAlign(c); imGap(c, 5, PX); {
                                            imValueOrBindingEditor(c, editor, wave.phaseUI);
                                            imValueOrBindingEditor(c, editor, wave.amplitudeUI);
                                            imValueOrBindingEditor(c, editor, wave.frequencyUI);
                                            imValueOrBindingEditor(c, editor, wave.sinUI);
                                            imValueOrBindingEditor(c, editor, wave.squareUI);
                                            imValueOrBindingEditor(c, editor, wave.triangleUI);
                                            imValueOrBindingEditor(c, editor, wave.sawUI);
                                        } imLayoutEnd(c);
                                        imLayout(c, ROW); imAlign(c); imJustify(c); imFlex(c); {
                                            imStr(c, " -> ");
                                        } imLayoutEnd(c);
                                        imLayout(c, ROW); imAlign(c); imGap(c, 30, PX);  {
                                            const newDst = imBindingEditor(c, editor, oscillator, FIELD_OSC_DST, oscillator.dst);
                                            if (newDst !== oscillator.dst) {
                                                oscillator.dst = newDst;
                                                editor.edited = true;
                                            }
                                        } imLayoutEnd(c);
                                    } imLayoutEnd(c);
                                } imLayoutEnd(c);
                            } break;
                        } imSwitchEnd(c);
                    } imForEnd(c);

                    if (imButtonIsClicked(c, "Add Oscillator")) {
                        editor.effectRack.effects.push(newOscillator());
                        editor.edited = true;
                    }
                } imScrollContainerEnd(c);
            } imLayoutEnd(c);

            imLine(c, LINE_VERTICAL_PADDING);
            imLine(c, LINE_VERTICAL);
            imLine(c, LINE_VERTICAL_PADDING);

            imLayout(c, COL); imFlex(c); {
                imHeading(c, "Oscilloscope (TODO: re-enable)");

                // want to visualize the program somehow. 
                if (0) {
                    const mockSampleRate = 44800;

                    const s = imGet(c, imEffectRackEditor) ?? imSet(c, {
                        noteIdx: getNoteIndex("A", 3),

                        samples: Array(mockSampleRate * 3).fill(0) as number[],
                        viewingIdx: 0,
                        viewingLen: 58071,
                        viewingInvalidated: true,

                        samplePressedIdx: 14430,
                        sampleReleasedIdx: 28090,
                    });

                    if (imMemo(c, s.noteIdx)) s.viewingInvalidated = true;
                    if (imMemo(c, editor.currentViewingRegisterInOscilloscope)) s.viewingInvalidated = true;

                    imLayout(c, BLOCK); {
                        imStr(c, "Computational cost: ");
                        imStr(c, playSettings.parameters.instructions.length);
                    } imLayoutEnd(c);

                    let samplesRecomputed = false;
                    if (s.viewingInvalidated) {
                        s.viewingInvalidated = false;
                        samplesRecomputed = true;

                        const dt = 1 / 44100;

                        for (let i = 0; i < s.samples.length; i++) {
                            assert(editor.currentViewingRegisterInOscilloscope < rack.registers.length);

                            // TODO: signal, frequency, etc needs to get into the effects rack somehow.

                            let frequency = getNoteFrequency(s.noteIdx);
                            let signal = 0;
                            if (s.samplePressedIdx < i && i < s.sampleReleasedIdx) {
                                signal = 1;
                            }

                            computeEffectsRackIteration(rack, s.samples, i, dt);

                            s.samples[i] = rack.registers[editor.currentViewingRegisterInOscilloscope];
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

                imHeading(c, "Bindings");

                imLayout(c, BLOCK); imScrollOverflow(c); imFlex(c); {
                    imFor(c); for (const binding of rack.bindings) {
                        imLayout(c, BLOCK); {
                            imStr(c, binding.name);
                            imStr(c, binding.readonly ? " [readonly]" : "");
                        } imLayoutEnd(c);
                    } imForEnd(c);
                } imLayoutEnd(c);

                if (imButtonIsClicked(c, "Add binding")) {
                    // TODO: rename the bindings
                    newBindingForEditor(editor);
                }
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
    reg: RegisterIdxForUI,
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
            imStr(c, reg.name);
            imStr(c, row ? ":" : "");

            const newBindingIdx = imBindingEditorContextMenu(c, editor, reg, FIELD__REG_NAME, reg.bindingIdx, reg.value);
            if (newBindingIdx !== reg.bindingIdx) {
                reg.bindingIdx = newBindingIdx;
                editor.edited = true;
            }
        } imLayoutEnd(c);
    } imLayoutEnd(c);
}

function imBindingEditorContextMenu(
    c: ImCache,
    editor: EffectRackEditorState,
    item: unknown,
    field: unknown,
    currentIdx: RegisterIdx,
    value: number | null,
): RegisterIdx {
    if (isFirstishRender(c)) {
        elSetStyle(c, "userSelect", "none");
        elSetClass(c, "hoverable");
    }

    if (elHasMousePress(c)) {
        openContextMenuAtMouse(editor.contextMenu, item, field);
    }

    const rack = editor.effectRack;

    if (imIf(c) && contextMenuIsOpen(editor.contextMenu, item, field)) {
        imContextMenuBegin(c, editor.contextMenu); {
            if (imIf(c) && value !== null) {
                imContextMenuItemBegin(c); {
                    if (isFirstishRender(c)) {
                        elSetClass(c, "hoverable");
                    }

                    imStr(c, "value: ");
                    imStrFmt(c, value, registerValueToString);

                    if (elHasMousePress(c)) {
                        currentIdx = asRegisterIdx(-1);
                    }
                } imContextMenuItemEnd(c);
            } imIfEnd(c);

            imFor(c); for (
                let bindingIdx = 0;
                bindingIdx < rack.bindings.length;
                bindingIdx++
            ) {
                const binding = rack.bindings[bindingIdx];
                if (binding.readonly) {
                    continue;
                }

                imContextMenuItemBegin(c); {
                    if (isFirstishRender(c)) {
                        elSetClass(c, "hoverable");
                    }

                    imStr(c, "Binding: ");
                    imStr(c, binding.name);

                    if (elHasMousePress(c)) {
                        currentIdx = asRegisterIdx(bindingIdx);
                    }
                } imContextMenuItemEnd(c);
            } imForEnd(c);

            imContextMenuItemBegin(c); {
                if (isFirstishRender(c)) {
                    elSetClass(c, "hoverable");
                }

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
        const binding = rack.bindings[currentIdx]; assert(!!binding);
        imStr(c, binding.name);
        currentIdx = imBindingEditorContextMenu(c, editor, item, field, currentIdx, null);
    } imLayoutEnd(c);

    return currentIdx;
}

function newBindingForEditor(editor: EffectRackEditorState): RegisterIdx {
    const newBinding = newEffectRackBinding("binding " + editor.effectRack.bindings.length, false);
    const idx = asRegisterIdx(editor.effectRack.bindings.length);
    editor.effectRack.bindings.push(newBinding);
    editor.edited = true;
    return idx;
}


