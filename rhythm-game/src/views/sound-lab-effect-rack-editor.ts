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
    imPadding,
    imSize,
    INLINE_BLOCK,
    NA,
    PERCENT,
    PX,
    ROW,
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
    newEffectRack,
    newOscillator,
    newOscillatorWave,
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
    imIfEnd,
    imMemo,
    imSet,
    imState,
    imSwitch,
    imSwitchEnd,
    isFirstishRender
} from "src/utils/im-core";
import { EL_B, elSetClass, elSetStyle, imEl, imElEnd, imStr, imStrFmt } from "src/utils/im-dom";
import { getNoteFrequency, getNoteIndex } from "src/utils/music-theory-utils";
import { GlobalContext } from "./app";
import { drawSamples, newPlotState } from "./plotting";
import { DRAG_TYPE_CIRCULAR, imParameterSliderInteraction } from "./sound-lab-drag-slider";


export type EffectRackEditorState = {
    rack: EffectRack;
    currentViewingRegisterInOscilloscope: RegisterIdx;
    version: number;

    edited: boolean;
};

export function newEffectRackEditorState(): EffectRackEditorState {
    return {
        rack: newEffectRack(),
        currentViewingRegisterInOscilloscope: asRegisterIdx(0),
        version: 0,

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

                    imFor(c); for (let effectIdx = 0; effectIdx < editor.rack.effects.length; effectIdx++) {
                        const effect = editor.rack.effects[effectIdx];

                        imSwitch(c, effect.type); switch(effect.type) {
                            case EFFECT_RACK_ITEM__OSCILLATOR: {
                                const oscillator = effect;

                                imLayout(c, COL); imAlign(c, STRETCH); imGap(c, 5, PX); {
                                    imStr(c, "Wave ");
                                    imStr(c, effectIdx);

                                    imFor(c); for (
                                        let waveIdx = 0;
                                        waveIdx < oscillator.waves.length;
                                        waveIdx++
                                    ) {
                                        imLayout(c, ROW); imAlign(c, STRETCH); imGap(c, 5, PX); {
                                            const wave = oscillator.waves[waveIdx];
                                            imRegisterEditor(c, editor, wave.phaseUI, "phase");
                                            imRegisterEditor(c, editor, wave.amplitudeUI, "amplitude");
                                            imRegisterEditor(c, editor, wave.frequencyUI, "*frequency");
                                            imRegisterEditor(c, editor, wave.sinUI, "sin");
                                            imRegisterEditor(c, editor, wave.squareUI, "square");
                                            imRegisterEditor(c, editor, wave.triangleUI, "triangle");
                                            imRegisterEditor(c, editor, wave.sawUI, "saw");
                                        } imLayoutEnd(c);
                                    } imForEnd(c);

                                    if (imButtonIsClicked(c, "Add Wave")) {
                                        oscillator.waves.push(newOscillatorWave());
                                        editor.edited = true;
                                    }
                                } imLayoutEnd(c);
                            } break;
                        } imSwitchEnd(c);
                    } imForEnd(c);

                    if (imButtonIsClicked(c, "Add Oscillator")) {
                        editor.rack.effects.push(newOscillator());
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

                    const rack = editor.rack;

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

function imRegisterEditor(c: ImCache, editor: EffectRackEditorState, reg: RegisterIdxForUI, name: string) {
    imLayout(c, BLOCK); imFlex(c); {
        imLayout(c, COL); imAlign(c); {
            imLayout(c, INLINE_BLOCK); {
                if (isFirstishRender(c)) {
                    elSetClass(c, "hoverable");
                    elSetStyle(c, "userSelect", "none");
                }

                const value = getRegisterIdxForUIValue(editor.rack, reg);
                imStrFmt(c, value, registerValueToString);

                if (imIf(c) && reg.bindingIdx === -1) {
                    let dragEvent = imParameterSliderInteraction(
                        c,
                        -1_000_000, 1_000_000, 0.00001, value, 0,
                        DRAG_TYPE_CIRCULAR
                    );
                    if (dragEvent) {
                        reg.value = dragEvent.val;
                        editor.edited = true;
                    }
                } imIfEnd(c);
            } imLayoutEnd(c);

            imLayout(c, INLINE_BLOCK); {
                if (isFirstishRender(c)) {
                    elSetClass(c, "hoverable");
                    elSetStyle(c, "userSelect", "none");
                }

                imStr(c, name);
            } imLayoutEnd(c);
        } imLayoutEnd(c);
    } imLayoutEnd(c);
}
