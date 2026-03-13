// IM-CORE 1.080
// NOTE: I'm currently working on 3 different apps with this framework,
// so even though I thought it was mostly finished, the API appears to still be changing slightly.
// Majority of the last changes have just been updates to the documentation though

import { assert } from "./assert";

// Conventions
//  - An 'immediate mode' method or 'im' method is any method that eventually _writes_ to the `Cache`.
//    These methods should ideally be prefixed with 'im'.
//    Conversely, methods that don't touch the Cache, or that will only ever _read_ from the imCache, should NOT be prefixed with 'im'.
//    This allows developers (and in the future, static analysis tools) to know that this method can't be rendered conditionally, or
//    out of order, similar to how React hooks work. This is really the only convention I would recommend you actually follow.
//    - If you want to expose these methods on a namespace, the im can be dropped from the alias, if the namespace itself starts with 'im'
//
//  - Methods that begin a scope and have a corresponding method to end that scope should be called `im<Name>Begin` and `im<Name>End`. 
//    Some day, I plan on making an eslint rule that will make use of this convention to flag missing closing statements.
//    Though I have significantly reduced the chance of this bug happening with typeIds and such,
//    missing begin/end statements not being paired corectly can still not be caught, and it can 
//    cause some strange behaviour or even silent data corruption in some cases.
//
//    NOTE: This framework still may have methods or utils that I called them so frequently that I omitted the `Begin` from them. 
//    As discussed above, I'm in the process of renaming them to conform to `<Begin>/<End>`. There will be carve-outs for
//    If, imSwitch, imFor and other basic control-flow stuff. I should probably just make this 
//    static analysis tool - it would speed up the process...


// I no longer export these - It should be easy to toggle between the array implementation and the object
// implementation, so only getters and setters get exported
const CACHE_FPS_COUNTER_STATE            = 0; // Useful for debugging performance in general, and running expensive computations over multiple frames
const CACHE_RERENDER_FN                  = 1;
const CACHE_ANIMATE_FN                   = 2;
const CACHE_ANIMATE_FN_STILL_ANIMATING   = 3;
const CACHE_ANIMATION_TIME_LAST          = 4;
const CACHE_ANIMATION_TIME               = 5;
const CACHE_ANIMATION_DELTA_TIME_SECONDS = 6;
const CACHE_TOTAL_DESTRUCTORS            = 7; // Useful memory leak indicator
const CACHE_RENDER_FN_CHANGES            = 8;
const CACHE_RERENDER_FN_INNER            = 9;
const CACHE_IS_EVENT_RERENDER            = 10;
const CACHE_NEEDS_RERENDER               = 11;
const CACHE_ITEMS_ITERATED               = 12;
const CACHE_IS_RENDERING                 = 13;
const CACHE_TOTAL_MAP_ENTRIES            = 14; // Useful memory leak indicator
const CACHE_TOTAL_MAP_ENTRIES_LAST_FRAME = 15; // Useful memory leak indicator
const CACHE_ITEMS_ITERATED_LAST_FRAME    = 16; // Useful performance metric
const CACHE_RENDER_COUNT                 = 17;
const CACHE_CURRENT_WAITING_FOR_SET      = 18;
const CACHE_ROOT_ENTRIES                 = 19;
const CACHE_CURRENT_ENTRIES              = 20;
const CACHE_IDX                          = 21;
const CACHE_ENTRIES_START         = 22; // Not in the struct implementation, but we'll need it for the array implementation


const ENTRIES_REMOVE_LEVEL                    = 1;
const ENTRIES_IS_IN_CONDITIONAL_PATHWAY       = 2;
const ENTRIES_IS_DERIVED                      = 3;
const ENTRIES_STARTED_CONDITIONALLY_RENDERING = 4;
const ENTRIES_DESTRUCTORS                     = 5;
const ENTRIES_KEYED_MAP_REMOVE_LEVEL          = 6;
const ENTRIES_KEYED_MAP                       = 7;
const ENTRIES_PARENT_TYPE                     = 8;
const ENTRIES_PARENT_VALUE                    = 9;
const ENTRIES_INTERNAL_TYPE                   = 10;
const ENTRIES_COMPLETED_ONE_RENDER            = 11;
const ENTRIES_LAST_IDX                        = 12;
const ENTRIES_IDX                             = 13;
const ENTRIES_ITEMS_START              = 14; // Not in the struct implementation, but we'll need it for the array implementation

function newCache(): ImCache {
    return [];
}

function getItemsIterated(c: ImCache): number {
    return c[CACHE_ITEMS_ITERATED_LAST_FRAME];
}

function getTotalMapEntries(c: ImCache): number {
    return c[CACHE_TOTAL_MAP_ENTRIES_LAST_FRAME];
}

function getTotalDestructors(c: ImCache): number {
    return c[CACHE_TOTAL_DESTRUCTORS];
}

function getCurrentCacheEntries(c: ImCache) {
    return c[CACHE_CURRENT_ENTRIES] as unknown as ImCacheEntries;
}

function getRootEntries(c: ImCache): ImCacheEntries {
    return c[CACHE_ROOT_ENTRIES];
}

function getEntriesRemoveLevel(entries: ImCacheEntries) {
    return entries[ENTRIES_REMOVE_LEVEL];
}

function getEntriesIsInConditionalPathway(entries: ImCacheEntries) {
    return entries[ENTRIES_IS_IN_CONDITIONAL_PATHWAY];
}

function getStackLength(c: ImCache) {
    return c.length - CACHE_ENTRIES_START;
}


/**
 * Allows us to cache state for our immediate mode callsites.
 * Initialize this on your end with `const cache: Cache = [];`. It's just an array
 * TODO: better typing here
 */
export type ImCache = (ImCacheEntries | any)[]; 
export type ImCacheEntries = any[] & { __CacheEntries: void };

export type FpsCounterState = {
    renderCount: number;
    lastRenderCount: number;
    renderStart: number;
    renderEnd: number;
    frameMs: number;
    renderMs: number;
}

function newFpsCounterState(): FpsCounterState {
    return {
        renderCount: 0,
        lastRenderCount: 0,
        renderStart: 0,
        renderEnd: 0,
        frameMs: 0,
        renderMs: 0,
    }
}

function fpsMarkRenderingStart(fps: FpsCounterState) {
    const t = performance.now();;

    fps.renderMs = fps.renderEnd - fps.renderStart;
    fps.frameMs = t - fps.renderStart;
    fps.renderStart = t;
    fps.lastRenderCount = fps.renderCount;
    fps.renderCount = 0;
}

function fpsMarkRenderingEnd(fps: FpsCounterState) {
    fps.renderEnd = performance.now();
}

