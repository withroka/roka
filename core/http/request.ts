/**
 * Common HTTP request functionality. Useful for making low level requests.
 *
 * @module
 */

import { assert } from "@std/assert";
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

/** Represents an error that occurs during a request. */
export class RequestError extends Error {
  /**
   * Construct RequestError.
   *
   * @param message The error message to be associated with this error.
   * @param status The status code of the response.
   */
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "RequestError";
  }
}

/** Represents the options for an HTTP request. */
export interface RequestOptions extends RequestInit {
  /** Errors that would not cause a {@linkcode RequestError}. */
  allowedErrors?: number[];
  /** Retry options. */
  retry?: RetryOptions;
  /** The user agent to be sent with the request headers. */
  agent?: string;
  /** The authorization to be sent with the request headers. */
  token?: string;
}

/**
 * A wrapper around the Fetch API that handles common functionality.
 *
 * 1. Retries
 *
 * If response status is retryable, for example a 429, the request will be
 * retried. Default retry strategy is exponential backoff, and it can be
 * customized with {@linkcode RequestOptions.retry}.
 *
 * 2. Error handling
 *
 * The function throws a {@linkcode RequestError} for non-retryable errors and
 * retryable errors that persist. The {@linkcode RequestOptions.allowedErrors}
 * array can be used to specify status codes that should not throw an error.
 * These are returns with the response object.
 *
 * 3. Headers
 *
 * A default browser agent is always sent with the request, unless overridden
 * with {@linkcode RequestOptions.agent}.
 *
 * If set, the {@linkcode RequestOptions.token} is sent as a bearer token in the
 * `Authorization` header.
 *
 * @see {@linkcode RequestOptions} for further optional configuration.
 *
 * @param input The URL or Request object to fetch.
 * @param init Standard `fetch` init, extended with {@linkcode RequestOptions}.
 */
export async function request<T>(
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
        throw new RequestError(response.statusText, response.status);
      }
      return response;
    } catch (e: unknown) {
      caught = e;
      return undefined;
    }
  }, init?.retry);
  if (caught) throw caught;
  assert(response, "response was left undefined");
  if (!response.ok) {
    if (init?.allowedErrors?.includes(response.status)) return response;
    throw new RequestError(response.statusText, response.status);
  }
  return response;
}
