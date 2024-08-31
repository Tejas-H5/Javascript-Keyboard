// Need a way to dynamically make web workers if I want all of the code to live ina single html file
// Cheers, https://stackoverflow.com/questions/5408406/web-workers-without-a-separate-javascript-file
// NOTE: args must be stringifiable constants
// NOTE: seems like web workers are invoked as soon as they are createad
export function newWebWorker(args: any[], fn: Function) {
    // create the web worker dynamically
    const blobURL = newFunctionUrl(args, fn);
    const worker = new Worker( blobURL );
    URL.revokeObjectURL( blobURL );
    return worker;
}

function newFunctionUrl(args: any[], fn: Function) {
    // make a function that we can pass in some constants to
    const argsToString = args.map(a => a.toString()).join(",");
    const src = '(' + fn.toString() + `)(${argsToString})`;
    const fnBlob =  new Blob([ src ], { type: 'application/javascript' });
    return URL.createObjectURL(fnBlob);
}
