/**
 * This module provides the {@linkcode request} function for making HTTP
 * requests. It is a wrapper around the global `fetch` function, with
 * additional functionality for handling errors and retries.
 *
 * ```ts
 * import { request, AGENT } from "@roka/http/request";
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

import { assertExists } from "@std/assert";
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
 * An error thrown by the {@link [jsr:@roka/http]} package.
 *
 * If the error is thrown due to a response status code, the status code is
 * stored in the `status` property.
 */
export class RequestError extends Error {
  /** The status code of the response. */
  readonly status?: number;

  /**
   * Construct RequestError.
   *
   * @param message The error message to be associated with this error.
   * @param status The status code of the response.
   * @param cause The cause of the error.
   */
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
  /** The authorization token to be sent with the request headers. */
  token?: string;
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
 * @param input The URL or Request object to fetch.
 * @param init Standard `fetch` init, extended with {@linkcode RequestOptions}.
 * @returns The response object, if the request was successful, or the error is
 *          one of {@linkcode RequestOptions.allowedErrors | allowedErrors}.
 * @throws {RequestError} If the request failed with an unrecoverable error.
 */
export async function request(
  input: Request | URL | string,
  init?: RequestOptions,
): Promise<Response> {
  let caught: unknown = undefined;
  const response = await retry(async () => {
    try {
      const response = await fetch(input, {
        ...init && omit(init, ["agent", "token", "headers"]),
        headers: {
          ...init?.headers,
          ...(init?.agent && { "User-Agent": init.agent }),
          ...(init?.token && { "Authorization": `Bearer ${init.token}` }),
        },
      });
      if (RETRYABLE_STATUSES.includes(response.status)) {
        await response.body?.cancel();
        throw new RequestError(response.statusText, {
          status: response.status,
        });
      }
      return response;
    } catch (e: unknown) {
      caught = e;
      return undefined;
    }
  }, init?.retry);
  if (caught) throw caught;
  assertExists(response, "Response is undefined");
  if (!response.ok) {
    if (init?.allowedErrors?.includes(response.status)) return response;
    throw new RequestError(response.statusText, { status: response.status });
  }
  return response;
}
