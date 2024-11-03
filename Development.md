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
        css/            
            All CSS that can be copy-pasted to other simlar projects goes here
        samples/
            samples are converted into number arrays by a python script, and then put here.
        dsp/
            dsp-loop.ts             -- All code that runs on a custom Audio Worklet node goes here
            dsp-loop-interface.ts   -- All code that lets the frontend communicate with dsp-loop.js goes here
        The rest of the code will be app-specific:
        state/          -- All app-specific domain logic goes here.
            global-context.ts   -- The 'spine' of the program - code with cross-cutting concerns goes here
                This file also contains the GlobalContext, which has references to all of the 'subsystems' in the program
        views/          
            All ui components that require the GlobalContext in order to work go here
        main.css        
            App-specific css goes here. Most styling is done through JS though, so this file might mostly contain css vars
        main.ts         
            All initialization code goes here
        vite-env.d.ts

    other files and folders

Development.md 
    Documents how to build and run (most of) the contents of this repo
Readme.md
    Documents the project's intentions/features/etc
```
