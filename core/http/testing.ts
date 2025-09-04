/**
 * This module provides the {@linkcode mockFetch} function to create a mock for
 * the global `fetch` function. The mocked fetch function can record and replay
 * all global `fetch` calls in tests.
 *
 * ```ts
 * import { mockFetch } from "@roka/http/testing";
 * Deno.test("mockFetch()", async (t) => {
 *   using fetch = mockFetch(t, {
 *     path: "__mocks__/testing.ts.mock",
 *     ignore: { headers: true },
 *   });
 *   await fetch("https://example.com");
 * });
 * ```
 *
 * The mocking system mimics the behavior of the `@std/testing/snapshot`
 * module. Running tests with the `--update` or `-u` flag will create a mock
 * file in the `__mocks__` directory, using real calls. The mock file will be
 * used in subsequent test runs when these flags are not present.
 *
 * When using the mock, the `--allow-read` permission must be enabled, or else
 * any calls will fail due to insufficient permissions. Additionally, when
 * updating the mock, the `--allow-write` and `--allow-net` permissions must be
 * enabled.
 *
 * @module testing
 */

import { type Mock, mock, type MockOptions } from "@roka/testing/mock";
import { pick } from "@std/collections";

/** Options for the {@linkcode mockFetch} function. */
export interface MockFetchOptions extends MockOptions {
  /** Limit what gets matched with replay calls. */
  ignore?: {
    /**
     * Whether to ignore the request and response headers.
     *
     * When matching calls, request headers will not be considered, and
     * response headers except "Content-Type" will not be stored in the mock
     * file.
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
 * `@roka/testing/mock` module. Running tests with the `--update` flag will
 * create a mock file in the `__mocks__` directory, using real fetch calls. The
 * mock file will be used in subsequent test runs when the flag is not present.
 *
 * In `"replay"` mode, a call to the mock will throw {@linkcode MockError} if
 * no matching call was recorded. At the end of the test, the mock will verify
 * that at least one call was made, and all recorded calls were replayed.
 *
 * @example Mock a fetch call.
 * ```ts
 * import { mockFetch } from "@roka/http/testing";
 * import { assertEquals } from "@std/assert";
 *
 * Deno.test("mockFetch()", async (t) => {
 *   using fetch = mockFetch(t, {
 *     path: "__mocks__/testing.ts.mock",
 *     ignore: { headers: true },
 *   });
 *   const response = await fetch("https://example.com");
 *   assertEquals(response.status, 200);
 * });
 * ```
 *
 * @param context The test context.
 * @param options Options for the mock.
 * @return A mock function that records and replays calls to the global `fetch`.
 */
export function mockFetch(
  context: Deno.TestContext,
  options?: MockFetchOptions,
): Mock<typeof fetch> & Disposable {
  return mock(context, globalThis, "fetch", {
    conversion: {
      input: {
        async convert(input: RequestInfo | URL, init?: RequestInit) {
          const request = input instanceof Request
            ? input.clone()
            : new Request(input, init);
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
          const contentType = response.headers.get("Content-Type");
          const headers = options?.ignore?.headers
            ? (contentType ? { "Content-Type": contentType } : undefined)
            : stripHeaders(response.headers);
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
