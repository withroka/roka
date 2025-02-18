import { assert } from "@std/assert/assert";
import { omit } from "@std/collections";
import { basename, dirname, fromFileUrl, isAbsolute, join } from "@std/path";
import { MockError, stub } from "@std/testing/mock";

export { MockError } from "@std/testing/mock";

/** The mode of mock. */
export type MockMode = "replay" | "update";

/** Options for mocking functions, like {@linkcode mockFetch}. */
export interface MockOptions {
  /**
   * Mock output directory.
   * @default {"__mocks__"}
   */
  dir?: string;
  /**
   * Mock mode. Defaults to {@code "replay"}, unless the `-u` or `--update` flag
   * is passed, in which case this will be set to {@code "update"}. This option
   * takes higher priority than the update flag.
   */
  mode?: MockMode;
  /**
   * Name of the mock to use in the mock file.
   */
  name?: string;
  /**
   * Mock output path.
   *
   * If both {@linkcode MockOptions.dir} and {@linkcode MockOptions.path} are
   * specified, the `dir` option will be ignored and the `path` option will be
   * handled as normal.
   */
  path?: string;
}

interface Mock {
  name: string;
  options: MockOptions | undefined;
  path: string;
  current: unknown[];
  recorded: unknown[];
}

class MockManager {
  static instance = new MockManager();
  private paths = new Map<string, Record<string, unknown[]>>();
  private mocks = new Map<string, Mock>();

  private constructor() {
    addEventListener("unload", () => this.close());
  }

  async load<T>(
    t: Deno.TestContext,
    component: string,
    options: MockOptions | undefined,
  ): Promise<T[]> {
    const path = MockManager.mockPath(t, options);
    if (!this.paths.has(path)) {
      let records: Record<string, unknown[]>;
      try {
        const { mock } = await import(path);
        records = mock;
      } catch (e: unknown) {
        if (!(e instanceof TypeError)) throw e;
        if (mockMode(options) === "replay") {
          throw new MockError(`No mock found: ${path}`);
        }
        records = {};
      }
      if (!this.paths.has(path)) {
        this.paths.set(path, records);
      }
    }
    const name = MockManager.mockName(t, component, options);
    const mocks = this.paths.get(path);
    const mock = mocks && mocks[name];
    this.mocks.set(name, {
      name,
      options,
      path,
      current: mock ?? [],
      recorded: [],
    });
    return (mock ?? []) as T[];
  }

  record(
    t: Deno.TestContext,
    component: string,
    result: object,
    options?: MockOptions,
  ) {
    const name = MockManager.mockName(t, component, options);
    const records = this.mocks.get(name)?.recorded;
    assert(records !== undefined, "Mock not loaded");
    records.push(result);
  }

  private static mockPath(
    context: Deno.TestContext,
    options: MockOptions | undefined,
  ): string {
    if (options?.path && isAbsolute(options.path)) return options.path;
    return join(
      dirname(fromFileUrl(context.origin)),
      options?.path ?? join(
        options?.dir ?? "__mocks__",
        `${basename(context.origin)}.mock`,
      ),
    );
  }

  private static mockName(
    context: Deno.TestContext,
    component: string,
    options: MockOptions | undefined,
  ): string {
    if (options?.name) return options?.name;
    const breadcrumb = [context.name, component];
    while (context.parent) {
      breadcrumb.unshift(context.parent.name);
      context = context.parent;
    }
    return breadcrumb.join(" > ");
  }

  private serialize(calls: unknown[]): string {
    return Deno.inspect(calls, {
      breakLength: Infinity,
      compact: false,
      depth: Infinity,
      iterableLimit: Infinity,
      sorted: true,
      strAbbreviateSize: Infinity,
      trailingComma: true,
    }).replaceAll("\r", "\\r");
  }

