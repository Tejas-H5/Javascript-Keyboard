import "src/css/layout.css";
import {
    getDspInfo,
    initDspLoopInterface
} from "src/dsp/dsp-loop-interface";
import { imState, initializeDomRootAnimiationLoop } from "src/utils/im-dom-utils";
import "./main.css";
import { loadSaveState, loadChart } from "./state/loading-saving-charts";
import { stopPlaying } from "./state/playing-pausing";
import { syncPlayback } from "./state/sequencer-state";
import { imApp, newGlobalContext, setViewPlayCurrentChart } from "./views/app";
import { initCnStyles } from "./utils/cn";
import { imFpsCounterOutput, newFpsCounterState, startFpsCounter, stopFpsCounter } from "./components/fps-counter";

const saveState = loadSaveState();
const globalContext = newGlobalContext(saveState);
loadChart(globalContext, "test song");

function renderRoot() {
    const fps = imState(newFpsCounterState);
    imFpsCounterOutput(fps, true);

    startFpsCounter(fps);

    imApp(globalContext);

    stopFpsCounter(fps);
}

initCnStyles();

// initialize the app.
(async () => {
    await initDspLoopInterface({
        render: () => {
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
    setViewPlayCurrentChart(globalContext);
    initializeDomRootAnimiationLoop(renderRoot);
})();
