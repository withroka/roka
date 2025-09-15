/**
 * This module provides functions for working with HTML content, and it is
 * complementary to the standard {@link https://jsr.io/@std/html | **@std/html**}
 * library.
 *
 * This package currently only provides the {@linkcode plain} function, which
 * removes HTML tags and escapes special characters to produce plain text from
 * HTML input.
 *
 * ```ts
 * import { plain } from "@roka/html";
 * const text = plain("<p>Hello, <b>world</b>!</p>");  // "Hello, world!"
 * ```
 *
 * @module html
 */

import sanitizeHtml from "@sanitize-html";
import { unescape } from "@std/html";

/**
 * Converts HTML content to plain text by removing tags and decoding special
 * characters.
 *
 * @example Basic usage.
 * ```ts
 * import { plain } from "@roka/html";
 * import { assertEquals } from "@std/assert";
 * const text = plain("<p>Hello, <b>world</b>!</p>");
 * assertEquals(text, "Hello, world!");
 * ```
 */
export function plain(html: string): string {
  return unescape(
    sanitizeHtml(html, {
      allowedTags: [],
      allowedAttributes: {},
      nonTextTags: [
        "head",
        "style",
        "script",
        "textarea",
        "option",
        "noscript",
      ],
      enforceHtmlBoundary: true,
    })
      .replace(/[\u200E-\u200F]/g, "")
      .replace(/\s+/g, " ")
      .trim(),
  );
}
