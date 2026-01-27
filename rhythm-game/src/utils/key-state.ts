import { filterInPlace } from "./array-utils";

// TODO: use keycode if supported

type PressedSymbols<T extends string> = {
    pressed: T[];
    held: T[];
    repeated: T[];
    released: T[];
};

export type KeysState = {
    keys:    PressedSymbols<Key>;
    letters: PressedSymbols<string>;
};

export function newKeysState(): KeysState {
    return {
        keys: {
            pressed:  [],
            held:     [],
            released: [],
            repeated: [],
        },
        letters: {
            pressed:  [],
            held:     [],
            released: [],
            repeated: [],
        }
    };
}

const EV_NOTHING  = 0;
const EV_PRESSED  = 1;
const EV_RELEASED = 2;
const EV_REPEATED = 3;
const EV_BLUR     = 4;


// https://developer.mozilla.org/en-US/docs/Web/API/UI_Events/Keyboard_event_key_values
// There are a LOT of them. So I won't bother holding state for every possible key like usual
// TODO: try using keyCode if available, then fall back on key
export type Key = string & { __Key: void };

export function getNormalizedKey(key: string): Key {
    if (key.length === 1) {
        key = key.toUpperCase();

        switch (key) {
            case "!": key = "1"; break;
            case "@": key = "2"; break;
            case "#": key = "3"; break;
            case "$": key = "4"; break;
            case "%": key = "5"; break;
            case "^": key = "6"; break;
            case "&": key = "7"; break;
            case "*": key = "8"; break;
            case "(": key = "9"; break;
            case ")": key = "0"; break;
            case "_": key = "-"; break;
            case "+": key = "+"; break;
            case "{": key = "["; break;
            case "}": key = "]"; break;
            case "|": key = "\\"; break;
            case ":": key = ";"; break;
            case "\"": key = "'"; break;
            case "<": key = ","; break;
            case ">": key = "."; break;
            case "?": key = "/"; break;
            case "~": key = "`"; break;
        }
    }

    return key as Key;
}

function updatePressedSymbols<T extends string>(
    s: PressedSymbols<T>,
    ev: number,
    key: T,
) {
    for (let i = 0; i < s.pressed.length; i++) {
        s.held.push(s.pressed[i]);
    }
    s.pressed.length = 0;
    s.repeated.length = 0;
    s.released.length = 0;

    switch (ev) {
        case EV_PRESSED: {
            // NOTE: the main issue with this input mechanism, is that 
            // Shift + Click on some browsers will open a context menu that can't be detected. (or at least, I don't know how to detect it).
            // This can result in EV_RELEASED never being sent. 
            // The compromise made here is that we only ever have one of any key in these arrays.
            // The keys _may_ get stuck down, but if the user does the natural thing, press this key again,
            // it will get released, and all is good.

            if (s.pressed.indexOf(key) === -1) {
                s.pressed.push(key);
            }
        } break;
        case EV_REPEATED: {
            if (s.repeated.indexOf(key) === -1) {
                s.repeated.push(key);
            }
        } break;
        case EV_RELEASED: {
            filterInPlace(s.held, heldKey => heldKey !== key);
            if (s.released.indexOf(key) !== -1) {
                s.released.push(key);
            }
        } break;
        case EV_BLUR: {
            s.pressed.length = 0;
            s.released.length = 0;
            s.repeated.length = 0;
            s.held.length = 0;
        } break;
        case EV_NOTHING: {
        } break;
    }
}

function updateKeysStateInternal(
    keysState: KeysState,
    ev: number,
    key: string,
) {
    updatePressedSymbols(keysState.keys, ev, getNormalizedKey(key));
    updatePressedSymbols(keysState.letters, ev, key);
}

export function updateKeysState(
    keysState: KeysState,
    keyDown: KeyboardEvent | null,
    keyUp: KeyboardEvent | null,
    blur: boolean,
) {
    let key = "";
    let ev  = EV_NOTHING
    if (keyDown !== null) {
        key = keyDown.key;
        if (keyDown.repeat === true) {
            ev = EV_REPEATED;
        } else {
            ev = EV_PRESSED;
        }
    } else if (keyUp !== null) {
        key = keyUp.key;
        ev = EV_RELEASED;
    } else if (blur === true) {
        ev = EV_BLUR;
        key = "";
    } else {
        ev = EV_NOTHING;
        key = "";
    }

    updateKeysStateInternal(keysState, ev, key);

    if (key === "Control" || key === "Meta") {
        updateKeysStateInternal(keysState, ev, "Modifier");
    }
}

export function isKeyPressed(keysState: KeysState, key: Key): boolean {
    const keys = keysState.keys;
    for (let i = 0; i < keys.pressed.length; i++) {
        if (keys.pressed[i] === key) return true;
    }
    return false;
}

export function isKeyRepeated(keysState: KeysState, key: Key): boolean {
    const keys = keysState.keys;
    for (let i = 0; i < keys.repeated.length; i++) {
        if (keys.repeated[i] === key) return true;
    }
    return false;
}

export function isKeyPressedOrRepeated(keysState: KeysState, key: Key): boolean {
    if (isKeyPressed(keysState, key)) return true;
    if (isKeyRepeated(keysState, key)) return true;
    return false;
}

