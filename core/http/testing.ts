/**
 * Mock objects that can record and replay interactions in tests.
 *
 * The mocking system mimicks the behavior of the `@std/testing/snapshot`
 * module. Running tests with the `--update` or `-u` flag will create a mock
 * file in the `__mocks__` directory, using real calls. The mock file will be
 * used in subsequent test runs, when these flags are not present.
 *
 * @module
 */

import { type Mock, mock, type MockOptions } from "@roka/testing/mock";
import { pick } from "@std/collections";

/** Options for {@linkcode mockFetch}. */
export interface MockFetchOptions extends MockOptions {
  /** Options for matching calls from the request. */
  ignore?: {
    /**
     * Whether to ignore the request headers when matching `fetch` calls.
     *
     * Authentication headers (`Authorization`, `Cookie`, `Set-Cookie`) are
     * never stored in mock files and matched, regardless of this option.
     *
     * @default {false}
     */
    headers?: true;
  };
}

/**
 * Create a mock for the global `fetch` function.
 *
 * The behavior of this mock follows the same for any mock created with the
 * `@roka/testing/mock` module. Running tests with `--update` flag will create
 * a mock file in the `__mocks__` directory, using real fetch calls. The mock
 * file will be used in subsequent test runs, when the flag is not present.
 *
 * @example
 * ```ts
 * import { mockFetch } from "@roka/http/testing";
 * import { assertEquals } from "@std/assert";
 *
 * Deno.test("mockFetch()", async (t) => {
 *   using fetch = mockFetch(t);
 *   const response = await fetch("https://example.com");
 *   assertEquals(response.status, 200);
 * });
 * ```
 */
export function mockFetch(
  context: Deno.TestContext,
  options?: MockFetchOptions,
): Mock<typeof fetch> {
  return mock(context, globalThis, "fetch", {
    conversion: {
      input: {
        async convert(input: RequestInfo | URL, init?: RequestInit) {
          const request = input instanceof Request
            ? input.clone()
            : new Request(input, init);
          request.headers.delete("Authorization");
          request.headers.delete("Cookie");
          request.headers.delete("Set-Cookie");
          let body = request.body === null ? undefined : await request.text();
          const contentType = request.headers.get("Content-Type");
          const boundary = contentType?.match(/boundary=(\S+)/)?.[1];
          if (body && boundary) {
            body = body.replaceAll(boundary, "BOUNDARY");
            request.headers.set(
              "Content-Type",
              contentType.replace(
                boundary,
                "BOUNDARY",
              ),
            );
          }
          const headers = options?.ignore?.headers
            ? undefined
            : stripHeaders(request.headers);
          return [request.url, {
            ...body && { body },
            ...headers && { headers },
            ...pick(request, [
              "cache",
              "credentials",
              "integrity",
              "keepalive",
              "method",
              "mode",
              "redirect",
              "referrer",
              "referrerPolicy",
            ]),
          }];
        },
      },
      output: {
        async convert(response): Promise<[string | undefined, ResponseInit]> {
          response = response.clone();
          const body = response.body === null
            ? undefined
            : await response.text();
          const headers = stripHeaders(response.headers);
          const init = {
            ...headers && { headers },
            ...pick(response, ["status", "statusText"]),
          };
          return [body, init];
        },
        revert(data) {
          return new Response(...data);
        },
      },
    },
    ...options,
  });
}

function stripHeaders(headers: HeadersInit): HeadersInit {
  const stripped = new Headers(headers);
  stripped.delete("Authorization");
  stripped.delete("Cookie");
  stripped.delete("Set-Cookie");
  return Object.fromEntries(stripped.entries());
}
