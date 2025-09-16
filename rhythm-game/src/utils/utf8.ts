// https://stackoverflow.com/questions/5515869/string-length-in-bytes-in-javascript
// Very clever. starts with the utf-16 length, then increments/decrements based on the difference between the utf8 length.
export function utf8ByteLength(str: string) {
    // returns the byte length of an utf8 string
    let s = str.length;
    for (let i = str.length - 1; i >= 0; i--) {
        const code = str.charCodeAt(i);
        if (code > 0x7f && code <= 0x7ff) s++;
        else if (code > 0x7ff && code <= 0xffff) s += 2;
        if (code >= 0xDC00 && code <= 0xDFFF) i--; //trail surrogate
    }
    return s;
}

export function bytesToMegabytes(bytes: number) {
    return bytes / 1024 / 1024;
}
