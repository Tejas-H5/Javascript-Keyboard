import { GlobalContext } from "src/global-context";
import { div, RenderGroup } from "src/utils/dom-utils";

export function ChartSelect(rg: RenderGroup<GlobalContext>) {
    return div({ class: "flex-1 col" }, [
        "TODO: implement"
    ]);
}

function Button(rg: RenderGroup<{
    ctx: GlobalContext;
    songName: string;
    songJson: string;
}>) {
    return div({}, [
    ]);
}
