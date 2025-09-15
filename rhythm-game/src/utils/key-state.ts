export type KeyState = {
    stringRepresentation: string;
    key:  string;
    key2: string | undefined;

    pressed:  boolean;
    repeat:   boolean;
    held:     boolean;
    released: boolean;

    numPressed:  number;
    numHeld:     number;
    numReleased: number;
};

export function newKeyState(
    stringRepresentation: string,
    key: string,
    key2?: string
): KeyState {
    return {
        stringRepresentation,
        key, 
        key2,

        pressed:  false,
        held:     false,
        released: false,
        repeat:   false,

        numPressed:  0,
        numHeld:     0,
        numReleased: 0,
    };
}

export function pressKey(state: KeyState, repeat: boolean) {
    if (!repeat) {
        state.numPressed++;
        state.numHeld++;
    }

    state.pressed = true;
    state.repeat = repeat;
    state.held = true;
}

export function releaseKey(state: KeyState) {
    state.numHeld--;
    state.numReleased++;

    state.held     = state.numHeld > 0;
    state.released = true;
}

export function stepKey(state: KeyState) {
    state.numPressed  = 0;
    state.numReleased = 0;

    state.pressed  = false;
    state.repeat = false;
    state.released = false;
}

export function resetKey(state: KeyState) {
    state.numPressed  = 0;
    state.numHeld     = 0;
    state.numReleased = 0;

    state.pressed  = false;
    state.held     =
    state.released = false;
}

export function handleKeyDown(keys: KeyState[], e: KeyboardEvent) {
    for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        if (e.key === key.key || e.key === key.key2) {
            pressKey(key, e.repeat);
        }
    }
}

export function handleKeyUp(keys: KeyState[], e: KeyboardEvent) {
    for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        if (e.key === key.key || e.key === key.key2) {
            releaseKey(key);
        }
    }
}

export function stepKeyboardState(keys: KeyState[]) {
    for (let i = 0; i < keys.length; i++) {
        stepKey(keys[i]);
    }
}

export function resetKeyboardState(keys: KeyState[]) {
    for (let i = 0; i < keys.length; i++) {
        resetKey(keys[i]);
    }
}

export function handleKeysLifecycle(
    keys: KeyState[],
    keyDown: KeyboardEvent | null,
    keyUp: KeyboardEvent | null,
    blur: boolean,
) {
    stepKeyboardState(keys);
    if (keyDown) {
        handleKeyDown(keys, keyDown);
    }
    if (keyUp) {
        handleKeyUp(keys, keyUp);
    }
    if (blur) {
        resetKeyboardState(keys);
    }
}

