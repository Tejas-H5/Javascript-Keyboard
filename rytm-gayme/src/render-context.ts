import { SequencerState } from "./sequencer-state";
import { GlobalState } from "./state";

export type RenderContext = {
    sequencer: SequencerState;
    globalState: GlobalState;
    render(): void;
}
