// function initA() {
//     // bad, not parallel at all
//     initPart1((p1) => {
//         initPart2(p2 => {
//             initPart3(p3 => {
//                 // ok. we ball.
//             })
//         })
//     });
// }
//
// function initA() {
//     const part1 = initDsp();
//     const repo = newChartRepo();
//     const part3 = initPart3();
//
//     // better. however:
//
//     // A:
//     waitFor([part1, repo, part3], ([part1, part2, part3]) => {
//         if (deubg.cleanup) {
//             waitFor([cleanuPDb(repo)]);
//         }
//     });
//
//     // B: 
//     waitFor([part4, part5], ([part4, part5]) => {
//         const item = from(part4, part5);
//
//         // what if u need a result from A and B?
//     });
// }
//
// function initA(done: Done<T>) {
//     let thing1, thing2;
//
//     waitFor([part1, repo, part3], ([part1, part2, part3]) => {
//         thing1.set(from(part1, part2, part3));
//     });
//
//     // B: 
//     waitFor([part4, part5], ([part4, part5]) => {
//         thing2.set(from(part1, part2, part3));
//     });
//
//     // natural extension
//     waitFor([thing1, thing2], () => {
//     });
//
//
//     waitFor([out], ([out]) => done(out));
// }
//
// function initA(done: Done<T>) {
//     function internal(s) {
//         if (!s.part1) s.part1 = asyncVal( // blah blah balh
//     }
// }
//
//
// function initA(done: Done<T>, s: ) {
//     let thing1, thing2;
//
//     waitFor([part1, repo, part3], ([part1, part2, part3]) => {
//         thing1.set(from(part1, part2, part3));
//     });
//
//     // B: 
//     waitFor([part4, part5], ([part4, part5]) => {
//         thing2.set(from(part1, part2, part3));
//     });
//
//     // natural extension
//     waitFor([thing1, thing2], () => {
//     });
//
//
//     waitFor([out], ([out]) => done(out));
// }
//
//
// function initA(done: Done<T>, s: ) {
//     let thing1, thing2;
//
//     const thing3 = Promise.all([part1, repo, part3]).then(([part1, repo, part3]) => {
//         return blah;
//     });
//
//     // B: 
//     const thing7 = Promise.all([part4, part5], ([part4, part5]) => {
//         thing2.set(from(part1, part2, part3));
//     });
//
//     // natural extension
//     waitFor([thing1, thing2], () => {
//     });
//
//
//     waitFor([out], ([out]) => done(out));
// }
//
//
// type Ringbuffer = {
//     buff: number[];
//     i: number;
// }
//
// function newRingbuffer(count: number): Ringbuffer {
//     return {
//         buff: new Array(count).fill(0),
//         i: 0,
//     };
// }
//
// function pushValueToRingbuffer(rb: Ringbuffer, val: number) {
//     rb.buff[rb.i] = val;
//     rb.i += 1;
//     if (rb.i >= rb.buff.length) {
//         rb.i = 0;
//     }
// }
//
