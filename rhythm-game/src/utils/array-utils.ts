export function filterInPlace<T>(arr: T[], predicate: (v: T, i: number) => boolean) {
    let i2 = 0;
    for (let i = 0; i < arr.length; i++) {
        if (predicate(arr[i], i)) arr[i2++] = arr[i];
    }
    arr.length = i2;
}

export function removeItem<T>(arr: T[], toDelete: T) {
    filterInPlace(arr, val => val !== toDelete);
}

export function filteredCopy<T, U extends T>(src: T[], dst: T[], predicate: (v: T, i: number) => v is U) {
    dst.length = 0;
    for (let i = 0; i < src.length; i++) {
        if (predicate(src[i], i)) {
            dst.push(src[i]);
        }
    }
}

export function copyArray<T>(dst: T[], src: T[], start: number, len: number) {
    const remaining = src.length - start;
    if (len > remaining) len = remaining;

    const end = start + len;
    for (let srcIdx = start, dstIdx = 0; srcIdx < end; srcIdx++, dstIdx++) {
        dst[dstIdx] = src[srcIdx];
    }
}

export function newArray<T>(n: number, fn: (i: number) => T): T[] {
    const arr = Array(n);
    for (let i = 0; i < arr.length; i++) {
        arr[i] = fn(i);
    }

    return arr;
}

export function findLastIndexOf<T>(arr: T[], predicate: (v: T) => boolean) {
    for (let i = arr.length - 1; i >= 0; i--) {
        if (predicate(arr[i])) {
            return i;
        }
    }

    return -1;
}

/** t is a number between 0 and 1 */
export function chooseItem<T>(arr: T[], t: number): T {
    return arr[Math.floor(t * arr.length)];
}

export function arrayAt<T>(arr: T[], i: number): T | undefined {
    if (i < 0) return undefined;
    if (i >= arr.length) return undefined;
    return arr[i];
}

export function arraySwap(arr: unknown[], i: number, j: number) {
    if (i < 0) return;
    if (i >= arr.length) return;
    if (j < 0) return;
    if (j >= arr.length) return;
    if (i === j) return;

    const temp = arr[i];
    arr[i] = arr[j];
    arr[j] = temp;
}

export function arrayMove(arr: unknown[], a: number, b: number) {
    if (a < 0 || a >= arr.length) return;

    while (a < b && a < arr.length - 1) {
        arraySwap(arr, a, a + 1);
        a++;
    }

    while (a > b && a > 0) {
        arraySwap(arr, a, a - 1);
        a--;
    }
}

/**
 * Used to create a correspondence between two lists of objects.
 * For example, a UI that is editing a bunch objects probably doesn't want to directly augment
 * the state of the things its editing, and instead have seperate 1->1 state per item being edited.
 */
export function resizeObjectPool<T>(arr: T[], factory: () => T, wantedLength: number,) {
    if (arr.length !== wantedLength) {
        let prevLength = arr.length;
        arr.length = wantedLength;
        for (let i = prevLength; i < wantedLength; i++) {
            if (arr[i] == null) arr[i] = factory();
        }
    }
}

// While the API looks inconsistent with resizeObjectPool, it actually isn't.
// in both cases, the 'pool-related' arguments are first.
// resizeObjectPool(pool::array, pool::constructor, len)
// resizeValuePool(pool::array, len, defaultValue).

export function resizeValuePool<T>(arr: T[], wantedLength: number, defaultVal: T) {
    if (arr.length !== wantedLength) {
        let prevLength = arr.length;
        arr.length = wantedLength;
        for (let i = prevLength; i < wantedLength; i++) {
            if (arr[i] == null) arr[i] = defaultVal;
        }
    }
}
