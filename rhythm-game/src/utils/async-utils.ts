// A series of utils that allow me to avoid using Promises ever.
// The main issues with promises:
// - They make highly concurrent code look serial, and thus prevent TypeScript from catching certain classes of bugs
// - They don't work exactly as you expect them to work. There are times you expect the to do work in the same
//      event tick but they never do I don't think
//
// I suspect that callback-based code can be just as clean as async/await,
// if not cleaner, with the right thought process.

import { assert } from "./assert";

// Don't forget to continue your continuations
export type Done = number & { readonly __ThenResult: unique symbol };
export const DONE = undefined as unknown as Done; // This is where the continuation continued.
// Some other alternatives to 'DONE' to make intent more clear
export const CANCELLED = DONE;        // This action was cancelled. We aren't calling the user's callback on purpose.
export const DISPATCHED_LATER = DONE; // This action dispatched callbacks in an unusual way. You'll need to review it's correctness.
export const PARALLELISM = DONE;      // We are calling many things at once, and continuing once it's all completed. You'll need to review it's correctness.

export type Then<T> = (value: T) => Done;

// RUST mentioned?!?
export type Result<T, E=string> = 
 | { value: T; }
 | { error: E  }
 ;

// Allows callsite to choose if they want to treat value not found because it wasn't found
// and value wasn't found because we encountered an error while finding it the same or differently.
export type GetResult<T, E=string> = {
    value?: T | undefined;
    error?: E;
}


// TODO: rename to callback-utils
export type RunningTasks = {
    tasks: Task[];
}

export type Task = {
    name: string;
    t0: number;
};

const globalTaskTracker: RunningTasks = {
    tasks: [],
}

export function getTasks(): RunningTasks {
    return globalTaskTracker;
}

export function trackTask<T>(name: string, then: Then<T>, tracker = globalTaskTracker): Then<T> {
    const task: Task = {
        name: name,
        t0:   performance.now(),
    };

    tracker.tasks.push(task);

    let invoked = false;

    const timeout = setTimeout(() => {
        console.warn("This task is taking a while: ", name);
    }, 3000);

    return (val: T) => {
        if (!invoked) {
            invoked = true;
            clearTimeout(timeout);

            const idx = tracker.tasks.indexOf(task); assert(idx !== -1);
            tracker.tasks[idx] = tracker.tasks[tracker.tasks.length - 1];
            tracker.tasks.pop();
            console.log("[" + name + "] completed in " + (performance.now() - task.t0) + "ms");
        } else {
            console.error("Continuations shouldn't be invoked multiple times");
        }

        return then(val);
    }
}

