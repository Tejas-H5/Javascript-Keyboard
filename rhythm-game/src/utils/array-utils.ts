export function filterInPlace<T>(arr: T[], predicate: (v: T, i: number) => boolean) {
    let i2 = 0;
    for (let i = 0; i < arr.length; i++) {
        if (predicate(arr[i], i)) arr[i2++] = arr[i];
    }
    arr.length = i2;
}

export function filteredCopy<T, U extends T>(src: T[], dst: T[], predicate: (v: T, i: number) => v is U) {
    dst.length = 0;
    for (let i = 0; i < src.length; i++) {
        if (predicate(src[i], i)) {
            dst.push(src[i]);
        }
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
export function chooseItem<T>(arr: T[], t: number): T{
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
