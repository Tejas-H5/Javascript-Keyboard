// I am not a fan of async-await for various reasons.
// In particular, the async keyword will propagate itself up the function usages.
// I don't like this, because whenever you mark a function as 'async', you can make far less assumptions about it's execution.
//
// However, I have nothing against Promises. In fact, they are required if you want to write any kind of efficient data 
// fetching code in JavaScript at all. Using async-await will make your code look synchronous, which
// will make it harder to notice things that can be paralellized.
//
// I also believe that 'callback-hell' is a complete non-issue.
//
// The benefits of:
//  - never having to add `async` to any of your functions
//  - serial and parallel dependency chaings being more obvious
//  - ability to handle the failure of each individual promise slightly differently, if needed
//
// Far outweight any percieved 'hell' from too much indentation.
//
// However, I'm finding that the main problem with any form of async/await, or callbacks, is that it is very 
// easy for them to leak to all of the places that call them, resulting in 
// all the code that touches them becoming overly complicated.
//
// The truth is, if all you're doing is loading assets asynchronously, 
// then you probably don't need to pollute your codebase with async/await or promises.
// TODO: test this theory and try to think of a better solution

// I'd also like the ability to, cancel tasks, handle cancellation on a case-by-case basis,
// replace tasks with newer tasks, use arbitrary scheduling algorithms for tasks
// and keep track of all the tasks that we've got running. 
// And it turns out, while being a useful prmitive, promises don't really solve any of this other stuff by themselves.

/** 
 * Represents some asset or action result that we'll get at some point in the future.
 * While similar to Promises, these tend to be more useful in practice, because you can:
 * - Track all async data that is currently loading
 * - 'Cancel' async data that is loading. Right now this just means the callbacks don't get called,
 *      but we can update it to invoke an abort controller in the future
 * - You can still schedule callbacks to get called on completion, error, or both
 
 * This data was designed to only be loaded by one async method, once.
 * There is no 'reloading' this object - cancel the previous object if needed, throw it away, and load another one in it's place instead.
 * This allows us to maintain a simple mental model, and avoid all sorts of race conditions.
 *
 * For example:
 * ```ts
 * // unintended usage that we built this thing to avoid in the first place:
 * const store = { value: 0, };
 * newAsyncData(() => fetch("/my/api/endpoint/v1/value", { method: "GET" }))
 *      .then(response => store.value = response)
 *
 * // intented usage:
 * const store = { value: newAsyncData(async () => 0), };
 * store.value = newAsyncData(() => fetch("/my/api/endpoint/v1/value", { method: "GET" }));
 *
 * ```
 */
export type AsyncData<T> = {
    // for debug/visualisation/profling purposes
    name: string; 
    startedAt: number;
    data: T | null;
    err: Error | null; 

    thenFn:    ((val: T) => void)[] | undefined;
    catchFn:   ((err: Error) => void)[] | undefined;
    finallyFn: ((d: AsyncData<T>) => void)[] | undefined;

    // NOTE: semantics are slightly different from Promise<T>.
    // These methods add handlers to the same data, rather than returning a new instance.
    // Also, multicast is supported.
    // If cancelled, none of the callbacks will fire.
    //

    // Should the API be updated to be like
    // then 
    //      .catch
    //      .finally
    // then
    //      .catch
    //      .finall
    //
    // i.e each catch and finally only applies to the last `then` ? I think it should.

    then:    (fn?: (val: T) => void) => AsyncData<T>;
    catch:   (fn?: (err: Error) => void) => AsyncData<T>;
    finally: (fn?: (d: AsyncData<T>) => void) => AsyncData<T>;

    // NOTE: these are static methods that probably didn't need to be fn pointers

    cancel(): void;
    isLoading(): boolean;

};

const allLoadingAsyncData = new Set<AsyncData<any>>();

export function getAllLoadingAsyncData() {
    return allLoadingAsyncData;
}

/** See {@link AsyncData} docs */
export function newAsyncData<T>(name: string, loadFn: (d: AsyncData<T>) => Promise<T>): AsyncData<T> {
    const d: AsyncData<T> = {
        name: name,
        startedAt: performance.now(),
        data: null,
        err: null,

        thenFn:     undefined,
        catchFn:    undefined,
        finallyFn:  undefined,

        // We need to be able to add these _after_ we return this object, and
        // still have the callbacks run. This allows us to not need to 
        // pass 3 lambda parameters into every AsyncData method.

        then(fn) {
            if (!fn) return d;

            if (d.data !== null) {
                fn(d.data);
            } else {
                if (!d.thenFn) d.thenFn = [];
                d.thenFn.push(fn);
            }
            return d;
        },
        catch(fn) {
            if (!fn) return d;

            if (d.err) {
                fn(d.err);
            } else {
                if (!d.catchFn) d.catchFn = [];
                d.catchFn.push(fn);
            }
            return d;
        },
        finally(fn) {
            if (!fn) return d;

            if (!d.isLoading()) {
                fn(d);
            } else {
                if (!d.finallyFn) d.finallyFn = [];
                d.finallyFn.push(fn);
            }
            return d;
        },

        cancel() {
            allLoadingAsyncData.delete(d);
        },

        isLoading() {
            return allLoadingAsyncData.has(d);
        },
    };

    // Adding it here instead of at the start of load(), so that if calling load() is forgotten, then the 
    // background task visualiser will still display this
    allLoadingAsyncData.add(d);

    const promise = loadFn(d);

    // Because we're using a builder pattern, 
    // our callbacks should always be set to something by now,
    // so this also works for when `loader` returns a promise that's already resolved.

    promise
        .then(val => {
            if (!allLoadingAsyncData.has(d)) {
                // Task was cancelled. Show is over folks
                return;
            }

            if (val == null) {
                d.err = CANCELLATION_ERROR;
                if (d.catchFn) {
                    for (const fn of d.catchFn) {
                        try {
                            fn(d.err);
                        } catch (e) {
                            console.error("Error in catch event of async task (cancellation pathway)", e);
                        }
                    }
                }
            } else {
                d.data = val;
                if (d.thenFn) {
                    for (const fn of d.thenFn) {
                        try {
                            fn(val);
                        } catch (e) {
                            console.error("Error in then event of async task", e);
                        }
                    }
                }
            }
        })
        .catch(err => {
            // Run this thing regardless of cancellation
            
            d.err = toError(err)

            if (d.catchFn === undefined) d.catchFn = defaultErrorHandlers;
            for (const fn of d.catchFn) {
                try {
                    fn(d.err);
                } catch (e) {
                    console.error("Error in catch event of async task", e);
                }
            }
        })
        .finally(() => {
            // Run this thing regardless of cancellation as well

            allLoadingAsyncData.delete(d);
            if (d.finallyFn) {
                for (const fn of d.finallyFn) {
                    try {
                        fn(d);
                    } catch (e) {
                        console.error("Error in finally event of async task", e);
                    }
                }
            }
        });

    console.log("New async data", d);

    return d;
}

function toError(err: any): Error {
    if (err instanceof Error) return err;
    return new Error("" + err);
}

const defaultErrorHandlers = [
    (err: Error) => {
        console.error("An error occured while loadin async data: ", err);
    }
];

const CANCELLATION_ERROR = new Error("Cancelled");

export function sleepForMs(ms: number): Promise<void> {
    return new Promise<void>((resolve) => setTimeout(resolve, ms));
}
