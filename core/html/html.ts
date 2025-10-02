/**
 * A library for working with HTML content, complementary to the standard
 * {@link https://jsr.io/@std/html | **@std/html**} library.
 *
 * This package only provides the {@link [plain]} module to remove HTML tags
 * from text input.
 *
 * ```ts
 * import { plain } from "@roka/html/plain";
 * import { assertEquals } from "@std/assert";
 * assertEquals(plain("<p>Hello, <b>world</b>!</p>"), "Hello, world!");
 * ```
 *
 * ## Modules
 *
 *  -  {@link [plain]}: Convert HTML to plain text.
 *
 * @module html
 */
