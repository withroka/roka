# Style Guide

## Principles

### Prefer surrounding style over this guide

The codebase already has lint rules for strict requirements, and this guide
helps us stay consistent beyond those. If the existing style is different from
this guide but still works well, please keep writing in that way. It can be a
bit confusing for readers when styles change within the same file.

### Design simple interfaces

Interfaces are most useful when they're straightforward. Optimize for the common
case and make common tasks easy, even if it means repetition or extra work in
the implementation. Users of a library shouldn't have to think hard about how to
use it.

#### ✅ Simple function interface

```ts
/** usage: parse("feat: add new feature"); */
export function parse(message: string) {
  const [type, summary] = message.split(": ");
  return { type, summary };
}
```

#### ❌ Abstraction that hinders usability

```ts
/** usage: parser().parse("feat: add new feature"); */
export function parser() {
  return {
    parse(message: string) {
      const [type, summary] = message.split(": ");
      return { type, summary };
    },
  };
}
```

### Write simple code

Write code that's easy to understand and maintain. Prefer simplicity over
performance, but don't write O(N²) code when O(N) is just one more line. You can
always micro-optimize later if needed, or provide a native implementation with
bindings.

#### ✅ Simple and clear

```ts
export function parse(message: string) {
  const lines = message.split("\n");
  const subject = lines[0];
  const body = lines.slice(1).join("\n").trim();
  return { subject, body };
}
```

#### ❌ Premature optimization

```ts
export function parse(message: string) {
  const buffer = new Uint8Array(message.length);
  let subjectEnd = 0;
  for (let i = 0; i < message.length; i++) {
    if (message.charCodeAt(i) === 10) {
      subjectEnd = i;
      break;
    }
    buffer[i] = message.charCodeAt(i);
  }
  const subject = new TextDecoder().decode(buffer.slice(0, subjectEnd));
  const body = new TextDecoder().decode(
    buffer.slice(subjectEnd + 1, message.length),
  ).trim();
  return { subject, body };
}
```

## Code organization

### Group modules around a subject into a package

Organize related modules into packages by their subject area or domain. For
example, any functionality around Git goes into `@roka/git` instead of its own
package. You can rename modules between versions, but packages stick around
forever.

### Avoid generic packages or modules

Packages and modules like `util` or `common` are too generic and don't tell you
much about their purpose. It's better to create specific modules for what you
need. If you have a utility that doesn't fit anywhere but is useful everywhere,
it can be its own package. The `@roka/maybe` package is just that with a single
`maybe()` function.

### Prefer singular names over plural ones

Use singular names for modules and packages, "tool" instead of "tools". This
makes it easier to remember the right name and pushes you toward consistency.
The only exception is when you're extending the standard library. For example,
`@roka/streams` can supplement `@std/streams`.

### Use default modules for core functionality

The default module of a package exports what users need most. This makes the API
straightforward. Users can import directly from the package without needing to
know about submodules. For example, the `@roka/git` package exports the `git()`
function directly.

Sometimes a package doesn't have a clear primary functionality. In those cases,
you won't export anything directly, and users will import from submodules
instead. The `@roka/testing` package works this way.

### Use submodules for secondary functionality

Secondary or specialized features go in submodules. For example,
`conventional()` lives in `@roka/git/conventional`. This keeps the main package
focused, makes secondary features easier to find, and keeps the number of
packages in check.

### Avoid internal modules

Avoid creating modules that are only used internally within a package. Modules
can talk to each other through their public interfaces. If functionality needs
to be shared between modules, make it high enough quality to export publicly. If
that's not worth the effort, consider code duplication before creating internal
modules.

### Name files after their module

The default module lives in a file named after the package. For example,
`@roka/git` code goes in `git.ts`. The module tests will be under `git.test.ts`.
Avoid using `mod.ts` as the main module file.

Submodules follow the same pattern. For example, the code for
`@roka/git/conventional` goes into `conventional.ts`, and its tests go into
`conventional.test.ts`.

## Public interface

### Export functionality as functions

The core interface of a module is the function or functions it exports.
Everything else, such as types, errors or constants, is complementary. This
keeps the design simple and function-focused. It also helps findability by
making the module names predictable.

A module preferably exports a single function with the same name as the module.
For example, `conventional()` in `@roka/git/conventional`. When you have a group
of functions with multiple variants or with intimately related functionality,
you can export them from a shared module. For example, the `@roka/testing/fake`
module provides fakes by exporting multiple functions like `fakeConsole()` and
`fakeCommand()`.

