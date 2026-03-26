/**
 * A library with helpers for making HTTP requests.
 *
 * This package provides convenience utilities for making HTTP requests and
 * testing requests with mocks.
 *
 * The {@linkcode [request].request request} function is the core of the
 * package, providing a wrapper around the `fetch` API, while handling errors
 * and retries. The {@link [json]} module provides higher-level
 * abstractions for making JSON requests.
 *
 * ### Simple HTTP requests
 *
 * ```ts
 * import { request } from "@roka/http/request";
 *
 * (async () => {
 *   const response = await request("https://www.example.com", {
 *     method: "GET",
 *     retry: { maxAttempts: 2 },
 *   });
 *   return { response };
 * });
 * ```
 *
 * ### JSON requests
 *
 * ```ts
 * import { client } from "@roka/http/json";
 *
 * (async () => {
 *   const api = client("https://www.example.com");
 *   return await api.get<{ id: number }>("/api/path");
 * });
 * ```
 *
 * ### Retries
 *
 * Fetch calls can be retried on certain status codes, with exponential
 * back-off by default. The retry behavior can be customized with the
 * {@linkcode RequestOptions.retry retry} option.
 *
 * ```ts
 * import { request } from "@roka/http/request";
 *
 * (async () => {
 *   const response = await request("https://www.example.com", {
 *     retry: { maxAttempts: 2 },
 *   });
 *   return { response };
 * });
 * ```
 *
 * ### Caching
 *
 * The library implements the Web API
 * {@linkcode https://developer.mozilla.org/en-US/docs/Web/API/Request/cache cache}
 * property to manage a client-side HTTP cache.
 *
 * ```ts
 * import { request } from "@roka/http/request";
 *
 * (async () => {
 *   const cached = await request("https://www.example.com", {
 *     cache: "only-if-cached",
 *   });
 *   return { cached };
 * });
 * ```
 *
 * ### Error handling
 *
 * The library functions throw {@linkcode RequestError} on error responses. Some
 * errors can be allowed to pass through with the
 * {@linkcode RequestOptions.allowedErrors allowedErrors} option.
 *
 * ```ts
 * import { request } from "@roka/http/request";
 * import { STATUS_CODE } from "@std/http/status";
 *
 * (async () => {
 *   const response = await request("https://www.example.com", {
 *     allowedErrors: [STATUS_CODE.NotFound],
 *   });
 *   if (response.status === STATUS_CODE.NotFound) {
 *     // deno-lint-ignore no-console
 *     console.log("Not found");
 *   }
 * });
 * ```
 *
 * ### Mock requests for testing
 *
 * The library provides the {@linkcode [testing].mockFetch mockFetch} function
 * that mocks the global `fetch` function in tests. This allows you to record
 * and replay any HTTP request made in your code. The mock files will never
 * store authentication headers.
 *
 * ```sh
 * deno test -A fetch.test.ts --update  # record requests into mock files
 * deno test -P fetch.test.ts           # replay fetch from mock files
 * ```
 *
 * ### Modules
 *
 *  - {@link [request]}: Make simple HTTP requests
 *  - {@link [json]}: Make JSON requests
 *  - {@link [testing]}: Test with mock requests
 *
 * @module http
 */
