import "src/css/layout.css";
import {
    getDspInfo,
    initDspLoopInterface
} from "src/dsp/dsp-loop-interface";
import {
    appendChild,
    Component,
    newComponent,
    newInsertable
} from "src/utils/dom-utils";
import "./main.css";
import { load, loadChart } from "./state/loading-saving-charts";
import { stopPlaying } from "./state/playing-pausing";
import {
    getCurrentPlayingTimeRelative
} from "./state/sequencer-state";
import { App, GlobalContext, newGlobalContext } from "./views/app";

// all util styles

const root = newInsertable(document.body);
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
                    // resync the current time with the DSP time. 
                    // it's pretty imperceptible if we do it frequently enough, since it's only tens of ms.
                    const currentEstimatedScheduledTime = getCurrentPlayingTimeRelative(sequencer);
                    const difference = dspInfo.scheduledPlaybackTime - currentEstimatedScheduledTime;
                    sequencer.startPlayingTime -= difference;
                }
            }
        }
    });

    // Our code only works after the audio context has loaded.
    app = newComponent(App, globalContext);
    appendChild(root, app);

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
