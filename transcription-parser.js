
function isWhitespace(c) {
    return (
        c === " " ||
        c === "\n" ||
        c === "\t" ||
        c === "\r" ||
        c === "\f" ||
        c === "\v" ||
        c === "\u00a0" ||
        c === "\u1680" ||
        c === "\u2000" ||
        c === "\u200a" ||
        c === "\u2028" ||
        c === "\u2029" ||
        c === "\u202f" ||
        c === "\u205f" ||
        c === "\u3000" ||
        c === "\ufeff"
    );
}

const noteLetters = "ABCDEFG"
function isNoteLetter(c) {
    return c && c.length === 1 && noteLetters.includes(c);
}

const T_REST = 0; // "rest";
const T_CHORD = 1; // "chord";
const T_NOTE = 2; // "note";
const T_VALUE_SET = 3; // "value-set";
const T_COMMAND = 4; // "cmd";

const REST_BREAK = 0
const REST_HOLD = 1

// this code also parses comments.
// This way, comments can appear almost anywhere in the
function advanceWhileWhitespace(text, pos) {
    while (
        pos < text.length &&
        (isWhitespace(text[pos]) || (text[pos] === "/" && text[pos + 1] === "/"))
    ) {
        // single line comment, ignore all text on the same line after //.
        if (text[pos] === "/") {
            pos += 2;
            while (pos < text.length && text[pos] !== "\n") {
                pos++;
            }
        }

        pos++;
    }
    return pos;
}

function parseNoteGroup(text, ctx, chords) {
    const notes = [];
    if (text[ctx.pos] !== "(") {
        if (!parseNote(text, ctx, notes)) return false;
    } else {
        ctx.pos += 1

        let parsed = false;
        while(ctx.pos < text.length && text[ctx.pos] !== ")") {
            ctx.pos = advanceWhileWhitespace(text, ctx.pos);
            if (!parseNote(text, ctx, notes)) {
                break;
            }
            parsed = true;
        }
    
        ctx.pos = advanceWhileWhitespace(text, ctx.pos);
        if (text[ctx.pos] === ")") {
            ctx.pos += 2;
        } else {
            return false;
        }
    }

    chords.push( {
        t: T_CHORD,
        notes: notes
    });
    return true;
}

const numbers = "1234567890.-"
function isNumber(c) {
    return c && c.length === 1 && numbers.includes(c);
}

function parseNumber(text, ctx) {
    const start = ctx.pos;
    while(isNumber(text[ctx.pos])) {
        ctx.pos++;
    }

    if (start === ctx.pos) {
        return [0, false];
    }

    try {
        let num = parseFloat(text.substring(start, ctx.pos));
        return [num, true];
    } catch {
        return [0, false];
    }
}


function isLetter(c) {
    return c && c.length === 1 && ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z'));
}

// A specialized method that also accepts '>' at the start
function parseWord(text, ctx) {
    const start = ctx.pos;
    while(isLetter(text[ctx.pos]) || (ctx.pos === start && text[ctx.pos] === ">")) {
        ctx.pos++;
    }

    if (start === ctx.pos) {
        return ["", false];
    }

    return [text.substring(start, ctx.pos), true];
}

function isValidSampleName(name) {
    // syntax like >snareHit >tomHit >hiHatHit
    return name[0] === ">";
}

// A note is like (letter) ('#')? (number)
// we only support sharps and no flats
function parseNote(text, ctx, notes) {
    const [noteLetter, noteLetterFound] = parseWord(text, ctx)
    if (!noteLetterFound || (
        !isNoteLetter(noteLetter) && !isValidSampleName(noteLetter)
    )) {
        return false;
    }

    const noteIsSharp = text[ctx.pos] === "#";
    if (noteIsSharp) {
        ctx.pos += 1;
    }

    let [noteNumber, found] = parseNumber(text, ctx);
    if (!found) noteNumber = 0;

    let noteDuration = 1;
    if (text[ctx.pos] === ":") {
        ctx.pos += 1;
        [noteDuration, found] = parseNumber(text, ctx);
        if (!found) return false;
    }

    notes.push({
        t: T_NOTE,
        letter: noteLetter,
        number: noteNumber,
        isSharp: noteIsSharp,
        duration: noteDuration,
    });
    return true;
}

function parseRest(text, ctx, chords) {
    let type = null;
    if (text[ctx.pos] === ".") {
        ctx.pos++;
        type = REST_BREAK;
    } else if (text[ctx.pos] === "_") {
        ctx.pos++;
        type = REST_HOLD;
    } else {
        return false;
    }

    chords.push({
        t: T_REST,
        type: type
    })
    return true;
}

function parseValueSet(text, ctx, chords) {
    const [varName, found] = parseWord(text, ctx);
    if (!found) return false;

    if (text[ctx.pos] !== "=") {
        chords.push({
            t: T_COMMAND,
            name: varName
        });
        return true;
    };

    ctx.pos += 1;

    const [number, foundNum] = parseNumber(text, ctx);
    if (!foundNum) return false;

    chords.push({
        t: T_VALUE_SET,
        name: varName,
        value: number
    });
    return true;
}

function parseChord(text, ctx, chords) {
    ctx.pos = advanceWhileWhitespace(text, ctx.pos);
    if (ctx.pos >= text.length) {
        return false;
    }

    const start = ctx.pos;

    ctx.pos = start;
    if (parseNoteGroup(text, ctx, chords)) return true;
    
    ctx.pos = start;
    if (parseRest(text, ctx, chords)) return true;

    ctx.pos = start;
    if (parseValueSet(text, ctx, chords)) return true;

    return false;
}

function parseTranscription(text) {
    const ctx = {
        pos: 0
    }

    const chords = [];
    while (ctx.pos < text.length) {
        ctx.pos = advanceWhileWhitespace(text, ctx.pos)
        if (!parseChord(text, ctx, chords)) {
            break;
        }
    }

    ctx.pos = advanceWhileWhitespace(text, ctx.pos)
    if (ctx.pos < text.length) {
        console.error("couldn't read at ", text.substring(ctx.pos))
        // wasn't parsed all the way for some reason
        return [];
    }

    return chords;
}