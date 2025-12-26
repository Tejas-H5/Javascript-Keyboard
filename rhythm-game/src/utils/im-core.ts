// IM-CORE 1.054
// NOTE: I'm currently working on 3 different apps with this framework,
// so even though I thought it was mostly finished, the API appears to still be changing slightly.

import { assert } from "src/utils/assert";

// Conventions
//  - An 'immediate mode' method or 'im' method is any method that eventually _writes_ to the `ImCache`.
//    These methods should ideally be prefixed with 'im'.
//    Conversely, methods that don't touch the imCache, or that will only ever _read_ from the imCache, should NOT be prefixed with 'im'.
//    This allows developers (and in the future, static analysis tools) to know that this method can't be rendered conditionally, or
//    out of order, similar to how React hooks work. This is really the only convention I would recommend you actually follow.
//
//  - imMethods that begin a scope and have a corresponding method to end that scope should be called `im<Name>Begin` and `im<Name>End`. 
//    You may have some methods that are so frequently used that you can omit `Begin` from the first method's name to save some typing,
//    and it may even be worth it. I have quite a few of these in im-core and im-dom. 
//    After wasting a lot of time thinking about a convention that 100% covers all bases, and makes it 
//    obvious which methods push/pop and also saves as much typing as possible, I wasn't able to find a good solution, 
//    so this is the compromise. 
//    Some day, I plan on making aneslint rule that will make use of this convention to flag missing closing statements.

export type ImCacheEntries = any[];

// Somewhat important that we store these all at 0.

export const ENTRIES_IDX = 0;
export const ENTRIES_LAST_IDX = 1;
export const ENTRIES_REMOVE_LEVEL = 2;
export const ENTRIES_IS_IN_CONDITIONAL_PATHWAY = 3;
export const ENTRIES_IS_DERIVED = 4;
export const ENTRIES_STARTED_CONDITIONALLY_RENDERING = 5;
export const ENTRIES_DESTRUCTORS = 6;
export const ENTRIES_KEYED_MAP = 7;
export const ENTRIES_KEYED_MAP_REMOVE_LEVEL = 8;
export const ENTRIES_COMPLETED_ONE_RENDER = 9;
export const ENTRIES_INTERNAL_TYPE = 10;
export const ENTRIES_PARENT_TYPE = 11;
export const ENTRIES_PARENT_VALUE = 12;
export const ENTRIES_ITEMS_START = 13;

// Allows us to cache state for our immediate mode callsites.
// Initially started using array indices instead of object+fields to see what would happen.
// A lot of code paths have actually been simplified as a result at the expense of type safety... (worth it)
export type ImCache = (ImCacheEntries | any)[];
export const CACHE_IDX                          = 0;
export const CACHE_CURRENT_ENTRIES              = 1;
export const CACHE_CURRENT_WAITING_FOR_SET      = 2;
export const CACHE_CONTEXTS                     = 3;
export const CACHE_ROOT_ENTRIES                 = 4;
export const CACHE_NEEDS_RERENDER               = 5;
export const CACHE_RERENDER_FN                  = 6;
export const CACHE_IS_RENDERING                 = 7;
export const CACHE_RENDER_COUNT                 = 8;
export const CACHE_ANIMATE_FN                   = 9;
export const CACHE_ANIMATION_ID                 = 10;
export const CACHE_ANIMATION_TIME_LAST          = 11;
export const CACHE_ANIMATION_TIME               = 12;
export const CACHE_ANIMATION_DELTA_TIME_SECONDS = 13;
export const CACHE_ITEMS_ITERATED               = 14;
export const CACHE_ITEMS_ITERATED_LAST_FRAME    = 15; // Useful performance metric
export const CACHE_TOTAL_DESTRUCTORS            = 16; // Useful memory leak indicator
export const CACHE_TOTAL_MAP_ENTRIES            = 17; // Useful memory leak indicator
export const CACHE_TOTAL_MAP_ENTRIES_LAST_FRAME = 18; // Useful memory leak indicator
export const CACHE_ENTRIES_START                = 19;


export const REMOVE_LEVEL_NONE = 1;
export const REMOVE_LEVEL_DETATCHED = 2;
export const REMOVE_LEVEL_DESTROYED = 3;


export type RemovedLevel
    = typeof REMOVE_LEVEL_NONE
