# Style Guide

## Principles

### Prefer existing style

The codebase already has lint rules for strict requirements, and this guide
helps stay consistent beyond those. If the existing style is different from this
guide but still works well, please keep writing in that way. It can be a bit
confusing for readers of the code when styles change within the same file.

### Design for usability

Frameworks are most useful when they're straightforward. Optimize for the common
case and make common tasks easy, even if it means repetition or extra work in
the implementation. Users shouldn't have to think hard about how to use modules
and functions.

#### ✅️ **Good**: Simple function signature

```ts
export function parse(message: string) {
  const [type, summary] = message.split(": ");
  return { type, summary };
}
```

#### ❌ **Bad**: Unnecessary abstraction

```ts
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

Simple code is easy to understand and maintain. Prefer simplicity over
performance. You can always optimize later if needed, or provide a native
implementation. However, be pragmatic. Don't write O(N²) code when O(N) is just
one more line.

#### ✅️ **Good**: Simple and clear code

```ts
export function parse(message: string) {
  const lines = message.split("\n");
  const subject = lines[0];
  const body = lines.slice(1).join("\n").trim();
  return { subject, body };
}
```

#### ❌ **Bad**: Premature optimization

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

### Write inclusive code

Neutral names should be preferred over those associated with gender or race. For
instance, use "allow" and "deny" to express permissions instead of "whitelist"
and "blacklist." Similarly, avoid loaded language like "master" when "main" is
fine. Everyone has the right to participate and contribute to the project. See
the
[Chromium style guide](https://chromium.googlesource.com/chromium/src/+/HEAD/styleguide/inclusive_code.md)
for more guidance.

## Modules

### Organize by packages and modules

Modules should be organized into packages by their subject area or domain. For
example, any functionality around Git goes into `@roka/git` instead of its own
package. You can rename modules between versions, but packages stick around
forever.

### Use default modules for core features

The default module of a package exports what users need most. This makes the API
straightforward. Users can import directly from the package without needing to
know about submodules. For example, the `@roka/git` package exports the `git()`
function directly.

Sometimes a package doesn't have a clear primary functionality. In those cases,
you won't export anything directly, and users will import from submodules
instead. The `@roka/testing` package works this way.

### Use submodules for secondary features

Secondary or specialized features should be in submodules. For example,
`conventional()` lives in `@roka/git/conventional`. This keeps the main package
focused, makes secondary features easier to find, and keeps the number of
packages in check.

### Avoid generic module names

Packages and modules like `util` or `common` are too generic and don't tell you
much about their purpose. It's better to create specific modules for what you
need. If you have a utility that doesn't fit anywhere but is useful everywhere,
it can be its own package. The `@roka/maybe` package is just that with a single
`maybe()` function.

### Avoid internal modules

Code sharing with internal modules makes it hard to limit the scope of code
changes. Modules can talk to each other through their public interfaces. If
shared functionality is needed, make it high enough quality to be public. If
that's not worth the effort, consider code duplication before creating internal
modules.

### Avoid re-exporting symbols

Symbols should have a canonical import source. This keeps the public interface
predictable and simple. Export symbols from the most specialized module. This is
usually where they're defined. For example the `conventional()` function can
only be imported from `@roka/git/conventional`, not from `@roka/git`.

### Prefer singular names

For module names, singular words, like "tool", should be preferred over plurals,
like "tools". This makes the public surface more predictable. The only exception
is when you're extending the standard library. For example, `@roka/streams` can
supplement `@std/streams`.

### Name files after their module

The default module lives in a file named after the package. For example,
`@roka/git` code goes in `git.ts`. The module tests will be under `git.test.ts`.
Avoid using `mod.ts` as the main module file.

Submodules follow the same pattern. For example, the code for
`@roka/git/conventional` goes into `conventional.ts`, and its tests go into
`conventional.test.ts`.

## Functions

### Export functionality with functions

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

### Limit required parameters

Functions with many positional parameters are hard to use. Stick to two required
parameters, and use an optional `options` object for everything else. This keeps
the common case simple while giving you flexibility.

#### ✅️ **Good**: A few parameters

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

#### ❌ **Bad**: Too many parameters

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

Parameters should only have types that can be distinguished from plain objects
at runtime. This allows the API to evolve in a backwards-compatible way even
when parameter positions change. Reserve plain objects only for the `options`
parameter, unless they can be distinguished with a well-known symbol like
`Symbol.iterator`.

#### ✅️ **Good**: Distinguishable types

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

#### ❌ **Bad**: Ambiguous plain objects

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

### Prefer function overloads

A function can accept different input types that produce different types. Use
function overloads to achieve this instead of returning union types in the
public interface. This makes the function easier to use and understand, and
improve type-safety for callers.

#### ✅️ **Good**: Function overloads

```ts
export function parse(input: string): string;
export function parse(input: string[]): string[];
export function parse(input: string | string[]): string | string[] {
  const split = (str: string) => str.split(":")[0] ?? "default";
  if (typeof input === "string") return split(input);
  return input.map(split);
}
```

#### ❌ **Bad**: Union return types

```ts
export function parse(input: string | string[]): string | string[] {
  const split = (str: string) => str.split(":")[0] ?? "default";
  if (typeof input === "string") return split(input);
  return input.map(split);
}
```

### Write flat and concise code

Code that is long and deeply indented is hard to scan and understand. Check
error conditions first and return early to keep the happy path clear and free of
nesting. Skip unnecessary comments and intermediate variables.

#### ✅️ **Good**: Flat and concise code

```ts
export function parse(input?: string): string | undefined {
  if (!input) return undefined;
  const [type] = input.split(":");
  return type?.trim();
}
```

#### ❌ **Bad**: Nested and verbose code

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

### Prefer concise naming

Shorter names are easier to read than longer names. Prefer single words and save
longer names for when they add real clarity. Or even better, design the scope or
abstraction so single words make sense.

#### ✅️ **Good**: Concise naming

```ts
export function parse(message?: string) {
  const first = message?.split("\n")[0];
  return first?.trim()?.replace(/^(fix|feat|chore):\s*/, "");
}
```

#### ❌ **Bad**: Long variable names

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

### Avoid abbreviations

Abbreviations can slow down reading for people unfamiliar with the codebase.
Spell out when possible. That said, widely-recognized industry standard
abbreviations like "cwd" (current working directory) or "id" (identifier) are
fine. These also help keep names as single words.

## Types

### Prefer `interface` over `type`

The two features for defining types in TypeScript largely overlap with each
other. For consistency, use `interface` for both data shapes and method
interfaces. Use the `type` keyword only for type manipulation.

#### 💡 **Example**: Defining types

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

### Prefer optional fields over `undefined`

The optional field syntax with `?` is semantically different than explicit union
with `undefined`. The former states that a value doesn't need to be set, while
latter states that the value `undefined` is accepted. The
`exactOptionalPropertyTypes` compiler setting prohibits mixing the two and helps
catch subtle bugs early. Prefer the optional field syntax since it is more
idiomatic and easier to use.

#### ✅️ **Good**: Optional fields

```ts
export interface ParseOptions {
  format?: string;
  strict?: boolean;
}
```

#### ❌ **Bad**: Explicit `undefined`

```ts
export interface ParseOptions {
  format: string | undefined;
  strict: boolean | undefined;
}
```

### Avoid classes except for errors

Classes add unnecessary complexity to the codebase. Method interfaces and
functions can be used instead of classes in a more idiomatic TypeScript. The
only exception is for error types, where runtime type identification is often
needed.

## Errors

### Assert assumptions

Internal assumptions and invariants should be validated with assertions. These
are conditions that should always happen if the code is correct. They make the
code robust against bugs and self-documenting. They can also steer the type
checker and simplify lines following the assertion.

#### 💡 **Example**: Using assertions

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

### Return `undefined` for missing values

Functions should produce optional results by returning a union with `undefined`.
This forces the caller to handle missing cases using the type system. One
exception is when it is unlikely that the value will be missing, in which case
throwing an error is acceptable to keep the types simpler.

#### 💡 **Example**: Optional return values

```ts
export function parse(input?: string): string | undefined {
  if (!input) return undefined;
  const [type] = input.split(":");
  return type?.trim();
}
```

### Throw errors for external conditions

Failures that happen due to unsupported usage or external conditions should
throw instances of specific error classes. A good approach is to have one custom
error class per package. For example, `@roka/git` has `GitError`.

#### 💡 **Example**: Using error classes

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

Errors can contain source information to preserve the error chain and help with
debugging. When you catch and re-throw errors, include the original error as the
`cause`.

#### 💡 **Example**: Using error causes

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

### Write clear error messages

Error messages should be specific, actionable, and consistent. Each message
should start with a brief sentence without punctuation. Optional context can be
added in the same sentence or in a separate body after an empty line. Never
include sensitive data like tokens or passwords.

#### ✅️ **Good**: Clear messages

```ts
throw new Error("Unknown commit type");
throw new Error(`Failed to parse file at ${path}`);
throw new Error([
  "Input must contain delimiter",
  "Accepted delimiters: ':', ' - '",
].join("\n\n"));
```

#### ❌ **Bad**: Vague or redundant messages

```ts
throw new Error("Error"); // too vague
throw new Error("ParseError: unknown commit type"); // redundant prefix
```

## Testing

### Add tests for all new feature

Every new feature requires tests that cover the expected behavior, edge cases,
and error conditions. Consider tests as a contract that the feature will
continue to work as expected while the codebase continues to change. Complete
coverage isn't necessary, but core functionality should be well-tested.

#### 💡 **Example**: Testing a new feature

```ts
Deno.test("parse() extracts type and summary from message", () => {
  const result = parse("feat: add new feature");
  assertEquals(result, { type: "feat", summary: "add new feature" });
});
```

### Add tests for all bug fixes

Bug fixes should include tests that verify the fix and prevent regressions. If a
bug surfaces once, it will likely resurface if not monitored and enough time
passes. Regression tests make the feature contract include all the edge cases we
encounter in the real-world.

#### 💡 **Example**: Testing a regression

```ts
Deno.test("parse() handles empty commit messages", () => {
  const result = parse("");
  assertEquals(result, undefined);
});
```

### Add tests for testing utilities

Testing utilities require tests as well. The test infrastructure must be
reliable, or you can't trust any tests that depend on it. Broken testing tools
can result in false positives, shipped bugs, and hours of debugging. The entire
test suite is only as reliable as the testing utilities it depends on.

#### 💡 **Example**: Testing a test utility

```ts
Deno.test("assertValidParse() validates parse results correctly", () => {
  const valid = { type: "feat", summary: "add feature" };
  assertValidParse(valid);
  assertThrows(() => assertValidParse({ type: "invalid" }));
});
```

### Use descriptive test names

Test names should clearly describe what's being tested and the expected
behavior. Use the format `functionName() behavior` or
`functionName({ option })
behavior` to keep names consistent and scannable. When
a test fails, the name should tell developers exactly what broke without reading
the test code.

#### ✅️ **Good**: Explicit test names

```ts
Deno.test("parse() extracts commit type", () => {});
Deno.test("parse() rejects empty input", () => {});
Deno.test("parse({ strict }) rejects missing whitespace in delimiter", () => {});
```

#### ❌ **Bad**: Vague test names

```ts
Deno.test("parse test", () => {});
Deno.test("it works", () => {});
Deno.test("empty input", () => {});
```

### Organize tests logically

Group tests by their options usage, start with no options to a logical ordering
of of options. If no logic arises, sort options alphabetically. Within each
option group, test common functionality first, then edge cases, then error
conditions.

#### 💡 **Example**: Ordering tests

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

### Document all modules

Each module needs a clear description. Good module documentation explains the
purpose, shows common usage patterns, and helps developers decide if this is the
right module for their needs. Examples should be valid code snippets.

#### 💡 **Example**: Documenting a module

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

### Document public functions

Each public function needs a clear description and practical examples. Good
function documentation explains what the function does and how it is used.
Examples should be valid code snippets.

#### 💡 **Example**: Documenting a function

````ts
/**
 * Parses a conventional commit message into its components.
 *
 * @example
 * ```ts
 * const result = parse("feat: add new feature");
 * // "feat"
 * ```
 * @param message Commit message in conventional commit format
 */
export function parse(message: string): string {}
````

### Avoid redundant documentation

Self-explanatory parameters and return values should not be documented. Document
only when additional context helps understanding. Omit type annotations if they
are already provided in the signature. Don't use dashes between parameter names
and descriptions.

#### ✅️ **Good**: Valuable documentation

```ts
/**
 * Parses a conventional commit message into its components.
 *
 * @param message Commit summary string in "type: summary" form
 * @param options Configuration for parse behavior
 * @throws {ParseError} If the message format is invalid
 */
