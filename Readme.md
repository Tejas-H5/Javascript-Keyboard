# Virtual Keyboard / Rhythm game (Check it out [here](https://tejas-h5.github.io/Javascript-Keyboard/))

This code is currently a work in progress. The plan is to make a rhythm game that uses as many keys of a keyboard as possible.
The problem with most rhythm games is that they give you the feeling of playing an instrument without you actually doing so. 
You could become a PRO guitar-hero player without ever having to play a guitar at all. 
In this game, all the charts will just be songs that can also be played outside of a particular chart in a sandbox mode.
NOTE: I have no idea if this can work or not, or how hard it would be, or how long it will take, or if I will even finish this.

## TODO:

- [x] Have basic gameplay, doesnt have to look/feel good
- [x] Have a basic chart editor that can place notes and play them, doesn't have to actually be good
- [...] Make some songs, see if it is possible to play them
- [ ] Make gameplay look good
- [ ] Make chart-select look good
- [ ] Make buttons look and sound good
- [ ] Make buttons look and sound good
- [ ] Add a way to customize the keyboard's sound
- [ ] Improve the keyboard's sound

## Architecture

This codebase is a web project that uses vite to run the dev server, and to create the final production bundle. 
A custom immediate-mode framework has been used for all of the UI () - it has been vendored manually, so it may be out of sync
with the source of truth. (It is also my own framework).
A custom HTML Audio API worklet node has been used for the audio output loop.

All state and subsystems can be accessed via the `GlobalContext` object, which is passed around to every app-specific component.
All keyboard events are handled in a single global event handler in `app.ts`. This significantly reduces all the issues with event bubling/ordering/propagation
issues that typically happens in JavaScript that you might get with per-component event handlers, and improves debuggability.
State is saved to a `SavedState`  object, which is saved in localStorage, and automatically migrated to the latest version by copying over all the saved field values to
a new instance of a particular object. We may move to IndexedDB in the future.

### Some things to note:

- Most web browsers have a security feature that prevents sounds from being played without any user interactions.
To get around this, I'm just re-resuming the context whenever a user presses a key or clicks the mouse to trigger the 
keyboard, but if I forget to do this somewhere, we'll run into a bug where no sound plays.
This is also the reason why we need a main menu that a user needs to click on before they can get to any of the real views.

- The only way to communicate with the custom audio worklet node is by sending serializable objects over message ports, which makes a lot of
things that would be easy when doing audio stuff in a normal app much harder here. 
Data is passed back and forth between the app and the audio worklet node via JSON DTOs. 

## Setting up the development environment

See Development.md for more info.
