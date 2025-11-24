import { arrayAt } from "src/utils/array-utils";
import { assert } from "src/utils/assert";

export const INSTR_SIN              = 1;
export const INSTR_SQUARE           = 2;
export const INSTR_ADD              = 3;
export const INSTR_ADD_DT           = 4;
export const INSTR_SUBTRACT         = 5;
export const INSTR_MULTIPLY         = 6;
export const INSTR_MULTIPLY_DT      = 7;
export const INSTR_DIVIDE           = 8;
export const INSTR_LT               = 9;
export const INSTR_LTE              = 10;
export const INSTR_GT               = 11;
export const INSTR_GTE              = 12;
export const INSTR_EQ               = 13;
export const INSTR_NEQ              = 14;
export const INSTR_JUMP_IF_NZ       = 15;
export const INSTR_JUMP_IF_Z        = 16;
export const INSTR_NUM_INSTRUCTIONS = 17;

export type InstructionType
    = typeof INSTR_SIN
    | typeof INSTR_SQUARE
    | typeof INSTR_ADD
    | typeof INSTR_ADD_DT
    | typeof INSTR_SUBTRACT
    | typeof INSTR_MULTIPLY
    | typeof INSTR_MULTIPLY_DT
    | typeof INSTR_DIVIDE
    | typeof INSTR_LT
    | typeof INSTR_LTE
    | typeof INSTR_GT
    | typeof INSTR_GTE
    | typeof INSTR_EQ
    | typeof INSTR_NEQ
    | typeof INSTR_JUMP_IF_NZ
    | typeof INSTR_JUMP_IF_Z;

export function instrToString(instr: InstructionType | undefined): string {
    if (!instr) return "No-op";

    let result;

    switch (instr) {
        case INSTR_SIN:         result = "* sin";     break;
        case INSTR_SQUARE:      result = "* square";  break;
        case INSTR_ADD:         result = "+";       break;
        case INSTR_ADD_DT:      result = "+ dt*";   break;
        case INSTR_SUBTRACT:    result = "-";       break;
        case INSTR_MULTIPLY:    result = "*";       break;
        case INSTR_MULTIPLY_DT: result = "* dt *";   break;
        case INSTR_DIVIDE:      result = "/";       break;
        case INSTR_LT:          result = "<";       break;
        case INSTR_LTE:         result = "<=";      break;
        case INSTR_GT:          result = ">";       break;
        case INSTR_GTE:         result = ">=";      break;
        case INSTR_EQ:          result = "==";      break;
        case INSTR_NEQ:         result = "!=";      break;
        case INSTR_JUMP_IF_NZ:  result = "[internal] Jump if non-zero"; break;
        case INSTR_JUMP_IF_Z:   result = "[internal] Jump if zero"; break;
    }

    return result;
}

export type ParameterInfo = { name: string; };

export const IDX_OUTPUT           = 0;
export const IDX_WANTED_FREQUENCY = 1;
export const IDX_SIGNAL           = 2;
export const IDX_DT               = 3;
export const IDX_JMP_RESULT       = 4;
export const IDX_USER             = 5;
export const IDX_COUNT            = 32;
export const REGISTER_INFO  = {
    reserved: [
        { name: "Output" },
        { name: "Frequency" },
        { name: "Signal" },
        { name: "DeltaTime" },
        { name: "JumpResult" },
    ],
    totalCount: IDX_COUNT,
};

function sin(t: number) {
    return Math.sin(t * Math.PI * 2);
}

function sawtooth(t: number) {
    return 2 * (t % 1) - 1;
}

function triangle(t: number) {
    if (t < 0) t = -t;
    t %= 1;
    let result;
    if (t > 0.5) {
        result = 2 - 2 * t;
    } else {
        result = 2 * t;
    }

    return 2 * (result - 0.5);
}

function square(t: number) {
    t = Math.abs(t) % 2;
    return t > 1 ? 1 : -1;
}


// The final instructions are just integers. This is just for the UI and the build step
export type DspSynthInstructionItem = {
    // only one of these codegen related parts should be present at a time.
    instruction?: InstructionPart;
    ifelseInnerBlock?: {
        isElseBlock: boolean;
        inner: DspSynthInstructionItem[]; 
    };

    comment?: string;
};

export type InstructionPartArgument = {
    reg: boolean; // is the value a register or a literal value?
    val: number; // the value
};

export type InstructionPart = {
    type: InstructionType;       // What type of instruction is this?
    arg1: InstructionPartArgument;
    arg2: InstructionPartArgument;

    // Where do we write the result to? NOTE: some instructions, like the JUMP_ instructions, don't write anything
    dst: number;
}

export type SampleContext = {
    registers: number[];
    wantedFrequency: number;
    signal: number;
    dt: number;
    isPressed: boolean;
};

export function updateSampleContext(
    ctx: SampleContext,
    wantedFrequency: number,
    signal: number,
    dt: number,
) {
    ctx.wantedFrequency = wantedFrequency;
    ctx.signal = signal;
    ctx.dt = dt;
}


