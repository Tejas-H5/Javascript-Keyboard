import { deserializeEffectRack } from "state/effect-rack";
import { effectRackPresetToMetadata, effectRackToPreset } from "state/keyboard-config";

// TODO: incorporate!

const allBundledEffectRacks = [
    ["Square wave", `{"name":"Default sine wave","id":0,"effects":[{"value":{"type":1,"amplitudeUi":{"valueRef":{"value":1}},"signalUI":{"valueRef":{"regIdx":1}},"attackUI":{"valueRef":{"value":0.02}},"decayUI":{"valueRef":{"value":0.02}},"sustainUI":{"valueRef":{"value":0.2}},"releaseUI":{"valueRef":{"value":0.2}},"valueOut":{"id":2},"stageOut":{"id":1}}},{"value":{"type":0,"waveType":1,"amplitudeUI":{"valueRef":{"regOutputId":2}},"phaseUI":{"valueRef":{"value":0}},"frequencyUI":{"valueRef":{"regIdx":0}},"frequencyMultUI":{"valueRef":{"value":1}},"offsetUI":{"valueRef":{"value":0}},"unisonCountUi":{"valueRef":{"value":1}},"unisionWidthUi":{"valueRef":{"value":1}},"unisonMixUi":{"valueRef":{"value":0.5}},"unisonPhaseOffsetUi":{"valueRef":{"value":0}},"waveOut":{"id":3},"tOut":{"id":4}}}],"effectRackOutputIds":[1,2,3,4],"output":{"valueRef":{"regOutputId":3}}}`]
].map(([name, json], i) => {
    const rack = deserializeEffectRack(json);
    const preset = effectRackToPreset(rack);
    preset.id = -i - 1;
    preset.name = name;
    return preset;
});

const allBundledEffectRacksMetadata = allBundledEffectRacks
    .map(effectRackPresetToMetadata);

export function getAllBundledEffectRacks() {
    return allBundledEffectRacks;
}

export function getAllBundledEffectRacksMetadata() {
    return allBundledEffectRacksMetadata;
}
