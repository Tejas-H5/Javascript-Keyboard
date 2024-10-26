import { GlobalState } from "./state";

export type RenderContext = {
    globalState: GlobalState;
    render(): void;
}