export function newSampleContext(): SampleContext {
    return {
        registers: new Array(IDX_COUNT).fill(0),
        wantedFrequency: 0,
        signal: 0,
        dt: 0,
        isPressed: false,
    };
}

export function newDspInstruction(
    val1: number,
    reg1: boolean,
    t: InstructionType,
    val2: number,
    reg2: boolean,
    dst: number
): InstructionPart {
    return {
        type: t,
        dst: dst,
        arg1: { val: val1, reg: reg1 },
        arg2: { val: val2, reg: reg2 },
    };
}

export function registerIdxToString(idx: number): string {
    if (idx < 0) return "???";
    if (idx < IDX_USER) return REGISTER_INFO.reserved[idx].name;
    if (idx < IDX_COUNT) return "user " + (idx - IDX_USER);
    return "????";
}

// Just made a programming language from scratch. again. lets go.
export function computeSample(s: SampleContext, instructions: number[]) {
    s.registers[IDX_WANTED_FREQUENCY] = s.wantedFrequency;
    s.registers[IDX_SIGNAL]           = s.signal;

    if (s.signal > 0 && s.isPressed === false) {
        s.isPressed = true;
        s.registers.fill(0);
    } else if (s.signal < 0.000001 && s.isPressed === true) {
        s.isPressed = false;
    }

    let i = 0; 
    while (i < instructions.length) {
        const type = instructions[i] as InstructionType; i++;
        const dst =  instructions[i]; i++;

        let val1 = instructions[i]; i++;
        const reg1 = instructions[i]; i++;
        if (reg1 !== 0) val1 = s.registers[val1];

        let val2 = instructions[i]; i++;
        const reg2 = instructions[i]; i++;
        if (reg2 !== 0) val2 = s.registers[val2];

        let result = 0;

        switch (type) {
            case INSTR_SIN:         { result = val1 * sin(val2);     } break;
            case INSTR_SQUARE:      { result = val1 * square(val2);  } break;
            case INSTR_ADD:         { result = val1 + val2;          } break;
            case INSTR_ADD_DT:      { result = val1 + (s.dt * val2); } break;
            case INSTR_SUBTRACT:    { result = val1 - val2;          } break;
            case INSTR_MULTIPLY:    { result = val1 * val2;          } break;
            case INSTR_MULTIPLY_DT: { result = val1 * s.dt * val2;   } break;
            case INSTR_DIVIDE:      { result = val1 / val2;          } break;
            case INSTR_JUMP_IF_NZ: {
                result = val1;
                if (val1 !== 0) {
                    i = val2;
                    continue;
                }
            }; break;
            case INSTR_JUMP_IF_Z: {
                result = val1;
                if (val1 === 0) {
                    i = val2;
                    continue;
                }
            }; break;
            case INSTR_LT:  { result = val1 < val2 ? 1 : 0;     } break; 
            case INSTR_LTE: { result = val1 <= val2 ? 1 : 0;    } break; 
            case INSTR_GT:  { result = val1 > val2 ? 1 : 0;     } break; 
            case INSTR_GTE: { result = val1 >= val2 ? 1 : 0;    } break; 
            case INSTR_EQ:  { result = val1 === val2 ? 1 : 0;   } break; 
            case INSTR_NEQ: { result = val1 !== val2 ? 1 : 0;   } break; 
            default: {
                if (isIfInstruction(type)) {
                    throw new Error("If-instructions are not valid compilation output");
                }
                throw new Error("Unknown instruction type");
            }
        };

        s.registers[dst] = result;
    }

    return s.registers[IDX_OUTPUT];
}

export function compileInstructions(instructions: DspSynthInstructionItem[], dst: number[] = []): number[] {
    dst.length = 0;

    compileToInstructionsInternal(instructions, dst);

    return dst;
}

export function isIfInstruction(type: InstructionType) {
    return type === INSTR_LT ||
        type === INSTR_LTE ||
        type === INSTR_GT ||
        type === INSTR_GTE ||
        type === INSTR_EQ ||
        type === INSTR_NEQ;
}

/**
 * If-statements are the main thing making this super complicated.
 * I'm handling their codegen as follows:
 *
 *  if <- A
 *      generate (call this recursively)
 *      jump to end of if-else block <- Z
 *  --------------- A jumps here if condition not met
 *  else if B
 *      generate (call this recursively)
 *      jump to end of if-else block <- Z
 *  --------------- B jumps here if condition not met
 *  else
 *      generate (call this recursively)
 *      jump to end of if-else block <- Z
 *  end
 *  --------------- Z jumps here if condition not met
 *
 */