const REMOVE_LEVEL_NONE = 1;
// This is the default remove level for im-blocks, im-arrays, im-if/else conditionals, and im-switch.
// The increase in performance far oughtweighs any memory problems.
const REMOVE_LEVEL_DETATCHED = 2;
// This is the default for im-keyed map entries. This is because we can key components on arbitrary values. 
// It is common (and intended behaviour) to use object references directly as keys.
// However, if those objects are constantly created and destroyed, this can pose a problem for REMOVE_LEVEL_DETATCHED. 
// Using REMOVE_LEVEL_DESTROYED instead allows the map to clean up and remove those keys, so 
// that the size of the map isn't constantly increasing.
const REMOVE_LEVEL_DESTROYED = 3;

export type RemovedLevel
    = typeof REMOVE_LEVEL_NONE
    | typeof REMOVE_LEVEL_DETATCHED   
    | typeof REMOVE_LEVEL_DESTROYED;

// TypeIDs allow us to provide some basic sanity checks and protection
// against the possiblity of data corruption that can happen when im-state is accessed 
// conditionally or out of order. The idea is that rather than asking you to pass in 
// some random number, or to save a bunch of type ID integers everywhere, you can 
// just pass in a reference to a function to uniquely identify a piece of state.
// You probably have a whole bunch of them lying around somewhere.
// The function that you are creating the state from, for example. 
// The return value of the function can be used to infer the return value of
// the {@link GetsState} call, but it can also be a completely unrelated function
// - in which case you can just use {@link InlineTypeId}. As long as a function
// has been uniquely used within a particular entry list at a particular slot, the 
// likelyhood of out-of-order rendering errors will reduce to almost 0.
export type TypeId<T> = (...args: any[]) => T;

/**
 * Used when the return type of the typeId function has nothing to do with the contents of the state.
 * We still need some way to check for out-of-order rendering bugs, and you probably have a function or two nearby that you can use.
 * This is an alterantive to the prior implementation, which forced you to pollute your module scopes with named integers.
 *
 * ```ts
 * let pingPong; pingPong = Get(c, inlineTypeId(Math.sin));
 * if (!pingPong) pingPong = Set(c, { t: 0 });
 * ```
 * // NOTE: You probably just want {@link imGetInline}
 */
function inlineTypeId<T = undefined>(fn: Function) {
    return fn as TypeId<T>;
}

// Can be any valid object reference. Or string, but avoid string if you can - string comparisons are slower than object comparisons
export type ValidKey = string | number | Function | object | boolean | null | unknown;

// Any immediate mode function that takes in the cache, and nothing else.
export type ImCacheRerenderFn = (c: ImCache) => void;

/** 
 * Initiates the render loop. 
 *
 * NOTE: I used to have an option here to allow 'manual rerendering', but I've since removed it.
 * The main point of this framework is that rerendering your components as an animation eliminates and simplifies various problems, 
 * so it's pretty pointless if you have to start issuing manual rerenders.
 */
function imCacheBegin(c: ImCache, renderFn: ImCacheRerenderFn) {
    if (c.length === 0) {
        c.length = CACHE_ENTRIES_START;
        c.fill(undefined);

        // starts at -1 and increments onto the current value. So we can keep accessing this idx over and over without doing idx - 1.
        // NOTE: memory access is supposedly far slower than math. So might not matter too much
        c[CACHE_IDX] = 0;
        c[CACHE_ROOT_ENTRIES] = [];
        c[CACHE_CURRENT_ENTRIES] = c[CACHE_ROOT_ENTRIES];
        c[CACHE_CURRENT_WAITING_FOR_SET] = false;
        c[CACHE_NEEDS_RERENDER] = false;
        c[CACHE_ITEMS_ITERATED] = 0;
        c[CACHE_ITEMS_ITERATED_LAST_FRAME] = 0;
        c[CACHE_TOTAL_DESTRUCTORS] = 0;
        c[CACHE_TOTAL_MAP_ENTRIES] = 0;
        c[CACHE_TOTAL_MAP_ENTRIES_LAST_FRAME] = 0;
        c[CACHE_IS_RENDERING] = true; 
        c[CACHE_RENDER_COUNT] = 0;
        c[CACHE_FPS_COUNTER_STATE] = newFpsCounterState();

        c[CACHE_ANIMATION_TIME] = 0;
        c[CACHE_ANIMATION_TIME_LAST] = 0;
        c[CACHE_ANIMATION_DELTA_TIME_SECONDS] = 0;
        c[CACHE_RENDER_FN_CHANGES]      = 0;
        c[CACHE_ANIMATE_FN_STILL_ANIMATING] = true;
    }

    if (c[CACHE_RERENDER_FN_INNER] !== renderFn) {
        c[CACHE_RERENDER_FN_INNER] = renderFn;

        // In a production app, this should remain 1.
        // In a dev environment with HMR enabled, it should be incrementing each
        // time HMR causes the render function to reload.
        const id = c[CACHE_RENDER_FN_CHANGES] + 1;
        c[CACHE_RENDER_FN_CHANGES] = id;

        c[CACHE_RERENDER_FN] = (c: ImCache) => {
            // I've found a significant speedup by writing code like
            // if (x === false) or if (x === true) instaed of if (!x) or if (x).
            // You won't need to do this in 99.9999% of your code, but it
            // would be nice if all 'library'-like code that underpins most of the stuff did it.
            if (c[CACHE_IS_RENDERING] === true) {
                // we can't rerender right here, so we'll queue a rerender at the end of the component
                c[CACHE_NEEDS_RERENDER] = true;
            } else {
                c[CACHE_IS_EVENT_RERENDER] = true;
                try {
                    renderFn(c);
                } catch (e) {
                    console.error(e);
                }
                c[CACHE_IS_EVENT_RERENDER] = false;
            }
        };

        const animateFn = (t: number) => {
            if (c[CACHE_ANIMATE_FN_STILL_ANIMATING] === false) {
                return;
            }

            if (c[CACHE_IS_RENDERING] === true) {
                // This will make debugging a lot easier. Otherwise the animation will play while
                // we're breakpointed. Firefox moment. xD
                return;
            }

            if (c[CACHE_RERENDER_FN_INNER] !== renderFn) {
                return;
            }

            c[CACHE_ANIMATION_TIME] = t;

            renderFn(c);

            // Needs to go stale, so that c[CACHE_RERENDER_FN_INNER] !== renderFn can work.
            requestAnimationFrame(animateFn);
        }
        c[CACHE_ANIMATE_FN] = animateFn;
        requestAnimationFrame(animateFn);
    }

    const fpsState = getFpsCounterState(c);
    if (c[CACHE_IS_EVENT_RERENDER] === false) {
        fpsMarkRenderingStart(fpsState);
    }
    fpsState.renderCount += 1;

    c[CACHE_NEEDS_RERENDER] = false;
    c[CACHE_IS_RENDERING] = true; 
    c[CACHE_IDX] = CACHE_ENTRIES_START - 1;
    c[CACHE_ITEMS_ITERATED_LAST_FRAME] = c[CACHE_ITEMS_ITERATED];
    c[CACHE_ITEMS_ITERATED] = 0;
    c[CACHE_TOTAL_MAP_ENTRIES_LAST_FRAME] = c[CACHE_TOTAL_MAP_ENTRIES];
    c[CACHE_TOTAL_MAP_ENTRIES] = 0;
    c[CACHE_CURRENT_WAITING_FOR_SET] = false;
    c[CACHE_RENDER_COUNT]++;

    // Deltatime should naturally reach 0 on 'rerenders'. Not sure how it will work for manual rendering.
    c[CACHE_ANIMATION_DELTA_TIME_SECONDS] = (c[CACHE_ANIMATION_TIME] - c[CACHE_ANIMATION_TIME_LAST]) / 1000;
    c[CACHE_ANIMATION_TIME_LAST] = c[CACHE_ANIMATION_TIME];

    CacheEntriesBegin(c, c[CACHE_ROOT_ENTRIES], imCacheBegin, c, INTERNAL_TYPE_CACHE);

    return c;
}

