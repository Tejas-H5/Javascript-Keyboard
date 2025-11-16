import { expectEqual, newTest, testSuite } from "src/utils/testing";
import { compileInstructions, computeSample, IDX_PRESSED_TIME, IDX_USER, IDX_WANTED_FREQUENCY, INSTR_SIN, newDspInstruction, newSampleContext } from "./dsp-loop-instruction-set";

export const dspLoopInstructionSetTests = testSuite("Instruction set tests", () => {
    return {
        sampleContext: newSampleContext(),
    };
}, [
    newTest("blank", (test, ctx) => {
        const result = computeSample(ctx.sampleContext, []);
        expectEqual(test, "Blank computation works", result, 0);
    }),
    newTest("Simple program works", (test, ctx) => {
        const compiled: number[] = [];
        compileInstructions([
            newDspInstruction(INSTR_SIN, IDX_WANTED_FREQUENCY, false, IDX_PRESSED_TIME, false, IDX_USER),
        ], compiled);

        ctx.sampleContext.frequency = 1;
        ctx.sampleContext.time = 0;
        ctx.sampleContext.dt = 0.5;
        const results = [
            computeSample(ctx.sampleContext, compiled),
            computeSample(ctx.sampleContext, compiled),
            computeSample(ctx.sampleContext, compiled),
            computeSample(ctx.sampleContext, compiled),
        ];
        expectEqual(test, "Is a sine wave", results, [0, 1, 0, -1, 0]);
    }),
]);
