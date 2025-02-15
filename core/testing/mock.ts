import { omit } from "@std/collections";
import { basename, dirname, fromFileUrl, join } from "@std/path";
import { MockError, stub } from "@std/testing/mock";

const MOCKS = "__mocks__";

export { MockError } from "@std/testing/mock";

/** The mode of mock. */
export type MockMode = "replay" | "update";

class MockManager {
  static instance = new MockManager();
  private paths = new Map<string, Map<string, object[]>>();

  private constructor() {
    addEventListener("unload", async () => {
      await this.close();
    });
  }

  addCall(t: Deno.TestContext, name: string, result: object) {
    const path = MockManager.testPath(t);
    if (!this.paths.has(path)) this.paths.set(path, new Map());
    const test = this.paths.get(path);
    const key = MockManager.testKey(t, name);
    if (!test?.has(key)) test?.set(key, []);
    test?.get(key)?.push(result);
  }

  async getCalls<T>(t: Deno.TestContext, name: string) {
    const path = MockManager.testPath(t);
    const key = MockManager.testKey(t, name);
    try {
      const { mock } = await import(path);
      return (mock[key] ?? []) as T[];
    } catch {
      throw new MockError(`Failed to load mock: ${path} ${key}`);
    }
  }

  private static testPath(context: Deno.TestContext) {
    return join(
      dirname(fromFileUrl(context.origin)),
      MOCKS,
      `${basename(context.origin)}.mock`,
    );
  }

  private static testKey(context: Deno.TestContext, name: string) {
    const breadcrumb = [context.name, name];
    while (context.parent) {
      breadcrumb.unshift(context.parent.name);
      context = context.parent;
    }
    return breadcrumb.join(" > ");
  }

  private async close() {
    if (getMockMode() === "replay") return;

    for (const [path, test] of this.paths) {
      const contents = [`export const mock = {};\n`];
      for (const [key, calls] of test) {
        const serialized = Deno.inspect(calls, {
          breakLength: Infinity,
          compact: false,
          depth: Infinity,
          iterableLimit: Infinity,
          sorted: true,
          strAbbreviateSize: Infinity,
          trailingComma: true,
        }).replaceAll("\r", "\\r");
        contents.push(`mock[\`${key}\`] =\n${serialized};\n`);
      }
      await Deno.mkdir(dirname(path), { recursive: true });
      await Deno.writeTextFile(path, contents.join("\n"));
    }
  }
}

/**
 * Get the mode of the mocking system. Defaults to `replay`, unless the `-u`
 * or `--update` flag is passed, in which case this will be set to `update`.
 */
export function getMockMode(): MockMode {
  return Deno.args.some((arg) => arg === "--update" || arg === "-u")
    ? "update"
    : "replay";
}

/** A mock for global fetch that records and replays responses. */
export interface MockFetch extends Disposable {
  (input: URL | Request | string, init?: RequestInit): Promise<Response>;
  /** The function that is mocked. */
  original: (
    input: URL | Request | string,
    init?: RequestInit,
  ) => Promise<Response>;
  /** Whether or not the original instance method has been restored. */
  restored: boolean;
  /** If mocking an instance method, this restores the original instance method. */
  restore(): void;
}

interface FetchRequest {
  input: string;
  init?: Omit<RequestInit, "signal">;
}

interface FetchResponse {
  init: ResponseInit;
  body?: string;
}

interface FetchCall {
  request: FetchRequest;
  response: FetchResponse;
}

function getSignature(request: FetchRequest): string {
  return [
    request.input,
    request.init?.method ?? "GET",
    request.init?.body,
  ].filter((x) => x !== undefined || x !== null).join(" ").trimEnd();
}

function stripHeaders(headers: HeadersInit): HeadersInit {
  const stripped = new Headers(headers);
  stripped.delete("Authorization");
  stripped.delete("Cookie");
  stripped.delete("Set-Cookie");
  return Object.fromEntries(stripped.entries());
}