export function compileToInstructionsInternal(instructions: DspSynthInstructionItem[], dst: number[]) {
    let currentIfBlock: DspSynthInstructionItem | undefined;
    const jumpToBlockEndInstructionIndexes: number[] = [];
    for (let i = 0; i <= instructions.length; i++) {
        const instr = arrayAt(instructions, i);

        if (
            !instr ||
            !instr.ifelseInnerBlock || 
            !instr.ifelseInnerBlock.isElseBlock
        ) {
            // This is not an else block or an else-if block. 
            // We should close off any pending if-else block, make it point to the next instruction
            if (currentIfBlock) {
                for (const idx of jumpToBlockEndInstructionIndexes) {
                    assert(dst[idx + OFFSET_VAL2] === -1);
                    dst[idx + OFFSET_VAL2] = dst.length;
                }
                jumpToBlockEndInstructionIndexes.length = 0;
                currentIfBlock = undefined;
            }
        }

        if (!instr) {
            // We ran this loop 1 extra time just so we can close off any remaining if-statements
            break;
        }

        if (instr.instruction) {
            pushInstruction(instr.instruction, dst);
        } else {
            // Need to at least have an else block if no instructions
            assert(!!instr.ifelseInnerBlock);
        }

        if (instr.ifelseInnerBlock) {
            if (!currentIfBlock) {
                // First if-block can't be an else block
                assert(!instr.ifelseInnerBlock.isElseBlock);
                currentIfBlock = instr;
                jumpToBlockEndInstructionIndexes.length = 0;
            } else {
                // subsequent ifs must be an else block. otherwise currentIfBlock should have been closed off by now.
                assert(instr.ifelseInnerBlock.isElseBlock);
            }

            let jumpIfInstrIdx = -1;
            if (instr.instruction) {
                jumpIfInstrIdx = dst.length;
                pushInstruction({
                    type: INSTR_JUMP_IF_Z,
                    // read result of last instruction
                    arg1: { reg: true, val: instr.instruction.dst},
                    // after codegen, needs to point to the if-check of the next if-block.
                    // We jump there if the previous comparison was false
                    arg2: { reg: false, val: -1 },
                    dst: -1,
                }, dst);
            } else {
                // This was just an `else` block. No jump required.
            }

            compileToInstructionsInternal(instr.ifelseInnerBlock.inner, dst);

            // If it exists, we'll need to bypass the next else-block, straight to the end of the final block.
            // Before we hit the next if-statement.
            {
                const nextInstruction = arrayAt(instructions, i + 1);
                if (
                    nextInstruction &&
                    nextInstruction.ifelseInnerBlock &&
                    nextInstruction.ifelseInnerBlock.isElseBlock
                ) {
                    const idx = dst.length;
                    pushInstruction({
                        type: INSTR_JUMP_IF_Z,
                        // always jump. TODO: consider dedicated jump instuction???
                        arg1: { reg: false, val: 0 },
                        // We can only populate this when we're closing off the final if-else block.
                        // There will be multiple of these instructions, and they'll all point
                        // back to the same place.
                        arg2: { reg: false, val: -1 },
                        dst: -1,
                    }, dst);
                    jumpToBlockEndInstructionIndexes.push(idx);
                }
            }

            if (jumpIfInstrIdx !== -1) {
                // If the check for if or if-else fails, we need to jump here
                assert(dst[jumpIfInstrIdx + OFFSET_VAL2] === -1);
                dst[jumpIfInstrIdx + OFFSET_VAL2] = dst.length;
            }
        }
    }
}

export function fixInstructionPartInstructionPartArgument(arg: InstructionPartArgument) {
    if (arg.reg) arg.val = Math.round(arg.val);
}

/** 
 * Mutates instructions as less as needed to get it into a runnable state  
 **/
export function fixInstructions(instructions: DspSynthInstructionItem[]) {
    let prevInstr: DspSynthInstructionItem | undefined;
    for (const instr of instructions) {
        if (instr.instruction) {
            fixInstructionPartInstructionPartArgument(instr.instruction.arg1);
            fixInstructionPartInstructionPartArgument(instr.instruction.arg2);
            instr.instruction.dst = Math.floor(instr.instruction.dst);
        }

        if (instr.ifelseInnerBlock) {
            // Can't have else blocks without a preceding if-block.
            if (instr.ifelseInnerBlock.isElseBlock) {
                if (!prevInstr?.ifelseInnerBlock) {
                    instr.ifelseInnerBlock.isElseBlock = false;
                }
            }

            fixInstructions(instr.ifelseInnerBlock.inner);
        }

        // do this _after_ fixing if/else blocks
        if (!instr.instruction && !instr.ifelseInnerBlock) {
            // All statements need at least an instruction or be an else block.
            const benignInstr = newDspInstruction(0, false, INSTR_ADD, 0, false, IDX_OUTPUT);
            instr.instruction = benignInstr;
        }

        prevInstr = instr;
    }
}

export const OFFSET_TYPE = 0;
export const OFFSET_DST = 1;
export const OFFSET_VAL1 = 2;
export const OFFSET_REG1 = 3;
export const OFFSET_VAL2 = 4;
export const OFFSET_REG2 = 5;
export const OFFSET_INSTRUCTION_SIZE = 6;

export function pushInstruction(instr: InstructionPart, dst: number[]) {
    dst.push(instr.type);           // 0
    dst.push(instr.dst);            // 1
    dst.push(instr.arg1.val);           // 2
    dst.push(instr.arg1.reg ? 1 : 0);   // 3
    dst.push(instr.arg2.val);           // 4
    dst.push(instr.arg2.reg ? 1 : 0);   // 5
}

