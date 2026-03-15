import { imModalBegin, imModalEnd } from "src/app-components/modal";
import { imTestHarness } from "src/components/test-harness";
import { COL, cssVars, imui, PERCENT, PX } from "src/utils/im-js/im-ui";

import { ImCache } from "src/utils/im-js";
import { GlobalContext } from "src/views/app";

import "src/utils/fft.test";
import "src/utils/serialization-utils.test";
import "src/utils/testing.test";
import "src/utils/undo-buffer-json.test";

export type UnitTestsState = {
};

export function newUnitTestsState(): UnitTestsState {
    return {
    };
}

export function imUnitTestsModal(c: ImCache, ctx: GlobalContext, s: UnitTestsState) {
    imModalBegin(c, 200); imui.Padding(c, 10, PX, 10, PX, 10, PX, 10, PX); {
        imui.Begin(c, COL); imui.Size(c, 100, PERCENT, 100, PERCENT); imui.Bg(c, cssVars.bg); {
            imTestHarness(c);
        } imui.End(c);
    } imModalEnd(c);

    if (!ctx.handled) {
        if (ctx.keyPressState) {
            if (ctx.keyPressState.key === "Escape") {
                ctx.ui.unitTestModal = null;
                ctx.handled = true;
            }
        }
    }
}
