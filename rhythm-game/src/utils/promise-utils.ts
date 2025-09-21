// I am not a fan of async-await for various reasons. But it is way better than thenables or the callback approach.
// My preference would be blocking operations, that we could then schedule manually to be async like `runAsync(() => normalFn())`;
// But afaik we don't really have that here.
// The promise pipeline can also be good, if we could do stuff like
// newPipeline()
//      .then(blah).catch(balh)
//      .then(balh2).catch(blah2)
//  
//  Except the .catch returns a new promise that is like A | void, which sucks. 
// And I haven't been able to figure out hwo to wrap the promises such that they don't do that,
// so we'll just have to use async/await I suppose.

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
        taskMap.delete(this.key);
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
    const task = new Task(key, newTaskId);
    taskMap.set(key, task);
    return task;
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