### Accept at most two required parameters

Functions with many positional parameters are hard to use. Stick to two required
parameters, and use an optional `options` object for everything else. This keeps
the common case simple while giving you flexibility.

#### ✅ Simple function signature

```ts
export interface ParseOptions {
  format?: string;
  strict?: boolean;
  encoding?: string;
  maxLength?: number;
}

export function parse(input: string, options?: ParseOptions) {
  // ...
}
```

#### ❌ Too many parameters

```ts
export function parse(
  input: string,
  format: string,
  strict: boolean,
  encoding?: string,
  maxLength?: number,
) {
  // ...
}
```

### Use distinguishable parameter types

Use parameter types that can be distinguished from plain objects at runtime.
This allows the API to evolve in a backwards-compatible way even when parameter
positions change. For example, use `string`, `number`, `Array`, or `Error`.
Reserve plain objects only for the `options` parameter, unless they can be
distinguished with a well-known symbol like `Symbol.iterator`.

#### ✅ Distinguishable parameter types

```ts
export function parse(
  lines: string | string[],
  options?: { strict?: boolean },
) {
  const delimiter = options?.strict ? ": " : ":";
  if (typeof lines === "string") lines = [lines];
  return lines.map((x) => x.split(delimiter));
}
```

#### ❌ Plain objects as required parameters

```ts
export function parse(
  input: { lines?: string[] },
  config: { strict?: boolean },
) {
  const delimiter = config.strict ? ": " : ":";
  return input.lines?.map((x) => x.split(delimiter));
}
const input = JSON.parse('{"lines":["key1:value1","key2:value2"]}');
const config = JSON.parse(await Deno.readTextFile("config.json"));
parse(input, config); // fine
parse(config, input); // still fine
```

### Prefer overloads for different input variants

When a function can accept different input types that produce different types,
use function overloads instead of returning union types. You will get better
type safety and clearer documentation.

#### ✅ Function overloads

```ts
export function parse(input: string): string;
export function parse(input: string[]): string[];
export function parse(input: string | string[]): string | string[] {
  const split = (str: string) => str.split(":")[0] ?? "default";
  if (typeof input === "string") return split(input);
  return input.map(split);
}
```

#### ❌ Union return types

```ts
export function parse(input: string | string[]): string | string[] {
  const split = (str: string) => str.split(":")[0] ?? "default";
  if (typeof input === "string") return split(input);
  return input.map(split);
}
```

### Name options types after the function

The options interface for a function gets named after the function with an
`Options` suffix. This creates a clear connection between the function and its
configuration.

```ts
export interface ParseOptions {
  format?: string;
  strict?: boolean;
  encoding?: string;
  maxLength?: number;
}

export function parse(input: string, options?: ParseOptions) {
  // ...
}
```

### Use `interface` for object shapes and `type` for utilities

This is mainly for consistency, as these two language features largely overlap
with each other. Readability is improved when the `type` keyword is reserved
only for type manipulation.

```ts
export interface Parsed {
  key: string;
  value: string;
  line: number;
}

export class ParseError extends Error {
  constructor(message: string, cause?: Error) {
    super(message, { cause });
    this.name = "ParseError";
  }
}

export type Parseable = string | string[] | URL;
export type ParseResult = Parsed | ParseError;
```

### Don't export classes, except for errors

Classes add unnecessary complexity to the codebase. Interfaces and functions can
be used instead of classes in a more idiomatic TypeScript. The only exception is
for error types, where runtime type identification is often needed.

### Use optional syntax for optional fields

Use the optional field syntax (`?`) instead of explicit union with `undefined`.
It's more concise and conventional in TypeScript. With the
`exactOptionalPropertyTypes` compiler setting, this prevents mixing two
different states: an "unset" field and a field explicitly set to `undefined`.
This helps catch subtle bugs early.

#### ✅ Optional field syntax

```ts
export interface ParseOptions {
  format?: string;
  strict?: boolean;
}
```

#### ❌ Explicit undefined syntax

```ts
export interface ParseOptions {
  format: string | undefined;
  strict: boolean | undefined;
}
```

### Export all types used in function interfaces

Export all symbols used in your function interfaces. For example, if `parse()`
accepts `ParseOptions` and returns `Parsed`, you need to export both types. This
ensures your whole public interface is documented.

### Avoid re-exports

Export symbols from the module where they're defined. This ensures each symbol
has one canonical import source, keeping the public surface simple.

