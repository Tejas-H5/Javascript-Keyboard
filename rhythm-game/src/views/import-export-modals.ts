import { imModalBegin, imModalEnd } from "src/app-components/modal.ts";
import { imButtonIsClicked } from "src/components/button.ts";
import {
    BLOCK,
    COL,
    imBg,
    imFlex,
    imJustify,
    imLayoutBegin,
    imLayoutEnd,
    imPadding,
    imScrollOverflow,
    imSize,
    PERCENT,
    PX,
    ROW
} from "src/components/core/layout.ts";
import { cssVars } from "src/components/core/stylesheets.ts";
import { imTextAreaBegin, imTextAreaEnd } from "src/components/editable-text-area.ts";
import { im, ImCache, imdom, el, ev, } from "src/utils/im-js";

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

    imModalBegin(c, 200); imPadding(c, 10, PX, 10, PX, 10, PX, 10, PX); {
        imLayoutBegin(c, COL); imSize(c, 100, PERCENT, 100, PERCENT); imBg(c, cssVars.bg); {
            imLayoutBegin(c, COL); imFlex(c); imScrollOverflow(c); {
                const [_, textArea] = imTextAreaBegin(c, {
                    value: s.json,
                    placeholder: "Paste in your wave program JSON!"
                }); {
                    if (im.isFirstishRender(c)) {
                    }

                    const inputEv = imdom.On(c, ev.INPUT);
                    if (inputEv) {
                        s.json = textArea.value;
                        s.event = { previewUpdated: true };
                    }
                } imTextAreaEnd(c);
            } imLayoutEnd(c);

            if (im.If(c) && s.importError) {
                imLayoutBegin(c, BLOCK); imBg(c, cssVarsApp.error); {
                    imdom.Str(c, s.importError);
                } imLayoutEnd(c);
            } im.IfEnd(c);

            imLayoutBegin(c, ROW); {
                if (imButtonIsClicked(c, "Import")) {
                    s.event = { import: true };
                }
            } imLayoutEnd(c);
        } imLayoutEnd(c);
    } imModalEnd(c);

    return s;
}

function imHeading(c: ImCache, text: string) {
    imLayoutBegin(c, ROW); imJustify(c); {
        imdom.ElBegin(c, el.B); imdom.Str(c, text); imdom.ElEnd(c, el.B);
    } imLayoutEnd(c);
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

    imModalBegin(c, 200); imPadding(c, 10, PX, 10, PX, 10, PX, 10, PX); {
        imLayoutBegin(c, COL); imSize(c, 100, PERCENT, 100, PERCENT); imBg(c, cssVars.bg); {
            imHeading(c, "Paste this JSON somewhere safe!");

            imLayoutBegin(c, BLOCK); imFlex(c); imScrollOverflow(c); {
                imdom.Str(c, s.json);
            } imLayoutEnd(c);
        } imLayoutEnd(c);
    } imModalEnd(c);

    return s;
}