export function parse(message: string, options?: ParseOptions): Parsed {}
```

#### ❌ **Bad**: Redundant documentation

```ts
/**
 * Parses a message.
 *
 * @param {string} message - The message
 * @param options The options to the function
 * @returns The parsed string
 */
export function parse(message: string, options?: ParseOptions): Parsed {}
```

### Document all exported symbols

In addition to functions, other exported symbols such as types or interfaces
need documentation. Anything exported is part of the public interface and needs
an explanation what it is for. Comprehensive documentation makes the entire API
discoverable and understandable.

#### 💡 **Example**: Documenting an interface

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

### Use indicative mood in descriptions

Function descriptions should begin with a verb phrase that describes what the
function does. Write this description in the third person indicative mood: "[the
function] does something". Don't write descriptions in an imperative sentence:
"do something". The same applies to descriptions for parameters and fields that
being with a verb.

#### ✅️ **Good**: Indicative mood

```ts
/**
 * Parses a conventional commit message into its components.
 *
 * @param message Commit message in conventional commit format
 */
export function parse(message: string): Parsed {}

/**
 * Options for configuring parse behavior.
 */
export interface ParseOptions {
  /**
   * Enables strict whitespace validation in delimiters.
   */
  strict?: boolean;
}
```

#### ❌ **Bad**: Imperative mood

```ts
/**
 * Parse a conventional commit message into its components.
 *
 * @param message Commit message to parse
 */
export function parse(message: string): Parsed {}

/**
 * Options for configuring parse behavior.
 */
export interface ParseOptions {
  /**
   * Enable strict whitespace validation in delimiters.
   */
  strict?: boolean;
}
```

### Document limitations with `@todo`

The `@todo` tags can document known limitations and missing features directly in
the code. These are intended as an inline guidance for the next person on the
current state of the code, and not as a replacement for project management. Keep
`@todos`s brief, specific and actionable.

#### 💡 **Example**: Documenting limitations

```ts
/**
 * Parses a conventional commit message into its components.
 *
 * @todo Add support for multi-line commit bodies.
 * @todo Validate commit type against allowed types.
 */
export function parse(message: string) {
  // ...
}
```

### End sentences with punctuation

All JSDoc sentences should end with proper punctuation.

#### ✅️ **Good**: Sentence with punctuation

```ts
/** Parses a conventional commit message. */
export function parse(message: string) {}
```

#### ❌ **Bad**: Sentence without punctuation

```ts
/** Parses a conventional commit message */
export function parse(message: string) {}
```