## Implementation

### Write inclusive code

Use gender-neutral and racially-neutral names. For example, use "blocklist"
instead of "blacklist". Avoid loaded language like "master" when "main" works
just fine. Everyone has a right to enjoy and contribute to the project. See the
[Chromium style guide](https://chromium.googlesource.com/chromium/src/+/HEAD/styleguide/inclusive_code.md)
for more guidance.

### Prefer single words over multiple words

Use shorter names when a single word gets the meaning across. Save longer names
for when they add real clarity. Or even better, think about your scope or
abstraction so single words make sense. This keeps code concise and easier to
read, while pushing you to think about the right scope and state.

#### ✅ Concise naming

```ts
export function parse(message?: string) {
  const first = message?.split("\n")[0];
  return first?.trim()?.replace(/^(fix|feat|chore):\s*/, "");
}
```

#### ❌ Long variable names

```ts
export function parse(commitMessage?: string) {
  const firstLineOfCommitMessage = commitMessage?.split("\n")[0];
  const trimmedFirstLineOfCommitMessage = firstLineOfCommitMessage?.trim();
  const commitMessageWithoutPrefix = trimmedFirstLineOfCommitMessage?.replace(
    /^(fix|feat|chore):\s*/,
    "",
  );
  return commitMessageWithoutPrefix;
}
```

### Prefer full words over abbreviations

Spell out words when you can. It improves readability and reduces ambiguity.
Abbreviations can be unclear to new readers or people unfamiliar with your
codebase. That said, widely-recognized abbreviations like "cwd" (current working
directory) or "id" (identifier) are fine when they're standard in the industry
or help keep names as single words.

### Assert code assumptions

Use assertions to validate internal assumptions and invariants in your code.
Throw `AssertionError` for conditions that should never happen if the code is
correct. These are programmer errors, not user errors.

```ts
import { assertExists } from "@std/assert";

export function parse(input: string, delimiter = ":") {
  if (!input) return undefined;
  const parts = input.split(delimiter);
  const key = parts[0];
  assertExists(key); // inform the type checker
  return key;
}
```

### Throw specific error types for runtime errors

Prefer specific error classes for different error conditions. This lets callers
catch and handle errors precisely. A good approach is to have one custom error
class per package. For example, `@roka/git` has `GitError`.

```ts
export class ParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ParseError";
  }
}

export function parse(input: string): Parsed {
  if (!input.includes(":")) {
    throw new ParseError("Input must contain delimiter");
  }
  // ...
}
```

### Include original errors as `cause`

When you catch and re-throw errors, include the original error as the `cause`.
This preserves the error chain and helps with debugging.

```ts
export async function parse(path: string) {
  try {
    const content = await Deno.readTextFile(path);
    return parseContent(content);
  } catch (error) {
    throw new ParseError("Failed to read file", { cause: error });
  }
}
```

### Write clear and actionable error messages

Write specific, actionable, and consistent error messages. End without a
punctuation. Include brief contextual data. Never include sensitive data like
tokens or passwords.

#### ✅ Clear and specific

```ts
throw new Error(`Failed to parse file at ${path}`);
throw new Error("Input must contain delimiter");
```

#### ❌ Vague or redundant

```ts
throw new Error("Error"); // Too vague
throw new Error("ParseError: failed"); // Redundant prefix
```

### Prefer minimal code with early returns

Write code that's easy to scan and understand. Skip unnecessary variables and
comments. Use early returns to cut down on nesting.

#### ✅ Minimal and clear

```ts
export function validate(input?: string): string | undefined {
  if (!input) return undefined;
  return input.trim();
}
```

#### ❌ Unnecessary complexity

```ts
export function validate(input?: string): string | undefined {
  // Check if input exists
  const hasInput = input !== undefined;

  // If no input, return undefined
  if (!hasInput) {
    return undefined;
  }

  // Trim the input
  const trimmed = input.trim();

  // Return the result
  return trimmed;
}
```

### Use guard clauses instead of nested conditions

Flatten your code by checking error conditions first and returning early. This
makes the happy path more obvious.

#### ✅ Guard clauses

```ts
export function process(value?: string): string | undefined {
  if (!value || value.length === 0) return undefined;
  return value.toLowerCase();
}
```

#### ❌ Nested conditions

```ts
export function process(value?: string): string | undefined {
  if (value !== undefined) {
    if (value.length > 0) {
      return value.toLowerCase();
    } else {
      return undefined;
    }
  } else {
    return undefined;
  }
}
```

## Testing

### Add tests for new features

Every new feature needs tests that verify it works as expected. Tests serve as
documentation and prevent regressions.

```ts
Deno.test("git().init() creates a new repository", async () => {
  const dir = await Deno.makeTempDir();
  const repo = git({ cwd: dir });
  await repo.init();
  assert(await exists(join(dir, ".git")));
});
```

### Add tests for fixed bugs

When you fix a bug, add a test that reproduces it first, then verify your fix
works. This keeps the bug from coming back.

```ts
Deno.test("parse() handles empty commit messages", () => {
  // This used to throw an error
  const result = parse("");
  assertEquals(result, undefined);
});
```

### Add tests for testing modules

Testing utilities need tests too. This ensures your testing infrastructure is
reliable and behaves as expected.

```ts
Deno.test("fakeConsole() captures log output", () => {
  using fake = fakeConsole();
  console.log("test message");
  assertEquals(fake.calls, [{ method: "log", args: ["test message"] }]);
});
```

### Name tests explicitly

Test names clearly describe what's being tested and what the expected behavior
is. Use the format: `functionName() behavior`. Skip generic names like "test 1"
or "works correctly".

#### ✅ Explicit test names

```ts
Deno.test("git().init() initializes a repository", async () => {});
Deno.test("parse() extracts commit type and summary", () => {});
Deno.test("validate() returns undefined for empty input", () => {});
```

#### ❌ Vague test names

```ts
Deno.test("init test", async () => {});
Deno.test("it works", () => {});
Deno.test("test parse", () => {});
```

## Documentation

### Use JSDoc for all public APIs

Document all public APIs using JSDoc comments. This provides IDE hover
information and generates documentation on JSR.

````ts
/**
 * Creates a new Git repository interface.
 *
 * @param options Configuration options
 * @returns A Git repository interface
 *
 * @example
 * ```ts
 * const repo = git({ cwd: "./my-project" });
 * await repo.init();
 * ```
 */
export function git(options?: GitOptions): Git {
  // ...
}
````

### Document every module with examples

Each module has a module-level JSDoc comment with a description and usage
example. This appears at the top of the generated documentation.

````ts
/**
 * Git repository operations.
 *
 * This module provides functions for working with Git repositories.
 *
 * @example
 * ```ts
 * import { git } from "@roka/git";
 *
 * const repo = git({ cwd: "./my-project" });
 * await repo.init();
 * await repo.commit("Initial commit");
 * ```
 *
 * @module
 */
````

### Document every exported symbol

All exported functions, types, interfaces, and constants need JSDoc comments.
This ensures users understand what each part of your API does.

```ts
/**
 * Options for creating a Git repository interface.
 */
export interface GitOptions {
  /**
   * Working directory of the repository.
   * @default {Deno.cwd()}
   */
  cwd?: string;
}
```

### Document missing features with `@todo`

Use `@todo` tags to document planned features or known limitations. This helps
track technical debt and informs users of current limitations.

```ts
/**
 * Pushes commits to a remote repository.
 *
 * @todo Add support for SSH authentication
 * @todo Handle merge conflicts
 */
export async function push(): Promise<void> {
  // ...
}
```

### Skip self-explanatory documentation

Avoid redundant documentation that simply restates the code. Only document
parameters, returns, and throws when they provide non-obvious information.

#### ✅ Useful documentation

```ts
/**
 * @param message Commit message in conventional commit format
 * @throws {ConventionalError} If the message format is invalid
 */
export function parse(message: string): Commit {}
```

#### ❌ Redundant documentation

```ts
/**
 * @param message The message
 * @returns A commit
 */
export function parse(message: string): Commit {}
```

### End JSDoc sentences with punctuation

All JSDoc sentences end with proper punctuation. Use periods, question marks, or
exclamation points. This keeps documentation looking professional.

```ts
/**
 * Creates a new Git repository.
 *
 * The repository is initialized with a default branch.
 */
export function init(): Promise<void> {}
```

### Format JSDoc for documentation generators

Format JSDoc tags for optimal documentation generation. Don't use dashes between
parameter names and descriptions, as they interfere with some documentation
generators.

#### ✅ Correct format

```ts
/**
 * @param cwd Working directory
 * @param author Author name
 */
```

#### ❌ Incorrect format

```ts
/**
 * @param cwd - Working directory
 * @param author - Author name
 */
```
