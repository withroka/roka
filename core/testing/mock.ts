/**
 * Mock objects that can record and replay interactions in tests.
 *
 * This module provides the {@linkcode mock} function, which can be used to
 * create a mock double of an async function or method. The mock can be used to
 * record and replay interactions in tests.
 *
 * Mocking of non-async functions is not supported. However, a wide variety of
 * async functions can be mocked.
 *
 * The mocking system mimicks the behavior of the `@std/testing/snapshot`
 * module. Running tests with the `--update` or `-u` flag will create a mock
 * file in the `__mocks__` directory, using real calls. The mock file will be
 * used in subsequent test runs, when these flags are not present.
 *
 * Much like the snapshot system, the mock system works best when the generated
 * mock files are commited to source control. This allows for changes to mocks
 * to be reviewed alongside the code changes that caused them, and ensures that
 * the tests will pass without needing to update the mocks when the code is
 * cloned.
 *
 * @example
 * ```ts
 * import { mock } from "@roka/testing/mock";
 * import { assertEquals } from "@std/assert";
 *
 * Deno.test("mock() usage", async (t) => {
 *   using fetch = mock(t, globalThis, "fetch");
 *   const response = await fetch("https://www.example.com");
 *   assertEquals(response.status, 200);
 * });
 * ```
 *
 * The mock system allows for altering the arguments and the result of the
 * original function before serializing and storing them in the mock file.
 * This might be needed in a variety of scenarios.
 *
 *  - any of the arguments is a consumable, meaning it can only be read once
 *  - the result of the function is a consumable
 *  - the original function modifies its parameters
 *  - the data contains sensitive information which cannot be stored
 *  - any argument or the result is not serializable to JavaScript code
 *
 * The `conversion` option can be used to define the custom conversion functions
 * from {@linkcode MockConversion}. All conversion functions can be both
 * synchronous and asynchronous.
 *
 * @example
 * ```ts
 * import { mock } from "@roka/testing/mock";
 *
 * Deno.test("mock() conversions", async (t) => {
 *   const _ = {
 *     async request(url: string, token: string) {
 *       const request = new Request(url, {
 *         headers: { Authorization: `Bearer ${token}` }
 *       });
 *       return await fetch(request);
 *     },
 *   };
 *   using _mock = mock(t, _, "request", {
 *     conversion: {
 *       input: {
 *         // strip sensitive information
 *         convert: (url: string): [string, string] => [url, "******"],
 *       },
 *       output: {
 *         // clone a consumable, and serialize to text
 *         convert: async (response) => await response.clone().text(),
 *         // unserialize from text
 *         revert: (text) => new Response(text),
 *       },
 *     },
 *   });
 *   await _.request("https://www.example.com", "token");
 * });
 * ```
 *
 * Note: A ready to use mock for the WEB Api `fetch` is provided by the
 * `@roka/http/testing` module.
 *
 * @module
 */

import { assert } from "@std/assert/assert";
import { dirname, fromFileUrl, parse, resolve, toFileUrl } from "@std/path";
import {
  type GetParametersFromProp,
  type GetReturnFromProp,
  MockError,
  stub,
} from "@std/testing/mock";

/**
 * The mode of mock.
 *
 *  - `replay`: The mock will replay the recorded calls from the mock file.
 *  - `update`: The mock will store the recorded calls into the mock file.
 */
export type MockMode = "replay" | "update";

/** A mock for an async function or method returned by {@linkcode mock}. */
export interface Mock<T extends (...args: Parameters<T>) => ReturnType<T>>
  extends Disposable {
  (...args: Parameters<T>): ReturnType<T>;
  /** The current mode of the mock. */
  mode: MockMode;
  /** The original function that is being mocked. */
  original: T;
  /** Whether or not the original function has been restored. */
  restored: boolean;
  /** Restores the original function instance. */
  restore(): void;
}

