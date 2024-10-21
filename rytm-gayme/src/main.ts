import "src/css/layout.css";
import {
    appendChild,
    Component,
    newComponent,
    newInsertable
} from "src/utils/dom-utils";
import { App } from "./app";
import {
    getDspInfo,
    initDspLoopInterface
} from "./dsp-loop-interface";
import "./main.css";
import { RenderContext } from "./render-context";
import {
    getCurrentPlayingTimeRelative
} from "./sequencer-state";
import {
    load,
    newGlobalState,
    stopPlaying
} from "./state";

// all util styles

const root = newInsertable(document.body);
let app: Component<RenderContext, any> | undefined;
function rerenderApp() {
    app?.render(renderContext);
}

const globalState = newGlobalState();

load(globalState);

const renderContext: RenderContext = {
    state: globalState.sequencer,
    globalState,
    render: rerenderApp,
};

// initialize the app.
(async () => {
    await initDspLoopInterface({
        render: () => {
            rerenderApp();

            const dspInfo = getDspInfo();
            const sequencer = globalState.sequencer;

            if (sequencer.isPlaying) {
                if (dspInfo.scheduledPlaybackTime === -1) {
                    stopPlaying(globalState);
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
    app = newComponent(App, renderContext);
    appendChild(root, app);

    // render to the dom at 60 fps (!)
    // (based??)
    setInterval(() => {
        if (!app) {
            return;
        }

        app.renderWithCurrentState();
    }, 1000 / 60);

    rerenderApp();
})();
