import { expectEqual, newTest, Test, testSuite } from "src/utils/testing";
import {
    compileInstructions,
    computeSample,
    DspSynthInstructionItem,
    IDX_OUTPUT,
    IDX_PRESSED_TIME,
    IDX_WANTED_FREQUENCY,
    INSTR_SIN,
    newDspInstruction,
    newSampleContext,
    pushInstruction,
    SampleContext
} from "./dsp-loop-instruction-set";

// I recon that it is important to develop a testing philosophy, since it is really easy to just
// sit there writing a comphrehensive testing suite that tests every single codepath otherwise, which will eat into our limited time.
//
// Tests allow us to:
// - quickly debug certain niche scenarios, thus speeding up development
// - have a list of things we know to work, and catch some regressions
//
// Tests should not be used for:
// - Comprehensive testing of all possible things, unless it is very important or easy to do. This is a video game we're working on here, 
//      and there is currently 0 esports community around it, so it is probably not that important.o
// - Documenting how the code works. This is what documentation is for.

function newTestContext() {
    return {
        sampleContext: newSampleContext(),
    };
}

function computeNextAndAdvanceTime(sampleContext: SampleContext, instructions: number[]): [number, number] {
    const result = computeSample(sampleContext, instructions);
    const t = sampleContext.time;
    sampleContext.time += sampleContext.dt;
    return [t, result];
}

function expectInstructionsEqual(
    test: Test<any>,
    requirement: string,
    compiled: number[],
    expected: DspSynthInstructionItem[]
) {
    const expectedCompiled: number[] = [];
    for (const inst of expected) {
        pushInstruction(inst.instruction, expectedCompiled);
    }

    return expectEqual(test, requirement, compiled, expectedCompiled);
}

export const dspLoopInstructionSetTests = [
    testSuite("Programmable DSP Compilation", newTestContext, [
        newTest("Simple program", (test, ctx) => {
            const compiled = compileInstructions([
                newDspInstruction(INSTR_SIN, IDX_WANTED_FREQUENCY, true, IDX_PRESSED_TIME, true, IDX_OUTPUT),
            ]);

            expectInstructionsEqual(test, "Compiled correctly", compiled, [
                newDspInstruction(INSTR_SIN, IDX_WANTED_FREQUENCY, true, IDX_PRESSED_TIME, true, IDX_OUTPUT),
            ]);

            ctx.sampleContext.frequency = 1;
            ctx.sampleContext.time = 0;
            ctx.sampleContext.dt = 0.25;

            const results = [
                computeNextAndAdvanceTime(ctx.sampleContext, compiled),
                computeNextAndAdvanceTime(ctx.sampleContext, compiled),
                computeNextAndAdvanceTime(ctx.sampleContext, compiled),
                computeNextAndAdvanceTime(ctx.sampleContext, compiled),
            ];

            {
                expectEqual(
                    test,
                    "Outputs a sine wave",
                    results,
                    [
                        [0, 0],
                        [0.25, 1],
                        [0.5, 0],
                        [0.75, -1]
                    ],
                    {
                        floatingPointTolerance: 0.0000001
                    }
                );
            }
        }),
        newTest("AttackSustainDecay envelope", (test, ctx) => {
        }),
    ]),
    testSuite("Programmable DSP Execution", newTestContext, [
        newTest("blank", (test, ctx) => {
            const result = computeSample(ctx.sampleContext, []);
            expectEqual(test, "Blank computation works", result, 0);
        }),
        newTest("Simple program compiles and runs", (test, ctx) => {
            const compiled = compileInstructions([
                newDspInstruction(INSTR_SIN, IDX_WANTED_FREQUENCY, true, IDX_PRESSED_TIME, true, IDX_OUTPUT),
            ]);

            {
                const expectedCompiled: number[] = [];
                pushInstruction(
                    newDspInstruction(INSTR_SIN, IDX_WANTED_FREQUENCY, true, IDX_PRESSED_TIME, true, IDX_OUTPUT).instruction,
                    expectedCompiled
                );

                expectEqual(test, "Compiled correctly", compiled, expectedCompiled);
            }

            ctx.sampleContext.frequency = 1;
            ctx.sampleContext.time = 0;
            ctx.sampleContext.dt = 0.25;

            const results = [
                computeNextAndAdvanceTime(ctx.sampleContext, compiled),
                computeNextAndAdvanceTime(ctx.sampleContext, compiled),
                computeNextAndAdvanceTime(ctx.sampleContext, compiled),
                computeNextAndAdvanceTime(ctx.sampleContext, compiled),
            ];

            {
                expectEqual(
                    test,
                    "Outputs a sine wave",
                    results,
                    [
                        [0, 0],
                        [0.25, 1],
                        [0.5, 0],
                        [0.75, -1]
                    ],
                    {
                        floatingPointTolerance: 0.0000001
                    }
                );
            }
        }),
        newTest("AttackSustainDecay envelope", (test, ctx) => {
        }),
    ])
]
