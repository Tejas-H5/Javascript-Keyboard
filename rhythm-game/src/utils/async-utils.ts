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
// But what I noticed when I was writing callback code is that it is somewhat similar to writing a good React UI component. 
// It is easy to fall into similar pitfalls.
// Assuming that writing good callback code is akin to writing good React UI code, and 'callback hell' 
// is just the result of lack of discipline, there is no real reason to not just write callbacks (unless there 
// is an easier alternative that is functionally the same, which promises are not as shown above).
//
// There are also a lot of limitations that callbacks have. 
// Mainly, I can't do them in a for-loop. The for-loop can start them in parallel, but I can't do them sequentially.
// I think I'll need to use deep recursion instead. And I'll pass on that.
//
// Another source of callback hell is the then/catch thing. Splitting the error code from the result code
// also causes the error while building the async DAG _and_ evaulating it synchronously as show above. 
// I have found I can just combine the two into one, and the result is a lot more flexible.
//
// It actually occurs to me that I have no clue when a promise is actually scheduled to run...
// Maybe this doesn't matter? Also if I want any hope of porting my utils/app to another language, 
// it's probably best to not use promises...

import { filterInPlace } from "./array-utils";
import { assert } from "./assert";

/**
 * Also see {@link done}
 */
export type AsyncCallback<T> = ((result: T | undefined, err?: unknown) => AsyncCallbackResult); 
export type ACB<T> = AsyncCallback<T>;
export type ACR = AsyncCallbackResult;


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
export const DONE = undefined as unknown as AsyncCallbackResult;
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

export function toAsyncCallback<T>(p: Promise<T>, cb: AsyncCallback<T>): ACR {
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

export type AsyncResult<T> = { 
    callback: AsyncCallback<T>;
} & (
    | {loaded: false; value: undefined; error: undefined;} 
    | {loaded: true; value: T | undefined; error: any;} 
);

export function asyncResult<T = boolean>(continuation: () => AsyncCallbackResult): AsyncResult<T> {
    const callback: AsyncCallback<T> = (value, err) => {
        if (result.loaded) {
            newError("Loaded the same result twice");
            return CANCELLED;
        }

        // @ts-expect-error it cannot understand my genius.
        result.loaded = true; result.error = err; result.value = value;

        return continuation();
    }

    const result: AsyncResult<T> = {
        callback: callback,
        loaded: false,
        value: undefined,
        error: undefined,
    };

    return result;
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

export function toTrackedCallback<T>(cbIn: ACB<T>, actionName: string): ACB<T> {
    const action = trackAsyncAction(actionName);
    const cb: ACB<T> = (val, err) => {
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

