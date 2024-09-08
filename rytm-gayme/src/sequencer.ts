import { Button } from "./components/button";
import { SEQ_ITEM, SequencerLine, SequencerLineItem, SequencerState, SequencerTrack, getCurrentLine, getItemSelectionRange, setCurrentLineIdx } from "./state";
import { div, getState, RenderGroup, scrollIntoView, span } from "./utils/dom-utils";
import { getNoteText } from "./utils/music-theory-utils";

function SequencerLineUI(rg: RenderGroup<{
    lineIdx: number;
    track: SequencerTrack;
    state: SequencerState;
    render(): void;
}>) {

    function handleHoverRow(lineIdx: number) {
        const s = getState(rg);
        s.state.currentHoveredLineIdx = lineIdx;
        s.render();
    }

    function handleClickRow(lineIdx: number) {
        const s = getState(rg);
        setCurrentLineIdx(s.state, lineIdx);
        s.render();
    }

    function isLineSelected(state: SequencerState, row: number) {
        return state.currentSelectedLineIdx === row;
    }

    function isLineHovered(state: SequencerState, row: number) {
        return state.currentHoveredLineIdx === row;
    }

    let line: SequencerLine;
    rg.preRenderFn((s) => {
        line = s.track.lines[s.lineIdx];
    });

    const itemsListRoot = (() => {
        function SequencerItemUI(rg: RenderGroup<{
            lineIdx: number;
            itemIdx: number;
            line: SequencerLine;
            state: SequencerState;
            render(): void;
        }>) {
            function isLineItemPlaying(state: SequencerState, lineIdx: number, itemIdx: number) {
                if (state.lastPlayingLineIdx !== lineIdx) {
                    return false;
                }

                const idx = state.lastPlayingItemIdx;
                const item = line.items[idx];
                let minIdx = idx;
                let maxIdx = idx;
                if (item.t === SEQ_ITEM.HOLD) {
                    while (minIdx > 0) {
                        const isHold = line.items[minIdx - 1].t === SEQ_ITEM.HOLD;
                        const isChord = line.items[minIdx - 1].t === SEQ_ITEM.CHORD;
                        if (isHold) {
                            minIdx--;
                            continue;
                        }

                        if (isChord) {
                            minIdx--;
                            break;
                        }

                        break;
                    }
                }

                return minIdx <= itemIdx && itemIdx <= maxIdx;
            }

            function isLineItemSelected(state: SequencerState, line: number, item: number): boolean {
                if (state.currentSelectedLineIdx !== line) {
                    return false
                }

                if (state.currentSelectedItemIdx === item) {
                    return true;
                }

                // range selection
                if (state.currentSelectedItemStartIdx !== -1) {
                    const [min, max] = getItemSelectionRange(state);
                    if (min <= item && item <= max) {
                        return true;
                    }
                }

                return false;
            }

            function isLineItemHovered(state: SequencerState, row: number, col: number) {
                return state.currentHoveredLineIdx === row
                    && state.currentHoveredItemIdx === col;
            }


            let item: SequencerLineItem;
            let isPlaying = false;
            let isSelected = false;
            rg.preRenderFn(s => {
                item = s.line.items[s.itemIdx];
                isPlaying = isLineItemPlaying(s.state, s.lineIdx, s.itemIdx);
                if (isPlaying) {
                    s.state._currentPlayingEl = root;
                }

                isSelected = isLineItemSelected(s.state, s.lineIdx, s.itemIdx);
                if (isSelected) {
                    s.state._currentSelectedEl = root;
                }
            });

            const root = span({ class: "inline-block", style: "padding: 4px; border: 1px solid var(--fg);" }, [
                rg.on("mousemove", (s, e) => {
                    e.stopImmediatePropagation();
                    s.state.currentHoveredLineIdx = s.lineIdx;
                    s.state.currentHoveredItemIdx = s.itemIdx;
                    s.render();
                }),
                rg.on("click", (s) => {
                    setCurrentLineIdx(s.state, s.lineIdx, s.itemIdx);
                    s.render();
                }),
                rg.style(
                    "backgroundColor",
                    s => isPlaying ? "#00F" :
                        isSelected ? "var(--mg)" :
                            isLineItemHovered(s.state, s.lineIdx, s.itemIdx) ? "var(--mg)" :
                                ""
                ),
                rg.style(
                    "color",
                    s => isLineItemPlaying(s.state, s.lineIdx, s.itemIdx) ? "#FFF" : ""
                ),
                rg.text(s => {
                    if (item.t === SEQ_ITEM.REST) {
                        return ".";
                    }

                    if (item.t === SEQ_ITEM.HOLD) {
                        return "_";
                    }

                    if (item.t === SEQ_ITEM.CHORD) {
                        return item.notes.map(n => {
                            if (n.sample) return n.sample;
                            if (n.noteIndex) return getNoteText(n.noteIndex);
                            return "<???>";
                        }).join(" ");
                    }

                    return "<????>";
                })
            ]);

            return root;
        }

        const root = div({
            class: "flex-wrap",
            style: "padding: 10px; gap: 10px"
        });

        return rg.list(root, SequencerItemUI, (getNext, s) => {
            for (let i = 0; i < line.items.length; i++) {
                getNext().render({
                    lineIdx: s.lineIdx,
                    itemIdx: i,
                    line,
                    state: s.state,
                    render: s.render
                });
            }
        })
    })();

    rg.postRenderFn((s) => {
        if (!line._itemPositions) {
            line._itemPositions = [];
        }
        // need to store list item positions to handle navigation with wrapping correctly later.
        // TODO: monitor for performance regressions
        line._itemPositions.splice(0, line._itemPositions.length);
        for (const c of itemsListRoot.components) {
            const rect = c.el.getBoundingClientRect();
            line._itemPositions.push([rect.left, rect.top]); 
        }
    })

    return div({
        style: "font-size: 20px; border: 1px solid var(--fg);"
    }, [
        rg.on("mouseenter", s => handleHoverRow(s.lineIdx)),
        rg.on("mousedown", s => handleClickRow(s.lineIdx)),
        rg.style("borderBottom", s => s.lineIdx === s.track.lines.length - 1 ? "1px solid var(--fg)" : "none"),
        rg.style(
            "backgroundColor",
            s => isLineSelected(s.state, s.lineIdx) ? "var(--bg2)" :
                isLineHovered(s.state, s.lineIdx) ? "var(--bg2)" : "",
        ),
        div({class: "row" }, [
            div({ style: "width: 20px; border-right: 1px solid var(--fg)" }, [
                // TODO: range selection styles
            ]),
            div({ style: "width: 10px;" }),
            div({ class: "col align-items-stretch", style: "font-size: var(--normal)" }, [
                div({}, [
                    rg.c(BpmInput, (c, s) => c.render({
                        value: line.bpm,
                        onChange(value) {
                            line.bpm = value;
                            s.render();
                        }
                    })),
                    rg.c(DivisionInput, (c, s) => c.render({
                        value: line.division,
                        onChange(value) {
                            line.division = value;
                            s.render();
                        }
                    })),
                ]),
            ]),
            itemsListRoot
        ])
    ]);
}