function getFpsCounterState(c: ImCache): FpsCounterState {
    assert(c[CACHE_FPS_COUNTER_STATE] != null);
    return c[CACHE_FPS_COUNTER_STATE];
}

// Enqueues a cache rerender. Usually to process an event again after the 
// current render without waiting for the next animation frame, or rerender once outside the animation frame.
function rerenderCache(c: ImCache) {
    c[CACHE_RERENDER_FN](c);
}

function noOp() {}

function imCacheEnd(c: ImCache) {
    CacheEntriesEnd(c);

    const startIdx = CACHE_ENTRIES_START - 1;
    if (c[CACHE_IDX] > startIdx) {
        console.error("You've forgotten to pop some things: ", c.slice(startIdx + 1));
        throw new Error("You've forgotten to pop some things");
    } else if (c[CACHE_IDX] < startIdx) {
        throw new Error("You've popped too many thigns off the stack!!!!");
    }

    c[CACHE_IS_RENDERING] = false;

    const needsRerender = c[CACHE_NEEDS_RERENDER];
    if (needsRerender === true) {
        // Other things need to rerender the cache long after we've done a render. Mainly, DOM UI events - 
        // once we get the event, we trigger a full rerender, and pull the event out of state and use it's result in the process.
        rerenderCache(c);

        // Some things may occur while we're rendering the framework that require is to immediately rerender
        // our components to not have a stale UI. Those events will set this flag to true, so that
        // We can eventually reach here, and do a full rerender.
        c[CACHE_NEEDS_RERENDER] = false;
    }

    if (c[CACHE_IS_EVENT_RERENDER] === false) {
        fpsMarkRenderingEnd(c[CACHE_FPS_COUNTER_STATE]);
    }
}

const INTERNAL_TYPE_NORMAL_BLOCK = 1;
const INTERNAL_TYPE_CONDITIONAL_BLOCK = 2;
const INTERNAL_TYPE_ARRAY_BLOCK = 3;
const INTERNAL_TYPE_KEYED_BLOCK = 4;
const INTERNAL_TYPE_TRY_BLOCK = 5;
const INTERNAL_TYPE_CACHE = 6;
const INTERNAL_TYPE_SWITCH_BLOCK = 7;

// Some common errors will get their own dedicated throw Error insead of a simple assert + comment
function internalTypeToString(internalType: number): string {
    switch (internalType) {
        case INTERNAL_TYPE_NORMAL_BLOCK:      return "INTERNAL_TYPE_NORMAL_BLOCK";
        case INTERNAL_TYPE_CONDITIONAL_BLOCK: return "INTERNAL_TYPE_CONDITIONAL_BLOCK";
        case INTERNAL_TYPE_ARRAY_BLOCK:       return "INTERNAL_TYPE_ARRAY_BLOCK";
        case INTERNAL_TYPE_KEYED_BLOCK:       return "INTERNAL_TYPE_KEYED_BLOCK";
        case INTERNAL_TYPE_TRY_BLOCK:         return "INTERNAL_TYPE_TRY_BLOCK";
        case INTERNAL_TYPE_CACHE:             return "INTERNAL_TYPE_CACHE";
        case INTERNAL_TYPE_SWITCH_BLOCK:      return "INTERNAL_TYPE_SWITCH_BLOCK";
    }

    return "Custom user type: " + internalType
}

function CacheEntriesBegin<T>(
    c: ImCache,
    entries: ImCacheEntries,
    parentTypeId: TypeId<T>,
    parent: T,
    internalType: number,
) {
    __Push(c, entries);

    if (entries.length === 0) {
        for (let i = 0; i < ENTRIES_ITEMS_START; i++) {
            entries.push(undefined);
        }

        entries[ENTRIES_IDX] = ENTRIES_ITEMS_START - 2;
        entries[ENTRIES_LAST_IDX] = ENTRIES_ITEMS_START - 2;
        entries[ENTRIES_REMOVE_LEVEL] = REMOVE_LEVEL_DETATCHED;
        entries[ENTRIES_IS_IN_CONDITIONAL_PATHWAY] = false;
        entries[ENTRIES_IS_DERIVED] = false;
        entries[ENTRIES_STARTED_CONDITIONALLY_RENDERING] = false;
        entries[ENTRIES_PARENT_TYPE] = parentTypeId;
        entries[ENTRIES_INTERNAL_TYPE] = internalType;
        entries[ENTRIES_COMPLETED_ONE_RENDER] = false;
        entries[ENTRIES_PARENT_VALUE] = parent;
        entries[ENTRIES_KEYED_MAP_REMOVE_LEVEL] = REMOVE_LEVEL_DESTROYED;
    } else {
        // The parent should never change
        assert(entries[ENTRIES_PARENT_TYPE] === parentTypeId);
        assert(entries[ENTRIES_PARENT_VALUE] === parent);
    }

    entries[ENTRIES_IDX] = ENTRIES_ITEMS_START - 2;

    const map = entries[ENTRIES_KEYED_MAP] as (Map<ValidKey, ListMapBlock> | undefined);
    if (map !== undefined) {
        // TODO: maintain a list of things we rendered last frame.
        // This map may become massive depending on how caching has been configured.
        for (const v of map.values()) {
            v.rendered = false;
        }
    }
}

function __Push(c: ImCache, entries: ImCacheEntries) {
    c[CACHE_IDX] += 1;
    const idx = c[CACHE_IDX];
    if (idx === c.length) {
        c.push(entries);
    } else {
        c[idx] = entries;
    }

    c[CACHE_CURRENT_ENTRIES] = entries;
}

function CacheEntriesEnd(c: ImCache) {
    __Pop(c);
}

