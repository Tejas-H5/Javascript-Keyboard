
export function logTimeDelta(t: number, now: number, message: string): number {
    let delta = now - t;
    console.log(message);
    return delta;
}