/** Options for {@linkcode mock}. */
export interface MockOptions {
  /**
   * Mock output directory.
   * @default {"__mocks__"}
   */
  dir?: string;
  /**
   * Mock mode. Defaults to `"replay"`, unless the `-u` or `--update` flag
   * is passed, in which case this will be set to `"update"`. This option
   * takes higher priority than the update flag.
   */
  mode?: MockMode;
  /** Name of the mock to use in the mock file. */
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

/** Conversion options for mocks. */
export interface MockConversion<
  T extends (...args: Parameters<T>) => ReturnType<T>,
  Input extends unknown[],
  Output,
> {
  /** Input conversions. */
  input?: {
    /**
     * Convert input arguments to a custom value.
     *
     * This is needed when the original input arguments cannot be serialized to
     * JavaScript code, when any argument is a consumable, or when sensitive
     * information needs to be stripped.
     *
     * The convert function must not consume the input arguments. They must be
     * left in a usable state for the original function.
     */
    convert?: (...args: Parameters<T>) => Input | Promise<Input>;
  };
  /** Output conversions. */
  output?: {
    /**
     * Convert output to a custom value.
     *
     * This is needed when the result value cannot be serialized to JavaScript
     * code, when the output is a consumable, or when sensitive information
     * needs to be stripped.
     *
     * The convert function must not consume the result. It must be left in a
     * usable state for the callers of the original function.
     */
    convert?: (result: Awaited<ReturnType<T>>) => Output | Promise<Output>;
    /**
     * Revert output to the original format.
     *
     * This is needed when the output was converted to a custom value that is
     * not compatible with the original format.
     */
    revert?: (data: Output) => Awaited<ReturnType<T>> | ReturnType<T>;
  };
}

/**
 * Create a mock for an async function.
 *
 * Usage is `@std/testing/snapshot` style. Running tests with `--update`
 * or `-u` flag will create a mock file in the `__mocks__` directory, using real
 * calls to the original function. The mock file will be used in subsequent test
 * runs, when the these flags are not present.
 *
 * When running tests with the mock, results will be returned from matching
 * calls with the same input. If no matching call is found, or, if at the end of
 * the test, there are still unhandled calls, a ` MockError` will be thrown.
 *
 * The returned mock is a disposable object. This allows for the mock to be used
 * in a `using` block, and for the original function to be restored when the
 * block is exited. Alternatively, the `restore` method can be called manually
 * to restore the original function.
 *
 * @example
 * ```ts
 * import { mock } from "@roka/testing/mock";
 * import { assertEquals } from "@std/assert";
 *
 * Deno.test("mock() as a disposable", async (t) => {
 *   const _ = { func: async () => await Promise.resolve(42) };
 *   using func = mock(t, _, "func");
 *   assertEquals(await _.func(), 42);
 * });
 *
 * Deno.test("mock() with manual restore", async (t) => {
 *   const _ = { func: async () => await Promise.resolve(42) };
 *   const func = mock(t, _, "func");
 *   assertEquals(await _.func(), 42);
 *   func.restore();
 * });
 * ```
 *
 * When using the mock, the `--allow-read` permission must be enabled, or else
 * any calls will fail due to insufficient permissions. Additionally, when
 * updating the mock, the `--allow-write` and `--allow-net` permissions must be
 * enabled.
 *
 * The mock file that is created under the `__mocks__` directory needs to be
 * committed to version control. This allows for tests not needing to rely on
 * actual network calls, and the changes in mock behavior to be peer-reviewed.
 *
 * @param context The test context.
 * @param options Options for the mock.
 */
export function mock<
  Self extends Record<
    Prop,
    ReturnType<Self[Prop]> extends Promise<unknown>
      ? (...args: Parameters<Self[Prop]>) => ReturnType<Self[Prop]>
      : never
  >,
  Prop extends keyof Self,
  Input extends unknown[] = Parameters<Self[Prop]>,
  Output = Awaited<ReturnType<Self[Prop]>>,
>(
  context: Deno.TestContext,
  self: Self,
  property: Prop,
  options?:
    & MockOptions
    & { conversion?: MockConversion<Self[Prop], Input, Output> },
): Mock<Self[Prop]> {
  let state: MockState<Input, Output> | undefined;
  let errored = false;
  const mockContext = MockContext.get();
  const conversion = {
    input: {
      convert: options?.conversion?.input?.convert ??
        ((...args: unknown[]) => args as Input),
    },
    output: {
      convert: options?.conversion?.output?.convert ??
        ((result) => result as Output),
      revert: options?.conversion?.output?.revert ??
        ((data) => data as ReturnType<Self[Prop]>),
    },
  };
  const stubbed = stub(
    self,
    property,
    async function (...args: Parameters<Self[Prop]>) {
      try {
        if (stubbed.restored) throw new MockError("Mock already restored");
        state = await mockContext.load(context, self, property, options);
        let output: Output;
        if (mode(options) === "replay") {
          const input = await conversion.input.convert(...args);
          output = mockContext.replay(state, property, input);
        } else {
          const input = await conversion.input.convert(...args);
          const result = await stubbed.original.call(
            self,
            ...args as unknown as GetParametersFromProp<Self, Prop>,
          );
          output = await conversion.output.convert(result);
          mockContext.update(state, input, output);
        }
        return conversion.output.revert(output);
      } catch (e: unknown) {
        errored = true;
        throw e;
      }
    } as unknown as (
      ...args: GetParametersFromProp<Self, Prop>
    ) => GetReturnFromProp<Self, Prop>,
  );
  const mock = Object.assign(
    stubbed.fake as unknown as Self[Prop],
    {
      mode: mode(options),
      original: stubbed.original as unknown as Self[Prop],
      restored: false,
      restore() {
        stubbed.restore();
        if (errored) return;
        if (!state) throw new MockError("No calls made");
        if (mode(state?.options) === "update") return;
        if (state.remaining.length > 0) {
          throw new MockError(
            `Unmatched calls: ${
              state.remaining.map((c) => callText(property, c.input))
            }`,
          );
        }
      },
      [Symbol.dispose]() {
        mock.restore();
      },
    },
  );
  return Object.defineProperties(mock, {
    restored: {
      enumerable: true,
      get() {
        return stubbed.restored;
      },
    },
  });
}

function mode(options: MockOptions | undefined): MockMode {
  return options?.mode ??
    (Deno.args.some((arg) => arg === "--update" || arg === "-u")
      ? "update"
      : "replay");
}

function mockPath(
  context: Deno.TestContext,
  options: MockOptions | undefined,
): string {
  const testFile = fromFileUrl(context.origin);
  const { dir, base } = parse(testFile);
  if (options?.path) {
    return resolve(dir, options.path);
  } else if (options?.dir) {
    return resolve(dir, options.dir, `${base}.mock`);
  } else {
    return resolve(dir, "__mocks__", `${base}.mock`);
  }
}

function serialize(calls: unknown): string {
  return Deno.inspect(calls, {
    compact: false,
    depth: Infinity,
    iterableLimit: Infinity,
    sorted: true,
    strAbbreviateSize: Infinity,
    trailingComma: true,
  }).replaceAll("\r", "\\r");
}

function callText<Input extends unknown[]>(
  property: string | symbol | number,
  input: Input,
): string {
  return `${property.toString()}(${
    Object.values(input).map((v) => serialize(v)).join(", ")
  })`;
}

interface MockCall<Input, Output> {
  input: Input;
  output: Output;
}

interface MockState<Input, Output> {
  name: string;
  path: string;
  options: MockOptions | undefined;
  calls: MockCall<Input, Output>[];
  remaining: MockCall<Input, Output>[];
}

class MockContext {
  static context: MockContext;