// This is the default remove level. The increase in performance far oughtweighs any memory problems.
//
// The only exception is map entries (created by imKeyedBegin), which default to being destroyed instead of removed.
// That way, the maps won't grow in size forever - this is very easy when values are immutable, or reloaded frequently enough.
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
// the {@link imGetsState} call, but it can also be a completely unrelated function
// - in which case you can just use {@link imInlineTypeId}. As long as a function
// has been uniquely used within a particular entry list at a particular slot, the 
// likelyhood of out-of-order rendering errors will reduce to almost 0.
export type TypeId<T> = (...args: any[]) => T;

/**
 * Used when the return type of the typeId function has nothing to do with the contents of the state.
 * We still need some way to check for out-of-order rendering bugs, and you probably have a function or two nearby that you can use.
 * This is an alterantive to the prior implementation, which forced you to pollute your module scopes with named integers.
 *
 * ```ts
 * let pingPong; pingPong = imGet(c, inlineTypeId(Math.sin));
 * if (!pingPong) pingPong = imSet(c, { t: 0 });
 * ```
 */
export function inlineTypeId<T = undefined>(fn: Function) {
    return fn as TypeId<T>;
}

// Can be any valid object reference. Or string, but avoid string if you can - string comparisons are slower than object comparisons
export type ValidKey = string | number | Function | object | boolean | null | unknown;

export const USE_MANUAL_RERENDERING = 1 << 0;
export const USE_REQUEST_ANIMATION_FRAME = 1 << 1;

/**
 * Pass in {@link USE_REQUEST_ANIMATION_FRAME} to get the intended experience - 
 * The animatin loop will make the following things significantly easier:
 *  - Animating that one thing
 *  - Writing robust javascript interaction logic that doesn't keep getting stuck in a particular bugged 
 *      state due to callbacks not being fired when you thought they would
 *  - 'reacting' to any state from anywhere. VanillaJS objects, your own data stores, api responses, you name it
 *
 * If you want to avoid the animation loop for whatever reason, pass in the {@link USE_MANUAL_RERENDERING} flag instead.
 *  - You'll need to manually call c[CACHE_RERENDER_FN]() whenever any state anywhere changes.
 *  - Methods that previously reported a deltaTime will report a constant 0.0333_ instead.
 * 
 * NOTE: the rerender function and the `useEventLoop` parameter are completely ignored after the first render, and this will never change.
 */
export function imCacheBegin(
    c: ImCache,
    renderFn: (c: ImCache) => void,
    flags: typeof USE_REQUEST_ANIMATION_FRAME | typeof USE_MANUAL_RERENDERING,
) {
    if (c.length === 0) {
        for (let i = 0; i < CACHE_ENTRIES_START; i++) {
            c.push(undefined);
        }

        // starts at -1 and increments onto the current value. So we can keep accessing this idx over and over without doing idx - 1.
        // NOTE: memory access is supposedly far slower than math. So might not matter too much
        c[CACHE_IDX] = 0;
        c[CACHE_CONTEXTS] = [];
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

        c[CACHE_RERENDER_FN] = () => {
            if (c[CACHE_IS_RENDERING] === true) {
                // we can't rerender right here, so we'll queue a rerender at the end of the component
                c[CACHE_NEEDS_RERENDER] = true;
            } else {
                renderFn(c);
            }
        };

        // Deltatime should naturally reach 0 on 'rerenders'. Not sure how it will work for manual rendering.
        c[CACHE_ANIMATION_TIME] = 0;
        c[CACHE_ANIMATION_TIME_LAST] = 0;

        if ((flags & USE_MANUAL_RERENDERING) !== 0) {
            c[CACHE_ANIMATE_FN] = noOp;
            c[CACHE_ANIMATION_ID] = null;
        } else if ((flags & USE_REQUEST_ANIMATION_FRAME) !== 0) {
            c[CACHE_ANIMATION_DELTA_TIME_SECONDS] = 0;
            c[CACHE_ANIMATE_FN] = (t: number) => {
                if (c[CACHE_IS_RENDERING] === true) {
                    // This will make debugging a lot easier. Otherwise the animation will play while
                    // we're breakpointed. xD
                    return;
                }

                c[CACHE_ANIMATION_TIME] = t;
                renderFn(c);
            };
            c[CACHE_ANIMATION_ID] = 0;
        } else {
            throw new Error("Invalid flags");
        }
    }

    c[CACHE_IS_RENDERING] = true; 
    c[CACHE_IDX] = CACHE_ENTRIES_START - 1;
    c[CACHE_NEEDS_RERENDER] = false;
    c[CACHE_ITEMS_ITERATED_LAST_FRAME] = c[CACHE_ITEMS_ITERATED];
    c[CACHE_ITEMS_ITERATED] = 0;
    c[CACHE_TOTAL_MAP_ENTRIES_LAST_FRAME] = c[CACHE_TOTAL_MAP_ENTRIES];
    c[CACHE_TOTAL_MAP_ENTRIES] = 0;
    c[CACHE_CURRENT_WAITING_FOR_SET] = false;
    c[CACHE_RENDER_COUNT]++;

    if ((flags & USE_REQUEST_ANIMATION_FRAME) !== 0) {
        c[CACHE_ANIMATION_DELTA_TIME_SECONDS] = (c[CACHE_ANIMATION_TIME] - c[CACHE_ANIMATION_TIME_LAST]) / 1000;
        c[CACHE_ANIMATION_TIME_LAST] = c[CACHE_ANIMATION_TIME];
    } else {
        c[CACHE_ANIMATION_DELTA_TIME_SECONDS] = 1 / 30;
    }

    imCacheEntriesBegin(c, c[CACHE_ROOT_ENTRIES], imCacheBegin, c, INTERNAL_TYPE_CACHE);

    return c;
}

