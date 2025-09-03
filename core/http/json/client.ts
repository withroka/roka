/**
 * This module provides the {@linkcode client} function to make JSON
 * requests and receive JSON responses. It is useful for building JSON-based
 * API clients.
 *
 * ```ts
 * import { client } from "@roka/http/json/client";
 * async function usage() {
 *   interface Issue { number: number; state: string; };
 *   const api = client("https://api.github.com");
 *   await api.post<Issue>(
 *     "/repos/owner/repo/issues",
 *     { body: { title: "Test issue" } },
 *   );
 *   const issue = await api.get<Issue>("/repos/owner/repo/issues/1");
 * }
 * ```
 *
 * @module client
 */

import { request, type RequestOptions } from "../request.ts";

/** A JSON client returned by the {@linkcode client} function. */
export interface Client {
  /** Makes a GET request. */
  get<T>(
    path: string,
    options?: JsonRequestOptions,
  ): Promise<Partial<T>>;
  /** Makes a DELETE request. */
  delete<T>(
    path: string,
    options?: JsonRequestOptions,
  ): Promise<Partial<T>>;
  /** Makes a PATCH request. */
  patch<T>(
    path: string,
    options?: JsonRequestOptions & { body?: object },
  ): Promise<Partial<T>>;
  /** Makes a POST request. */
  post<T>(
    path: string,
    options?: JsonRequestOptions & { body?: object },
  ): Promise<Partial<T>>;
  /** Makes a PUT request. */
  put<T>(
    path: string,
    options?: JsonRequestOptions & { body?: object },
  ): Promise<Partial<T>>;
  /**
   * Makes a GET request with optional JSON body and returns the response as a
   * string.
   */
  text(
    path: string,
    options?: JsonRequestOptions & { body?: object },
  ): Promise<string>;
}

/** Options for JSON requests. */
export type JsonRequestOptions = Omit<RequestOptions, "method" | "body">;

/**
 * Creates an HTTP client for making JSON-based requests.
 *
 * @example Make a JSON request.
 * ```ts
 * import { client } from "@roka/http/json/client";
 * async function usage() {
 *   interface Issue { number: number; state: string; };
 *   const api = client("https://api.github.com");
 *   const issue = await api.get<Issue>("/repos/owner/repo/issues/1");
 * }
 * ```
 *
 * @example Make an authenticated JSON request.
 * ```ts
 * import { client } from "@roka/http/json/client";
 * async function usage() {
 *   interface Issue { number: number; state: string; };
 *   const api = client("https://api.github.com", {
 *     token: "TOKEN",
 *   });
 *   await api.post<Issue>(
 *     "/repos/owner/repo/issues",
 *     { body: { title: "Test issue" } },
 *   );
 * }
 * ```
 */
export function client(
  url: string | URL,
  options?: JsonRequestOptions,
): Client {
  const clientOptions = options;
  if (typeof url === "string") url = new URL(url);
  async function req<T>(
    method: string,
    path: string,
    options: JsonRequestOptions & { body?: object; text?: boolean } = {},
  ): Promise<Partial<T>> {
    const { body, text, ...requestOptions } = options ?? {};
    const response = await request(new URL(path, url), {
      method,
      headers: {
        "Accept": "application/json; charset=UTF-8",
        ...body && { "Content-Type": "application/json; charset=UTF-8" },
      },
      ...clientOptions,
      ...requestOptions,
      ...body && { body: JSON.stringify(body) },
    });
    if (response.headers.get("Content-Type") === null) return {};
    return text ? await response.text() as T : await response.json();
  }
  return {
    get: async (path, options) => await req("GET", path, options),
    delete: async (path, options) => await req("DELETE", path, options),
    patch: async (path, options) => await req("PATCH", path, options),
    put: async (path, options) => await req("PUT", path, options),
    post: async (path, options) => await req("POST", path, options),
    text: async (path, options) =>
      await req<string>("GET", path, { ...options, text: true }),
  };
}
