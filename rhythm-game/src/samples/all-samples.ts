import { crash1 } from "./crash1";
import { crash2 } from "./crash2";
import { hat1 } from "./hat1";
import { hat2 } from "./hat2";
import { kick } from "./kick";
import { rand1 } from "./rand1";
import { rand2 } from "./rand2";
import { snare } from "./snare";

export function getAllSamples() {
    return { crash1, crash2, hat1, hat2, kick, rand1, rand2, snare };
}

export type Sample = "crash1" | "crash2" | "hat1" | "hat2" | "kick" | "rand1" | "rand2" | "snare";
    