function noOp() {}

export function imCacheEnd(c: ImCache) {
    imCacheEntriesEnd(c);

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
        c[CACHE_RERENDER_FN]();

        // Some things may occur while we're rendering the framework that require is to immediately rerender
        // our components to not have a stale UI. Those events will set this flag to true, so that
        // We can eventually reach here, and do a full rerender.
        c[CACHE_NEEDS_RERENDER] = false;
    } else if (c[CACHE_ANIMATE_FN] !== noOp) {
        // paranoid about starting multiple animations side by side, which kills performance and introduces various bugs.
        // cancelling the prior animation should do it
        cancelAnimationFrame(c[CACHE_ANIMATION_ID]);
        c[CACHE_ANIMATION_ID] = requestAnimationFrame(c[CACHE_ANIMATE_FN]);
    }
}

const INTERNAL_TYPE_NORMAL_BLOCK = 1;
const INTERNAL_TYPE_CONDITIONAL_BLOCK = 2;
const INTERNAL_TYPE_ARRAY_BLOCK = 3;
const INTERNAL_TYPE_KEYED_BLOCK = 4;
const INTERNAL_TYPE_TRY_BLOCK = 5;
const INTERNAL_TYPE_CACHE = 6;
const INTERNAL_TYPE_SWITCH_BLOCK = 7;

export function imCacheEntriesBegin<T>(
    c: ImCache,
    entries: ImCacheEntries,
    parentTypeId: TypeId<T>,
    parent: T,
    internalType: number,
) {
    const idx = ++c[CACHE_IDX];
    if (idx === c.length) {
        c.push(entries);
    } else {
        c[idx] = entries;
    }

    c[CACHE_CURRENT_ENTRIES] = entries;

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
        assert(entries[ENTRIES_PARENT_TYPE] === parentTypeId);
    }

    entries[ENTRIES_IDX] = ENTRIES_ITEMS_START - 2;
}

export function imCacheEntriesEnd(c: ImCache) {
    const idx = --c[CACHE_IDX];
    c[CACHE_CURRENT_ENTRIES] = c[idx];
    assert(idx >= CACHE_ENTRIES_START - 1);
}

export function imGet<T>(
    c: ImCache,
    typeId: TypeId<T>,
    initialValue: T | undefined = undefined
): T | undefined {
    const entries = c[CACHE_CURRENT_ENTRIES];
    c[CACHE_ITEMS_ITERATED]++;

    // Make sure you called imSet for the previous state before calling imGet again.
    assert(c[CACHE_CURRENT_WAITING_FOR_SET] === false);

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

    if (idx === entries.length) {
        entries.push(typeId);
        entries.push(initialValue);
        c[CACHE_CURRENT_WAITING_FOR_SET] = true;
    } else if (idx < entries.length) {
        assert(entries[idx] === typeId);
    } else {
        throw new Error("Shouldn't reach here");
    }

    return entries[idx + 1];
}

/**
 * Allows you to get/set state inline without using lambdas:
 * ```ts
 * let s; s = imGetInline(c, fn);
 * if (!s) s = imSet(c, { blah });
 * ```ts
 *
 * Or more concise:
 *
 * let s; s = imGetInline(c, fn) ?? imSet(c, { blah });
 * ```ts
 * ```
 * NOTE: undefined return type is a lie! Will also return whatever you set with imSet.
 * But we want typescript to infer the value of `x = imGet(c) ?? imSet(c, val)` to always be the type of val.
 */
