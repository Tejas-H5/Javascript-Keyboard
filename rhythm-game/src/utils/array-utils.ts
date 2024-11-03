export function filterInPlace<T>(arr: T[], predicate: (v: T, i: number) => boolean) {
    for (let i = 0; i < arr.length; i++) {
        if (!predicate(arr[i], i)) {
            arr.splice(i, 1);
            i--;
        }
    }
}

export function filterInPlace2<T, U extends T>(src: T[], dst: T[], predicate: (v: T, i: number) => v is U) {
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
