// Need a way to dynamically make web workers if I want all of the code to live ina single html file
// Cheers, https://stackoverflow.com/questions/5408406/web-workers-without-a-separate-javascript-file
// NOTE: args must be stringifiable constants
// NOTE: seems like web workers are invoked as soon as they are createad
export function newWebWorker(args: any[], fn: Function, options? : NewFunctionUrlOptions) {
    // create the web worker dynamically
    const blobURL = newFunctionUrl([], args, fn, options);
    const worker = new Worker( blobURL );
    URL.revokeObjectURL( blobURL );
    return worker;
}

export type NewFunctionUrlOptions = {
    // You'll need this to fix errors like __publicField when you're using ES6 classes and building with esbuild or vite in 
    // some circumstances.
    includeEsBuildPolyfills: boolean;
};


export type UrlFnDependency = Function | {
    name: string;
    value: any; // this gets stringified
};

// This is a hack that allows usage of web-workers in a single-file-app that can be downloaded and ran locally.
// This is otherwise not possible with Vite web worker imports.
export function newFunctionUrl(
    /** functions get stringified directly. Be sure that they are named the same in {@link fn} as they are here */
    dependencies: UrlFnDependency[], 
    args: any[], 
    fn: Function, 
    options? : NewFunctionUrlOptions
) {
    // make a function that we can pass in some constants to
    const argsToString = args.join(",");

    let src = `

function main() {
// These dependencies were passed on externally, and stringified in an automated manner
${dependencies.map(a => {
    if(typeof a === "function") return a.toString();
    return `var ${a.name} = ${a.value};`
}).join("\n\n")}

// This is the actual code we want to run. It too was staringified in an automated manner
(${fn.toString()})(${argsToString});

}
main();
`

    if (options?.includeEsBuildPolyfills) {
        // These are copy-pasted, and may change in the future if we update vite.
        const esBuildPolyfills = `var __defProp = Object.defineProperty;
    var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
    var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);`;
        src = esBuildPolyfills + src;
    }

    const fnBlob =  new Blob([ src ], { type: 'application/javascript' });

    console.log(src)

    return URL.createObjectURL(fnBlob);
}
