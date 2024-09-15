import { Button } from "./components/button";
import { getKeyForNote, getSelectionRangeTime, GlobalState, isItemPlaying, SequencerState, TimelineItem } from "./state";
import { unreachable } from "./utils/asserts";
import { div, getState, RenderGroup, scrollIntoView, span } from "./utils/dom-utils";
import { getNoteText } from "./utils/music-theory-utils";


function SequencerItemUI(rg: RenderGroup<{
    state: SequencerState;
    globalState: GlobalState;
    idx: number;
    render(): void;
}>) {

    let item: TimelineItem;
    let isPlaying = false;
    let isSelected = false;

    rg.preRenderFn(s => {
        item = s.state.timeline[s.idx];
        isPlaying = isItemPlaying(s.state, item);
        if (isPlaying) {
            s.state._currentPlayingEl = root;
        }

        const [minTime, maxTime] = getSelectionRangeTime(s.state);
        isSelected = minTime <= item.time && item.time <= maxTime;
        if (isSelected) {
            s.state._currentSelectedEl = root;
        }
    });

    function isLineItemHovered(state: SequencerState, idx: number) {
        return state.currentHoveredTimelineItemIdx === idx;
    }

    const root = span({ class: "inline-block relative", style: "padding: 4px; border: 1px solid var(--fg); overflow: overflow;" }, [
        rg.style(
            "backgroundColor",
            s => isPlaying ? "#00F" :
                isSelected ? "var(--mg)" :
                    isLineItemHovered(s.state, s.idx) ? "var(--mg)" :
                        ""
        ),
        rg.style("color", s => isPlaying ? "#FFF" : ""), 
        rg.text(s => {
            return getItemSequencerText(s.globalState, item, s.state.settings.showKeysInsteadOfABCDEFG);
        }),
    ]);

    return root;
}

export function getItemSequencerText(globalState: GlobalState, item: TimelineItem, useKeyboardKey: boolean): string {
    if (item.t === "chord") {
        return item.notes.map(n => {
            if (n.sample) return n.sample;
            if (n.noteIndex) {
                if (useKeyboardKey) {
                    const key = getKeyForNote(globalState, n);
                    return key?.text || "<??>";
                } else {
                    return getNoteText(n.noteIndex);
                }
            }
            return "<???>";
        }).join(" ");
    }

    if (item.t === "bpm") {
        return "bpm=" + item.bpm;
    }

    return unreachable(item);
}

export function Sequencer(rg: RenderGroup<{ 
    state: SequencerState; 
    globalState: GlobalState; 
}>) {
    function handleMouseLeave() {
        const state = getState(rg).state;
        state.currentHoveredTimelineItemIdx = -1;
        rg.renderWithCurrentState();
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
    });

    const scrollRoot = div({
        class: "overflow-y-auto flex-1",
    }, [
        rg.on("mouseleave", handleMouseLeave),
    ]);

    return div({
        class: "flex-1 col",
        style: "padding: 10px",
    }, [
        rg.list(scrollRoot, SequencerItemUI, (getNext, s) => {
            for (let i = 0; i < s.state.timeline.length; i++) {
                getNext().render({ 
                    state: s.state, 
                    render: rg.renderWithCurrentState,
                    globalState: s.globalState,
                    idx: i,
                });
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

