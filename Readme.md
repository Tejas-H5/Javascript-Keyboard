## Virtual Keyboard

This project aims to be a fully functional virtual keyboard, with the ability to automate it's own playing, as well as the ability to teach people how to play it. It is basically a rework of my more or less failed Harmonic Table unity project (https://github.com/El-Tejaso/Harmonic-Table), but it is also quite different.

This project is only possible because of the web's audio API, in particular the `AudioWorkletNode`. 
I was able to use it to set up a DSP-loop that was extremely similar to Unity's DSP loop that I had used in the Harmonic Table unity project. 
Even though this one is much easier to play, I still found it quite hard to learn. But because all of the notes are right next to each other, I can basically brute force all of the random songs floating around in my head.
In the end, it would save me a lot of time to have some sort of system to play back a sequence of notes in order.
Rather than spending months creating a DAW, I hacked together something using Javascript's SetTimeout + some slightly adapted parsing code that I wrote for another project where I am trying to clone MatLab in the browser (https://github.com/El-Tejaso/Calculator (I really shouldn't have called it "Calculator", that is such an underwhelming name for what it really is.)).
This ended up being quite a good decision, because now, I could even transcribe whole songs by looking at what someone else had transcribed on Muse-Score or some similar website.
Another benefit of this automation was that now that I had some format to store how a song was played, it is theoretically possible to use this data to provide visual queues to a user and basically teach them how to play the song. 

Currently, this is still a work in progress.

## TODO:

