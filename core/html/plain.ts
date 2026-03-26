/**
 * This module provides the {@linkcode plain} function, which removes HTML
 * tags and escapes special characters to produce plain text from HTML input.
 *
 * ```ts
 * import { plain } from "@roka/html/plain";
 * import { assertEquals } from "@std/assert";
 *
 * assertEquals(
 *   plain("<p>Hello, <b>world</b>!</p>"),
 *   "Hello, world!",
 * );
 * ```
 *
 * @module plain
 */

import { DOMParser } from "@b-fuze/deno-dom";

/**
 * Converts HTML content to plain text by removing tags and decoding special
 * characters.
 *
 * @example Decode HTML entities and strip tags
 * ```ts
 * import { plain } from "@roka/html/plain";
 * import { assertEquals } from "@std/assert";
 *
 * assertEquals(
 *   plain("<b>Hello</b> &amp; &lt;World&gt;!"),
 *   "Hello & <World>!",
 * );
 * ```
 */
export function plain(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  return doc?.body?.textContent
    .replace(/[\u200E-\u200F]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
