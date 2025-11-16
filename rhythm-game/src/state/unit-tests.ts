import { imModalBegin, imModalEnd } from "src/app-components/modal";
import { imTestHarness } from "src/components/test-harness";
import { COL, imBg, imLayout, imLayoutEnd, imPadding, imSize, PERCENT, PX } from "src/components/core/layout";
import { cssVars } from "src/components/core/stylesheets";
import { dspLoopInstructionSetTests } from "src/dsp/dsp-loop-instruction-set-tests";
import { ImCache } from "src/utils/im-core";
import { TestSuite } from "src/utils/testing";
import { GlobalContext } from "src/views/app";

export type UnitTestsState = {
};

export function newUnitTestsState(): UnitTestsState {
    return {
    };
}

const testSuites: TestSuite<any>[] = [
    ...dspLoopInstructionSetTests,
];

export function imUnitTestsModal(c: ImCache, ctx: GlobalContext, s: UnitTestsState) {
    imModalBegin(c, 200); imPadding(c, 10, PX, 10, PX, 10, PX, 10, PX); {
        imLayout(c, COL); imSize(c, 100, PERCENT, 100, PERCENT); imBg(c, cssVars.bg); {
            imTestHarness(c, testSuites);
        } imLayoutEnd(c);
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
