/**
 * This module provides the {@linkcode request} function for making HTTP
 * requests. It is a wrapper around the global `fetch` function, with
 * additional functionality for handling errors and retries.
 *
 * ```ts
 * import { AGENT, request } from "@roka/http/request";
 * async function usage() {
 *   const response = await request("https://www.example.com", {
 *     method: "GET",
 *     agent: AGENT.Browser,
 *   });
 * }
 * ```
 *
 * The function retries the fetch call on certain status codes, with
 * exponential back off by default. The retry behavior can be customized with
 * the {@linkcode RequestOptions.retry | retry} option.
 *
 * ```ts
 * import { request } from "@roka/http/request";
 * async function usage() {
 *   const response = await request("https://www.example.com", {
 *     retry: { maxAttempts: 2 },
 *   });
 * }
 * ```
 *
 * The function throws a {@linkcode RequestError} on error responses. Some
 * errors can be allowed to pass through with the
 * {@linkcode RequestOptions.allowedErrors | allowedErrors} option.
 *
 * ```ts
 * import { request } from "@roka/http/request";
 * import { STATUS_CODE } from "@std/http/status";
 * async function usage() {
 *   const response = await request("https://www.example.com", {
 *     allowedErrors: [STATUS_CODE.NotFound],
 *   });
 *   if (response.status === STATUS_CODE.NotFound) {
 *     console.log("Not found");
 *   }
 * }
 * ```
 *
 * @module request
 */

import { maybe } from "@roka/maybe";
import "@sigma/deno-compile-extra/cachesPolyfill";
import { retry, type RetryOptions } from "@std/async/retry";
import { omit } from "@std/collections";
import { STATUS_CODE } from "@std/http/status";

export { type RetryOptions } from "@std/async/retry";

/** Predefined agent strings. */
export const AGENT = {
  Browser:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1.1 Safari/605.1.15",
} as const;

const RETRYABLE_STATUSES: number[] = [
  STATUS_CODE.TooManyRequests,
  STATUS_CODE.ServiceUnavailable,
  STATUS_CODE.GatewayTimeout,
] as const;

/**
 * An error thrown by the `http` package.
 *
 * If the error is thrown due to a response status code, the status code is
 * stored in the `status` property.
 */
export class RequestError extends Error {
  /** The status code of the response. */
  readonly status?: number;

  /** Construct RequestError. */
  constructor(
    message: string,
    options?: { status?: number; cause?: unknown },
  ) {
    super(message, options);
    this.name = "RequestError";
    if (options?.status !== undefined) this.status = options?.status;
  }
}

/** Options for the {@linkcode request} function. */
export interface RequestOptions extends RequestInit {
  /** Errors that would not cause a {@linkcode RequestError}. */
  allowedErrors?: number[];
  /** Retry options. */
  retry?: RetryOptions;
  /** The user agent to be sent with the request headers. */
  agent?: string;
  /** The referrer to be sent with the request headers. */
  referrer?: string;
  /** The authorization token to be sent with the request headers. */
  token?: string;
  /**
   * Client cache behavior.
   * @default {"default"}
   *
   * @see https://developer.mozilla.org/en-US/docs/Web/API/Request/cache
   */
  cache?: RequestCache;
  /**
   * The cache expiration time in seconds. By default, the `max-age` from the
   * `Cache-Control` header of the response is used.
   *
   * @see https://developer.mozilla.org/en-US/docs/Web/API/Request/cache
   */
  cacheMaxAge?: number;
  /**
   * Cache store name.
   *
   * By default, client cache is shared across all requests. This parameter
   * allows to create separate cache stores.
   *
   * @see https://developer.mozilla.org/en-US/docs/Web/API/Request/cache
   */
  cacheStore?: string;
}