export function imGetInline(
    c: ImCache,
    typeIdInline: TypeId<unknown>,
): undefined {
    return imGet(c, inlineTypeId(typeIdInline));
}


/**
 * A shorthand for a pattern that is very common.
 * NOTE: if your state gains dependencies, you can just use imGet and imSet directly, as intended.
 */
export function imState<T>(c: ImCache, fn: () => T): T {
    let val = imGet(c, fn);
    if (val === undefined) val = imSet(c, fn());
    return val;
}

export function getEntryAt<T>(c: ImCache, typeId: TypeId<T>, idx: number): T {
    const entries = c[CACHE_CURRENT_ENTRIES];
    const type = entries.at(ENTRIES_ITEMS_START + idx);
    if (type !== typeId) {
        throw new Error("Didn't find <typeId::" + typeId.name + "> at " + idx);
    }

    const val = entries[ENTRIES_ITEMS_START + idx + 1];
    return val as T;
}


export function getEntriesParent<T>(c: ImCache, typeId: TypeId<T>): T {
    // If this assertion fails, then you may have forgotten to pop some things you've pushed onto the stack
    const entries = c[CACHE_CURRENT_ENTRIES];
    assert(entries[ENTRIES_PARENT_TYPE] === typeId);
    return entries[ENTRIES_PARENT_VALUE] as T;
}


export function imSet<T>(c: ImCache, val: T): T {
    const entries = c[CACHE_CURRENT_ENTRIES];
    const idx = entries[ENTRIES_IDX];
    entries[idx + 1] = val;
    c[CACHE_CURRENT_WAITING_FOR_SET] = false;
    return val;
}

type ListMapBlock = { rendered: boolean; entries: ImCacheEntries; };


function __imBlockKeyedBegin(c: ImCache, key: ValidKey) {
    const entries = c[CACHE_CURRENT_ENTRIES];

    let map = entries[ENTRIES_KEYED_MAP] as (Map<ValidKey, ListMapBlock> | undefined);
    if (map === undefined) {
        map = new Map<ValidKey, ListMapBlock>();
        entries[ENTRIES_KEYED_MAP] = map;
    }

    let block = map.get(key);
    if (block === undefined) {
        block = { rendered: false, entries: [] };
        map.set(key, block);
    }

    /**
     * You're rendering this list element twice. You may have duplicate keys in your dataset.
     * If that is not the case, a more common cause is that you are mutating collections while iterating them.
     * All sorts of bugs and performance issues tend to arise when I 'gracefully' handle this case, so I've just thrown an exception instead.
     *
     * If you're doing this in an infrequent event, here's a quick fix:
     * {
     *      let deferredAction: () => {};
     *      imCacheListItem(s);
     *      for (item of list) {
     *          if (event) deferredAction = () => literally same mutation
     *      }
     *      imCacheListItemEnd(s);
     *      if (deferredAction !== undefined) deferredAction();
     * }
     */
    if (block.rendered === true) throw new Error(
        "You've requested the same list key twice. This is indicative of a bug. The comment above this exception will explain more."
    );

    block.rendered = true;

    const parentType = entries[ENTRIES_PARENT_TYPE];
    const parent = entries[ENTRIES_PARENT_VALUE];
    imCacheEntriesBegin(c, block.entries, parentType, parent, INTERNAL_TYPE_KEYED_BLOCK);
}

/**
 * Allows you to reuse the same component for the same key.
 * This key is local to the current entry list, which means that multiple `imKeyedBegin` calls all reuse the same entry list
 * pushed by `imFor` in this example:
 *
 * ```ts
 * imFor(c); for (const val of list) {
 *      imKeyedBegin(c, val); { ... } imKeyedEnd(c);
 * } imForEnd(c);
 * ```
 */
export function imKeyedBegin(c: ImCache, key: ValidKey) {
    __imBlockKeyedBegin(c, key);
}

export function imKeyedEnd(c: ImCache) {
    __imBlockDerivedEnd(c, INTERNAL_TYPE_KEYED_BLOCK);
}