function __Pop(c: ImCache): ImCacheEntries {
    const entries = c[CACHE_CURRENT_ENTRIES];
    const idx = --c[CACHE_IDX];
    c[CACHE_CURRENT_ENTRIES] = c[idx];
    assert(idx >= CACHE_ENTRIES_START - 1);
    return entries;
}


/**
 * Allows you to get/set state inline without using lambdas, when used with {@link imSet}:
 * ```ts
 * const s = Get(c, fn) ?? imSet(c, { blah });
 * ```
 *
 * {@link typeId} is a function reference that we use to check that susbequent state access is for the 
 * correct state. This is required, because state is indexed by the position where `Get` is called,
 * and conditional rendering/etc can easily break this order. I've not looked at React sourcecode, but
 * I imagine it is very similar to the rule of hooks that they have.
 *
 * The type of the value is assumed to have the return type of the `typeId` function that was specified.
 * It does not necessarily need to actually be constructed by that function. 
 * See {@link imGetInline} - it does not make this assumption, and allows you to use typeIds
 * purely as an ID.
 *
 * You might need to refresh the state more often:
 *
 * ```ts
 * const depChanged = Memo(c, dep);
 *
 * let s = Get(c, fn);
 * if (!s || depChanged) {
 *      s = Set(c, someConstructorFn(dep));
 * };
 * ```
 *
 * All calls to `Get` must be followed by `imSet` the very first time, to populate the initial state.
 * An assertion will throw if this is not the case.
 * NOTE: This function is a fundamental primitive that most of the other methods in this framework are built with.
 */
function imGet<T>(
    c: ImCache,
    typeId: TypeId<T>,
    initialValue: T | undefined = undefined
): T | undefined {
    const entries = c[CACHE_CURRENT_ENTRIES];
    c[CACHE_ITEMS_ITERATED]++;

    // Make sure you called Set for the previous state before calling imGet again.
    assert(c[CACHE_CURRENT_WAITING_FOR_SET] === false);

    // [type, value][type,value],[typ....
    // ^----------->^
    entries[ENTRIES_IDX] += 2;

    const idx = entries[ENTRIES_IDX];
    if (idx === ENTRIES_ITEMS_START) {
        // Rendering 0 items is the signal to remove an immediate-mode block from the conditional pathway.
        // This means we can't know that an immediate mode block has re-entered the conditional pathway untill 
        // it has started rendering the first item, which is what this if-block is handling

        if (entries[ENTRIES_IS_IN_CONDITIONAL_PATHWAY] === false) {
            entries[ENTRIES_IS_IN_CONDITIONAL_PATHWAY] = true;
            entries[ENTRIES_STARTED_CONDITIONALLY_RENDERING] = true;
            entries[ENTRIES_REMOVE_LEVEL] = REMOVE_LEVEL_NONE;
        } else {
            // NOTE: if an error occured in the previous render, then
            // subsequent things that depended on `startedConditionallyRendering` being true won't run.
            // I think this is better than re-running all the things that ran successfully over and over again.
            entries[ENTRIES_STARTED_CONDITIONALLY_RENDERING] = false;
        }
    }

    if (idx < entries.length) {
        if (entries[idx] !== typeId) {
            const expectedName = entries[idx].name;
            let gotName = typeId.name;
            let errorMessage;
            if (expectedName === gotName) {
                errorMessage = `Expected to populate this cache entry with type=${expectedName}, but got <same name, but new object reference>. Only functions that don't change can be used as typeIds. If you wrote some code like State(c, () => ({ ... })), consider using imGet/imSet directly instead.`
            } else {
                errorMessage = `Expected to populate this cache entry with type=${expectedName}, but got ${gotName} . Either your begin/end pairs probably aren't lining up right, or you're conditionally rendering immediate-mode state`;
            }
            console.error(errorMessage, entries[idx], typeId);
            throw new Error(errorMessage);
        }
    } else if (idx === entries.length) {
        entries.push(typeId);
        entries.push(initialValue);
        c[CACHE_CURRENT_WAITING_FOR_SET] = true;
    } else {
        throw new Error("Shouldn't reach here");
    }

    return entries[idx + 1];
}

/**
 * When you have code like this:
 * ```ts
 * if (!Get(c) || valueChanged) imSet(c, value);
 * ```
 * When value could be undefined, it will trigger every frame. You can use SetRequired instead.
 * This code will check "allocated or nah" instead of "is the value we have undefined?", which is more correct.
 * ```ts
 * if (SetRequired(c) || valueChanged) imSet(c, value);
 * ```
 */
function isSetRequired(c: ImCache): boolean {
    return c[CACHE_CURRENT_WAITING_FOR_SET];
}

/**
 * Allows you to get/set state inline. Unlike {@link imGet},
 * the type returned by {@link typeIdInline} is not necessarily
 * the type being stored.
 *
 * NOTE: you're not really supposed to use the last parameter.
 *
 * ```ts
 * const = GetInline(c, fn) ?? imSet(c, { blah });
 * ```
 */
function imGetInline<T = undefined>(
    c: ImCache,
    typeIdInline: TypeId<unknown>,
    initialValue: T | undefined = undefined
): T | undefined {
    // NOTE: undefined return type is a lie! Will also return whatever you set with Set.
    // But we want typescript to infer the value of `x = Get(c) ?? imSet(c, val)` to always be the type of val.
    return imGet(c, inlineTypeId(typeIdInline), initialValue as T);
}


/**
 * A shorthand for a pattern that is very common.
 * NOTE: if your state gains dependencies, you can just use Get and imSet directly, as intended.
 */
function imState<T>(c: ImCache, fn: () => T): T {
    let val = imGet(c, fn);
    if (val === undefined) val = imSet(c, fn());
    return val;
}

function getEntryAt<T>(c: ImCache, typeId: TypeId<T>, idx: number): T {
    const entries = c[CACHE_CURRENT_ENTRIES];
    const type = entries.at(ENTRIES_ITEMS_START + idx);
    if (type !== typeId) {
        throw new Error("Didn't find <typeId::" + typeId.name + "> at " + idx);
    }

    const val = entries[ENTRIES_ITEMS_START + idx + 1];
    return val as T;
}


function getEntriesParent<T>(c: ImCache, typeId: TypeId<T>): T {
    // If this assertion fails, then you may have forgotten to pop some things you've pushed onto the stack
    const entries = c[CACHE_CURRENT_ENTRIES];
    assert(entries[ENTRIES_PARENT_TYPE] === typeId);
    return entries[ENTRIES_PARENT_VALUE] as T;
}

function getEntriesParentFromEntries<T>(entries: ImCacheEntries, typeId: TypeId<T>): T | undefined {
    if (entries[ENTRIES_PARENT_TYPE] === typeId) {
        return entries[ENTRIES_PARENT_VALUE] as T;
    }
    return undefined;
}


