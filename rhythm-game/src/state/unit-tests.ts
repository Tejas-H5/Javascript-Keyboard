import { imModalBegin, imModalEnd } from "app-components/modal";
import { imTestHarness } from "components/test-harness";
import { COL, cssVars, imui, PERCENT, PX } from "imcf/im-ui";

import { ImCache } from "imcf";
import { GlobalContext } from "views/app";

import "utils/fft.test";
import "utils/serialization-utils.test";
import "utils/testing.test";

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
