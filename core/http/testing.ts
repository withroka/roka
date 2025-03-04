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

import {
  type Mock,
  mock,
  type MockMode,
  type MockOptions,
} from "@roka/testing/mock";
import { pick } from "@std/collections";

/** Options for mocking functions, like {@linkcode mockFetch}. */
export interface MockOptionsOld {
  /**
   * Mock output directory.
   * @default {"__mocks__"}
   */
  dir?: string;
  /**
   * Mock mode. Defaults to `"replay"`, unless the `-u` or `--update` flag
   * is passed, in which case this will be set to `"update"`. This option
   * takes higher priority than the update flag.
   */
  mode?: MockMode;
  /** Name of the mock to use in the mock file. */
  name?: string;
  /**
   * Mock output path.
   *
   * If both {@linkcode MockOptions.dir} and {@linkcode MockOptions.path} are
   * specified, the `dir` option will be ignored and the `path` option will be
   * handled as normal.
   */
  path?: string;
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
  options?: MockOptions,
): Mock<typeof fetch> {
  return mock(context, globalThis, "fetch", {
    conversion: {
      input: {
        async convert(
          input: RequestInfo | URL,
          init?: RequestInit,
        ): Promise<[string, RequestInit]> {
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
          const headers = stripHeaders(request.headers);
          return [request.url, {
            ...headers && { headers },
            ...body && { body },
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
          return [body, {
            ...headers && { headers },
            ...pick(response, ["status", "statusText"]),
          }];
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
