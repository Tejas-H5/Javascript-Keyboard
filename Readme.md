# Virtual Keyboard ( Check it out [here](https://tejas-h5.github.io/Javascript-Keyboard/keyboard.html) )

This was originally a VanillaJS project that I've now ported to typescript. 
Right now, it is a virtual keyboard piano instrument, but I eventually plan on turning this into a rhythm game.
Wouldn't it be cool if all of the charts from rhythm games also doubled as actual songs that can be learned and played outside of
any specific level?

## How does it work?

To explain it simply, each musical note has a frequency. The first or 0th musical note is a C0, which has a frequency of around 16.5hz. 
Each note after C0 (in half-steps) multiplies this frequency by the 12th root of two. 
Other music systems may use different formulations, but they are out of the scope of this discussion.
If we assign an 'index' to every key in our instrument, we can then get it's frequency with a formula like `C0 * Math.pow(twelvethRootOfTwo, i)`.
I was able to construct a keyboard using some code very similar to this (I've ommitted the subtle details for simplicity here):

```
// this code is actually the real code btw
export const C_0 = 16.35;
export const TWELVTH_ROOT_OF_TWO = 1.0594631;
export function getNoteFrequency(index: number) {
    return C_0 * Math.pow(TWELVTH_ROOT_OF_TWO, index);
}

...

// this code to construct the instrument is pseudo code
keys = "1234567890-=qwertyuiop[]asdfghjkl;'\zxcvbnm,./".split('')
for key, i in keys:
    key.frequency = getNoteFrequency(i);
    key.t = 0

```

Now, it's just a matter of 'playing' these frequencies on the computer speaker when we press some keys.
The way to do audio stuff on the web seems to involve using the web audio API: https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API

Specifically what we're interested in is the `AudioWorkletNode` - this allows us to create arbitrary audio nodes in our 
audio graph. With an audio graph as simple as `AudioWorkletNode -> audioCtx output` we can output custom audio to the speakers -
but with some catches:

- Most web browsers have a security feature that prevents sounds from being played without user interaction. 
This is very understandable. To get around this, I'm just re-resuming the context whenever a user presses a key or clicks the mouse to trigger the 
keyboard, but if I forget to do this somewhere, we'll run into a bug where no sound plays.
- The only way to communicate with the custom audio worklet node is by sending serializable objects over message ports, which makes a lot of
things that would be easy when doing audio stuff in a normal app much harder in the web world.

TODO: explain how to make the waveform once we've got it sounding somewhat decent