function imSet<T>(c: ImCache, val: T): T {
    const entries = c[CACHE_CURRENT_ENTRIES];
    const idx = entries[ENTRIES_IDX];
    entries[idx + 1] = val;
    c[CACHE_CURRENT_WAITING_FOR_SET] = false;
    return val;
}

export type ListMapBlock = { rendered: boolean; entries: ImCacheEntries; };

/**
 * Creates an entry in the _Parent's_ keyed elements map.
 */
function __BlockKeyedBegin(c: ImCache, key: ValidKey, removeLevel: RemovedLevel) {
    const entries = c[CACHE_CURRENT_ENTRIES];
    entries[ENTRIES_KEYED_MAP_REMOVE_LEVEL] = removeLevel;

    let map = entries[ENTRIES_KEYED_MAP] as (Map<ValidKey, ListMapBlock> | undefined);
    if (map === undefined) {
        map = new Map<ValidKey, ListMapBlock>();
        entries[ENTRIES_KEYED_MAP] = map;
    }

    let block = map.get(key);
    if (block === undefined) {
        block = { rendered: false, entries: [] as unknown as ImCacheEntries };
        map.set(key, block);
    }

    /**
     * You're rendering this list element twice. You may have duplicate keys in your dataset.
     * If that is not the case, a more common cause is that you are mutating collections while iterating them.
     * All sorts of bugs and performance issues tend to arise when I 'gracefully' handle this case, so I've just thrown an exception instead.
     *
     * If you're doing this in an infrequent event, here's a quick fix:
     * {
     *      let deferredAction: () => {} | undefined;
     *      CacheListItem(s);
     *      for (item of list) {
     *          if (event) deferredAction = () => literally same mutation
     *      }
     *      CacheListItemEnd(s);
     *      if (deferredAction) deferredAction();
     * }
     */
    if (block.rendered === true) {
        throw new Error("You have already rendered to this key");
    }
    assert(block.rendered === false);

    block.rendered = true;

    const parentType = entries[ENTRIES_PARENT_TYPE];
    const parent = entries[ENTRIES_PARENT_VALUE];

    CacheEntriesBegin(c, block.entries, parentType, parent, INTERNAL_TYPE_KEYED_BLOCK);
}

/**
 * Allows you to reuse the same component for the same key.
 * This key is local to the current entry list, which means that multiple `KeyedBegin` calls all reuse the same entry list
 * pushed by `For` in this example:
 *
 * ```ts
 * For(c); for (const val of list) {
 *      if (!val) continue;
 *      KeyedBegin(c, val); { ... } imKeyedEnd(c);
 * } ForEnd(c);
 * ```
 */
function imKeyedBegin(c: ImCache, key: ValidKey) {
    __BlockKeyedBegin(c, key, REMOVE_LEVEL_DESTROYED);
}

function imKeyedEnd(c: ImCache) {
    __BlockDerivedEnd(c, INTERNAL_TYPE_KEYED_BLOCK);
}

// You probably don't need a destructor unless you're being forced to add/remove callbacks or 'clean up' something
function onImmediateModeBlockDestroyed(c: ImCache, destructor: () => void) {
    const entries = c[CACHE_CURRENT_ENTRIES];
    let destructors = entries[ENTRIES_DESTRUCTORS];
    if (destructors === undefined) {
        destructors = [];
        entries[ENTRIES_DESTRUCTORS] = destructors;
    }

    destructors.push(destructor);
    c[CACHE_TOTAL_DESTRUCTORS]++;
}

function CacheEntriesOnRemove(entries: ImCacheEntries) {
    if (entries[ENTRIES_IS_IN_CONDITIONAL_PATHWAY] === true) {
        recursivelyEnumerateEntries(entries, CacheEntriesRemoveEnumerator);
    }
}

function recursivelyEnumerateEntries(entries: ImCacheEntries, fn: (entries: ImCacheEntries) => boolean) {
    const shouldEnumerate = fn(entries);
    if (shouldEnumerate) {
        for (let i = ENTRIES_ITEMS_START; i < entries.length; i += 2) {
            const t = entries[i];
            const v = entries[i + 1];
            if (t === imImmediateModeBlockBegin) {
                recursivelyEnumerateEntries(v, fn);
            }
        }


        let map = entries[ENTRIES_KEYED_MAP] as (Map<ValidKey, ListMapBlock> | undefined);
        if (map !== undefined) {
            for (const block of map.values()) {
                recursivelyEnumerateEntries(block.entries, fn);
            }
        }
    }
}

/**
 * Iterates every item in an entries list. You only need this if you're working on 
 * dev-tools for this framework.
 */
function imForEachCacheEntryItem(entries: ImCacheEntries, fn: (t: TypeId<unknown>, value: unknown) => void) {
    for (let i = ENTRIES_ITEMS_START; i < entries.length; i += 2) {
        const t = entries[i];
        const v = entries[i + 1];
        fn(t, v);
    }

    let map = entries[ENTRIES_KEYED_MAP] as (Map<ValidKey, ListMapBlock> | undefined);
    if (map !== undefined) {
        for (const block of map.values()) {
            imForEachCacheEntryItem(block.entries, fn);
        }
    }
}

function CacheEntriesRemoveEnumerator(entries: ImCacheEntries): boolean {
    // don't re-traverse these items.
    if (entries[ENTRIES_IS_IN_CONDITIONAL_PATHWAY] === true) {
        entries[ENTRIES_IS_IN_CONDITIONAL_PATHWAY] = false;
        return true;
    }

    return false;
}

function CacheEntriesOnDestroy(c: ImCache, entries: ImCacheEntries) {
    // don't re-traverse these items.
    if (entries[ENTRIES_REMOVE_LEVEL] < REMOVE_LEVEL_DESTROYED) {
        entries[ENTRIES_REMOVE_LEVEL] = REMOVE_LEVEL_DESTROYED;
        entries[ENTRIES_IS_IN_CONDITIONAL_PATHWAY] = false;

        for (let i = ENTRIES_ITEMS_START; i < entries.length; i += 2) {
            const t = entries[i];
            const v = entries[i + 1];
            if (t === imImmediateModeBlockBegin) {
                CacheEntriesOnDestroy(c, v);
            }
        }

        const destructors = entries[ENTRIES_DESTRUCTORS];
        if (destructors !== undefined) {
            for (const d of destructors) {
                try {
                    d();
                    c[CACHE_TOTAL_DESTRUCTORS]--;
                } catch (e) {
                    console.error("A destructor threw an error: ", e);
                }
            }
            entries[ENTRIES_DESTRUCTORS] = undefined;
        }
    }
}

