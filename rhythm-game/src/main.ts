import "src/css/layout.css";
import {
    getDspInfo,
    initDspLoopInterface
} from "src/dsp/dsp-loop-interface";
import {
    appendChild,
    Component,
    newComponent
} from "src/utils/dom-utils";
import { domRoot } from "./dom-root";
import "./main.css";
import { load, loadChart } from "./state/loading-saving-charts";
import { stopPlaying } from "./state/playing-pausing";
import { syncPlayback } from "./state/sequencer-state";
import { App, GlobalContext, newGlobalContext, setViewPlayCurrentChart } from "./views/app";

let app: Component<GlobalContext, any> | undefined;
function rerenderApp() {
    app?.render(globalContext);
}
const globalContext = newGlobalContext(rerenderApp);
load(globalContext);
loadChart(globalContext, "test song");

// initialize the app.
(async () => {
    await initDspLoopInterface({
        render: () => {
            rerenderApp();

            const dspInfo = getDspInfo();
            const sequencer = globalContext.sequencer;

            if (sequencer.isPlaying) {
                if (dspInfo.scheduledPlaybackTime === -1) {
                    stopPlaying(globalContext);
                } else {
                    syncPlayback(sequencer, dspInfo.scheduledPlaybackTime, dspInfo.isPaused);
                }
            } 
        }
    });

    // Our code only works after the audio context has loaded.
    app = newComponent(App, globalContext);
    appendChild(domRoot, app);
    setViewPlayCurrentChart(globalContext);

    function onRender() {
        if (!app) {
            return;
        }

        app.renderWithCurrentState();
    }

    // render to the dom at the monitor's fps (!)
    // (based??)
    let lastTime = 0;
    function renderFunc(time: DOMHighResTimeStamp) {
        const dtMs = time - lastTime;
        lastTime = time;

        if (dtMs < 300) {
            globalContext.dt = dtMs / 1000;
            onRender();
        }

        requestAnimationFrame(renderFunc);
    }
    requestAnimationFrame(renderFunc);

    rerenderApp();
})();
