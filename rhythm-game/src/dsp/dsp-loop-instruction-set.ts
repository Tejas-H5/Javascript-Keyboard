import { assert } from "src/utils/assert";

export const INSTR_SIN              = 1;
export const INSTR_SQUARE           = 2;
export const INSTR_ADD              = 3;
export const INSTR_SUBTRACT         = 4;
export const INSTR_MULTIPLY         = 5;
export const INSTR_MULTIPLY_DT      = 6;
export const INSTR_DIVIDE           = 7;
export const INSTR_LT               = 8;
export const INSTR_LTE              = 9;
export const INSTR_GT               = 10;
export const INSTR_GTE              = 11;
export const INSTR_EQ               = 12;
export const INSTR_NEQ              = 13;
export const INSTR_JUMP_IF_NZ       = 14;
export const INSTR_JUMP_IF_Z        = 15;
export const INSTR_NUM_INSTRUCTIONS = 16;

export type InstructionType
    = typeof INSTR_SIN
    | typeof INSTR_SQUARE
    | typeof INSTR_ADD
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

export function instrToString(instr: InstructionType): string {
    let result;

    switch (instr) {
        case INSTR_SIN:         result = "Sin";     break;
        case INSTR_SQUARE:      result = "Square";  break;
        case INSTR_ADD:         result = "+";       break;
        case INSTR_SUBTRACT:    result = "-";       break;
        case INSTR_MULTIPLY:    result = "*";       break;
        case INSTR_MULTIPLY_DT: result = "*dt";     break;
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

export const IDX_OUTPUT     = 0;
export const IDX_FREQUENCY  = 1;
export const IDX_TIME       = 2;
export const IDX_SIGNAL     = 3;
export const IDX_JMP_RESULT = 4;
export const IDX_USER       = 4;
export const IDX_MAX        = 32;

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
    t = t % 2;
    return t > 1 ? 1 : -1;
}


// The final instructions are just integers. This is just for the UI and the build step
export type DspSynthInstructionItem = {
    instruction: InstructionPart;

    if?: {
        inner: DspSynthInstructionItem[]; // if-statements can contain other statements within them.
    };

    comment?: string; // ?
};

type InstructionPart = {
    type: InstructionType;       // What type of instruction is this?
    val1: number; reg1: boolean; // Val1, and is it a register or nah?
    val2: number; reg2: boolean; // Val2, and is it a register or nah?

    // Where do we write the result to? NOTE: some instructions, like the JUMP_ instructions, don't write anything
    dst: number;                 
}

export type SampleContext = {
    registers: number[];
};

export function newSampleContext(): SampleContext {
    return {
        registers: new Array(IDX_MAX, 0),
    };
}

export function newDspInstruction(
    t: InstructionType,
    val1: number,
    reg1: boolean,
    val2: number,
    reg2: boolean,
    dst: number
): DspSynthInstructionItem {
    return {
        instruction: {
            type: t,
            dst: dst,
            val1: val1,
            reg1: reg1,
            val2: val2,
            reg2: reg2,
        }
    };
}

export function registerIdxToString(idx: number): string {
    switch (idx) {
        case IDX_OUTPUT:    return "output";
        case IDX_FREQUENCY: return "frequency";
        case IDX_TIME:      return "time";
    };

    if (idx < IDX_MAX) return "user " + (idx - IDX_USER);
    return "invalid register index";
}

// Just made a programming language from scratch. again. lets go.
export function computeSample(
    s: SampleContext,
    instructions: number[],
    frequency: number,
    time: number,
    dt: number,
) {
    s.registers[IDX_OUTPUT]    = 0;
    s.registers[IDX_TIME]      = 0;
    s.registers[IDX_FREQUENCY] = frequency;
    s.registers[IDX_TIME]      = time;

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
            case INSTR_SIN: { result = sin(val1 * val2);        } break;
            case INSTR_SQUARE: { result = square(val1 * val2);  } break;
            case INSTR_ADD: { result = val1 + val2;             } break;
            case INSTR_SUBTRACT: { result = val1 - val2;        } break;
            case INSTR_MULTIPLY: { result = val1 * val2;        } break;
            case INSTR_MULTIPLY_DT: { result = val1 * val2 * dt } break;
            case INSTR_DIVIDE: { result = val1 / val2;          } break;
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
            default: throw new Error("Unknown instruction type");
        };

        s.registers[dst] = result;
    }

    return s.registers[IDX_OUTPUT];
}

export function compileInstructions(instructions: DspSynthInstructionItem[], dst: number[]) {
    dst.length = 0;

    compileToInstructionsInternal(instructions, dst);
}

function compileToInstructionsInternal(instructions: DspSynthInstructionItem[], dst: number[]) {
    for (let i = 0; i < instructions.length; i++) {
        const instr = instructions[i];

        if (instr.if) {
            assert(
                instr.instruction.type === INSTR_LT ||
                instr.instruction.type === INSTR_LTE ||
                instr.instruction.type === INSTR_GT ||
                instr.instruction.type === INSTR_GTE ||
                instr.instruction.type === INSTR_EQ ||
                instr.instruction.type === INSTR_NEQ
            );

            pushInstruction(instr.instruction, dst);

            const jumpIfInstrIdx = dst.length;

            pushInstruction({
                type: INSTR_JUMP_IF_Z,
                val1: instr.instruction.dst,
                reg1: true,
                // We don't know where to jump yet. We'll popluate this soon [tagSoon]
                val2: -1, 
                reg2: false,
                dst: instr.instruction.dst,
            }, dst);

            compileToInstructionsInternal(instr.if.inner, dst);

            // [tagSoon]: that would be here
            assert(dst[jumpIfInstrIdx + 4] === -1);
            dst[jumpIfInstrIdx + 4] = dst.length;
        } else {
            pushInstruction(instr.instruction, dst);
        }

    }
}

function pushInstruction(instr: InstructionPart, dst: number[]) {
    dst.push(instr.type);           // 0
    dst.push(instr.dst);            // 1
    dst.push(instr.val1);           // 2
    dst.push(instr.reg1 ? 1 : 0);   // 3
    dst.push(instr.val2);           // 4
    dst.push(instr.reg2 ? 1 : 0);   // 5
}
