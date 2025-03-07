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
 * async function  usage() {
 *   const response = await request("https://www.example.com", {
 *     method: "GET",
 *     retry: { maxAttempts: 2 },
 *   });
 * }
 * ```
 *
 * The {@link [json]} and {@link [graphql]} modules provide higher-level
 * abstractions for making JSON and GraphQL requests, respectively.
 *
 * ```ts
 * import { jsonClient } from "@roka/http/json";
 * async function usage() {
 *   const api = jsonClient("https://www.example.com");
 *   const data = await api.get<{ id: number; }>("/api/path");
 * }
 * ```
 *
 * ## Modules
 *
 *  -  {@link [request]}: Make simple HTTP requests.
 *  -  {@link [json]}: Make JSON requests.
 *  -  {@link [graphql]}: Make GraphQL requests.
 *  -  {@link [testing]}: Test with mock requests.
 *
 * @module http
 */