export function isKeyReleased(keysState: KeysState, key: Key): boolean {
    const keys = keysState.keys;
    for (let i = 0; i < keys.released.length; i++) {
        if (keys.released[i] === key) return true;
    }
    return false;
}

export function isKeyHeld(keysState: KeysState, key: Key): boolean {
    const keys = keysState.keys;
    for (let i = 0; i < keys.held.length; i++) {
        if (keys.held[i] === key) return true;
    }
    return false;
}


export function isLetterPressed(keysState: KeysState, letter: string): boolean {
    const letters = keysState.letters;
    for (let i = 0; i < letters.pressed.length; i++) {
        if (letters.pressed[i] === letter) return true;
    }
    return false;
}

export function isLetterRepeated(keysState: KeysState, letter: string): boolean {
    const letters = keysState.letters;
    for (let i = 0; i < letters.repeated.length; i++) {
        if (letters.repeated[i] === letter) return true;
    }
    return false;
}

export function isLetterPressedOrRepeated(keysState: KeysState, letter: string): boolean {
    if (isLetterPressed(keysState, letter)) return true;
    if (isLetterRepeated(keysState, letter)) return true;
    return false;
}

export function isLetterReleased(keysState: KeysState, letter: string): boolean {
    const letters = keysState.letters;
    for (let i = 0; i < letters.released.length; i++) {
        if (letters.released[i] === letter) return true;
    }
    return false;
}

export function isLetterHeld(keysState: KeysState, letter: string): boolean {
    const letters = keysState.letters;
    for (let i = 0; i < letters.held.length; i++) {
        if (letters.held[i] === letter) return true;
    }
    return false;
}

export const KEY_1             = getNormalizedKey("1");
export const KEY_2             = getNormalizedKey("2");
export const KEY_3             = getNormalizedKey("3");
export const KEY_4             = getNormalizedKey("4");
export const KEY_5             = getNormalizedKey("5");
export const KEY_6             = getNormalizedKey("6");
export const KEY_7             = getNormalizedKey("7");
export const KEY_8             = getNormalizedKey("8");
export const KEY_9             = getNormalizedKey("9");
export const KEY_0             = getNormalizedKey("0");
export const KEY_MINUS         = getNormalizedKey("-");
export const KEY_EQUALS        = getNormalizedKey("=");
export const KEY_Q             = getNormalizedKey("Q");
export const KEY_W             = getNormalizedKey("W");
export const KEY_E             = getNormalizedKey("E");
export const KEY_R             = getNormalizedKey("R");
export const KEY_T             = getNormalizedKey("T");
export const KEY_Y             = getNormalizedKey("Y");
export const KEY_U             = getNormalizedKey("U");
export const KEY_I             = getNormalizedKey("I");
export const KEY_O             = getNormalizedKey("O");
export const KEY_P             = getNormalizedKey("P");
export const KEY_OPEN_BRACKET  = getNormalizedKey("[");
export const KEY_CLOSE_BRACKET = getNormalizedKey("]");
export const KEY_BACKSLASH     = getNormalizedKey("\\");
export const KEY_A             = getNormalizedKey("A");
export const KEY_S             = getNormalizedKey("S");
export const KEY_D             = getNormalizedKey("D");
export const KEY_F             = getNormalizedKey("F");
export const KEY_G             = getNormalizedKey("G");
export const KEY_H             = getNormalizedKey("H");
export const KEY_J             = getNormalizedKey("J");
export const KEY_K             = getNormalizedKey("K");
export const KEY_L             = getNormalizedKey("L");
export const KEY_SEMICOLON     = getNormalizedKey(";");
export const KEY_QUOTE         = getNormalizedKey("'");
export const KEY_Z             = getNormalizedKey("Z");
export const KEY_X             = getNormalizedKey("X");
export const KEY_C             = getNormalizedKey("C");
export const KEY_V             = getNormalizedKey("V");
export const KEY_B             = getNormalizedKey("B");
export const KEY_N             = getNormalizedKey("N");
export const KEY_M             = getNormalizedKey("M");
export const KEY_COMMA         = getNormalizedKey(",");
export const KEY_PERIOD        = getNormalizedKey(".");
export const KEY_FORWAR_SLASH  = getNormalizedKey("/");

export const KEY_SHIFT = getNormalizedKey("Shift");
export const KEY_CTRL  = getNormalizedKey("Control");
export const KEY_META  = getNormalizedKey("Meta");
export const KEY_ALT   = getNormalizedKey("Alt");
export const KEY_MOD   = getNormalizedKey("Modifier"); // Either CTRL or META

export const KEY_SPACE       = getNormalizedKey(" ");
export const KEY_ENTER       = getNormalizedKey("Enter");
export const KEY_BACKSPACE   = getNormalizedKey("Backspace");
export const KEY_ARROW_UP    = getNormalizedKey("ArrowUp");
export const KEY_ARROW_DOWN  = getNormalizedKey("ArrowDown");
export const KEY_ARROW_LEFT  = getNormalizedKey("ArrowLeft");
export const KEY_ARROW_RIGHT = getNormalizedKey("ArrowRight");