// This is the typeId for a list of cache entries.
function imImmediateModeBlockBegin<T>(
    c: ImCache,
    parentTypeId: TypeId<T>,
    parent: T,
    internalType: number = INTERNAL_TYPE_NORMAL_BLOCK
): ImCacheEntries {
    let entries; entries = imGet(c, imImmediateModeBlockBegin);
    if (entries === undefined) {
        entries = imSet(c, [] as unknown as ImCacheEntries);
    }

    CacheEntriesBegin(c, entries, parentTypeId, parent, internalType);

    return entries;
}

function __GetEntries(c: ImCache): ImCacheEntries {
    const entries = c[CACHE_CURRENT_ENTRIES];
    return entries;
}

function imImmediateModeBlockEnd(c: ImCache, internalType: number = INTERNAL_TYPE_NORMAL_BLOCK) {
    const entries = c[CACHE_CURRENT_ENTRIES];

    if (entries[ENTRIES_INTERNAL_TYPE] !== internalType) {
        const message = `Opening and closing blocks may not be lining up right. You may have missed or inserted some blocks by accident. `
            + "expected " + internalTypeToString(entries[ENTRIES_INTERNAL_TYPE]) + ", got " + internalTypeToString(internalType);
        throw new Error(message)
    }

    let map = entries[ENTRIES_KEYED_MAP] as (Map<ValidKey, ListMapBlock> | undefined);
    if (map !== undefined) {
        c[CACHE_TOTAL_MAP_ENTRIES] += map.size;

        const removeLevel = entries[ENTRIES_KEYED_MAP_REMOVE_LEVEL];
        if (removeLevel === REMOVE_LEVEL_DETATCHED) {
            for (const v of map.values()) {
                if (v.rendered === false) {
                    CacheEntriesOnRemove(v.entries);
                }
            }
        } else if (removeLevel === REMOVE_LEVEL_DESTROYED) {
            // This is now the default for keyed elements. You will avoid memory leaks if they
            // get destroyed instead of detatched. 
            for (const [k, v] of map) {
                if (v.rendered === false) {
                    CacheEntriesOnDestroy(c, v.entries);
                    map.delete(k);
                }
            }
        } else {
            throw new Error("Unknown remove level");
        }
    }

    entries[ENTRIES_COMPLETED_ONE_RENDER] = true;

    const idx = entries[ENTRIES_IDX];
    const lastIdx = entries[ENTRIES_LAST_IDX];
    if (idx !== lastIdx) {
        if (lastIdx === ENTRIES_ITEMS_START - 2) {
            // This was the first render. All g
            entries[ENTRIES_LAST_IDX] = idx;
        } else if (idx !== ENTRIES_ITEMS_START - 2) {
            // This was not the first render...
            throw new Error("You should be rendering the same number of things in every render cycle");
        }
    }

    CacheEntriesEnd(c);
}

function __BlockDerivedBegin(c: ImCache, internalType: number): ImCacheEntries {
    const entries = c[CACHE_CURRENT_ENTRIES];
    const parentType = entries[ENTRIES_PARENT_TYPE];
    const parent = entries[ENTRIES_PARENT_VALUE];

    return imImmediateModeBlockBegin(c, parentType, parent, internalType);
}

// Not quite the first render - 
// if the function errors out before the entries finish one render, 
// this method will rerender. Use this when you want to do something maybe once or twice or several times but hopefully just once,
// as it doesn't require an additional im-state entry. 
// For example, if you have an API like this:
// ```ts
// Div(c); imRow(c); imCode(c); imJustifyCenter(c); imBg(c, cssVars.bg); {
// } DivEnd(c);
// ```
// Each of those methods that 'augment' the call to `Div` may have their own initialization logic.
function isFirstishRender(c: ImCache): boolean {
    const entries = c[CACHE_CURRENT_ENTRIES];
    return entries[ENTRIES_COMPLETED_ONE_RENDER] === false;
}

function isEventRerender(c: ImCache) {
    return c[CACHE_IS_EVENT_RERENDER];
}


function __BlockDerivedEnd(c: ImCache, internalType: number) {
    // The DOM appender will automatically update and diff the children if they've changed.
    // However we can't just do
    // ```
    // if (blah) {
    //      new component here
    // }
    // ```
    //
    // Because this would de-sync the immediate mode call-sites from their positions in the cache entries.
    // But simply putting them in another entry list:
    //
    // ConditionalBlock();
    // if (blah) {
    // }
    // ConditionalBlockEnd();
    //
    // Will automatically isolate the next immediate mode call-sites with zero further effort required,
    // because all the entries will go into a single array which always takes up just 1 slot in the entries list.
    // It's a bit confusing why there isn't more logic here though, I guess.
    //
    // NOTE: I've now moved this functionality into core. Your immediate mode tree builder will need
    // to resolve diffs in basically the same way.

    imImmediateModeBlockEnd(c, internalType);
}

/**
 * Usage:
 * ```ts
 *
 * // Annotating the control flow is needed - otherwise it won't work
 *
 * if (If(c) && <condition>) {
 *      // <condition> will by adequately type-narrowed by typescript
 * } else if (ElseIf(c) && <condition2>){
 *      // <condition>'s negative will not by adequately type-narrowed here though, sadly.
 *      // I might raise an issue on their github soon.
 * } else {
 *      Else(c);
 *      // <condition>'s negative will not by adequately type-narrowed here though, sadly, same as above.
 * } IfEnd(c);
 *
 * ```
 *
 * It effectively converts a variable number of im-entries into a single if-entry,
 * that has a fixed number of entries within it, so it still abides by 
 * the immediate mode restrictions.
 * This thing works by detecting if 0 things were rendered, and 
 * then detatching the things we rendered last time if that was the case. 
 * Even though code like below will work, you should never write it:
 * ```ts
 * // technically correct but dont do it like this:
 * If(c); if (<condition>) {
 * } else {
 *      Else(c);
 * }IfEnd(c);
 * ```
 * Because it suggests that you can extend it like the following, which would
 * no longer be correct:
 * ```ts
 * If(c); if (<condition>) {
 * } else if (<condition2>) {
 *      // NOO this will throw or corrupt data :((
 *      ElseIf(c);
 * } else {
 *      Else(c);
 * } IfEnd(c);
 * ```
 *
 * The framework assumes that every conditional annotation will get called in order,
 * till one of the conditions passes, after which the next annotation is `IfEnd`. 
 * But now, it is no longer guaranteed that ElseIf will always be called if <condition> was false.
 * This means the framework has no way of telling the difference between the else-if block
 * and the else block (else blocks and else-if blocks are handled the same internally).
 */
function imIf(c: ImCache): true {
    __BlockArrayBegin(c);
    __BlockConditionalBegin(c);
    return true;
}

function imIfElse(c: ImCache): true {
    __BlockConditionalEnd(c);
    __BlockConditionalBegin(c);
    return true;
}

function imIfEnd(c: ImCache) {
    __BlockConditionalEnd(c);
    __BlockArrayEnd(c);
}

