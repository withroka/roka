/**
 * Helpers for testing.
 *
 * The `fake` module provides fake objects that can be used to
 * replace real objects in tests. For example, {@linkcode fakeConsole} is a
 * console that does not output to the terminal.
 *
 * The `mock` module provides mock objects that can be used to replay
 * interactions in tests. For example, {@linkcode mockFetch} is a fetch that
 * records and replays requests.
 *
 * The `temp` module provides disposables that can be used to
 * create temporary resources in tests. For example, {@linkcode tempDir} is a
 * temporary directory that is deleted when the test ends.
 *
 * @module
 */

export * from "./fake.ts";
export * from "./mock.ts";
export * from "./temp.ts";
