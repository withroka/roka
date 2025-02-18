/**
 * JSON over HTTP. Useful for building JSON based API clients.
 *
 * @module
 */

import { request } from "@roka/http/request";

/** A JSON client returned by {@linkcode client}. */
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

/** Options for {@linkcode client}. */
export interface JsonClientOptions {
  /** The bearer token to be sent with the request headers. */
  token?: string;
  /** The user agent to be sent with the request headers. */
  agent?: string;
  /** The referrer to be sent with the request headers. */
  referrer?: string;
}

/** Creates an HTTP client for making JSON-based requests. */
export function client(
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
