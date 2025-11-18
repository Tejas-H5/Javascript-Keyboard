import { expectEqual, newTest, Test, testSuite } from "src/utils/testing";
import {
    compileInstructions,
    computeSample,
    IDX_OUTPUT,
    IDX_PRESSED_TIME,
    IDX_USER,
    IDX_WANTED_FREQUENCY,
    INSTR_ADD,
    INSTR_JUMP_IF_Z,
    INSTR_LT,
    INSTR_MULTIPLY_DT,
    INSTR_SIN,
    InstructionPart,
    newDspInstruction,
    newSampleContext,
    OFFSET_INSTRUCTION_SIZE,
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
    expected: InstructionPart[]
) {
    const expectedCompiled: number[] = [];
    for (const inst of expected) {
        pushInstruction(inst, expectedCompiled);
    }

    return expectEqual(test, requirement, compiled, expectedCompiled);
}

function expectTimeSeriesEqual(
    test: Test<any>,
    requirement: string,
    a: [number, number][],
    b: [number, number][],
) {
    expectEqual(test, requirement, a, b, { 
        floatingPointTolerance: 0.0000001 
    });
}

export const dspLoopInstructionSetTests = [
    testSuite("Programmable DSP Compilation", newTestContext, [
        newTest("Simple program", (test, ctx) => {
            const instructions = [
                { instruction: newDspInstruction(INSTR_SIN, IDX_WANTED_FREQUENCY, true, IDX_PRESSED_TIME, true, IDX_OUTPUT) },
            ];
            const compiled = compileInstructions(instructions);

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

            const expected: [number, number][] = [
                [0, 0],
                [0.25, 1],
                [0.5, 0],
                [0.75, -1]
            ];

            expectTimeSeriesEqual(test, "Outputs a sine wave", results, expected);
        }),
        newTest("If generation", (test, ctx) => {
            const TEMP_IDX = IDX_USER + 0;
            const instructions = [
                { instruction: newDspInstruction(INSTR_MULTIPLY_DT, 100, false, 1, false, TEMP_IDX) },
                { instruction: newDspInstruction(INSTR_ADD, TEMP_IDX, true, IDX_OUTPUT, true, IDX_OUTPUT) },
                { 
                    instruction: newDspInstruction(INSTR_LT, IDX_OUTPUT, true, 100, false, TEMP_IDX),
                    ifelseInnerBlock: {
                        isElseBlock: false,
                        inner: [
                            { instruction: newDspInstruction(INSTR_MULTIPLY_DT, 100, false, 1, false, TEMP_IDX) },
                            { instruction: newDspInstruction(INSTR_ADD, TEMP_IDX, true, IDX_OUTPUT, true, IDX_OUTPUT) },
                        ],
                    },
                }, 
                { 
                    ifelseInnerBlock: {
                        isElseBlock: true,
                        inner: [
                            { instruction: newDspInstruction(INSTR_MULTIPLY_DT, -100, false, 1, false, TEMP_IDX) },
                            { instruction: newDspInstruction(INSTR_ADD, TEMP_IDX, true, IDX_OUTPUT, true, IDX_OUTPUT) },
                        ],
                    },
                },
            ];
            const compiled = compileInstructions(instructions);

            // Should've intermediate representation'd :(
            // ahh its a trivial language with limited scope so I wont bother fixing for now
            expectInstructionsEqual(test, "Compiled correctly", compiled, [
                newDspInstruction(INSTR_MULTIPLY_DT, 100, false, 1, false, TEMP_IDX),                       // 0
                newDspInstruction(INSTR_ADD, TEMP_IDX, true, IDX_OUTPUT, true, IDX_OUTPUT),                 // 1
                newDspInstruction(INSTR_LT, IDX_OUTPUT, true, 100, false, TEMP_IDX),                        // 2
                newDspInstruction(INSTR_JUMP_IF_Z, TEMP_IDX, true, 7 * OFFSET_INSTRUCTION_SIZE, false, -1), // 3
                    newDspInstruction(INSTR_MULTIPLY_DT, 100, false, 1, false, TEMP_IDX),                   // 4
                    newDspInstruction(INSTR_ADD, TEMP_IDX, true, IDX_OUTPUT, true, IDX_OUTPUT),             // 5
                    newDspInstruction(INSTR_JUMP_IF_Z, 0, false, 9 * OFFSET_INSTRUCTION_SIZE, false, -1),   // 6
                // else block has no jmps.
                    newDspInstruction(INSTR_MULTIPLY_DT, -100, false, 1, false, TEMP_IDX),                  // 7
                    newDspInstruction(INSTR_ADD, TEMP_IDX, true, IDX_OUTPUT, true, IDX_OUTPUT),             // 9
                // Final if-statement doesn't actually need to be closed off !!
            ]);
        }),
    ]),
]
