export const INSTR_SIN              = 1;
export const INSTR_SQUARE           = 2;
export const INSTR_ADD              = 3;
export const INSTR_SUBTRACT         = 4;
export const INSTR_MULTIPLY         = 5;
export const INSTR_MULTIPLY_DT      = 6;
export const INSTR_DIVIDE           = 7;
export const INSTR_IF               = 8;
export const INSTR_ELIF             = 9;
export const INSTR_END              = 10;
export const INSTR_NUM_INSTRUCTIONS = 11;

export type InstructionType
    = typeof INSTR_SIN
    | typeof INSTR_SQUARE
    | typeof INSTR_ADD
    | typeof INSTR_SUBTRACT
    | typeof INSTR_MULTIPLY
    | typeof INSTR_MULTIPLY_DT
    | typeof INSTR_DIVIDE
    | typeof INSTR_IF
    | typeof INSTR_ELIF
    | typeof INSTR_END;

export const IF_COMPARISON_LT  = 1;
export const IF_COMPARISON_LTE = 2;
export const IF_COMPARISON_GT  = 3;
export const IF_COMPARISON_GTE = 4;
export const IF_COMPARISON_EQ  = 5;
export const IF_COMPARISON_NEQ = 6;

export type IfComparisonType 
    = typeof IF_COMPARISON_LT
    | typeof IF_COMPARISON_LTE
    | typeof IF_COMPARISON_GT
    | typeof IF_COMPARISON_GTE
    | typeof IF_COMPARISON_EQ
    | typeof IF_COMPARISON_NEQ;

export function ifComparsionToString(c: IfComparisonType): string {
    let result;

    switch (c) {
        case IF_COMPARISON_LT:  result = "<"; break;
        case IF_COMPARISON_LTE: result = "<="; break;
        case IF_COMPARISON_GT:  result = ">"; break;
        case IF_COMPARISON_GTE: result = ">="; break;
        case IF_COMPARISON_EQ:  result = "=="; break;
        case IF_COMPARISON_NEQ: result = "!="; break;
    }

    return result;
}

export function instrToString(instr: InstructionType): string {
    switch (instr) {
        case INSTR_SIN:         return "Sin";
        case INSTR_SQUARE:      return "Square";
        case INSTR_ADD:         return "+";
        case INSTR_SUBTRACT:    return "-";
        case INSTR_MULTIPLY:    return "*";
        case INSTR_MULTIPLY_DT: return "*dt";
        case INSTR_DIVIDE:      return "/";
        case INSTR_IF:          return "if";
        case INSTR_ELIF:        return "else if";
        case INSTR_END:         return "end";
    }

    return "???"
}

export const IDX_OUTPUT    = 0;
export const IDX_FREQUENCY = 1;
export const IDX_TIME      = 2;
export const IDX_USER      = 3;
export const IDX_MAX       = 32;

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


// Needs to be very fast. Might just use integers later. for now, prototying slop phase.
export type DspSynthInstruction = {
    type: InstructionType; // What type of instruction is this?
    val1: number; reg1: boolean; // Val1, and is it a register or nah?
    val2: number; reg2: boolean; // Val2, and is it a register or nah?
    dst: number;           // Where do we write the result to?

    comment?: string; // ?
};

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
): DspSynthInstruction {
    return {
        type: t,
        dst: dst,
        val1: val1,
        reg1: reg1,
        val2: val2,
        reg2: reg2,
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
    instructions: DspSynthInstruction[],
    frequency: number,
    time: number,
    dt: number,
) {
    s.registers[IDX_OUTPUT]    = 0;
    s.registers[IDX_TIME]      = 0;
    s.registers[IDX_FREQUENCY] = frequency;
    s.registers[IDX_TIME]      = time;

    const NEEDS_TO_GO_TO_END_AT_NEXT_IF_BRANCH = 1;
    const NEEDS_NEXT_IF_BRANCH = 3;

    let loopState = 0;

    for (let i = 0; i < instructions.length; i++) {
        const instr = instructions[i];

        // TODO: compile to jump instructions instead.
        if (loopState === NEEDS_NEXT_IF_BRANCH) {
            for (; i < instructions.length; i++) {
                const type = instructions[i].type;
                if (type === INSTR_ELIF || type === INSTR_END || type === INSTR_IF) {
                    loopState = 0;
                    break;
                }
            }
        } else if (loopState === NEEDS_TO_GO_TO_END_AT_NEXT_IF_BRANCH) {
            const type = instr.type;
            if (type === INSTR_ELIF || type === INSTR_END || type === INSTR_IF) {
                loopState = 0;

                for (; i < instructions.length; i++) {
                    const type = instructions[i].type;
                    if (type === INSTR_END) break;
                }

                // we're now at the end. End is also a NO-op
                continue;
            }
        } 

        const dst = instr.dst;

        let val1 = instr.val1;
        if (instr.reg1 === true) val1 = s.registers[val1];

        let val2 = instr.val2;
        if (instr.reg2 === true) val2 = s.registers[val2];

        let result;

        switch (instr.type) {
            case INSTR_SIN: { result = sin(val1 * val2); } break;
            case INSTR_SQUARE: { result = square(val1 * val2); } break;
            case INSTR_ADD: { result = val1 + val2; } break;
            case INSTR_SUBTRACT: { result = val1 - val2; } break;
            case INSTR_MULTIPLY: { result = val1 * val2; } break;
            case INSTR_MULTIPLY_DT: { result = val1 * val2 * dt } break;
            case INSTR_DIVIDE: { result = val1 / val2; } break;
            case INSTR_IF:
            case INSTR_ELIF: {
                result = 0;
                switch (val1) {
                    case IF_COMPARISON_LT: { result = val1 < val2 ? 1 : 0; } break;
                    case IF_COMPARISON_LTE: { result = val1 <= val2 ? 1 : 0; } break;
                    case IF_COMPARISON_GT: { result = val1 > val2 ? 1 : 0; } break;
                    case IF_COMPARISON_GTE: { result = val1 >= val2 ? 1 : 0; } break;
                    case IF_COMPARISON_EQ: { result = val1 == val2 ? 1 : 0; } break;
                    case IF_COMPARISON_NEQ: { result = val1 != val2 ? 1 : 0; } break;
                }

                // TODO: 'compile' this. We should already know which i to jump to
                if (result === 0) {
                    loopState = NEEDS_NEXT_IF_BRANCH;
                    continue;
                } else {
                    loopState = NEEDS_TO_GO_TO_END_AT_NEXT_IF_BRANCH;
                    continue;
                }
            } // break;
            case INSTR_END: {
                continue;
            } // break;
        };

        s.registers[dst] = result;
    }

    return s.registers[IDX_OUTPUT];
}

