import { expectEqual, newTest, Test, testSuite } from "src/utils/testing";
import {
    compileInstructions,
    computeSample,
    IDX_OUTPUT,
    IDX_SIGNAL,
    IDX_USER,
    IDX_WANTED_FREQUENCY,
    INSTR_ADD,
    INSTR_ADD_DT,
    INSTR_JUMP_IF_Z,
    INSTR_LT,
    INSTR_MULTIPLY_DT,
    INSTR_SIN,
    InstructionPart,
    newDspInstruction,
    newSampleContext,
    OFFSET_INSTRUCTION_SIZE,
    pushInstruction,
    updateSampleContext
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
    a: number[],
    b: number[],
) {
    expectEqual(test, requirement, a, b, { 
        floatingPointTolerance: 0.0000001 
    });
}

export const dspLoopInstructionSetTests = [
    testSuite("Programmable DSP Compilation", newTestContext, [
        newTest("Simple program", (test, ctx) => {
            const temp = IDX_USER + 1;
            const angle = IDX_USER;
            const instructions = [
                { instruction: newDspInstruction(IDX_WANTED_FREQUENCY, true, INSTR_MULTIPLY_DT, IDX_SIGNAL, true, temp) },
                { instruction: newDspInstruction(angle, true, INSTR_ADD_DT, temp, true, angle) },
                { instruction: newDspInstruction(1, false, INSTR_SIN, angle, true, IDX_OUTPUT) },
            ];
            const compiled = compileInstructions(instructions);

            expectInstructionsEqual(test, "Compiled correctly", compiled, [
                newDspInstruction(IDX_WANTED_FREQUENCY, true, INSTR_MULTIPLY_DT, IDX_SIGNAL, true, temp),
                newDspInstruction(angle, true, INSTR_ADD_DT, temp, true, angle),
                newDspInstruction(1, false, INSTR_SIN, angle, true, IDX_OUTPUT),
            ]);

            updateSampleContext(ctx.sampleContext, 100, 1, 0.25);
            const results = [
                computeSample(ctx.sampleContext, compiled),
                computeSample(ctx.sampleContext, compiled),
                computeSample(ctx.sampleContext, compiled),
                computeSample(ctx.sampleContext, compiled),
            ];

            const expected = [0, 1, 0, -1];

            expectTimeSeriesEqual(test, "Outputs a sine wave", results, expected);
        }),
        newTest("If generation", (test, ctx) => {
            const TEMP_IDX = IDX_USER + 0;
            const instructions = [
                { instruction: newDspInstruction(100, false, INSTR_MULTIPLY_DT, 1, false, TEMP_IDX) },
                { instruction: newDspInstruction(TEMP_IDX, true, INSTR_ADD, IDX_OUTPUT, true, IDX_OUTPUT) },
                { 
                    instruction: newDspInstruction(IDX_OUTPUT, true, INSTR_LT, 100, false, TEMP_IDX),
                    ifelseInnerBlock: {
                        isElseBlock: false,
                        inner: [
                            { instruction: newDspInstruction(100, false, INSTR_MULTIPLY_DT, 1, false, TEMP_IDX) },
                            { instruction: newDspInstruction(TEMP_IDX, true, INSTR_ADD, IDX_OUTPUT, true, IDX_OUTPUT) },
                        ],
                    },
                }, 
                { 
                    ifelseInnerBlock: {
                        isElseBlock: true,
                        inner: [
                            { instruction: newDspInstruction(-100, false, INSTR_MULTIPLY_DT, 1, false, TEMP_IDX) },
                            { instruction: newDspInstruction(TEMP_IDX, true, INSTR_ADD, IDX_OUTPUT, true, IDX_OUTPUT) },
                        ],
                    },
                },
            ];
            const compiled = compileInstructions(instructions);

            // Should've intermediate representation'd :(
            // ahh its a trivial language with limited scope so I wont bother fixing for now
            expectInstructionsEqual(test, "Compiled correctly", compiled, [
                newDspInstruction(100, false, INSTR_MULTIPLY_DT, 1, false, TEMP_IDX),                       // 0
                newDspInstruction(TEMP_IDX, true, INSTR_ADD, IDX_OUTPUT, true, IDX_OUTPUT),                 // 1
                newDspInstruction(IDX_OUTPUT, true, INSTR_LT, 100, false, TEMP_IDX),                        // 2
                newDspInstruction(TEMP_IDX, true, INSTR_JUMP_IF_Z, 7 * OFFSET_INSTRUCTION_SIZE, false, -1), // 3
                    newDspInstruction(100, false, INSTR_MULTIPLY_DT, 1, false, TEMP_IDX),                   // 4
                    newDspInstruction(TEMP_IDX, true, INSTR_ADD, IDX_OUTPUT, true, IDX_OUTPUT),             // 5
                    newDspInstruction(0, false, INSTR_JUMP_IF_Z, 9 * OFFSET_INSTRUCTION_SIZE, false, -1),   // 6
                // else block has no jmps.
                    newDspInstruction(-100, false, INSTR_MULTIPLY_DT, 1, false, TEMP_IDX),                  // 7
                    newDspInstruction(TEMP_IDX, true, INSTR_ADD, IDX_OUTPUT, true, IDX_OUTPUT),             // 9
                // Final if-statement doesn't actually need to be closed off !!
            ]);

            expectEqual(test, "idk", "TODO: compute the samples and test result", "");
        }),
    ]),
]
