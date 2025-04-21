import { getCurrentOscillatorGain, getCurrentOscillatorOwner } from "src/dsp/dsp-loop-interface";
import {
    InstrumentKey,
    KeyboardState
} from "src/state/keyboard-state";
import {
    getSequencerPlaybackOrEditingCursor,
    getTimelineMusicNoteThreads,
    NoteMapEntry
} from "src/state/sequencer-state";
import { div, RenderGroup, span, lerpColor, newColor, cn } from "src/utils/dom-utils";
import { inverseLerp } from "src/utils/math-utils";
import { getNoteHashKey } from "src/utils/music-theory-utils";
import { GlobalContext } from "./app";
import { cssVars, getCurrentTheme } from "./styling";
import { 
    CommandItem,
    getItemLengthBeats,
    getItemStartBeats,
    NoteItem,
} from "./chart";

const GAMEPLAY_LOOKAHEAD_BEATS = 2;
const GAMEPLAY_LOADAHEAD_BEATS = 6;

export type KeysMapEntry = { 
    instrumentKey: InstrumentKey;

    // NOTE: this is a non-owning reference
    _items: NoteItem[];
};

export function notesMapToKeysMap(
    keyboard: KeyboardState,
    srcNotesMap: Map<string, NoteMapEntry>,
    dstKeysMap: Map<string, KeysMapEntry>,
) {
    for (const k of keyboard.flatKeys) {
        let block = dstKeysMap.get(k.keyboardKey);
        if (!block) {
            block = { instrumentKey: k, _items: [] };
            dstKeysMap.set(k.keyboardKey, block);
        }

        const noteHashKey = getNoteHashKey(k.musicNote);
        const notesMapEntry = srcNotesMap.get(noteHashKey);
        if (!notesMapEntry) {
            continue;
        }

        block._items = notesMapEntry.items;
    }
}


export function Gameplay(rg: RenderGroup<GlobalContext>) {
    let start = 0;
    let midpoint = 0;

    const notesMap = new Map<string, NoteMapEntry>();
    const keysMap = new Map<string, KeysMapEntry>();
    const commandsList: CommandItem[] = [];

    rg.preRenderFn(s => {
        start = getSequencerPlaybackOrEditingCursor(s.sequencer);

        const tl = s.sequencer._currentChart.timeline;

        getTimelineMusicNoteThreads(
            tl,
            start,
            start + GAMEPLAY_LOADAHEAD_BEATS,
            notesMap,
            commandsList
        );

        notesMapToKeysMap(s.keyboard, notesMap, keysMap);

        midpoint = Math.floor(keysMap.size / 2);
    });

    return div({
        class: [cn.flex1, cn.col, cn.alignItemsStretch, cn.justifyContentCenter, cn.overflowHidden]
    }, [
        div({ class: [cn.flex1, cn.row, cn.alignItemsStretch, cn.justifyContentCenter, cn.overflowHidden] }, [
            rg.list(div({ class: [cn.contents] }), VerticalThread, (getNext, s) => {
                for (const thread of keysMap.values()) {
                    getNext().render({
                        ctx: s,
                        thread: thread._items,
                        start,
                        instrumentKey: thread.instrumentKey,
                    })
                }
            }),
        ]),
    ]);
}

