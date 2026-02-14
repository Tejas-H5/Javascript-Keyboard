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
import {
    ImCache,
    imGetInline,
    imIf,
    imIfEnd,
    imMemo,
    imSet,
    imState,
    isFirstishRender
} from "src/utils/im-core.ts";
import { EL_B, EV_INPUT, imElBegin, imElEnd, imOn, imStr } from "src/utils/im-dom.ts";
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
    const refocused = imMemo(c, true);
    let s; s = imGetInline(c, imImportModal); 
    if (!s || refocused) {
        s = imSet(c, newImportModalState());
    }

    imModalBegin(c, 200); imPadding(c, 10, PX, 10, PX, 10, PX, 10, PX); {
        imLayoutBegin(c, COL); imSize(c, 100, PERCENT, 100, PERCENT); imBg(c, cssVars.bg); {
            imLayoutBegin(c, COL); imFlex(c); imScrollOverflow(c); {
                const [_, textArea] = imTextAreaBegin(c, {
                    value: s.json,
                    placeholder: "Paste in your wave program JSON!"
                }); {
                    if (isFirstishRender(c)) {
                    }

                    const ev = imOn(c, EV_INPUT);
                    if (ev) {
                        s.json = textArea.value;
                        s.event = { previewUpdated: true };
                    }
                } imTextAreaEnd(c);
            } imLayoutEnd(c);

            if (imIf(c) && s.importError) {
                imLayoutBegin(c, BLOCK); imBg(c, cssVarsApp.error); {
                    imStr(c, s.importError);
                } imLayoutEnd(c);
            } imIfEnd(c);

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
        imElBegin(c, EL_B); imStr(c, text); imElEnd(c, EL_B);
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
    const s = imState(c, newExportModalState);
    if (imMemo(c, true)) {
        s.json = customSerializer ? customSerializer(jsonSerializable) : JSON.stringify(jsonSerializable);
    }

    imModalBegin(c, 200); imPadding(c, 10, PX, 10, PX, 10, PX, 10, PX); {
        imLayoutBegin(c, COL); imSize(c, 100, PERCENT, 100, PERCENT); imBg(c, cssVars.bg); {
            imHeading(c, "Paste this JSON somewhere safe!");

            imLayoutBegin(c, BLOCK); imFlex(c); imScrollOverflow(c); {
                imStr(c, s.json);
            } imLayoutEnd(c);
        } imLayoutEnd(c);
    } imModalEnd(c);

    return s;
}
