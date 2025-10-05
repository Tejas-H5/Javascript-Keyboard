const loadingTrackedPromises = new Set<TrackedPromise<any>>();

export function getLoadingPromises(): Set<TrackedPromise<any>> {
    return loadingTrackedPromises;
}

function toError(err: any): Error {
    if (err instanceof Error) return err;
    return new Error("" + err);
}

export function sleepForMs(sleepMs: number) {
    return new Promise((resolve) => setTimeout(resolve, sleepMs));
}

class CancelRef {
    cancelled = false;
    cancel() {
        this.cancelled = true;
    }
}

class CancellationError extends Error {}

/** 
 * A Promise<T> wrapper. 
 * Adds:
 *  - tracking which ones are loading
 *  - ability to cancel the next `then` invocation
 * Removes:
 *  - catch   -> you can just use errors as values if you actually care about various errors. Typically you just want to log errors.
 *  - finally -> you can just add some code to the end of your `then` method. 
 *
 * Btw. You can still `await` these just like normal promises, since
 * `await` actually interacts with all thenables, and not just promises!
 */
export class TrackedPromise<T> {
    private _error: Error | undefined;
    private _value: undefined | T;

    private promise: Promise<T>;

    private readonly cancelRef: CancelRef;

    public t0 = 0;

    constructor(
        public readonly promiseFn:         () => Promise<T>,
        public readonly pipelineStageName: string,

        cancelRef?: CancelRef,
        // Derived promises are created in a 'then' stage - they don't actually start running till they enter the then method.
        private readonly isDerived?: boolean, 
    ) {
        if (!isDerived) {
            this.t0 = performance.now();
            loadingTrackedPromises.add(this);
        }

        this.promise = promiseFn().then((val) => {
            loadingTrackedPromises.delete(this);
            this._value = val;
            return val;
        });

        this.promise.catch((err) => {
            loadingTrackedPromises.delete(this);
            this._error = toError(err);
            if (err instanceof CancellationError) {
                console.log("[" + this.pipelineStageName + "] was cancelled");
            } else {
                console.error("[" + this.pipelineStageName + "]", err);
            }
        });

        this.cancelRef = cancelRef ?? new CancelRef();
    }

    then<T2>(
        onfulfilled: ((value: T) => T2 | PromiseLike<T2>),
        pipelineStageName?: string,
    ): TrackedPromise<T2> {
        const newPromise = this.promise.then((val) => {
            if (this.cancelRef.cancelled) {
                throw new CancellationError();
            }

            if (this.isDerived) {
                newPromiseWrapped.t0 = performance.now();
                loadingTrackedPromises.add(newPromiseWrapped);
            }

            newPromiseWrapped.t0 = performance.now();

            return onfulfilled(val);
        });

        const newPromiseWrapped = new TrackedPromise(
            () => newPromise,
            pipelineStageName ?? "Then stage",
            this.cancelRef,
            true,
        );

        return newPromiseWrapped;
    }

    cancel() {
        this.cancelRef.cancel();
    }

    get loading() {
        return loadingTrackedPromises.has(this);
    }

    get error() {
        return this._error;
    }

    get value() {
        return this._value;
    }
}

export function newDefaultTrackedPrimise<T>(initialValue: T): TrackedPromise<T> {
    return new TrackedPromise<T>(() => Promise.resolve(initialValue), "Default stage");
}