  private close() {
    const updatedNames: string[] = [];
    const removedNames: string[] = [];
    for (const mocks of this.paths.values()) {
      removedNames.push(
        ...Object.keys(mocks).filter((mock) => !this.mocks.has(mock)),
      );
    }
    const byPath = Map.groupBy(this.mocks.values(), (mock) => mock.path);
    for (const [path, mocks] of byPath.entries()) {
      const updated = mocks.filter((mock) =>
        mockMode(mock.options) === "update"
      );
      if (!updated.length) continue;
      const contents = [`export const mock = {};\n`];
      for (const mock of updated) {
        const before = this.serialize(mock.current);
        const after = this.serialize(mock.recorded);
        if (before !== after) updatedNames.push(mock.name);
        contents.push(`mock[\`${mock.name}\`] =\n${after};\n`);
      }
      Deno.mkdirSync(dirname(path), { recursive: true });
      Deno.writeTextFileSync(path, contents.join("\n"));
    }
    if (updatedNames.length) {
      // deno-lint-ignore no-console
      console.log(
        `%c\n > ${updatedNames.length} ${
          updatedNames.length === 1 ? "mock" : "mocks"
        } updated.`,
        "color: green; font-weight: bold;",
      );
      for (const name of updatedNames) {
        // deno-lint-ignore no-console
        console.log(`%c   • ${name}`, "color: green;");
      }
    }
    if (removedNames.length) {
      // deno-lint-ignore no-console
      console.log(
        `%c\n > ${removedNames.length} ${
          removedNames.length === 1 ? "mock" : "mocks"
        } removed.`,
        "color: red; font-weight: bold;",
      );
    }
    for (const name of removedNames) {
      // deno-lint-ignore no-console
      console.log(`%c   • ${name}`, "color: red;");
    }
  }
}

/**
 * Get the mode of the mocking system. Defaults to `replay`, unless the `-u`
 * or `--update` flag is passed, in which case this will be set to `update`.
 */
function mockMode(options: MockOptions | undefined): MockMode {
  return options?.mode ??
    (Deno.args.some((arg) => arg === "--update" || arg === "-u")
      ? "update"
      : "replay");
}

/** A mock for global fetch that records and replays responses. */
export interface MockFetch extends Disposable {
  (input: URL | Request | string, init?: RequestInit): Promise<Response>;
  /** The current mode of the mock. */
  mode: MockMode;
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
 * Usage is {@code @std/testing/snapshot} style. Running tests with `--update`
 * or `-u` flag will create a mock file in the `__mocks__` directory, using real
 * fetch calls. The mock file will be used in subsequent test runs, when the
 * these flags are not present.
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
export function mockFetch(
  context: Deno.TestContext,
  options?: MockOptions,
): MockFetch {
  let calls: FetchCall[] | undefined = undefined;
  let remaining: FetchCall[] = [];

  const stubbed = stub(globalThis, "fetch", async function (
    input: URL | Request | string,
    init?: RequestInit,
  ): Promise<Response> {
    const request = getRequestData(input, init);
    let call: FetchCall;
    if (calls === undefined) {
      let mock: FetchCall[];
      try {
        mock = await MockManager.instance.load<FetchCall>(
          context,
          "fetch",
          options,
        );
      } catch (e: unknown) {
        mock = [];
        throw e;
      }
      // another call might have loaded the mock
      if (calls === undefined) {
        calls = mock;
        remaining = [...mock];
      }
    }
    if (mockMode(options) === "update") {
      const response = await stubbed.original.call(globalThis, input, init);
      call = {
        request,
        response: await getResponseData(response),
      };
      MockManager.instance.record(context, "fetch", call, options);
    } else {
      const signature = getSignature(request);
      const found = remaining.find((call) =>
        getSignature(call.request) === signature
      );
      if (found === undefined) {
        throw new MockError(`No matching fetch call found: ${request.input}`);
      }
      remaining.splice(remaining.indexOf(found), 1);
      call = found;
    }
    return new Response(call.response.body, call.response.init);
  });

  const fetch = Object.assign(stubbed.fake, {
    mode: mockMode(options),
    original: stubbed.original,
    restore() {
      stubbed.restore();
      if (mockMode(options) === "replay") {
        if (calls === undefined) {
          throw new MockError("No fetch calls made");
        }
        if (remaining.length > 0) {
          throw new MockError(
            "Unmatched fetch calls: " +
              remaining.map((c) => getSignature(c.request)),
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
        return stubbed.restored;
      },
    },
  }) as MockFetch;
}
