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
 *   await api.post<Issue>("/repos/owner/repo/issues", {
 *     title: "Test issue",
 *   });
 *   const issue = await api.get<Issue>("/repos/owner/repo/issues/1");
 * }
 * ```
 *
 * @module json
 */

import { request } from "../request.ts";

/** A JSON client returned by the {@linkcode client} function. */
export interface Client {
  /** Makes a GET request. */
  get<T>(path: string): Promise<Partial<T>>;
  /** Makes a DELETE request. */
  delete<T>(path: string): Promise<Partial<T>>;
  /** Makes a PATCH request. */
  patch<T>(path: string, body: object): Promise<Partial<T>>;
  /** Makes a POST request. */
  post<T>(path: string, body: object): Promise<Partial<T>>;
  /** Makes a PUT request. */
  put<T>(path: string, body: object): Promise<Partial<T>>;
}

/** Options for the {@linkcode client} function. */
export interface ClientOptions {
  /** The bearer token to be sent with the request headers. */
  token?: string;
  /** The user agent to be sent with the request headers. */
  agent?: string;
  /** The referrer to be sent with the request headers. */
  referrer?: string;
}

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
 *   await api.post<Issue>("/repos/owner/repo/issues", {
 *     title: "Test issue",
 *   });
 * }
 * ```
 */
export function client(url: string, options?: ClientOptions): Client {
  async function req<T>(
    method: string,
    path: string,
    body?: object,
  ): Promise<Partial<T>> {
    const response = await request(`${url}${path}`, {
      method,
      headers: {
        "Accept": "application/json; charset=UTF-8",
        ...body && { "Content-Type": "application/json; charset=UTF-8" },
        ...(options?.token && { "Authorization": `Bearer ${options.token}` }),
        ...(options?.agent && { "User-Agent": options.agent }),
        ...(options?.referrer && { "Referrer": options.referrer }),
      },
      ...body && { body: JSON.stringify(body) },
    });
    if (response.headers.get("Content-Type") === null) return {};
    return await response.json();
  }
  return {
    get: async (path) => await req("GET", path),
    delete: async (path) => await req("DELETE", path),
    patch: async (path, body) => await req("PATCH", path, body),
    put: async (path, body) => await req("PUT", path, body),
    post: async (path, body) => await req("POST", path, body),
  };
}
