import { imModalBegin, imModalEnd } from "app-components/modal.ts";
import { imButtonIsClicked } from "components/button.ts";
import {BLOCK, COL, PERCENT, PX, ROW, imui, cssVars, } from "imcf/im-ui";
import { imTextAreaBegin, imTextAreaEnd } from "components/editable-text-area.ts";
import { im, ImCache, imdom, el, ev, } from "imcf";

import { cssVarsApp } from "./styling.ts";

export type ImportEvent = {
    previewUpdated?: boolean;
    import?: boolean;
};

export type ImportModalState = {
    json: string;
    importError: string;
    event: ImportEvent | null;
};

function newImportModalState(): ImportModalState {
    return {
        json: "",
        importError: "",
        event: null,
    };
}

export function imImportModal(c: ImCache): ImportModalState {
    const refocused = im.Memo(c, true);
    let s; s = im.GetInline(c, imImportModal); 
    if (!s || refocused) {
        s = im.Set(c, newImportModalState());
    }

    imModalBegin(c, 400); imui.Padding(c, 10, PX, 10, PX, 10, PX, 10, PX); {
        imui.Begin(c, COL); imui.Size(c, 100, PERCENT, 100, PERCENT); imui.Bg(c, cssVars.bg); {
            imui.Begin(c, COL); imui.Flex(c); imui.ScrollOverflow(c); {
                const [_, textArea] = imTextAreaBegin(c, {
                    value: s.json,
                    placeholder: "Paste in your wave program JSON!"
                }); {
                    if (im.IsFirstRender(c)) {
                    }

                    const inputEv = imdom.On(c, ev.INPUT);
                    if (inputEv) {
                        s.json = textArea.value;
                        s.event = { previewUpdated: true };
                    }
                } imTextAreaEnd(c);
            } imui.End(c);

            if (im.If(c) && s.importError) {
                imui.Begin(c, BLOCK); imui.Bg(c, cssVarsApp.error); {
                    imdom.Str(c, s.importError);
                } imui.End(c);
            } im.IfEnd(c);

            imui.Begin(c, ROW); {
                if (imButtonIsClicked(c, "Import")) {
                    s.event = { import: true };
                }
            } imui.End(c);
        } imui.End(c);
    } imModalEnd(c);

    return s;
}

function imHeading(c: ImCache, text: string) {
    imui.Begin(c, ROW); imui.Justify(c); {
        imdom.ElBegin(c, el.B); imdom.Str(c, text); imdom.ElEnd(c, el.B);
    } imui.End(c);
}


export type ExportModalState = {
    json: string;
};

function newExportModalState(): ExportModalState {
    return {
        json: "",
    };
}

export function imExportModal<T>(c: ImCache, jsonSerializable: T, customSerializer?: (val: T) => string): ExportModalState {
    const s = im.State(c, newExportModalState);
    if (im.Memo(c, true)) {
        s.json = customSerializer ? customSerializer(jsonSerializable) : JSON.stringify(jsonSerializable);
    }

    imModalBegin(c, 200); imui.Padding(c, 10, PX, 10, PX, 10, PX, 10, PX); {
        imui.Begin(c, COL); imui.Size(c, 100, PERCENT, 100, PERCENT); imui.Bg(c, cssVars.bg); {
            imHeading(c, "Paste this JSON somewhere safe!");

            imui.Begin(c, BLOCK); imui.Flex(c); imui.ScrollOverflow(c); {
                imdom.Str(c, s.json);
            } imui.End(c);
        } imui.End(c);
    } imModalEnd(c);

    return s;
}
