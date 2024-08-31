# Virtual Keyboard ( Check it out [here](https://el-tejaso.github.io/Javascript-Keyboard/keyboard.html) )

I have since stopped working on the vanillaJS project, and I'm porting it to typescript. 
Ideally, I want to turn this into some sort of rhythm game, but coming up with an intuitive design is proving difficult.

This project aims to be a fully functional virtual keyboard, with the ability to automate it's own playing, as well as the ability to teach people how to play it. It is basically a rework of my more or less failed Harmonic Table unity project (https://github.com/El-Tejaso/Harmonic-Table), but it is also quite different.

## How does it work?

To explain it simply, each musical note has a frequency. The first or 0th musical note is a C0, which has a frequency of around 16.5hz. 
This means that if your computer's speaker membrane oscillated back and forth at a rate of 16.5 times a second, it would emit a C0 note. I will come back to this later.

Each note after C0 (in half-steps) multiplies this frequency by the 12th root of two. Basically, if we wanted to get the frequency of a note that was `i` half-steps up from C0, we can get the frequency of that note with the formula `C0 * Math.pow(twelvethRootOfTwo, i)` (there are probably other systems of music as well, but they will be ignored since most songs I know use this one). 

That is great and all, but how does this help me make sounds, let alone music? Well, if we know what frequency a particular note 'index' is, and we are able to assign indices to keys on a keyboard, we can make a musical instrument, that works something like this:
```
keys = "1234567890-=qwertyuiop[]asdfghjkl;'\zxcvbnm,./".split('')
for key, i in keys:
    key.frequency = calculateFrequency(i);
    key.t = 0

speakerInput, sampleRate = some audio API thinggy;
dt = 1 / sampleRate
while (I can write to the speakerInput):
    sample = 0
    for key, i in keys:
        if keyboard has key pressed:
            sample += Math.sin(key.t * 2PI)
            key.t += dt * key.frequency

    speakerInput.push(sample)
```

Here, each `sample` is some number between 0 and 1 indicating how far 'in' or 'out' the speaker membrane should be, and the `sampleRate` is going to be some large number like 48000hz or 44100hz saying how many samples are sent to the speaker per second. If we give each key it's own timer and frequency, we can increment that timer per key whenever it is pressed down for each sample, sum up all of the samples and send each sample to the speaker. I would call each of these (t, frequency) tuples _oscillators_ . The real code is a little more complex, as we need to make sure the sample is between 0 and 1 by dividing by the total number of keys pressed per second. and we also need to make sure that the wave is always a continuous (smooth, no jagged edges) function - when this isn't the case, the audio will have  slight clicking sounds that are very hard to track down. This means that we can't simply add `Math.sin(key.t * 2PI)` to the final audio output, we need to multiply it by an 'envelope', which is basically another function that will smoothly move from 0 to 1 over some period of time when the key is pressed, and then slowly decay back from 1 to zero when the key is released. And we can't just divide the final sample by the number of oscillators that are currently oscillating, because this is an integer that changes in discrete steps (it is the source of clicking sounds that I wasn't able to track down the last time I did this kind of project). We need another continuous value that smoothly moves between each of the discrete values for "the number of sounds oscillating at a given time" and use that to normalize the final sample between 0 and 1. And to a more complex sound that sounds kind of like a piano, each oscillator can't just be a sine-wave, but multiple sine waves added together of various frequencies. At the time of writing this, all of that code is in `dsp-loop.js`.

Now it is just a matter of initializing a DSP thread using an `AudioWorkletNode` from the web audio API, and then communicating with it using ports whenever a key is pressed/released to let it know which oscillators to oscillate (I still cant believe this works tbh).
Most web browsers have a security feature that prevents sounds from being played without user interaction, and this includes our DSP loop, so I've had to include a button that needs to be clicked by the user to basically kick-start the audio context.

Only one problem remaining - I don't actually know how to play piano, or any musical instrument really. I do find it fun to brute-force the random songs floating around in my head, continually extending the sequence of notes one note at a time till I have the entire tune.
But I found it hard to remember the sequence of notes and accurately play them back correctly over and over again.
It would save me a lot of effort if I had some sort of automated way of playing back a sequence of notes in order.
Rather than spending months creating a DAW, I decided to make some sort of language/file format that would allow me to iteratively transcribe a song, and then play it back on this instrument. I ended up hacking  together something using Javascript's setTimeout + some slightly altered parsing code that I copy-pasted from one of my other projects.
The simplest idea here is to just store a bunch of notes separated by a space, one after another.
The main decision I had to make was whether to encode the notes as the literal keys on the keyboard that I am pressing (q w e r t y, ect.), or if I should store actual musical notes (A1, B1 C2 D2, etc.), and then map them back to keyboard keys when I want to play them.
I ended up going with the latter, because I didn't want the file format to be tightly coupled to the instrument it would be used on. 
This ended up being quite a good decision, because now, if I really couldn't figure out some song, I could much more easily transcribe it by looking at sheet music what someone else had already transcribed on Muse-Score or some similar website.

Unfortunately automating the playing of songs doesn't really fix my problem of not being able to play this thing myself.
Quite the opposite, actually. So now what? 

Here is the thing. I know how to type letters without even looking at the keyboard, but I can't play songs on the piano.
The idea then, is to take the sequence of note encoded by the file format, convert them into keyboard keys (I am already doing this to automate playing the sequence, actually) and then add some sort of highlight over that key in the keyboard visualization, so that I know instantly what key to press next to continue the sequence. 
In this way, my keyboard ability should just seamlessly transfer over into piano ability, right?

TODO: Try this out for a while, and find out if this works or not

.... To be continued. (Or abandoned)