/**
 * A wrapper around the Fetch API that handles common functionality.
 *
 * If the response status is retryable, for example a 429, the request will be
 * retried. The default retry strategy is exponential back off, and it can be
 * customized with {@linkcode RequestOptions.retry | retry}.
 *
 * A {@linkcode RequestError} is thrown for non-retryable errors and errors
 * that persist. The {@linkcode RequestOptions.allowedErrors | allowedErrors}
 * option can be used to specify status codes that should not throw an error.
 * These are returned with the response object.
 *
 * A default browser agent is always sent with the request, unless overridden
 * with the {@linkcode RequestOptions.agent | agent} option.
 *
 * If the {@linkcode RequestOptions.token | token} option set, it is sent as a
 * bearer token in the `Authorization` header.
 *
 * The responses for `GET` requests are cached on the client side using the
 * {@link https://developer.mozilla.org/en-US/docs/Web/API/Cache | Cache API}.
 * The cache behavior can be controlled with the
 * {@linkcode RequestOptions.cache | `cache`} option.
 *
 * The returned response must be consumed or cancelled to avoid resource leaks.
 *
 * @todo Implement `no-cache` conditional request.
 * @todo Remove caching when Deno supports it in Fetch API.
 *       (https://github.com/denoland/deno/issues/3756).
 * @todo Remove cache polyfill when Deno supports it in `deno compile`.
 *
 * @param input The URL or Request object to fetch.
 * @param options Standard `fetch` init, extended with {@linkcode RequestOptions}.
 * @returns The response object, if the request was successful, or the error is
 *          one of {@linkcode RequestOptions.allowedErrors | allowedErrors}.
 * @throws {RequestError} If the request failed with an unrecoverable error.
 */
export async function request(
  input: Request | URL | string,
  options?: RequestOptions,
): Promise<Response> {
  const { cache = "default", agent, referrer, token, headers, allowedErrors } =
    options ||
    {};
  const init = {
    ...options &&
      omit(options, ["agent", "referrer", "token", "headers"]),
    headers: {
      ...headers,
      ...(agent && { "User-Agent": agent }),
      ...(referrer && { "Referer": referrer }),
      ...(token && { "Authorization": `Bearer ${token}` }),
    },
  };
  const request = new Request(input, init);
  let response: Response | undefined = undefined;
  if (request.method === "GET") response = await readCache(request, options);
  if (!response && cache === "only-if-cached") {
    response = new Response(undefined, { status: STATUS_CODE.GatewayTimeout });
  }
  if (!response) response = await makeRequest(request, options);
  if (response.ok && request.method === "GET") {
    await writeCache(request, response, options);
  }
  if (!response.ok) {
    if (allowedErrors?.includes(response.status)) return response;
    await response.body?.cancel();
    throw new RequestError(response.statusText, { status: response.status });
  }
  return response;
}

async function makeRequest(
  request: Request,
  options: RequestOptions | undefined,
): Promise<Response> {
  let caught: unknown = undefined;
  const response = await retry(async () => {
    const { value: response, error } = await maybe(() => fetch(request));
    if (error) {
      caught = error;
      return undefined;
    }
    if (RETRYABLE_STATUSES.includes(response.status)) {
      await response.body?.cancel();
      throw new RequestError(response.statusText, {
        status: response.status,
      });
    }
    return response;
  }, options?.retry);
  if (response === undefined) throw caught;
  return response;
}

async function readCache(
  request: Request,
  options: RequestOptions | undefined,
): Promise<Response | undefined> {
  const { cache = "default" } = options ?? {};
  if (!["default", "force-cache", "only-if-cached"].includes(cache)) {
    return undefined;
  }
  const store = await caches.open(options?.cacheStore || import.meta.url);
  const cached = await store.match(request);
  if (!cached?.ok) {
    cached?.body?.cancel();
    return undefined;
  }
  if (["force-cache", "only-if-cached"].includes(cache)) return cached;
  const now = new Date();
  const date = cached?.headers.get("Date");
  const expires = cached?.headers.get("Expires");
  const expired = expires ? now > new Date(expires) : false;
  const age = date ? (now.getTime() - new Date(date).getTime()) / 1000 : 0;
  const cacheControl = cached?.headers.get("Cache-Control");
  const maxAge = options?.cacheMaxAge ??
    parseInt((cacheControl?.match(/max-age=(\d+)/))?.[1] ?? "0");
  if (expired || age > maxAge) {
    await cached?.body?.cancel();
    return undefined;
  }
  return cached;
}

async function writeCache(
  request: Request,
  response: Response,
  options: RequestOptions | undefined,
): Promise<Response | undefined> {
  const { cache = "default" } = options ?? {};
  if (!["default", "force-cache", "reload", "no-cache"].includes(cache)) return;
  const store = await caches.open(options?.cacheStore || import.meta.url);
  await store.put(request, response.clone());
}

/** Clear the client cache. */
export async function clearCache(cacheStore?: string): Promise<void> {
  await caches.delete(cacheStore ?? import.meta.url);
}