function SequencerTrackUI(rg: RenderGroup<{ track: number; state: SequencerState; render(): void; }>) {
    return div({}, [
        div({}, [
            rg.text(s => "Track " + (s.track + 1)),
        ]),
        rg.list(div(), SequencerLineUI, (getNext, s) => {
            const track = s.state.sequencerTracks[s.track];
            for (let i = 0; i < track.lines.length; i++) {
                getNext().render({ track, lineIdx: i, render: s.render, state: s.state });
            }
        })
    ]);
}

export function Sequencer(rg: RenderGroup<{ state: SequencerState }>) {
    function handleMouseLeave() {
        const state = getState(rg).state;
        state.currentHoveredLineIdx = -1;
        state.currentHoveredItemIdx = -1;
        rg.renderWithCurrentState();
    }

    function handlePlay() {
        // TODO: step through the sequence
    }

    rg.preRenderFn(s => {
        s.state._currentSelectedEl = null;
        s.state._currentPlayingEl = null;
    });

    rg.postRenderFn(s => {
        const scrollEl = s.state._currentPlayingEl || s.state._currentSelectedEl;
        if (scrollEl) {
            scrollIntoView(scrollRoot.el, scrollEl, 0.5);
        }
    })

    const scrollRoot = div({
        class: "overflow-y-auto flex-1",
    }, [
        rg.on("mouseleave", handleMouseLeave),
    ]);

    return div({
        class: "flex-1 col",
        style: "padding: 10px",
    }, [
        rg.list(scrollRoot, SequencerTrackUI, (getNext, s) => {
            const { sequencerTracks } = s.state;
            for (let i = 0; i < sequencerTracks.length; i++) {
                getNext().render({ track: i, state: s.state, render: rg.renderWithCurrentState });
            }
        }),
    ]);
}


