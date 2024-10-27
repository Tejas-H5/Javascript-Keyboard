export function filterInPlace<T>(arr: T[], predicate: (v: T, i: number) => boolean) {
    for (let i = 0; i < arr.length; i++) {
        if (!predicate(arr[i], i)) {
            arr.splice(i, 1);
            i--;
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
