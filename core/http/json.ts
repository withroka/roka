/**
 * This module provides the {@linkcode jsonClient} function to make JSON requests
 * and receive JSON responses. It is useful for building JSON based API clients.
 *
 * ```ts
 * import { jsonClient } from "@roka/http/json";
 * async function usage() {
 *   interface Issue { number: number; state: string; };
 *   const api = jsonClient("https://api.github.com");
 *   await api.post<Issue>("/repos/owner/repo/issues", {
 *     title: "Test issue",
 *   });
 *   const issue = await api.get<Issue>("/repos/owner/repo/issues/1");
 * }
 * ```
 *
 * @module json
 */

import { request } from "@roka/http/request";

/** A JSON client returned by {@linkcode jsonClient}. */
export interface JsonClient {
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

/** Options for {@linkcode jsonClient}. */
export interface JsonClientOptions {
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
 * import { jsonClient } from "@roka/http/json";
 * async function usage() {
 *   interface Issue { number: number; state: string; };
 *   const api = jsonClient("https://api.github.com");
 *   const issue = await api.get<Issue>("/repos/owner/repo/issues/1");
 * }
 * ```
 *
 * @example Make an authenticated JSON request.
 * ```ts
 * import { jsonClient } from "@roka/http/json";
 * async function usage() {
 *   interface Issue { number: number; state: string; };
 *   const api = jsonClient("https://api.github.com", {
 *     token: "TOKEN",
 *   });
 *   await api.post<Issue>("/repos/owner/repo/issues", {
 *     title: "Test issue",
 *   });
 * }
 * ```
 */
export function jsonClient(
  url: string,
  options?: JsonClientOptions,
): JsonClient {
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
    async get(path) {
      return await req("GET", path);
    },
    async delete(path) {
      return await req("DELETE", path);
    },
    async patch(path, body) {
      return await req("PATCH", path, body);
    },
    async put(path, body) {
      return await req("PUT", path, body);
    },
    async post(path, body) {
      return await req("POST", path, body);
    },
  };
}
