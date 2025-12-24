import { imModalBegin, imModalEnd } from "src/app-components/modal";
import { imButtonIsClicked } from "src/components/button";
import {
    BLOCK,
    COL,
    imBg,
    imFlex,
    imJustify,
    imLayout,
    imLayoutEnd,
    imPadding,
    imScrollOverflow,
    imSize,
    PERCENT,
    PX,
    ROW
} from "src/components/core/layout";
import { cssVars } from "src/components/core/stylesheets";
import { imTextAreaBegin, imTextAreaEnd } from "src/components/editable-text-area";
import {
    ImCache,
    imGetInline,
    imIf,
    imIfEnd,
    imMemo,
    imSet,
    imState,
    isFirstishRender
} from "src/utils/im-core";
import { EL_B, EV_INPUT, imEl, imElEnd, imOn, imStr } from "src/utils/im-dom";
import { cssVarsApp } from "./styling";

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
        imLayout(c, COL); imSize(c, 100, PERCENT, 100, PERCENT); imBg(c, cssVars.bg); {
            imLayout(c, COL); imFlex(c); imScrollOverflow(c); {
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
                imLayout(c, BLOCK); imBg(c, cssVarsApp.error); {
                    imStr(c, s.importError);
                } imLayoutEnd(c);
            } imIfEnd(c);

            imLayout(c, ROW); {
                if (imButtonIsClicked(c, "Import")) {
                    s.event = { import: true };
                }
            } imLayoutEnd(c);
        } imLayoutEnd(c);
    } imModalEnd(c);

    return s;
}

function imHeading(c: ImCache, text: string) {
    imLayout(c, ROW); imJustify(c); {
        imEl(c, EL_B); imStr(c, text); imElEnd(c, EL_B);
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
        imLayout(c, COL); imSize(c, 100, PERCENT, 100, PERCENT); imBg(c, cssVars.bg); {
            imHeading(c, "Paste this JSON somewhere safe!");

            imLayout(c, BLOCK); imFlex(c); imScrollOverflow(c); {
                imStr(c, s.json);
            } imLayoutEnd(c);
        } imLayoutEnd(c);
    } imModalEnd(c);

    return s;
}
