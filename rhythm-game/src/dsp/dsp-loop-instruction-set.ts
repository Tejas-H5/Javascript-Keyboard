export const INSTR_SET              = 0;
export const INSTR_SIN              = 1;
export const INSTR_SQUARE           = 2;
export const INSTR_ADD              = 3;
export const INSTR_SUBTRACT         = 4;
export const INSTR_MULTIPLY         = 5;
export const INSTR_DIVIDE           = 6;
export const INSTR_NUM_INSTRUCTIONS = 7;

export type InstructionType
    = typeof INSTR_SET
    | typeof INSTR_SET
    | typeof INSTR_SIN
    | typeof INSTR_SQUARE
    | typeof INSTR_ADD
    | typeof INSTR_SUBTRACT
    | typeof INSTR_MULTIPLY
    | typeof INSTR_DIVIDE;

export function instrToString(instr: InstructionType): string {
    switch (instr) {
        case INSTR_SET:      return "Set";
        case INSTR_SET:      return "Set";
        case INSTR_SIN:      return "Sin";
        case INSTR_SQUARE:   return "Square";
        case INSTR_ADD:      return "Add";
        case INSTR_SUBTRACT: return "Subtract";
        case INSTR_MULTIPLY: return "Multiply";
        case INSTR_DIVIDE:   return "Divide";
    }

    return "???"
}

export const IDX_SAMPLE    = 0;
export const IDX_AMPLITUDE = 1;
export const IDX_FREQUENCY = 2;
export const IDX_TIME      = 3;
export const IDX_USER      = 4;

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


// Needs to be very fast. Might just use integers later.
export type DspSynthInstruction = {
    type: InstructionType; // What type of instruction is this?
    enabled: boolean;      // Is this instruction enabled?
    val: number;           // What value? 
    reg: boolean;          // Was `val` actually a register index?
    dst: number;           // Where do we write the result to?
};

export type SampleContext = {
    registers: number[];
}

export function newSampleContext(): SampleContext {
    return {
        registers: Array(16, 0),
    };
}

export function newDspInstruction(
    type: InstructionType,
    val: number,
    reg: boolean,
    dst: number
): DspSynthInstruction {
    return { type: type, enabled: true, dst: dst, val: val, reg: reg, };
}

export function registerIdxToString(idx: number): string {
    switch (idx) {
        case IDX_SAMPLE:    return "output";
        case IDX_AMPLITUDE: return "amplitude";
        case IDX_FREQUENCY: return "frequency";
        case IDX_TIME:      return "time";
    };

    return "user " + (idx - IDX_USER);
}

// Just made a programming language from scratch. again. lets go.
export function computeSample(
    s: SampleContext,
    instructions: DspSynthInstruction[],
    frequency: number,
    time: number,
) {
    // TODO: figure out how many registers we actually use, and only reset those. 
    s.registers.fill(0);
    s.registers[IDX_SAMPLE]    = 0;
    s.registers[IDX_TIME]      = 0;
    s.registers[IDX_FREQUENCY] = frequency;
    s.registers[IDX_TIME]      = time;

    for (let i = 0; i < instructions.length; i++) {
        const instr = instructions[i];
        if (!instr.enabled) continue;

        const dst = instr.dst;

        let val = instr.val;
        if (instr.reg === true) val = s.registers[val];

        let result = 0;

        switch (instr.type) {
            case INSTR_SET:      { result = val;                    } break;
            case INSTR_SIN:      { result = sin(val);               } break;
            case INSTR_SQUARE:   { result = square(val);            } break;
            case INSTR_ADD:      { result = s.registers[dst] + val; } break;
            case INSTR_SUBTRACT: { result = s.registers[dst] - val; } break;
            case INSTR_MULTIPLY: { result = s.registers[dst] * val; } break;
            case INSTR_DIVIDE:   { result = s.registers[dst] / val; } break;
        };

        s.registers[dst] = result;
    }

    return s.registers[IDX_SAMPLE] / s.registers[IDX_AMPLITUDE];
}