// You probably don't need a destructor unless you're being forced to add/remove callbacks or 'clean up' something
export function cacheEntriesAddDestructor(c: ImCache, destructor: () => void) {
    const entries = c[CACHE_CURRENT_ENTRIES];
    let destructors = entries[ENTRIES_DESTRUCTORS];
    if (destructors === undefined) {
        destructors = [];
        entries[ENTRIES_DESTRUCTORS] = destructors;
    }

    destructors.push(destructor);
    c[CACHE_TOTAL_DESTRUCTORS]++;
}

function imCacheEntriesOnRemove(entries: ImCacheEntries) {
    // don't re-traverse these items.
    if (entries[ENTRIES_IS_IN_CONDITIONAL_PATHWAY] === true) {
        entries[ENTRIES_IS_IN_CONDITIONAL_PATHWAY] = false;

        for (let i = ENTRIES_ITEMS_START; i < entries.length; i += 2) {
            const t = entries[i];
            const v = entries[i + 1];
            if (t === imBlockBegin) {
                imCacheEntriesOnRemove(v);
            }
        }
    }
}

function imCacheEntriesOnDestroy(c: ImCache, entries: ImCacheEntries) {
    // don't re-traverse these items.
    if (entries[ENTRIES_REMOVE_LEVEL] < REMOVE_LEVEL_DESTROYED) {
        entries[ENTRIES_REMOVE_LEVEL] = REMOVE_LEVEL_DESTROYED;

        for (let i = ENTRIES_ITEMS_START; i < entries.length; i += 2) {
            const t = entries[i];
            const v = entries[i + 1];
            if (t === imBlockBegin) {
                imCacheEntriesOnDestroy(c, v);
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

export function imBlockBegin<T>(
    c: ImCache,
    parentTypeId: TypeId<T>,
    parent: T,
    internalType: number = INTERNAL_TYPE_NORMAL_BLOCK
): ImCacheEntries {
    let entries; entries = imGet(c, imBlockBegin);
    if (entries === undefined) entries = imSet(c, []);

    imCacheEntriesBegin(c, entries, parentTypeId, parent, internalType);

    const map = entries[ENTRIES_KEYED_MAP] as (Map<ValidKey, ListMapBlock> | undefined);
    if (map !== undefined) {
        // TODO: maintain a list of things we rendered last frame.
        // This map may become massive depending on how caching has been configured.
        for (const v of map.values()) {
            v.rendered = false;
        }
    }

    return entries;
}

export function imBlockEnd(c: ImCache, internalType: number = INTERNAL_TYPE_NORMAL_BLOCK) {
    const entries = c[CACHE_CURRENT_ENTRIES];
    let map = entries[ENTRIES_KEYED_MAP] as (Map<ValidKey, ListMapBlock> | undefined);

    // Opening and closing blocks may not be lining up right.
    // You may have missed or inserted some blocks by accident.
    assert(entries[ENTRIES_INTERNAL_TYPE] === internalType);

    if (map !== undefined) {
        c[CACHE_TOTAL_MAP_ENTRIES] += map.size;

        const removeLevel = entries[ENTRIES_KEYED_MAP_REMOVE_LEVEL];
        if (removeLevel === REMOVE_LEVEL_DETATCHED) {
            for (const v of map.values()) {
                if (v.rendered === false) {
                    imCacheEntriesOnRemove(v.entries);
                }
            }
        } else if (removeLevel === REMOVE_LEVEL_DESTROYED) {
            // This is now the default. You will avoid memory leaks if your keyed
            // elements get destroyed instead of detatched. 
            for (const [k, v] of map) {
                if (v.rendered === false) {
                    imCacheEntriesOnDestroy(c, v.entries);
                    map.delete(k);
                }
            }
        } else {
            throw new Error("Unknown remove level");
        }
    }

    const idx = entries[ENTRIES_IDX];
    entries[ENTRIES_COMPLETED_ONE_RENDER] = true;
    const lastIdx = entries[ENTRIES_LAST_IDX];
    if (idx !== ENTRIES_ITEMS_START - 2) {
        if (lastIdx === ENTRIES_ITEMS_START - 2) {
            entries[ENTRIES_LAST_IDX] = idx;
        } else if (idx !== lastIdx) {
            throw new Error("You should be rendering the same number of things in every render cycle");
        }
    }

    return imCacheEntriesEnd(c);
}

export function __imBlockDerivedBegin(c: ImCache, internalType: number): ImCacheEntries {
    const entries = c[CACHE_CURRENT_ENTRIES];
    const parentType = entries[ENTRIES_PARENT_TYPE];
    const parent = entries[ENTRIES_PARENT_VALUE];

    return imBlockBegin(c, parentType, parent, internalType);
}

// Not quite the first render - 
// if the function errors out before the entries finish one render, 
// this method will rerender. Use this when you want to do something maybe once or twice or several times but hopefully just once,
// as it doesn't require an additional im-state entry. 
// For example, if you have an API like this:
// ```ts
// imDiv(c); imRow(c); imCode(c); imJustifyCenter(c); imBg(c, cssVars.bg); {
// } imDivEnd(c);
// ```
// Each of those methods that 'augment' the call to `imDiv` may have their own initialization logic.
export function isFirstishRender(c: ImCache): boolean {
    const entries = c[CACHE_CURRENT_ENTRIES];
    return entries[ENTRIES_COMPLETED_ONE_RENDER] === false;
}

export function __imBlockDerivedEnd(c: ImCache, internalType: number) {
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
    // imConditionalBlock();
    // if (blah) {
    // }
    // imConditionalBlockEnd();
    //
    // Will automatically isolate the next immediate mode call-sites with zero further effort required,
    // because all the entries will go into a single array which always takes up just 1 slot in the entries list.
    // It's a bit confusing why there isn't more logic here though, I guess.
    //
    // NOTE: I've now moved this functionality into core. Your immediate mode tree builder will need
    // to resolve diffs in basically the same way.

    imBlockEnd(c, internalType);
}

/**
 * Usage:
 * ```ts
 *
 * // Annotating the control flow is needed - otherwise it won't work
 *
 * if (imIf(c) && <condition>) {
 *      // <condition> will by adequately type-narrowed by typescript
 * } else if (imElseIf(c) && <condition2>){
 *      // <condition>'s negative will not by adequately type-narrowed here though, sadly.
 *      // I might raise an issue on their github soon.
 * } else {
 *      imElse(c);
 *      // <condition>'s negative will not by adequately type-narrowed here though, sadly, same as above.
 * } imIfEnd(c);
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
 * imIf(c); if (<condition>) {
 * } else {
 *      imElse(c);
 * }imIfEnd(c);
 * ```
 * Because it suggests that you can extend it like the following, which would
 * no longer be correct:
 * ```ts
 * imIf(c); if (<condition>) {
 * } else if (<condition2>) {
 *      // NOO this will throw or corrupt data :((
 *      imElseIf(c);
 * } else {
 *      imElse(c);
 * } imIfEnd(c);
 * ```
 *
 * The framework assumes that every conditional annotation will get called in order,
 * till one of the conditions passes, after which the next annotation is `imIfEnd`. 
 * But now, it is no longer guaranteed that imElseIf will always be called if <condition> was false.
 * This means the framework has no way of telling the difference between the else-if block
 * and the else block (else blocks and else-if blocks are handled the same internally).
 */
export function imIf(c: ImCache): true {
    __imBlockArrayBegin(c);
    __imBlockConditionalBegin(c);
    return true;
}

export function imIfElse(c: ImCache): true {
    __imBlockConditionalEnd(c);
    __imBlockConditionalBegin(c);
    return true;
}

export function imIfEnd(c: ImCache) {
    __imBlockConditionalEnd(c);
    __imBlockArrayEnd(c);
}

// All roads lead to rome (TM) design pattern. not sure if good idea or shit idea
export const imEndIf = imIfEnd;
export const imElse = imIfElse;
export const imEndSwitch = imSwitchEnd;
export const imEndFor = imForEnd;
export const imCatch = imTryCatch;

/**
 * Example usage:
 * ```ts
 * imSwitch(c, key) switch (key) {
 *      case a: { ... } break;
 *      case b: { ... } break;
 *      case c: { ... } break;
 * } imSwitchEnd(c);
 * ```
 * ERROR: Don't use fallthrough, use if-else + imIf/imIfElse/imIfEnd instead. 
 * Fallthrough doesn't work as you would expect - for example:
 * ```ts
 *  imSwitch(c,key); switch(key) {
 *          case "A": { imComponent1(c); } // fallthrough (nooo)
 *          case "B": { imComponent2(c); }
 *  } imSwitchEnd(c);
 * ```
 * When the key is `b`, an instance of imComponent2 is rendered. However,
 * when the key is `a`, two completely separate instances of `imComponent1` and `imComponent2` are rendered.
 *      You would expect the `imComponent2` from both switch cases to be the same instance, but they are duplicates 
 *      with none of the same state.
 * 
 */
export function imSwitch(c: ImCache, key: ValidKey) {
    __imBlockDerivedBegin(c, INTERNAL_TYPE_SWITCH_BLOCK);
    __imBlockKeyedBegin(c, key);
}

export function imSwitchEnd(c: ImCache) {
    __imBlockDerivedEnd(c, INTERNAL_TYPE_KEYED_BLOCK);
    __imBlockDerivedEnd(c, INTERNAL_TYPE_SWITCH_BLOCK);
}

function __imBlockArrayBegin(c: ImCache) {
    __imBlockDerivedBegin(c, INTERNAL_TYPE_ARRAY_BLOCK);
}

function __imBlockConditionalBegin(c: ImCache) {
    __imBlockDerivedBegin(c, INTERNAL_TYPE_CONDITIONAL_BLOCK);
}

function __imBlockConditionalEnd(c: ImCache) {
    const entries = c[CACHE_CURRENT_ENTRIES];
    if (entries[ENTRIES_IDX] === ENTRIES_ITEMS_START - 2) {
        imCacheEntriesOnRemove(entries);
    }

    __imBlockDerivedEnd(c, INTERNAL_TYPE_CONDITIONAL_BLOCK);
}

export function imFor(c: ImCache) {
    __imBlockArrayBegin(c);
}

export function imForEnd(c: ImCache) {
    __imBlockArrayEnd(c);
}

function __imBlockArrayEnd(c: ImCache) {
    const entries = c[CACHE_CURRENT_ENTRIES]

    const idx = entries[ENTRIES_IDX];
    const lastIdx = entries[ENTRIES_LAST_IDX];
    if (idx < lastIdx) {
        // These entries have left the conditional rendering pathway
        for (let i = idx + 2; i <= lastIdx; i += 2) {
            const t = entries[i];
            const v = entries[i + 1];
            if (t === imBlockBegin) {
                imCacheEntriesOnRemove(v);
            }
        }
    }

    // we allow growing or shrinking this kind of block in particular
    entries[ENTRIES_LAST_IDX] = idx;

    __imBlockDerivedEnd(c, INTERNAL_TYPE_ARRAY_BLOCK);
}

// This is the initial value, so that anything, even `undefined`, can trigger imMemo
const IM_MEMO_FIRST_EVER = {};

export const MEMO_NOT_CHANGED = 0;
/** returned by {@link imMemo} if the value changed */
export const MEMO_CHANGED = 1;
/** 
 * returned by {@link imMemo} if this is simply the first render. 
 * Most of the time the distinction is not important, but sometimes,
 * you want to happen on a change but NOT the initial renderer.
 */
export const MEMO_FIRST_RENDER = 2;
/** 
 * returned by {@link imMemo} if this is is caused by the component
 * re-entering the conditional rendering codepath.
 */
export const MEMO_FIRST_RENDER_CONDITIONAL = 3;

export const MEMO_FIRST_RENDER_EVER = 4;

export type ImMemoResult
    = typeof MEMO_NOT_CHANGED
    | typeof MEMO_FIRST_RENDER_EVER
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
 *      if (imMemo(c, focused)) {
 *          // recompute state
 *      }
 * }
 * ```
 *
 * With 1. alone, it won't work if the component leaves the conditional rendering pathway, 
 * and then re-enters it:
 *
 * ```ts
 * imSwitch(c); switch(currentComponent) {
 *      case "component 1": uiComponent(true); break;
 *      case "component 2": somethingElse(true); break;
 *  } imSwitchEnd(c);
 * ```
 *
 * But with 2. as well, it should always work as expected.
 *
 * NOTE: NaN !== NaN. So your memo will fire every frame. 
 * I'm still diliberating on should my code be 'correct' and always handle this for every imMemo, 
 * even when it doesn't really need to, or if you sohuld just handle it as needed. 
 * For now, you can handle it.
 */
export function imMemo(c: ImCache, val: unknown): ImMemoResult {
    /**
     * NOTE: I had previously implemented imMemo() and imMemoEnd():
     *
     * if (imBeginMemo().val(x).objectVals(obj)) {
     *      <Memoized component>
     * } imEndMemo();
     * ```
     * It can be done, but I've found that it's a terrible idea in practice.
     * I had initially thought {@link imMemo} was bad too, but it has turned out to be very useful.
     *
     * let result: ImMemoResult = MEMO_NOT_CHANGED; 
     */

    let result: ImMemoResult = MEMO_NOT_CHANGED;

    const entries = c[CACHE_CURRENT_ENTRIES];

    let lastVal = imGet(c, inlineTypeId(imMemo), IM_MEMO_FIRST_EVER);
    if (lastVal !== val) {
        imSet(c, val);
        if (lastVal === IM_MEMO_FIRST_EVER) {
            result = MEMO_FIRST_RENDER_EVER;
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
 * const tryState = imTry(c); try {
 *      // render your component here
 * } catch(err) {
 *      imTryCatch(c, tryState, err);
 *      // don't render anything here! Only do the other things
 * } imTryEnd(c, tryState); 
 * ```
 */
export function imTry(c: ImCache): TryState {
    const entries = __imBlockDerivedBegin(c, INTERNAL_TYPE_TRY_BLOCK);

    let tryState = imGet(c, imTry);
    if (tryState === undefined) {
        const val: TryState = {
            err: null,
            recover: () => {
                val.err = null;
                c[CACHE_NEEDS_RERENDER] = true;
            },
            entries,
            unwoundThisFrame: false,
        };
        tryState = imSet(c, val);
    }

    tryState.unwoundThisFrame = false;

    return tryState;
}

export function imTryCatch(c: ImCache, tryState: TryState, err: any) {
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

export function imTryEnd(c: ImCache, tryState: TryState) {
    if (tryState.unwoundThisFrame === true) {
        // nothing to end.
        assert(c[c[CACHE_IDX] + 1] === tryState.entries);
    } else {
        const entries = c[CACHE_CURRENT_ENTRIES];
        assert(entries === tryState.entries);
        __imBlockDerivedEnd(c, INTERNAL_TYPE_TRY_BLOCK);
    }
}

export function getDeltaTimeSeconds(c: ImCache): number {
    return c[CACHE_ANIMATION_DELTA_TIME_SECONDS];
}

// Events can trigger rerenders in the same frame.
export function getRenderCount(c: ImCache) {
    return c[CACHE_RENDER_COUNT];
}

/**
 * Sometimes, you'll need a global state stack, so that you have access to some state.
 * ```ts
 *
 * globalStateStackPush(gssThing, thing); {
 *      ...
 *      // can be arbitrarily deep inside the component
 *      const thing = globalStateStackGet(gssThing);
 *
 *      ...
 * } globalStateStackPop(gssThing);
 * ```ts
 *
 * 99% of the time, this pattern is a mistake that obfuscates and overcomplicates the code, 
 * and you should just pass `thing` as an additional function parameter.
 * And for things you pass around *a lot* like c: ImCache, you will incur a significant performance
 * hit by using this approach (as of 08/2025) (on top of the perf hit of using this framework).
 *
 * Here is a decision matrix you can use to decide whether to use this pattern or not:
 *
 *                                      | I need this state everywhere,    | I infrequently need this value, but the requirement can arise 
 *                                      | and I make sure to pass it as    | naturally somewhere deep node of the component, and I have
 *                                      | a method param everywhere anyway | to spend a bunch of time adding an extra function argument 
 *                                      |                                  | everywhere when it does.
 * ----------------------------------------------------------------------------------------------------------------------------
 *  This state is related to my app's   | Don't use a global state stack   | Don't use a global state stack 
 *  domain model                        | ctx: AppGlobalCtxState is here   | s: BlahViewState is here
 * ----------------------------------------------------------------------------------------------------------------------------
 *  This state is not related to my     | Don't use a global state stack   | Consider using a global state stack
 *  app's domain model                  | c: IMCache is here               | ev: ImGlobalEventSystem is here 
 * ----------------------------------------------------------------------------------------------------------------------------
 *
 */
export function globalStateStackPush<T>(gss: T[], item: T) {
    // I've put a limit on the context depth to 100. But really, anything > 1 is already a niche usecase, and anything > 2 may never happen in practice ... 
    if (gss.length > 100) {
        throw new Error("Looks like you're forgetting to pop items from your global state array. tsk tsk tsk. ");
    }

    gss.push(item);
}

export function globalStateStackGet<T>(gss: T[]): T {
    // No context item was pushed
    assert(gss.length > 0);

    return gss[gss.length - 1];
}

export function globalStateStackPop<T>(gss: T[], item: T): T {
    const currentItem = globalStateStackGet(gss);

    // Item may have changed mid-render, which definitely shouldn't ever happen, and is indicative of some other issue.
    assert(currentItem === item);

    gss.pop();

    return currentItem;
}
