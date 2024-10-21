import { SequencerState } from "./sequencer-state";
import { GlobalState } from "./state";

export type RenderContext = {
    state: SequencerState;
    globalState: GlobalState;
    render(): void;
}
