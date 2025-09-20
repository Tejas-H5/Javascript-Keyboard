export type AsyncValue<T, L = null> = {
    val: T;
    err: Error | null;
    valOrLoading: T | L;
    errOrLoading: Error | L;
    loading: boolean;
    loadCounter: 0,
};

export function newAsyncValue<T, L>(initialValue: T, loadingValue: L): AsyncValue<T, L> {
    return {
        val: initialValue,
        err: null,
        valOrLoading: loadingValue,
        errOrLoading: loadingValue,
        loading: false,
        loadCounter: 0,
    };
}

export async function loadAsyncVal<T>(
    asyncVal: AsyncValue<T>,
    promiseToUse: Promise<T>,
) {
    asyncVal.loadCounter++;
    const thisLoad = asyncVal.loadCounter;

    asyncVal.loading = true;
    // Don't clear out .err
    asyncVal.errOrLoading = null;
    asyncVal.valOrLoading = null;

    const returnPromise = promiseToUse
        .then(val => {
            if (asyncVal.loadCounter === thisLoad) {
                asyncVal.val = val;
                asyncVal.valOrLoading = val;
                asyncVal.err = null;
                asyncVal.errOrLoading = null;
            } else {
                console.log("Promise dropped!");
            }
        })

    returnPromise
        .catch(err => {
            if (asyncVal.loadCounter === thisLoad) {
                // Don't clear out prev. value
                asyncVal.err = err;
                asyncVal.errOrLoading = err;
                asyncVal.valOrLoading = null;
                console.error("An error occured loading this async value", err);
            } else {
                console.error("An error occured loading this promise (but this promise was dropped!) ", err);
            }
        })
        .finally(() => {
            if (asyncVal.loadCounter === thisLoad) {
                asyncVal.loading = false;
            } else {
                console.log("Promise dropped!");
            }
        });

    return returnPromise;
}