function VerticalThread(rg: RenderGroup<{
    ctx: GlobalContext;
    thread: NoteItem[];
    start: number;
    instrumentKey: InstrumentKey;
}>) {
    let signal = 0;
    let owner = 0;
    let backgroundColor = "";

    const currentBgColor = newColor(0, 0, 0, 1);


    rg.preRenderFn(s => {
        owner = getCurrentOscillatorOwner(s.instrumentKey.index) 
        signal = getCurrentOscillatorGain(s.instrumentKey.index) 

        const theme = getCurrentTheme();
        const hasPress = (owner === 0 && signal > 0.001);

        const wantedBgColor = s.thread.length > 0 ? theme.bg2 : theme.bg;
        const wantedFgColor = s.thread.length > 0 ? theme.fg2 : theme.error;

        lerpColor(wantedBgColor, wantedFgColor, hasPress ? signal : 0, currentBgColor);
        backgroundColor = currentBgColor.toCssString();
    });

    function createLetter() {
        return span({ style: "transition: color 0.2s; height: 2ch;" }, [
            rg.style("color", s => s.thread.length === 0 ? cssVars.bg2 : cssVars.fg),
            rg.text((s) => s.instrumentKey ? s.instrumentKey.text : "?"),
        ]);
    }

    return div({ class: [cn.row, cn.alignItemsStretch, cn.justifyContentStart] }, [
        rg.if(s => s.instrumentKey.isLeftmost, rg => rg &&
            div({ style: `width: 2px; background: ${cssVars.fg}` })
        ),
        div({ 
            class: [cn.col, cn.alignItemsCenter, cn.justifyContentCenter],
            style: "width: 40px; font-size: 64px;" 
        }, [
            createLetter(),
            div({ style: `width: 100%; height: 2px; background-color: ${cssVars.fg};` }),
            div({ 
                class: [cn.flex1, cn.relative, cn.w100, cn.overflowHidden], 
                style: "transition: background-color 0.2s;" 
            }, [
                rg.style("backgroundColor", () => backgroundColor),
                rg.list(div({ class: [cn.contents] }), Bar, (getNext, s) => {
                    for (const item of s.thread) {
                        getNext().render({
                            ctx: s.ctx,
                            instrumentKey: s.instrumentKey,
                            item, 
                            start: s.start,
                        });
                    }
                }),
            ]),
            div({ style: `width: 100%; height: 2px; background-color: ${cssVars.fg};` }),
            createLetter(),
        ]),
        rg.if(s => s.instrumentKey.isRightmost, rg => rg &&
            div({ style: `width: 2px; background: ${cssVars.fg}` })
        ),
    ]);
}

function Bar(rg: RenderGroup<{
    ctx: GlobalContext;
    instrumentKey: InstrumentKey;
    item: NoteItem;
    start: number;
}>) {
    let heightPercent = 0;
    let bottomPercent = 0;

    let animation = 0;
    let color = "";

    rg.preRenderFn(s => {
        const start = s.start;
        const end = start + GAMEPLAY_LOOKAHEAD_BEATS;
        const itemStart = getItemStartBeats(s.item);
        const itemLength = getItemLengthBeats(s.item);

        bottomPercent = 100 * inverseLerp(itemStart, start, end);
        heightPercent = 100 * itemLength / GAMEPLAY_LOOKAHEAD_BEATS;

        if (bottomPercent <= 0) {
            // prevent the bar from going past the midpoint line
            heightPercent += bottomPercent;
            bottomPercent = 0;

        }

        if (bottomPercent < 0.1) {
            // give user an indication that they should care about the fact that this bar has reached the bottm.
            // hopefully they'll see the keyboard letter just below it, and try pressing it.
            animation += s.ctx.dt;
            if (animation > 1) {
                animation = 0;
            }
        } else {
            animation = 0;
        }

        color = animation > 0.5 ? "#FFFF00" : cssVars.fg;
        // color = animation < 0.5 ? "#FFFF00" : s.instrumentKey.cssColours.normal;
    });

    return div({
        style: "position: absolute; left: 0; right: 0; z-index: 10;" +
            "color: transparent;"
    }, [
        rg.style("bottom", () => bottomPercent + "%"),
        rg.style("height", () => heightPercent + "%"),
        div({ style: `width: 100%; height: 100%; position: relative; background-color: ${cssVars.fg}` }, [
            div({
                style: "position: absolute; left: 2px; right: 2px; top: 2px; bottom: 2px;" +
                    "transition: background-color 0.2s;"
            }, [
                rg.style("backgroundColor", () => color),
            ])
        ])
    ]);
}


