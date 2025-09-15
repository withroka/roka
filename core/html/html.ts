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

import { unescape } from "@std/html";

/**
 * Converts HTML content to plain text by removing tags and decoding special
 * characters.
 *
 * This is currently implemented with a simple regular expression-based
 * approach, which may not handle all edge cases of HTML parsing. For more
 * robust HTML parsing, consider using a dedicated HTML parser library.
 *
 * @example Basic usage.
 * ```ts
 * import { plain } from "@roka/html";
 * import { assertEquals } from "@std/assert";
 * const text = plain("<p>Hello, <b>world</b>!</p>");
 * assertEquals(text, "Hello, world!");
 * ```
 *
 * @todo Rewrite with a proper HTML parser.
 */
export function plain(html: string): string {
  let prev;
  do {
    prev = html;
    html = html
      .replace(/<\s*head\b[^>]*>[\s\S]*?<\s*\/head\b[^>]*>/gi, "")
      .replace(/<\s*script\b[^>]*>[\s\S]*?<\s*\/script\b[^>]*>/gi, "")
      .replace(/<\s*style\b[^>]*>[\s\S]*?<\s*\/style\b[^>]*>/gi, "")
      .replace(/<\s*style\b[^>]*>[\s\S]*?<\s*\/style\b[^>]*>/gi, "");
  } while (html !== prev);
  return unescape(
    html
      .replace(/(?=<\s*(td|th)\b[^>]*>)/gi, " ")
      .replace(/(?=<\s*(br|hr|li)\b[^>]*>)/gi, "\n")
      .replace(/(?=<\s*(p|div|tr)\b[^>]*>)/gi, "\n\n")
      .replace(/<[^>]+>/g, "")
      .replace(/[\u200E-\u200F]/g, "")
      .replace(/\r+/g, "\n")
      .replace(/[^\S\n]+/g, " ")
      .replace(/\s*\n\s+/g, "\n")
      .trim(),
  );
}
