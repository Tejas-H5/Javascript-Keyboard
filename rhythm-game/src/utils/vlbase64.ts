const validLetters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz1234567890+/"
const validLettersReverseMap = new Map<string, number>();
for (let i = 0; i < validLetters.length; i++) {
    validLettersReverseMap.set(validLetters[i], i);
}

const mask = 0b111111;
export function numbersToVariableLengthBase64(numbers: number[]): string {
    const sb: string[] = [];

    for (let i = 0; i < numbers.length; i++) {
        const num = numbers[i];
        const part1 = ((num >> 0) & mask);
        const part2 = ((num >> 6) & mask);
        const part3 = ((num >> 12) & mask);
        const part4 = ((num >> 18) & mask);
        const part5 = ((num >> 24) & mask);
        const part6 = ((num >> 30) & mask); 

        // Most these parts are probably zero. so instead of encoding 6 letters, 
        // I just encode a length and then based on the length, a number of parts.
        let length;
        if (part6) length = 6;
        else if (part5) length = 5;
        else if (part4) length = 4;
        else if (part3) length = 3;
        else if (part2) length = 2;
        else if (part1) length = 1;
        else length = 0;

        sb.push("" + length); // we can actually just push a number for the length here. it is between 0 and 6.
        if (length > 0) sb.push(validLetters[part1]);
        if (length > 1) sb.push(validLetters[part2]);
        if (length > 2) sb.push(validLetters[part3]);
        if (length > 3) sb.push(validLetters[part4]);
        if (length > 4) sb.push(validLetters[part5]);
        if (length > 5) sb.push(validLetters[part6]);
    }

    return sb.join("");
}

export function variableLengthBase64ToNumbers(vlBase64: string): number[] {
    const result: number[] = [];

    for (let i = 0; i < vlBase64.length;) {
        let len = parseInt(vlBase64[i]); i++;

        let num = 0;
        let shift = 0;
        while (shift < len) {
            const letter = vlBase64[i]; i++;
            const letterIdx = validLettersReverseMap.get(letter);
            if (letterIdx === undefined) {
                throw new Error("Expected the letter index to be defined. You may not have a valid variable-length base64 string!");
            }
            num = num | (letterIdx << (shift * 6));
            shift++;
        }
        result.push(num);
    }

    return result;
}
