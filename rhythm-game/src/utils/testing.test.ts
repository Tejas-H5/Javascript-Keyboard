import {expect, expectEqual, fork, runTest, test, TestExpectation, TestingHarness} from "./testing";

test("TestingHarness - forking", t => {
    const h = new TestingHarness();

    const result = runTest(h, t => {
        expect(t, "a", true);

        if (fork(t, "First fork")) {
            expect(t, "b", true);

            if (fork(t, "Second fork")) {
                expect(t, "c", true);
                return;
            }

            // test runner will never be smart enough to prune redundant forks, like "Second fork".
            // it doesn't have enough context to tell (without metaprogramming)
            
            return;
        }

        if (fork(t, "Either or fork")) {
            expect(t, "d", true);
        }

        expect(t, "e", true);
    });

    function ex(str: string): TestExpectation {
        return { desc: str };
    }

    expectEqual(t, result.expectationsPerFork, [
        [ex("a"), ex("b"), ex("c")],
        [ex("a"), ex("b")],
        [ex("a"), ex("d"), ex("e")],
        [ex("a"), ex("e")],
    ]);
});

test("TestingHarness - more forking", t => {
    const h = new TestingHarness();

    const result = runTest(h, t => {
        if (fork(t, "First fork")) {
            expect(t, "a", true);
        }

        if (fork(t, "Second fork")) {
            expect(t, "b", true);
        }

        if (fork(t, "Third fork")) {
            expect(t, "c", true);
        }
    });

    function ex(str: string): TestExpectation {
        return { desc: str };
    }

    // This passes, but is this necessarily what we would want? hmm.
    expectEqual(t, result.expectationsPerFork, [
        [ex("a"), ex("b"), ex("c")],
        [ex("a"), ex("b")],
        [ex("a"), ex("c")],
        [ex("a")],
    ]);
});