function getRequestData(
  input: URL | Request | string,
  init?: RequestInit,
): FetchRequest {
  if (input instanceof Request) {
    return getRequestData(new URL(input.url), { ...input, ...init });
  }
  if (typeof input === "string") {
    return getRequestData(new URL(input), init);
  }
  if (init) {
    init = {
      ...init?.headers ? { headers: stripHeaders(init?.headers) } : {},
      ...omit(init, ["headers", "signal"]),
    };
  }
  return {
    input: input.toString(),
    ...init ? { init } : {},
  };
}

async function getResponseData(response: Response): Promise<FetchResponse> {
  return {
    ...response?.body && { body: await response.text() },
    init: {
      status: response.status,
      statusText: response.statusText,
      headers: stripHeaders(response.headers),
    },
  };
}

/**
 * Create a mock for the global `fetch` function.
 *
 * Usage is {@link ../../std/testing/doc/snapshot/~ | @std/testing/snapshot}
 * style. Running tests with `--update` or `-u` flag will create a mock file
 * in the `__mocks__` directory, using real fetch calls. The mock file will
 * be used in subsequent test runs, when the these flags are not present.
 *
 * When running tests with the mock, responses will be returned from matching
 * requests with URL and method. If no matching request is found, or, If at the
 * end of the test, there are still unhandled calls, a {@link MockError} will
 * be thrown.
 *
 * @example
 * ```ts
 * import { mockFetch } from "@roka/testing/mock";
 * import { assertEquals } from "@std/assert";
 *
 * Deno.test("mockFetch", async (t) => {
 *  using fetch = mockFetch(t);
 *  const response = await fetch("https://example.com");
 *  assertEquals(response.status, 200);
 * });
 * ```
 *
 * When using the mock, the `--allow-read` permission must be enabled, or else
 * any calls to `fetch` will fail due to insufficient permissions. Additionally,
 * when updating the mock, the `--allow-write` and `--allow-net` permissions
 * must be enabled.
 *
 * The mock file that is created under the `__mocks__` directory needs to be
 * committed to version control. This allows for tests not needing to rely on
 * actual network calls, and the changes in mock behavior to be peer-reviewed.
 *
 * @param context The test context.
 * @returns The mock fetch instance.
 */
export function mockFetch(context: Deno.TestContext): MockFetch {
  let calls: FetchCall[] | undefined = undefined;

  const spy = stub(globalThis, "fetch", async function (
    input: URL | Request | string,
    init?: RequestInit,
  ) {
    const request = getRequestData(input, init);
    let call: FetchCall;
    if (getMockMode() === "update") {
      const response = await spy.original.call(globalThis, input, init);
      call = {
        request,
        response: await getResponseData(response),
      };
      MockManager.instance.addCall(context, "fetch", call);
    } else {
      if (!calls) {
        calls = await MockManager.instance.getCalls<FetchCall>(
          context,
          "fetch",
        );
      }
      const signature = getSignature(request);
      const found = calls?.find((call) =>
        getSignature(call.request) === signature
      );
      if (found === undefined) {
        throw new MockError(`No matching fetch call found: ${request.input}`);
      }
      calls.splice(calls.indexOf(found), 1);
      call = found;
    }
    return new Response(call.response.body, call.response.init);
  });

  const fetch = Object.assign(spy.fake, {
    original: spy.original,
    restore() {
      spy.restore();
      if (getMockMode() === "replay") {
        if (calls === undefined) {
          throw new MockError("No fetch calls made");
        }
        if (calls.length > 0) {
          throw new MockError(
            "Unmatched fetch calls: " +
              calls.map((c) => getSignature(c.request)),
          );
        }
      }
    },
    [Symbol.dispose]() {
      fetch.restore();
    },
  });

  return Object.defineProperties(fetch, {
    restored: {
      enumerable: true,
      get() {
        return spy.restored;
      },
    },
  }) as MockFetch;
}
