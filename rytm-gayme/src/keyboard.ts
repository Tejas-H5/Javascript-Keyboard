import "src/css/layout.css";
import {
    div,
    getState,
    RenderGroup,
    span
} from "src/utils/dom-utils";
import {
    getCurrentOscillatorGain,
    pressKey,
    releaseKey
} from "./dsp-loop-interface";
import "./main.css";
import {
    getCurrentPlayingTimeRelative,
    timelineHasNoteAtPosition
} from "./sequencer-state";
import {
    InstrumentKey
} from "./state";
import { RenderContext } from "./render-context";


export function Keyboard(rg: RenderGroup<RenderContext>) {
    function KeyboardRow(rg: RenderGroup<{
        s: RenderContext;
        keys: InstrumentKey[];
        keySize: number;
        startOffset: number;
    }>) {
        rg.skipErrorBoundary = true;

        function KeyboardKey(rg: RenderGroup<{
            ctx: RenderContext;
            key: InstrumentKey;
            keySize: number;
        }>) {
            rg.skipErrorBoundary = true;

            function ApproachSquare(rg: RenderGroup<{
                currentTime: number;
                keyTime: number;
            }>) {
                rg.skipErrorBoundary = true;

                const keyMarkedColor = `var(--playback)`;

                let t = 0;
                let scale = 0;
                rg.preRenderFn(s => {
                    t = s.keyTime;
                    scale = 250 * Math.max(0, t)
                });

                return div({}, [
                    div({
                        class: "absolute",
                        style: `top: 0; left: 0; bottom: 0; right: 0; background-color: ${keyMarkedColor};`
                    }, [
                        rg.style("opacity", () => "" + t),
                    ]),
                    // This osu! style border kinda whack ngl.
                    // div({
                    //     class: "absolute",
                    //     style: "border: 5px solid var(--fg); opacity: 1;"
                    // }, [
                    //     rg.style("top", () => -scale + "px"),
                    //     rg.style("left", () => -scale + "px"),
                    //     rg.style("bottom", () => -scale + "px"),
                    //     rg.style("right", () => -scale + "px"),
                    // ]),
                ]);
            }

            function handlePress() {
                const s = getState(rg);
                pressKey(s.key);
                s.ctx.render();
            }

            function handleRelease() {
                const s = getState(rg);
                releaseKey(s.key);
                s.ctx.render();
            }

            let signal = 0;
            let pressEffect = 0;
            let hasNote = false;

            rg.preRenderFn((s) => {
                signal = getCurrentOscillatorGain(s.key.index);

                const sequencer = s.ctx.globalState.sequencer;
                hasNote = timelineHasNoteAtPosition(
                    sequencer.timeline,
                    sequencer.cursorStart,
                    sequencer.cursorDivisor,
                    s.key.musicNote,
                );

                const PRESS_EFFECT = 5;

                // later, this press effect should use the signal when actually playing.
                pressEffect = PRESS_EFFECT *
                    // Math.max(signal, hasNote ? 1 : 0);
                    (hasNote ? 1 : 0);
            });


            return span({
                class: " relative",
                style: "font-family: monospace; outline: 1px solid var(--foreground);" +
                    "display: inline-block; text-align: center; user-select: none;",
            }, [
                rg.style("width", s => s.keySize + "px"),
                rg.style("height", s => s.keySize + "px"),
                rg.style("fontSize", s => (s.keySize / 2) + "px"),
                rg.style("color", () => signal > 0.1 ? `var(--bg)` : `var(--fg)`),
                rg.style("transform", () => `translate(${pressEffect}px, ${pressEffect}px)`),
                rg.on("mousedown", handlePress),
                rg.on("mouseup", handleRelease),
                rg.on("mouseleave", handleRelease),

                // indicator that shows if it's pressed on the sequencer
                div({
                    style: "position: absolute; top:0px; left: 0; right:0; bottom: 0;"
                }, [
                    rg.style("backgroundColor", (s) => hasNote ? `var(--mg)` : "#0000"),
                ]),
                // letter bg
                div({
                    style: "position: absolute; top:0px; left: 0; right:0; bottom: 0;"
                }, [
                    rg.style("backgroundColor", () => `rgba(0, 0, 0, ${signal})`),
                ]),
                // letter text
                div({ style: "position: absolute; top:5px; left: 0; right:0;" }, [
                    rg.text(s => s.key.text)
                ]),
                div({
                    style: "position: absolute; bottom:5px; left: 0; right:0;" +
                        "text-align: right;"
                }, [
                    rg.style("fontSize", s => (s.keySize / 4) + "px"),
                    rg.style("paddingRight", s => (s.keySize / 10) + "px"),
                    rg.text(s => s.key.noteText),
                ]),
                rg.list(div(), ApproachSquare, (getNext, s) => {
                    // need to iterate over all the notes within the approach window, 
                    // could need multiple approach squares for this key.
                    const sequencer = s.ctx.globalState.sequencer;
                    if (!sequencer.isPlaying) {
                        return;
                    }

                    const currentTime = getCurrentPlayingTimeRelative(sequencer);

                    const scheduledKeyPresses = s.ctx.globalState.scheduledKeyPresses;
                    for (let i = 0; i < scheduledKeyPresses.length; i++) {
                        const scheduledPress = scheduledKeyPresses[i];
                        if (scheduledPress.keyId !== s.key.index) {
                            continue;
                        }
                        if (!scheduledPress.pressed) {
                            continue;
                        }

                        const APPROACH_WINDOW = 500;
                        const PERSIST_WINDOW = 200;

                        const relativeTime = currentTime - scheduledPress.time;
                        if (relativeTime < -APPROACH_WINDOW) {
                            continue;
                        }

                        if (relativeTime > PERSIST_WINDOW) {
                            continue;
                        }

                        getNext().render({
                            currentTime,
                            keyTime: -relativeTime / APPROACH_WINDOW,
                        });
                    }
                }),
            ]);
        }

        return div({ class: "row", style: "gap: 5px;" }, [
            div({}, [
                rg.style("width", s => (s.startOffset * s.keySize) + "px"),
            ]),
            rg.list(div({ class: "row" }), KeyboardKey, (getNext, s) => {
                for (let i = 0; i < s.keys.length; i++) {
                    const key = getNext();
                    key.render({ 
                        ctx: s.s,
                        key: s.keys[i], 
                        keySize: s.keySize 
                    });
                }
            })
        ]);
    }

    const root = div({ class: "" });

    return rg.list(root, KeyboardRow, (getNext, s) => {
        const offsets = [
            0,
            0.5,
            0.75,
            1.25,
            1.75,
        ];

        let maxOffset = 0;
        const keys = s.globalState.keys;

        for (let i = 0; i < keys.length; i++) {
            const row = s.globalState.keys[i];
            let computedOffset = offsets[i] + row.length + 1;
            maxOffset = Math.max(maxOffset, computedOffset);
        }

        const parent = root.el.parentElement!;
        const width = parent.clientWidth;
        const height = parent.clientHeight;
        const keySize = Math.min(
            width / maxOffset,
            height / (s.globalState.keys.length),
        )

        for (let i = 0; i < keys.length; i++) {
            const row = keys[i];
            const c = getNext();
            c.render({
                s: s,
                keys: row,
                keySize,
                startOffset: offsets[i],
            });
        }
    });
}
