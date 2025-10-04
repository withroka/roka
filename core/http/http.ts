/**
 * A library with helpers for making HTTP requests.
 *
 * This package provides convenience utilities for making HTTP requests and
 * testing requests with mocks.
 *
 * The {@linkcode [request].request | request} function is the core of the
 * package, providing a wrapper around the `fetch` API, while handling errors
 * and retries.
 *
 * ```ts
 * import { request } from "@roka/http/request";
 * (async () => {
 *   const response = await request("https://www.example.com", {
 *     method: "GET",
 *     retry: { maxAttempts: 2 },
 *   });
 *   return { response };
 * });
 * ```
 *
 * The {@link [json]} module provides higher-level
 * abstractions for making JSON requests.
 *
 * ```ts
 * import { client } from "@roka/http/json";
 * (async () => {
 *   const api = client("https://www.example.com");
 *   return await api.get<{ id: number }>("/api/path");
 * });
 * ```
 *
 * ## Modules
 *
 *  -  {@link [request]}: Make simple HTTP requests.
 *  -  {@link [json]}: Make JSON requests.
 *  -  {@link [testing]}: Test with mock requests.
 *
 * @module http
 */
