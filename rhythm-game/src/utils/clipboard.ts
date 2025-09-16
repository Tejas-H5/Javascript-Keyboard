export function copyToClipboard(s: string) {
    return navigator.clipboard.writeText(s);
}

export async function readFromClipboard(): Promise<string> {
    return await navigator.clipboard.readText();
}