  static get() {
    if (!this.context) {
      this.context = new MockContext();
      addEventListener("unload", () => this.context.teardown());
    }
    return this.context;
  }

  private mocks = new Map<
    string, // by path
    { // then by name
      records: Record<string, MockCall<unknown, unknown>[]>;
      states: Map<string, MockState<unknown, unknown>>;
      names: Map<string, object[]>;
    }
  >();

  async load<
    Self extends Record<Prop, object>,
    Prop extends keyof Self,
    Input,
    Output,
  >(
    context: Deno.TestContext,
    self: Self,
    property: Prop,
    options: MockOptions | undefined,
  ): Promise<MockState<Input, Output>> {
    const path = mockPath(context, options);
    if (!this.mocks.has(path)) {
      let records: Record<string, MockCall<Input, Output>[]>;
      try {
        const { mock } = await import(toFileUrl(path).toString());
        records = mock;
      } catch (e: unknown) {
        if (!(e instanceof TypeError)) throw e;
        if (mode(options) === "replay") {
          throw new MockError(`No mock found: ${path}`);
        }
        records = {};
      }
      if (!this.mocks.has(path)) {
        this.mocks.set(path, {
          records,
          states: new Map(),
          names: new Map(),
        });
      }
    }
    const mock = this.mocks.get(path);
    assert(mock !== undefined, "Mock not loaded correctly");
    const name = this.name(
      context,
      self,
      property,
      mock.names,
      options,
    );
    if (!mock.states.has(name)) {
      const name = this.name(context, self, property, mock.names, options);
      const remaining = [
        ...(mock.records[name] ?? []) as MockCall<Input, Output>[],
      ];
      mock.states.set(name, {
        name,
        path,
        options,
        calls: [],
        remaining,
      });
    }
    const state = mock.states.get(name);
    assert(state !== undefined, "State not loaded correctly");
    return state as MockState<Input, Output>;
  }

