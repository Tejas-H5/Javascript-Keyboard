// TODO: Delete this file - it's a hack solution that is poorly thought of - 
// it's better to just have a proper UI than a parsing system.

// Sometimes when you use a hammer, everything looks like a nail.
// The correct solution was to use a good UI, not a fking programming language lol.
// I was coming off the high of making a programming lang entirely in javascript.
// So it was failry simple to just copy paste the code. 
// so that makes sense, I guess.


function isWhitespace(c: string) {
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
function isNoteLetter(c: string) {
    return c && c.length === 1 && noteLetters.includes(c);
}

type RestBreak = { t: "rest-break" };
type RestHold = { t: "rest-hold" };
type Chord = { t: "chord", notes: Note[] };
type Note = {
    t: "note",
    letter: string;
    number: number;
    isSharp: boolean;
    duration: number;
};
type SetValueCommand = {
    t: "set-value",
    name: string;
    value: any;
}
type RegularCommand = {
    t: "cmd",
    name: string;
}

export type PlayableNote = RestBreak | RestHold | Chord | SetValueCommand | RegularCommand;

// this code also parses comments.
// This way, comments can appear almost anywhere in the
function advanceWhileWhitespace(text: string, pos: number) {
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

function parseNoteGroup(text: string, ctx: ParserContext, chords: PlayableNote[]) {
    const notes: Note[] = [];
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

    chords.push({
        t: "chord",
        notes: notes
    });
    return true;
}

const numbers = "1234567890.-"
function isNumber(c: string) {
    return c && c.length === 1 && numbers.includes(c);
}

function parseNumber(text: string, ctx: ParserContext): [number, boolean] {
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


function isLetter(c: string) {
    return c && c.length === 1 && ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z'));
}

// A specialized method that also accepts '>' at the start
function parseWord(text: string, ctx: ParserContext): [string, boolean] {
    const start = ctx.pos;
    while(isLetter(text[ctx.pos]) || (ctx.pos === start && text[ctx.pos] === ">")) {
        ctx.pos++;
    }

    if (start === ctx.pos) {
        return ["", false];
    }

    return [text.substring(start, ctx.pos), true];
}

function isValidSampleName(name: string) {
    // syntax like >snareHit >tomHit >hiHatHit
    return name[0] === ">";
}

// A note is like (letter) ('#')? (number)
// we only support sharps and no flats
function parseNote(text: string, ctx: ParserContext, notes: Note[]) {
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
        t: "note",
        letter: noteLetter,
        number: noteNumber,
        isSharp: noteIsSharp,
        duration: noteDuration,
    });
    return true;
}

function parseRest(text: string, ctx: ParserContext, chords: PlayableNote[]) {
    if (text[ctx.pos] === ".") {
        ctx.pos++;
        chords.push({ t: "rest-break" });
    } else if (text[ctx.pos] === "_") {
        ctx.pos++;
        chords.push({ t: "rest-hold" });
    } else {
        return false;
    }
}

function parseValueSet(text: string, ctx: ParserContext, chords: PlayableNote[]) {
    const [varName, found] = parseWord(text, ctx);
    if (!found) return false;

    if (text[ctx.pos] !== "=") {
        chords.push({ t: "cmd", name: varName });
        return true;
    };

    ctx.pos += 1;

    const [number, foundNum] = parseNumber(text, ctx);
    if (!foundNum) return false;

    chords.push({
        t: "set-value",
        name: varName,
        value: number
    });

    return true;
}

function parseChord(text: string, ctx: ParserContext, chords: PlayableNote[]) {
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

type ParserContext = {
    pos: number;
}

function parseTranscription(text: string): PlayableNote[] {
    const ctx: ParserContext = {
        pos: 0
    }

    const chords: PlayableNote[] = [];
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
