// A series of utils aimed at making callback-based programming easier, such
// that we can completely avoid using promies in our code. Because `Promise` is just slop that is peddled by the big-tech complexity merchants.
// But in all seriousness, something feels off about that abstraction. I dont want to convert all my methods to `async`, actually.
// But I won't focus on that in this rant, I will leave that for later.
// 
// The thing about promises:
//
// let x = () => {
//     Promise.resolve(undefined).then(() => console.log("Hello")); 
//     console.log("World");
// }
// x();
//
// When ran, we get
// "World"
// "Hello"
//
// This is actually a good thing - it means promise continuations will behave predictably and consistently.
// I also find that it is also very difficult to create async pipelines without this being the case.
// For example, if we made such a thing (I say that as if I haven't already just tried making it...),
// natural code that we are all used to writing like this would no longer work:
//
// ```ts
// idb.getOne(tx, tables.chartMetadata, id)
//    .then(...)  // If this gets run synchronously and throws, we won't be able to catch, since the catch callback hasn't been attached yet.
//    .catch(...);
// ```
//
// However, if I want my indexeddb abstraction to actually work alongside caching i.e not drop the transaction,
// it will need to run instantly, i.e result in "Hello", "World". 
//
// The solution then, is to use callbacks. Ever time I have used them in the past, the code has always been
// unreadable and unmaintainable. However, I was simply not as good a programmer at the time. Can I execute
// callback-based programming better now? 
// 
// The answer is - surprisingly - yes. One of the main sources of misery with callbacks, is callback hell.
// Each callback gets nested deeper and deeper. While this is the focal point of many async/await motivations,
// I think the main problem with callbacks is that the error path and the normal path are split into two paths.
// This means that every async call will double the number of callbacks that are required, which necessarily leads to complexity.
// However, it is also possible to reuse the same callback for both the error path and the normal path,
// which completely fixes this. 
//
// Some other things like looping over things is also more cumbersome with callback-based code, so I've created some
// helpers for that too.
// It's also easy to forget to call a particular continuation, and just `return;` in a guard clause somewhere.
// To make this harder to forget, I've added an `AsyncCallback` calback type that enforces a return type of
// `AsyncCallbackResult` - this makes it much less likely to forget, but it is still possible.
// It is a leaky abstraction in the exact same way as async/await is, and it heavily encourages
// a style of programming that uses early returns. If you're dispatching an async action, 
// chances are, you probably don't want any code to execute afterwards:
//
// ```ts
// function asyncFunction(acb: ACB): ACR {
//      // Placing the return here allows the reader to discard asyncFunction from their 'mental stack', 
//      // and they can just focus on the callback logic after anotherAsyncFunction
//      return anotherAsyncFunction((val, err) => {
//          if (err) return acb(undefined, err);
//
//          ... lots of processing
// ```
//
// We are left with an indentation problem. I actually think this is fine.
// Indentation does not look very nice, and it is something that programmers want to minimize.
// They (me included) will rewrite entire functions to use early-returns where possible 
// simply so that the code is less indented.
// Within this callback paradigm, deeply indented callbacks are a sign of several async steps one
// after another, and this is also something that we should aim to minimize where possible.

import { filterInPlace } from "./array-utils";
import { assert } from "./assert";

/**
 * Also see {@link done}
 */
export type AsyncCallback<T = void> = ((result: T | undefined, err?: unknown) => AsyncCallbackResult); 
export type AsyncCb<T = void> = AsyncCallback<T>;
export type AsyncDone = AsyncCallbackResult;


/**
 * It's pretty easy to forget to call a callback inside another callback. 
 * Making the callback return something should this it a bit harder.
 *
 * ```ts
 * function a(cb) {
 *      if (blah) {
 *          return; // This is worng. If only the TS compiler could let you know ... well now, it can!
 *          return cb(undefined, err); // that is more like it
 *      }
 *
 *      return cb(value);
 * }
 * ```
 * As such, there will never be any more 'statuses'.
 *
 * It is pretty natural for this abstraction to leak into your other callback-based code. 
 * You will find that it heavily promotes a programming strategy that makes use of early-returns.
 * So far I'm finding that this is OK, and I wonder what my opion will be a couple months from now.
 */
export type AsyncCallbackResult = number & { readonly __AsyncCallbackResult: unique symbol };
// hopefully, `return undefined;` can be optimized by the compiler to do tail recursion, since its not really returning anything,
// and we can still get our compiler error
export const DONE = undefined as unknown as AsyncDone;
// Some other alternatives to 'DONE' to make intent more clear
export const CANCELLED = DONE; // This action was cancelled. We aren't calling the user's callback on purpose.
export const DISPATCHED_ELSEWHERE = DONE; // This action dispatched callbacks in an unusual way. You'll need to review it's correctness.

export function newError(message: string) {
    console.error(message);
    return new Error(message);
}

/**
 * Baiscally the no-op of an async callback.
 *
 * NOTE: it is actually a bad idea to use done to initialize a callback as optional.
 *
 * ```ts
 * function foo(cb: ACB<void>): ACR {
 *      return someOtherMethodWithCallback((result, err) => {
 *          if (!result) return cb(undefined, err);
 *
 *          // noo you were supposed to put `cb` here but there is no compiler warning, 
 *          // because someMethodWithCallback made their callback optional.
 *          // cb is also being used, so that `cb is usned` thing doesn't kick in here either
 *          return someMethodWithCallback(result); 
 *      });
 * }
 * ```
 *
 * Instead, use it at the callsite to explicitly flag that you dont care for that result.
 * ```ts
 * foo(done);
 * ```
 */
