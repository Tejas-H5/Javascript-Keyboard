# How do I get this thing running locally?

1. Clone this repo into a directory of your choosing.
2. Install node and npm. You'll need these to install dependencies and run javascript.
3. `cd` into `rhythm-game`, and use `npm install` to install packages
4. use `npm run dev` to start the vite dev server, and open it up.

# How do I build the single HTML file?

Same as above, but use `npm run build` to build a static HTML file with everything.

# 

# Project structure

```
.github/
    contains CI/CD pipeline info
rhythm-game/    -- The frontend typescript code.
    audioProcessing/
        python code that is use to generate assets. 
        can be ran with npm run build-samples.
        you'll need to pip-install the dependencies as needed.

    dist/       -- this is where we build the final static page
        index.html  -- the frontend entry point

    src/        -- all code lives here except index.html
        Some dirs here are for 're-useable' logic that is not specific to this app:

        components/
            UI components that can be copy-pasted to other simlar projects go here
        utils/
            Utils that can be copy-pasted to other simlar projects go here
        samples/
            samples are converted into number arrays by a python script, and then put here.
        dsp/                        -- All code that runs on a custom Audio Worklet node goes here
        state/          -- All app-specific domain logic goes here.
        views/          -- All ui components that require the GlobalContext in order to work go here
        main.ts         -- All initialization code goes here
        vite-env.d.ts

    other files and folders

Development.md 
    Documents how to build and run (most of) the contents of this repo
Readme.md
    Documents the project's intentions/features/etc
```
