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

### Write flat code with early returns

Write code that's easy to scan and understand. Check error conditions first and
return early to keep the happy path clear and free of nesting. Skip unnecessary
variables and comments when the code speaks for itself. Flat code reads linearly
without indentation creep, making the main logic obvious at a glance.

#### ✅ Flat and clear

```ts
export function parse(input?: string): string | undefined {
  if (!input) return undefined;
  const [type] = input.split(":");
  return type?.trim();
}
```

#### ❌ Nested and verbose

```ts
export function parse(input?: string): string | undefined {
  // check if we have input
  if (input !== undefined) {
    // check if input has content
    if (input.length > 0) {
      // split on delimiter
      const parts = input.split(":");
      const type = parts[0];

      // check if type exists
      if (type) {
        // trim and return
        return type.trim();
      } else {
        // no type found
        return undefined;
      }
    } else {
      // empty input
      return undefined;
    }
  }

  // there was no input
  return undefined;
}
```

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

Write specific, actionable, and consistent error messages. End without
punctuation. Include brief contextual data. Never include sensitive data like
tokens or passwords.

#### ✅ Clear and specific

```ts
throw new Error("Unknown commit type");
throw new Error("Input must contain delimiter");
throw new Error(`Failed to parse file at ${path}`);
```

#### ❌ Vague or redundant

```ts
throw new Error("Error"); // too vague
throw new Error("ParseError: unknown commit type"); // redundant prefix
```

## Testing

### Add tests for new features

Every new feature requires tests that cover the expected behavior, edge cases,
and error conditions. Consider tests as a contract that the feature will
continue to work as expected while the codebase continues to change. Complete
coverage isn't necessary, but core functionality should be well-tested.

```ts
Deno.test("parse() extracts type and summary from message", () => {
  const result = parse("feat: add new feature");
  assertEquals(result, { type: "feat", summary: "add new feature" });
});
```

### Add tests for fixed bugs

Bug fixes should include tests that verify the fix and prevent regressions. If a
bug surfaces once, it will likely resurface if not monitored and enough time
passes. Regression tests make the feature contract include all the edge cases we
encounter in the real-world.

```ts
Deno.test("parse() handles empty commit messages", () => {
  const result = parse("");
  assertEquals(result, undefined);
});
```

### Add tests for testing modules

Testing utilities require tests as well. The test infrastructure must be
reliable, or you can't trust any tests that depend on it. Broken testing tools
can result in false positives, shipped bugs, and hours of debugging. The entire
test suite is only as reliable as the testing utilities it depends on.

```ts
Deno.test("assertValidParse() validates parse results correctly", () => {
  const valid = { type: "feat", summary: "add feature" };
  assertValidParse(valid);
  assertThrows(() => assertValidParse({ type: "invalid" }));
});
```

### Name tests explicitly

Test names should clearly describe what's being tested and the expected
behavior. Use the format `functionName() behavior` or
`functionName({ option })
behavior` to keep names consistent and scannable. When
a test fails, the name should tell developers exactly what broke without reading
the test code.

#### ✅ Explicit test names

```ts
Deno.test("parse() extracts commit type", () => {});
Deno.test("parse() rejects empty input", () => {});
Deno.test("parse({ strict }) rejects missing whitespace in delimiter", () => {});
```

#### ❌ Vague test names

```ts
Deno.test("parse test", () => {});
Deno.test("it works", () => {});
Deno.test("empty input", () => {});
```

### Order tests by complexity and configuration

Order tests from simple to complex, starting with default functionality before
moving to configured behavior. Within each configuration, test the happy path
first, then edge cases, then error conditions. Organize options logically based
on context, or alphabetically if no logic applies.

```ts
Deno.test("parse() extracts type and summary", () => {});
Deno.test("parse() handles single-word messages", () => {});
Deno.test("parse() rejects empty input", () => {});
Deno.test("parse({ format }) uses custom format", () => {});
Deno.test("parse({ format }) rejects invalid format", () => {});
Deno.test("parse({ strict }) enforces whitespace", () => {});
Deno.test("parse({ strict }) rejects missing space", () => {});
```

## Documentation

### Document every public function with examples

The documentation lives alongside the code, and deserves the same care. Good
documentation should explain what the function does and provide working
examples. However, skip the obvious and don't document self-explanatory
parameters or return values.

#### ✅ Clear and useful documentation

````ts
/**
 * Parses a conventional commit message into its components.
 *
 * @param message Commit message in conventional commit format
 *
 * @example
 * ```ts
 * const result = parse("feat: add new feature");
 * // Returns "feat"
 * ```
 */
export function parse(message: string): string {}
````

#### ❌ Redundant documentation

```ts
/**
 * Parses a message.
 *
 * @param message The message
 * @returns A string
 */
export function parse(message: string): string {}
```

### Document every module with examples

Each module should have a module-level JSDoc comment with a clear description
and practical usage example. This appears at the top of generated documentation
and gives users their first understanding of what the module does. Good module
documentation explains the purpose, shows common usage patterns, and helps
developers decide if this is the right module for their needs.

````ts
/**
 * Conventional commit message parsing.
 *
 * This module provides functions for parsing and validating conventional commit messages.
 *
 * @example
 * ```ts
 * import { parse } from "@roka/parse";
 *
 * const result = parse("feat: add new feature");
 * // { type: "feat", summary: "add new feature" }
 * ```
 *
 * @module parse
 */
````

### Document every exported symbol

In addition to functions, other exported symbols such as types or interfaces
need JSDoc comments. Anything exported is part of the public API and needs an
explanation what it is for. Comprehensive documentation makes the entire API
discoverable and understandable.

```ts
/**
 * Options for configuring parse behavior.
 */
export interface ParseOptions {
  /**
   * Format string for parsing the commit message.
   * @default {"conventional"}
   */
  format?: string;
  /**
   * Enforce strict whitespace rules in delimiters.
   * @default {false}
   */
  strict?: boolean;
}
```

### Use indicative mood for documentation

Document functions and fields using third-person indicative form. Functions
should describe what they do, not command the reader. This keeps documentation
consistent and reads naturally in IDE tooltips.

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