  private name<
    Self extends Record<Prop, object>,
    Prop extends keyof Self,
  >(
    context: Deno.TestContext,
    self: Self,
    property: Prop,
    names: Map<string, object[]>,
    options: MockOptions | undefined,
  ): string {
    if (options?.name) return options?.name;
    const breadcrumb = [context.name, property];
    while (context.parent) {
      breadcrumb.unshift(context.parent.name);
      context = context.parent;
    }
    const base = breadcrumb.join(" > ");
    if (!names.has(base)) names.set(base, []);
    const stubbed = self[property];
    if (!names.get(base)?.includes(stubbed)) names.get(base)?.push(stubbed);
    const index = names.get(base)?.length ?? 0;
    return `${base} ${index}`;
  }

  replay<Input extends unknown[], Output>(
    state: MockState<Input, Output>,
    property: string | symbol | number,
    input: Input,
  ): Output {
    const found = state.remaining.find((record) =>
      serialize(record.input) === serialize(input)
    );
    if (found === undefined) {
      throw new MockError(
        `No matching call found: ${callText(property, input)}`,
      );
    }
    const output = found.output;
    state.calls.push({ input, output });
    state.remaining.splice(state.remaining.indexOf(found), 1);
    return output;
  }

  update<Input, Output>(
    state: MockState<Input, Output>,
    input: Input,
    output: Output,
  ): void {
    state.calls.push({ input, output });
  }

  teardown() {
    const updatedNames: string[] = [];
    const removedNames: string[] = [];
    for (const [path, { records, states }] of this.mocks.entries()) {
      const updatedStates = Array.from(
        states.values().filter((state) => mode(state.options) === "update"),
      );
      if (!updatedStates.length) continue;
      const contents = [`export const mock = {};\n`];
      for (const state of updatedStates) {
        const record = records[state.name];
        const after = serialize(state.calls);
        if (record === undefined) updatedNames.push(state.name);
        else {
          const before = serialize(record);
          if (before !== after) updatedNames.push(state.name);
        }
        contents.push(`mock[\`${state.name}\`] =\n${after};\n`);
      }
      removedNames.push(
        ...Object.keys(records ?? {}).filter((name) => !states.has(name)),
      );
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
