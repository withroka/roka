/**
 * A library for making test writing easier.
 *
 * This package provides utilities for testing code to complement the "mock"
 * and "snapshot" systems of the standard
 * {@link https://jsr.io/@std/testing | **@std/testing**} library. The
 * functionality provided here is split into the groups of _fake_ and _mock_
 * objects.
 *
 * The "**fake**" objects implement the same interface as their real
 * counterparts, but with fake data and functionality. For example, the
 * {@linkcode [fake].fakeConsole | fakeConsole} function mimics the `console`
 * object, but captures calls to its methods instead of logging to the console.
 *
 * ```ts
 * import { fakeConsole } from "@roka/testing/fake";
 * Deno.test("fakeConsole()", async (t) => {
 *   using console = fakeConsole();
 *   console.log("I won't be printed");
 * });
 * ```
 *
 * The "**mock**" system is more heavy-handed than fake objects. It provides
 * the {@linkcode [mock].mock | mock} function to record and replay calls to an
 * asynchronous function. This is used to build the `mockFetch` function from
 * the {@link https://jsr.io/@roka/http | **@roka/http**} module to record and
 * replay real HTTP calls.
 *
 * ```ts
 * import { mock } from "@roka/testing/mock";
 * Deno.test("mock()", async (t) => {
 *   const mocked = {
 *     func: async () => "Hello, world!",
 *   };
 *   using func = mock(t, mocked, "func", {
 *     path: "__mocks__/testing.ts.mock",
 *   });
 *   await func();
 * });
 * ```
 *
 * This package contains only the most common utilities from these groups.
 * More specific test helpers are provided in other Roka packages. For example,
 * {@link https://jsr.io/@roka/git/doc/testing | **@roka/git/testing**}
 * provides temporary git repositories, and
 * {@link https://jsr.io/@roka/github/doc/testing | **@roka/github/testing**}
 * provides a fake GitHub API.
 *
 * ## Modules
 *
 *  -  {@link [fake]}: Use fake objects in tests.
 *  -  {@link [mock]}: Build test mocks for async functions.
 *
 * @module testing
 */