// allows someone to specifically select a number between 1 and 16
function DivisionInput(rg: RenderGroup<{
    value: number;
    onChange(val: number): void;
}>) {
    function onChange(val: number) {
        const s = getState(rg);
        if (val > 0 && val <= 16) {
            s.onChange(val);
        }
    }

    function getPrev(val: number) {
        //truly I can't think of the math formula for this...
        switch(val) {
            case 1: return 1;
            case 2: return 1;
            case 3: return 1;
            case 4: return 2;
            case 5: return 1;
            case 6: return 3;
            case 7: return 1;
            case 8: return 4;
            case 9: return 6;
            case 10: return 5;
            case 11: return 1;
            case 12: return 6;
            case 13: return 12;
            case 14: return 7;
            case 15: return 10;
            case 16: return 12;
        }
        throw new Error("Invalid val: " + val);
    }

    function getNext(val: number) {
        //truly I can't think of the math formula for this...
        switch(val) {
            case 1: return 2;
            case 2: return 4;
            case 3: return 6;
            case 4: return 8;
            case 5: return 10;
            case 6: return 12;
            case 7: return 14;
            case 8: return 16;
            case 9: return 12;
            case 10: return 15;
            case 11: return 13;
            case 12: return 16;
            case 13: return 15;
            case 14: return 16;
            case 15: return 16;
            case 16: return 16;
        }
        throw new Error("Invalid val: " + val);
    }

    return div({ class: "row justify-content-center" }, [
        rg.c(Button, (c, s) => c.render({
            text: "<",
            onClick() {
                onChange(getPrev(s.value));
            }
        })),
        rg.c(Button, (c, s) => c.render({
            text: "-",
            onClick: () => onChange(s.value - 1),
        })),
        div({ class: "flex-1" }),
        rg.text(s => "1 / " + s.value),
        div({ class: "flex-1" }),
        rg.c(Button, (c, s) => c.render({
            text: "+",
            onClick: () => onChange(s.value + 1),
        })),
        rg.c(Button, (c, s) => c.render({
            text: ">",
            onClick() {
                onChange(getNext(s.value));
            }
        })),
    ]);
}


function BpmInput(rg: RenderGroup<{
    value: number;
    onChange(val: number): void;
}>) {
    return div({ class: "row justify-content-center" }, [
        rg.c(Button, (c, s) => c.render({
            text: "<",
            onClick() {
                s.onChange(s.value - 10);
            }
        })),
        rg.c(Button, (c, s) => c.render({
            text: "-",
            onClick() {
                s.onChange(s.value - 1);
            }
        })),
        div({ class: "flex-1" }),
        rg.text(s => s.value.toFixed(1) + ""),
        div({ class: "flex-1" }),
        rg.c(Button, (c, s) => c.render({
            text: "+",
            onClick() {
                s.onChange(s.value + 1);
            }
        })),
        rg.c(Button, (c, s) => c.render({
            text: ">",
            onClick() {
                s.onChange(s.value + 10);
            }
        })),
    ]);
}

