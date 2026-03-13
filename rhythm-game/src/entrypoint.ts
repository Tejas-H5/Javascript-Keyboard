import { IS_PROD } from "./debug-flags";
import { imMain } from "./main";
import { initCssbStyles } from "./utils/cssb";
import { im, ImCache, imdom, el, ev, } from "src/utils/im-js";

// export let hmr: HmrState | undefined;

// TODO: needs to clean up the specific styles that were patched after HMR
// (or dont bother)
initCssbStyles();

// if (IS_PROD) {
    imMain([]);
// } else {
//     hmr = startRenderingWithHMR(imMain);
//     if (import.meta.hot) {
//         import.meta.hot.accept((newModule) => {
//             hmr!.accept(newModule, import.meta.hot?.invalidate);
//         });
//     }
// }