// All roads lead to rome (TM) design pattern. not sure if good idea or shit idea
const EndIf = imIfEnd;
const imElse = imIfElse;
const EndSwitch = imSwitchEnd;
const EndFor = imForEnd;

/**
 * Example usage:
 * ```ts
 * Switch(c, key) switch (key) {
 *      case a: { ... } break;
 *      case b: { ... } break;
 *      case c: { ... } break;
 * } SwitchEnd(c);
 * ```
 * ERROR: Don't use fallthrough, use if-else + If/imIfElse/imIfEnd instead. 
 * Fallthrough doesn't work as you would expect - for example:
 * ```ts
 *  Switch(c,key); switch(key) {
 *          case "A": { Component1(c); } // fallthrough (nooo)
 *          case "B": { Component2(c); }
 *  } SwitchEnd(c);
 * ```
 * When the key is `b`, an instance of Component2 is rendered. However,
 * when the key is `a`, two completely separate instances of `Component1` and `imComponent2` are rendered.
 *      You would expect the `Component2` from both switch cases to be the same instance, but they are duplicates 
 *      with none of the same state.
 * 
 */
function imSwitch(c: ImCache, key: ValidKey, cached: boolean = false) {
    __BlockDerivedBegin(c, INTERNAL_TYPE_SWITCH_BLOCK);
    // I expect the keys to a switch statement to be constants that are known at 'compile time', 
    // so we don't need to worry about the usual memory leaks we would get with normal keyed blocks.
    // NOTE: However, switches can have massive components behind them.
    // This decision may be reverted in the future if we find it was a mistake.
    __BlockKeyedBegin(c, key, cached ? REMOVE_LEVEL_DETATCHED : REMOVE_LEVEL_DESTROYED);
}

function imSwitchEnd(c: ImCache) {
    __BlockDerivedEnd(c, INTERNAL_TYPE_KEYED_BLOCK);
    __BlockDerivedEnd(c, INTERNAL_TYPE_SWITCH_BLOCK);
}

function __BlockArrayBegin(c: ImCache) {
    __BlockDerivedBegin(c, INTERNAL_TYPE_ARRAY_BLOCK);
}

function __BlockConditionalBegin(c: ImCache) {
    __BlockDerivedBegin(c, INTERNAL_TYPE_CONDITIONAL_BLOCK);
}

function __BlockConditionalEnd(c: ImCache) {
    const entries = c[CACHE_CURRENT_ENTRIES];
    if (entries[ENTRIES_IDX] === ENTRIES_ITEMS_START - 2) {
        // The index wasn't moved, so nothing was rendered.
        // This tells the conditional block to remove everything rendered under it last. 
        CacheEntriesOnRemove(entries);
    }

    __BlockDerivedEnd(c, INTERNAL_TYPE_CONDITIONAL_BLOCK);
}

function imFor(c: ImCache) {
    __BlockArrayBegin(c);
}

function imForEnd(c: ImCache) {
    __BlockArrayEnd(c);
}

function __BlockArrayEnd(c: ImCache) {
    const entries = c[CACHE_CURRENT_ENTRIES]

    const idx = entries[ENTRIES_IDX];
    const lastIdx = entries[ENTRIES_LAST_IDX];
    if (idx < lastIdx) {
        // These entries have left the conditional rendering pathway
        for (let i = idx + 2; i <= lastIdx; i += 2) {
            const t = entries[i];
            const v = entries[i + 1];
            if (t === imImmediateModeBlockBegin) {
                CacheEntriesOnRemove(v);
            }
        }
    }

    // we allow growing or shrinking this kind of block in particular
    entries[ENTRIES_LAST_IDX] = idx;

    __BlockDerivedEnd(c, INTERNAL_TYPE_ARRAY_BLOCK);
}

// This is the initial value, so that anything, even `undefined`, can trigger Memo
const IM_MEMO_FIRST_EVER = {};

const MEMO_NOT_CHANGED = 0;
/** returned by {@link imMemo} if the value changed */
const MEMO_CHANGED = 1;
/** 
 * returned by {@link imMemo} if this is simply the first render. 
 * Most of the time the distinction is not important, but sometimes,
 * you want to happen on a change but NOT the initial renderer.
 */
const MEMO_FIRST_RENDER = 2;
/** 
 * returned by {@link imMemo} if this is is caused by the component
 * re-entering the conditional rendering codepath.
 */
const MEMO_FIRST_RENDER_CONDITIONAL = 3;

export type MemoResult
    = typeof MEMO_NOT_CHANGED
    | typeof MEMO_FIRST_RENDER
    | typeof MEMO_CHANGED
    | typeof MEMO_FIRST_RENDER_CONDITIONAL;

/**
 * Returns non-zero when either:
 *  1. val was different from the last value, 
 *  2. the component wasn't in the conditional rendering pathway before,
 *    but it is now
 *
 * 1 makes sense, but 2 only arises is because we want code like this to work
 * in any concievable context:
 *
 * ```ts
 * function uiComponent(focused: boolean) {
 *      if (Memo(c, focused)) {
 *          // recompute state
 *      }
 * }
 * ```
 *
 * With 1. alone, it won't work if the component leaves the conditional rendering pathway, 
 * and then re-enters it:
 *
 * ```ts
 * Switch(c); switch(currentComponent) {
 *      case "component 1": uiComponent(true); break;
 *      case "component 2": somethingElse(true); break;
 *  } SwitchEnd(c);
 * ```
 *
 * But with 2. as well, it should always work as expected.
 *
 * NOTE: NaN !== NaN. So your memo will fire every frame. 
 * I'm still diliberating on should my code be 'correct' and always handle this for every Memo, 
 * even when it doesn't really need to, or if you sohuld just handle it as needed. 
 * For now, you can handle it.
 *
 * NOTE: you can use the bitwise-or operator if you just want to check if multiple values have changed
 * without extracing value1Changed, value2Changed, etc. variables since this is not short-circuiting like the || operator.
 * 
 * ```ts
 * if (Memo(c, value1) | imMemo(c, value2) | imMemo(c, value3) | imMemo(c, value4)) {
 *      // Something
 * }
 * ```
 */
function imMemo(c: ImCache, val: unknown): MemoResult {
    /**
     * NOTE: I had previously implemented Memo() and imMemoEnd():
     *
     * ```ts
     * if (MemoBegin().val(x).objectVals(obj)) {
     *      <Memoized component>
     * } MemoEnd();
     * ```
     * It can be done, but I've found that it's a terrible idea in practice.
     * I had initially thought {@link imMemo} was bad too, but it has turned out to be very useful.
     * turned out to be very useful, more so even, than Memo2(c, ...manyArgs)
     */

    let result: MemoResult = MEMO_NOT_CHANGED;

    const entries = c[CACHE_CURRENT_ENTRIES];

    let lastVal = imGet(c, inlineTypeId(imMemo), IM_MEMO_FIRST_EVER);
    if (lastVal !== val) {
        imSet(c, val);
        if (lastVal === IM_MEMO_FIRST_EVER) {
            result = MEMO_FIRST_RENDER;
        } else {
            result = MEMO_CHANGED;
        }
    } else if (entries[ENTRIES_STARTED_CONDITIONALLY_RENDERING] === true) {
        result = MEMO_FIRST_RENDER_CONDITIONAL;
    }

    return result;
}

