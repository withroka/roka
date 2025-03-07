/**
 * A library for making test writing easier.
 *
 * This package provides utilities for testing code to complement the "mock"
 * and "snapshot" systems of the standard library {@link [jsr:@std/testing]}.
 * The functionality provided here is split into the groups of *fake*, *mock*,
 * and *temporary* objects.
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
 * the {@link [jsr:@roka/http]} module to record and replay real HTTP calls.
 *
 * ```ts
 * import { mock } from "@roka/testing/mock";
 * Deno.test("mock()", async (t) => {
 *   using fetch = mock(t, globalThis, "fetch");
 *   await fetch("https://www.example.com");
 * });
 * ```
 *
 * Finally, "**temp**" objects are real objects that are created and disposed
 * of during the lifetime of a test. The {@linkcode [temp].tempDirectory}
 * function is an example.
 *
 * ```ts
 * import { tempDirectory } from "@roka/testing/temp";
 * Deno.test("tempDirectory()", async (t) => {
 *   await using directory = await tempDirectory();
 * });
 * ```
 *
 * The modules of this package contain only the most common utilities from
 * these groups. More specific test helpers are provided in other Roka
 * packages. For example, {@link [jsr:@roka/git]} provides temporary git
 * repositories, and {@link [jsr:@roka/github]} provides a fake GitHub API.
 *
 * ## Modules
 *
 *  -  {@link [fake]}: Use fake objects in tests.
 *  -  {@link [mock]}: Build test mocks for async functions.
 *  -  {@link [temp]}: Create temporary resources in tests.
 *
 * @module testing
 */
