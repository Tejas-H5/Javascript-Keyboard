
export function filterInPlace<T>(arr: T[], predicate: (v: T, i: number) => boolean) {
    for (let i = 0; i < arr.length; i++) {
        if (!predicate(arr[i], i)) {
            arr.splice(i, 1);
            i--;
        }
    }
}
