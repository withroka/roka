/**
 * This module provides the {@linkcode plain} function, which  removes HTML
 * tags and escapes special characters to produce plain text from HTML input.
 *
 * ```ts
 * import { plain } from "@roka/html/plain";
 * const text = plain("<p>Hello, <b>world</b>!</p>");  // "Hello, world!"
 * ```
 *
 * @module plain
 */

import { DOMParser } from "@b-fuze/deno-dom";

/**
 * Converts HTML content to plain text by removing tags and decoding special
 * characters.
 *
 * @example Basic usage.
 * ```ts
 * import { plain } from "@roka/html/plain";
 * import { assertEquals } from "@std/assert";
 * const text = plain("<p>Hello, <b>world</b>!</p>");
 * assertEquals(text, "Hello, world!");
 * ```
 */
export function plain(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  return doc?.body?.textContent
    .replace(/[\u200E-\u200F]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