export function done<T>(_val: T | undefined, _err?: any) {
    // Its a no-op
    return DONE;
}

export function toAsyncCallback<T>(p: Promise<T>, cb: AsyncCallback<T>): AsyncDone {
    p
        .then(val => cb(val))
        .catch(err => {
            console.error(err);
            cb(undefined, err)
        });

    return DISPATCHED_ELSEWHERE;
}

// How do you use for-loops with a callback-based concurrency model? you can't. 
// You'll need to use recursion
export function sequentialIterator<T>(
    values: T[],
    iteration: (it: T, iterCb: AsyncCallback<void>) => void,
    cb: AsyncCallback<T>
): AsyncCallbackResult {
    let i = 0;

    const run = (_: any, err: any) => {
        if (err != null) {
            return cb(undefined, err);
        }

        if (i >= values.length) {
            return cb(undefined);
        }

        const val = values[i];
        i += 1;

        return iteration(val, run);
    };

    return DONE;
}

// 'Parallel' is assuming each iteration is an async action.
// Allows switching between {@link sequentialIterator} and parallel quickly
// TODO: test
export function parallelIterator<T>(
    values: T[],
    iteration: (it: T, finishedCb: AsyncCallback<void>) => AsyncCallbackResult,
    cb: AsyncCallback<void>,
): AsyncCallbackResult {
    let numFinished = 0;

    const onFinished = (_: any, err: any) => {
        if (err != null) {
            return cb(undefined, err);
        }

        numFinished += 1;
        if (numFinished === values.length) {
            return cb(undefined);
        }

        return DONE;
    };

    for (const it of values) {
        iteration(it, onFinished);
    }

    return DONE;
}

export type AsyncResult<T> = 
    | { loaded: false; val: undefined; err: undefined; } 
    | { loaded: true; val: T | undefined; err: any; };

type AsyncFunction<T> = (cb: AsyncCallback<T>) => AsyncCallbackResult;

export function asyncResult<T>(asyncFn: AsyncFunction<T>, cb: AsyncCb<AsyncResult<T>>): AsyncResult<T> {
    const result: AsyncResult<T> = {
        loaded: false,
        val: undefined,
        err: undefined,
    };

    asyncFn((val, err) => {
        // @ts-expect-error it cannot understand my genius.
        result.loaded = true; result.err = err; result.val = val;
        return cb(result);
    });

    return result;
}

export function asyncResultsAll<T extends unknown[]>(
    asyncMethods: { [K in keyof T]: AsyncFunction<T[K]> },
    resultsCallback: (results: { [K in keyof T]: AsyncResult<T[K]> }) => AsyncDone,
): AsyncDone {
    let finishedCount = 0;
    const asyncResults = asyncMethods.map(fn => asyncResult(fn, onFinished));

    return DISPATCHED_ELSEWHERE;

    function onFinished(): AsyncDone {
        finishedCount += 1;
        if (finishedCount !== asyncResults.length) {
            return DONE;
        }

        // avoid double-calls
        finishedCount += 1;

        return resultsCallback(
            // @ts-expect-error trust me bro
            asyncResults
        );
    }
}

type TrackedAsyncAction = {
    name: string;
    t0: number;
    t1: number | null;
    error: string;
    result?: any;
}

const trackedAsyncActions = new Map<string, TrackedAsyncAction[]>();

export function trackAsyncAction(actionName: string): TrackedAsyncAction {
    const result: TrackedAsyncAction = {
        name: actionName,
        t0: performance.now(),
        t1: null,
        error: "",
    };

    let slot = trackedAsyncActions.get(actionName);
    if (!slot) {
        slot = [];
        trackedAsyncActions.set(actionName, slot);
    }

    slot.push(result);

    return result;
}

export function untrackAsyncAction(
    action: TrackedAsyncAction,
    result: any,
    error: any,
    dismissErrorsManually = true,
    dismissResultsManually = false,
): void {
    assert(!action.result);
    assert(!action.error);
    action.result = result;
    action.error = error;

    const slot = trackedAsyncActions.get(action.name);
    assert(!!slot);

    if (!dismissResultsManually) {
        if (!dismissErrorsManually || error == null) {
            const idx = slot.indexOf(action);
            assert(idx !== -1);

            slot[idx] = slot[slot.length - 1];
            slot.pop();
        }
    }

    action.t1 = performance.now();
}

export function toTrackedCallback<T>(cbIn: AsyncCb<T>, actionName: string): AsyncCb<T> {
    const action = trackAsyncAction(actionName);
    const cb: AsyncCb<T> = (val, err) => {
        untrackAsyncAction(action, val, err);
        return cbIn(val, err);
    }
    return cb;
}

export function dismissCompletedTrackedAsyncActions() {
    for (const slot of trackedAsyncActions.values()) {
        filterInPlace(slot, action => action.t1 !== null);
    }
}

export function getTrackedAsyncActions() {
    return trackedAsyncActions;
}

