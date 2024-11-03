export function unreachable(t: never): never {
    throw new Error("Unhandled case: " + t);
}
