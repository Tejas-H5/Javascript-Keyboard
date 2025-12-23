export function sleepForMs(sleepMs: number) {
    return new Promise((resolve) => setTimeout(resolve, sleepMs));
}

/**
 * Part of a self-imposed challenge to not create APIs using Promise or async/await or .then chaining approaches in this codebase.
 * There are a lot of reason to like async/await - it makes it very easy to compose asynchronous functions, and Promise is a nice
 * way to allow any kind of callback-based API to be consumed by async/await style code.
 *
 * But some issues I have encountered with async/await so far:
 * - Values like `x.y` can change out from under you after an `await` statement. For convenience sake (?), TypeScript
 *   won't flag this bug with async/await, but it will when using a thenables approach.
 * - code written in an async/await style is serial by default, and writing it parallel makes the code more complicated
 * - There is always something subtly wrong wtih async code. E.g. queries not being cancelled before being re-issued, 
 *   or mutations being cancelled as if it were a query, when it isn't.
 *
 * After a lot of fking around, I think that I may have found a solution, and it's a lot simpler than you might expect.
 * The answer is to use an event system. Our function that needs to do asyncrhonous processing can simply instantiate
 * a bunch of 'event' objects that can connect to one another via a simple and straightforward API:
 *
 * ```ts
 * function doTheAsyncThing(): Promise<Result> {
 *      const aLoaded = fetchA();
 *      const bLoaded = fetchB();
 *      const cLoaded = fetchC();
 *
 *      const [gLoaded, g2Loaded] = waitFor([aLoading, bLoading], ([a, b]) => {
 *          const eLoading = fetchE(a);
 *          const fLoading = fetchE(b);
 *
 *          const gLoading = waitFor([eLoading, fLoading], ([e, f]) => {
 *              return fn(e, f);
 *          });
 *
 *          const g2Loading = waitFor([eLoading, fLoading], ([e, f]) => {
 *              return fn(e, f);
 *          });
 *
 *          return [gLoading, g2Loading];
 *      });
 *
 *      const [x] = waitFor([gLoaded, g2Loaded], (blah) => {
 *          etc
 *      })
 * }
 * ```
 *
 * An API like this makes the flow of data very explicit, and also allows us to trivially multiplex events.
 * It is extremely obvious what is happening - it is just an event system. The foundation for understanding is extremely simple.
 * The code is parallel by default, unlike normal async/await code, and won't suffer from infinite callback nesting
 * that comes from using thenables. It is slightly more verbose, but worth it I think.
 * Converting serial code into parallel code actually makes the code simpler, so there is inherently an incentive to do it.
 *
 * You can actually just write code like this with normal promises, but it isn't at all immediately obvious how.
 *
 * This event system here actually looks very similar to `Promise.all` with a few extra steps, so I have simply
 * wrapped Promise.all for now instead of coding my own custom `Event` node.
 * Using `Promise` as the substrate is actually very convenient - it allows the code to better interpo with
 * other code in the JS ecosystem. It is a lot less offputting than the other immediate-mode reentry polling solution I came up with ...
 *
 * Seems to work for now. I've updated the event system to take in an `AsyncContext`, so that I can cancel a particular async pipeline's side effects
 * if I am rerunning it.
 */

export class AsyncContext {
    _abortController: AbortController | null = null;
    version = 0;
    name = "";
    t0 = 0;

    totalInFlight = 0;
    totalSettled = 0;

    getAbortSignal() {
        if (!this._abortController) {
            this._abortController = new AbortController();
        }
        return this._abortController.signal;
    }

    // Cancells the current async stream and side-effects, aborts the abort controller if any
    bump(): this {
        this.version++;
        if (this._abortController !== null) {
            this._abortController.abort();
            this._abortController = null;
        }
        return this;
    }

    isPending() {
        return allAsyncContexts.has(this);
    }
};

export function newAsyncContext(name: string,): AsyncContext {
    const val = new AsyncContext();
    val.name = name;
    return val;
}

/**
 * A unique kind of abstraction that actually reduces the scope and power of Promise to something more manageable.
 * When you use this, you will be writing code that is easier to extend and parallelize the first time.
 * The handler itself may still be async - this allows the handler to contain mostly serial work.
 * Its not perfect. Things that it doesnt handle well:
 *  - "Actually, I want to do it serially anyway"
 *      - "Actually, I only want 5 in parallel at a time"
 *  - "The pipeline must complete in X seconds, else timeout"
 *      - "The step must complete in X seconds, else timeout"
 * NOTE: if cancelled via AsyncContext, the continuation simply won't run at all.
 * NOTE: some highly serial code would still be better left as async/await ngl
 */
export function waitFor<T extends readonly unknown[] | [], V>(
    a: AsyncContext,
    promises: T,
    // NOTE: I just copy-pasted the signature of Promise.all here, so I've got no clue what the difference between 
    // -readonly and readonly is. This is one of those types that is currently beyond my level.
    handler: (results: { -readonly [P in keyof T]: Awaited<T[P]>; }) => V | PromiseLike<V>,
): Promise<V> {
    if (!allAsyncContexts.has(a)) {
        a.t0 = performance.now();
        a.totalInFlight = 0;
        a.totalSettled = 0;
    }

    allAsyncContexts.add(a);
    a.totalInFlight += 1;

    const onResolve = () => {
        a.totalSettled += 1;
        if (a.totalInFlight === a.totalSettled) {
            allAsyncContexts.delete(a);
        }
    }

    const onStalled = () => {
        a.totalSettled = a.totalInFlight;
        allAsyncContexts.delete(a);
    }

    const result = new Promise<V>((resolve, reject) => {
        const version = a.version;
        // TODO: if any of these promises get cancelled, we're screwed.
        Promise.all(promises).then((results) => {
            const notCancelled = version === a.version;
            if (notCancelled) {
                const value = handler(results);
                onResolve();
                resolve(value);
            } else {
                console.info("Asyncronous action was cancellled");
                onStalled();
            }
        }).catch((err) => {
            onStalled();
            reject(err);
        });
    });

    return result;
}

export function settle<T>(promise: Promise<T>): Promise<PromiseSettledResult<T>> {
    return promise
        .then(val => ({ status: "fulfilled", value: val, }) as const)
        .catch(reason => ({ status: "rejected", reason: reason }) as const)
}

export class CancellationError extends Error {
    constructor() {
        super("This asyncronous task has been cancelled");
    }
}

export function waitForOne<T>(a: AsyncContext, promise: PromiseLike<T>) {
    return waitFor(a, [promise], ([val]) => val);
}

const allAsyncContexts = new Set<AsyncContext>();
export function getAllAsyncContexts() {
    return allAsyncContexts;
}