export type TryState = {
    entries: ImCacheEntries;
    err: any | null;
    recover: () => void;
    unwoundThisFrame: boolean;
    // TODO: consider Map<Error, count: number>
};

/**
 * ```ts
 * const tryState = Try(c); try {
 *      const { err, recover }  tryState;
 *      if (If(c) && !err) {
 *          MainApp(c);
 *      } else {
 *          IfElse(c):
 *
 *          ErrorViewer(c, err, recover);
 *      } IfEnd(c);
 *      // render your component here
 * } catch(err) {
 *      TryCatch(c, tryState, err);
 *      // NOTE: you can't render components here. use the else part of an if-else in the try block instead.
 *      // NOTE: if your else block has an error as well, then you're cooked.
 * } TryEnd(c, tryState); 
 * ```
 */
function imTry(c: ImCache): TryState {
    const entries = __BlockDerivedBegin(c, INTERNAL_TYPE_TRY_BLOCK);

    let tryState = imGet(c, imTry);
    if (tryState === undefined) {
        const val: TryState = {
            err: null,
            recover: () => {
                val.err = null;
                rerenderCache(c);
            },
            entries,
            unwoundThisFrame: false,
        };
        tryState = imSet(c, val);
    }

    tryState.unwoundThisFrame = false;

    return tryState;
}

function imCatch(c: ImCache, tryState: TryState, err: any) {
    tryState.unwoundThisFrame = true;

    if (tryState.err != null) {
        throw new Error("Your error boundary pathway also has an error in it, so we can't recover!");
    }

    c[CACHE_NEEDS_RERENDER] = true;
    tryState.err = err;
    const idx = c.lastIndexOf(tryState.entries);
    if (idx === -1) {
        throw new Error("Couldn't find the entries in the stack to unwind to!");
    }

    c[CACHE_IDX] = idx - 1;
    c[CACHE_CURRENT_ENTRIES] = c[idx - 1];
}

function imTryEnd(c: ImCache, tryState: TryState) {
    if (tryState.unwoundThisFrame === true) {
        // nothing to end.
        assert(c[c[CACHE_IDX] + 1] === tryState.entries);
    } else {
        const entries = c[CACHE_CURRENT_ENTRIES];
        assert(entries === tryState.entries);
        __BlockDerivedEnd(c, INTERNAL_TYPE_TRY_BLOCK);
    }
}

function getDeltaTimeSeconds(c: ImCache): number {
    return c[CACHE_ANIMATION_DELTA_TIME_SECONDS];
}

// Events can trigger rerenders in the same frame.
function getRenderCount(c: ImCache) {
    return c[CACHE_RENDER_COUNT];
}

export const im = {
    /** You'll need to call this once, and retain the state somewhere. So, technically speaking, this framework is retained-mode :nerd-emoji: */
    newCache,

    /** Need to call these two for the immediate-mode cache to work */
    CacheBegin: imCacheBegin, CacheEnd: imCacheEnd,

    /** Internal methods and variables */
    CACHE_ENTRIES_START, // Offset into an Imcache where the actual entries start
    ENTRIES_ITEMS_START, // Offset into an ImCacheEntries where the actual items start

    /** State management - all different flavours of Get/Set */
    Get: imGet, Set: imSet,
    GetInline: imGetInline,  
    isSetRequired,  // Useful for when you want to store `undefined` as a valid value
    State: imState,
    // Use this to add a destructor. Destructors should not be relied upon to execute business logic on entry-list exit, because
    // they may or may not run depending on the 'remove level' you've set, which is purely based on
    // the performance characteristics you want.
    // They should only be used to free memory/resources, like event listeners, various observers, etc.
    onImmediateModeBlockDestroyed, 

    /** Conditional rendering, list rendering */

    KeyedBegin: imKeyedBegin, KeyedEnd: imKeyedEnd,
    If: imIf, IfElse: imIfElse, Else: imElse, IfEnd: imIfEnd,
    Switch: imSwitch, SwitchEnd: imSwitchEnd,
    For: imFor, ForEnd: imForEnd,
    Try: imTry, Catch: imCatch, TryEnd: imTryEnd, TryCatch: imCatch,

    /** Executing code when something else has changed */
    Memo: imMemo,
    MEMO_NOT_CHANGED, MEMO_CHANGED, MEMO_FIRST_RENDER, MEMO_FIRST_RENDER_CONDITIONAL,

    /** Animation */
    getDeltaTimeSeconds, // Gets the _seconds_ elapsed between the previous frame and the current frame

    /** Performance optimization */

    // Is this more-or-less the first render? If the component encountered an error before ending 
    // the entry list, then this method will continue to be true till we can call CacheEntriesEnd on it.
    // You'll want to use this for quite a lot of idempotent things that you dont want running too often, 
    // as it doesn't create any cache entries by itself.
    isFirstishRender, 
    // Is this rerender caused by an event (as opposed to an animation frame)? 
    // Useful to avoid expensive canvas rendering when true.
    isEventRerender,

    /** State management - surprisingly useless method */
    getEntryAt,

    /** You won't need these for your app, but you may need these to build a custom adapter */

    getCurrentCacheEntries,   // Gets the current entry list
    getRootEntries,           // Gets whatever entries were in the call to {@link im.newCache}
    getEntriesRemoveLevel,    // When this entry list leaves the conditional pathway, to what extent should we remove it?
    REMOVE_LEVEL_NONE, REMOVE_LEVEL_DETATCHED, REMOVE_LEVEL_DESTROYED,
    getEntriesIsInConditionalPathway,   // Is this entry list currently in the conditional pathway?
    rerenderCache,      // Use this to rerender the cache. Either immediately afther the current render, or a new render. Happens outside the animation frame.
    recursivelyEnumerateEntries, // Recursively enumerate your entries
    getEntriesParent, getEntriesParentFromEntries, // Get the 'parent item' associated with an entry list

    ImmediateModeBlockBegin: imImmediateModeBlockBegin, // This is the typeId of an ImCacheEntries object
    ImmediateModeBlockEnd: imImmediateModeBlockEnd,

    /** Internal diagnostics */
    getFpsCounterState,
    getItemsIterated,
    getTotalMapEntries,
    getTotalDestructors,
    getStackLength,
    getRenderCount,

    /** I made this literally for some demo that I canned, but might be useful idk */
    ForEachCacheEntryItem: imForEachCacheEntryItem,
};
