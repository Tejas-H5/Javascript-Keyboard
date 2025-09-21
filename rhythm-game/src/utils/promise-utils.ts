// I am not a fan of async-await for various reasons. Main reasons:
// - Makes async code look like synchronous code - obfuscates the true nature of the code, which leads to incorrect assumptions about what it does.
// - The `async` keyword propagates it's usage up function calls, turning otherwise simple and easy to debug sync functions into async ones.
//
// I am also not a fan of async programming in general. 
// As soon as your code or data becomes 'async', the complexity can massively go up if not handled correctly.
// Sometimes the performance boost is worth it, and other times, you are doing web stuff or integrating with async APIs, so you
// are forced to uose it.
//
// One such complexity is that if I have a list of metadata for posts, and I only want to fetch the actual post when I 
// scroll to it, for example - depending on the size of the posts, it may take a different amount of time for each request to resolve.
// Your code then needs some way to discard/cancel the 'old' request before it sends out another one, so that we
// don't end up with:
//
// fetch post 1
// fetch post 2
// update store to contain post 2 
// update store to contain post 1
//
// Promises don't have any notion of 'cancellation', so you will need to build this in yourself somehow. 
// Maybe promise.race([a, b]) can work, if promise a is the request, and b is something that resolves when we call cancel() on some wrapper object
// manually. But the code you wrote in the first branch still churning along. How do you get the remaining steps in the pipeline to automatically
// stop/early return without just checking for a cancelled variable after every `await` instruction? 
//
// I was trying to code a Promise wrapper that would respect ordering of requests somehow, but 
// I'm just not able to get the types to work. I've settled on something simpler.

import { setTimelineNoteAtPosition } from "src/state/sequencer-state";

let taskId = 0;
const taskMap = new Map<any, Task>();

class Task {
    done = false;

    constructor(
        public readonly key: any,
        public readonly taskId: number,
    ) {
    }

    // A task can be 'completed' whenever we no longer care about it's results.
    // This is because 
    // a) it's been cancelled
    // b) superceeded by another request
    // c) has completed successfuly and ran all the way through
    complete() {
        this.done = true;
        taskMap.delete(this.taskId);
    }
}

export function getTask(key: any): Task | undefined {
    return taskMap.get(key);
}

export function getOrCreateTask(key: any): Task {
    const block = taskMap.get(key);
    if (block) {
        block.complete();
    }

    const newTaskId = taskId++;
    const taskInfo = new Task(key, newTaskId);
    return taskInfo;
}

export function isTaskIdValidForKey(taskId: number, key: any) {
    return taskMap.get(key)?.taskId === taskId;
} 

export function clearTaskIdForKey(taskId: number, key: any) {
    if (isTaskIdValidForKey(key, taskId)) {
        taskMap.delete(key);
    }
}

export function getAllTasks() {
    return taskMap;
}

// `key` is just any value that is unique to this particular action.
// It's kinda like react-query, but also like Java where you can synchronize on random objects you have lying around
export async function runCancellableAsyncFn(
    key: any,
    fn: (taskInfo: Task) => Promise<void>,
    onError?: (err: any) => void,
) {
    const task = getOrCreateTask(key);

    const t0 = performance.now();

    try { 
        await fn(task);

        let name = typeof key === "function" ? key.name: key;
        console.log("async task " + name + " completed in " + (performance.now() - t0) + "ms");
    } catch (err) {
        console.error("An error occured in a cancellable async function: ", key, err);
        onError?.(err);
    }


    task.complete();
}

export function cancelAsyncFn(key: any) {
    const task = getTask(key);
    task?.complete();
}

export function sleepForMs(ms: number) {
    return new Promise<void>((resolve) => {
        setTimeout(() => resolve(), ms);
    });
}
