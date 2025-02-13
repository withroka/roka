import { retry, type RetryOptions } from "@std/async";

export { type RetryOptions } from "@std/async";

/** Represents an error that occurs during a request. */
export class RequestError extends Error {
  /**
   * Creates an instance of RequestError.
   *
   * @param msg The error message to be associated with this error.
   */
  constructor(msg: string) {
    super(msg);
    this.name = "RequestError";
  }
}

const RETRYABLE_STATUSES = [
  429, // Too many requests
  504, // Gateway timeout
];

/** Represents an HTTP request method. */
export type RequestMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

/** Represents the options for an HTTP request. */
export interface RequestOptions {
  /** Errors that would not cause a {@linkcode RequestError}. */
  allowedErrors?: string[];
  /** Request body. */
  body?: string | object;
  /** Request method. */
  method?: RequestMethod;
  /** Request headers. */
  headers?: Record<string, string>;
  /** Retry options. */
  retry?: RetryOptions;
  /** Authentication token. */
  token?: string;
  /** Referrer. */
  referrer?: string;
  /** User agent. */
  userAgent?: string;
}

/**
 * Makes an HTTP request with the given URL and options, and returns a response object.
 * Retries the request if it fails due to too many requests.
 *
 * @template T The expected response type.
 * @param url The URL to request.
 * @param options The options for the request.
 * @returns An object containing the response and optionally an error.
 * @throws {RequestError} If the response is not ok and the error type is not allowed.
 */
export async function request<T>(
  url: string,
  options: RequestOptions = {},
): Promise<{
  response: Response;
  error?: { type: string; message: string };
}> {
  const response = await retry(async () => {
    const response = await fetch(url, {
      method: options.method ?? "GET",
      headers: {
        ...options.headers,
        ...(options.token
          ? { "Authorization": `Bearer ${options.token}` }
          : {}),
        ...(options.referrer ? { "Referer": options.referrer } : {}),
        "User-Agent": options.userAgent ??
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1.1 Safari/605.1.15",
      },
      ...options.body
        ? {
          body: (typeof options.body === "string"
            ? options.body
            : JSON.stringify(options.body)),
        }
        : {},
    });
    if (RETRYABLE_STATUSES.includes(response.status)) {
      await response.body?.cancel();
      throw new RequestError(response.statusText);
    }
    return response;
  }, options.retry);

  if (!response.ok) {
    const error = await getErrorFromResponse(response);
    if (options.allowedErrors?.includes(error.type)) {
      return { response, error };
    }
    throw new RequestError(`${error.message} [${error.type}]`);
  }

  return { response };
}

async function getErrorFromResponse(
  response: Response,
): Promise<{ type: string; message: string }> {
  const text = await response.text();
  try {
    const { error } = JSON.parse(text) as {
      error: { type: string; message: string };
    };
    return error;
  } catch {
    return {
      type: response.status.toString(),
      message: response.statusText,
    };
  }
}
