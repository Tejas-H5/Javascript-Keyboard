import { asDefined, asIs, asNumber, asNumberOrUndefined, asObject, asString, asStringMapOrUndefined, unmarshalObject } from "./serialization-utils";
import { expectEqual, test } from "./testing";

test("Unmarshal object ", t => {
    // App code.
    // These functions and types already exist somewhere in the app

    class Stuff {
        constructor(public id: string) {
        }
    }

    type TargetType = {
        x: number;
        y: number | null;
        z: number | undefined;
        w?: number;

        stuff: Map<string, Stuff>;
    };

    function newTargetType(): TargetType {
        return {
            x: 0,
            y: null,
            z: undefined,
            stuff: new Map(),
        };
    }

    // Deserializer

    const u = JSON.parse(`{
    "x": 0,
    "y": null,
    "stuff": [
        ["a", { "id": "a" }],
        ["b", { "id": "b" }],
        ["c", { "id": "c" }]
    ]
}`);

    function asNumberOrNull(u: unknown): number | null {
        if (u === null) return null;
        return asNumber(u);
    }

    const result = unmarshalObject(u, newTargetType(), {
        x: asNumber,
        y: asNumberOrNull,
        z: asNumberOrUndefined,
        w: asNumberOrUndefined,
        stuff: (u, defaultVal) => asStringMapOrUndefined(u, u => {
            const obj = asDefined(asObject(u));
            const id = asString(
                obj["id"], // omg. not type safe !! TODO: fix API. 
            );
            const defaultValue = new Stuff(id);

            return unmarshalObject<Stuff>(u, defaultValue, {
                id: asIs,
            });
        }) ?? defaultVal,
    });

    expectEqual(t, "Deserialization worked", result, {
        x: 0,
        y: null,
        z: undefined,
        // Another limitation - all keys will be present.
        // I prefer the shape of all my objects to be static though, so I couldn't care less.
        w: undefined,
        stuff: new Map([
            new Stuff("a"),
            new Stuff("b"),
            new Stuff("c"),
        ].map(val => [val.id, val] as const))
    });
});
