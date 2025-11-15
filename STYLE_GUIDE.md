# Style Guide

## Principles

### Prefer existing style

The codebase already has lint rules for strict requirements, and this guide
helps us stay consistent beyond those. If the existing style is different from
this guide but still works well, please keep writing in that way. It can be a
bit confusing for readers when styles change within the same file.

### Design for usability

Frameworks are most useful when they're straightforward. Optimize for the common
case and make common tasks easy, even if it means repetition or extra work in
the implementation. Users of a framework shouldn't have to think hard about how
to use it.

**GOOD**: Simple function signature

```ts
/** usage: parse("feat: add new feature"); */
export function parse(message: string) {
  const [type, summary] = message.split(": ");
  return { type, summary };
}
```

**BAD**: Unnecessary abstraction

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

**GOOD**: Simple and clear code

```ts
export function parse(message: string) {
  const lines = message.split("\n");
  const subject = lines[0];
  const body = lines.slice(1).join("\n").trim();
  return { subject, body };
}
```

**BAD**: Premature optimization

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

Use gender-neutral and racially-neutral names. For example, use "blocklist"
instead of "blacklist". Avoid loaded language like "master" when "main" works
just fine. Everyone has a right to enjoy and contribute to the project. See the
[Chromium style guide](https://chromium.googlesource.com/chromium/src/+/HEAD/styleguide/inclusive_code.md)
for more guidance.

## Modules

### Organize by packages and modules

Organize related modules into packages by their subject area or domain. For
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

Secondary or specialized features go in submodules. For example,
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

Avoid creating modules that are only used internally within a package. Modules
can talk to each other through their public interfaces. If functionality needs
to be shared between modules, make it high enough quality to export publicly. If
that's not worth the effort, consider code duplication before creating internal
modules.

### Avoid re-exporting symbols

Export symbols from the module where they're defined. This ensures each symbol
has one canonical import source, keeping the public surface simple.

### Prefer singular names

Use singular names for modules and packages, "tool" instead of "tools". This
makes it easier to remember the right name and pushes you toward consistency.
The only exception is when you're extending the standard library. For example,
`@roka/streams` can supplement `@std/streams`.

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

**GOOD**: A few parameters

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

**BAD**: Too many parameters

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

**GOOD**: Distinguishable types

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

**BAD**: Ambiguous plain objects

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

When a function can accept different input types that produce different types,
use function overloads instead of returning union types. You will get better
type safety and clearer documentation.

**GOOD**: Function overloads

```ts
export function parse(input: string): string;
export function parse(input: string[]): string[];
export function parse(input: string | string[]): string | string[] {
  const split = (str: string) => str.split(":")[0] ?? "default";
  if (typeof input === "string") return split(input);
  return input.map(split);
}
```

**BAD**: Union return types

```ts
export function parse(input: string | string[]): string | string[] {
  const split = (str: string) => str.split(":")[0] ?? "default";
  if (typeof input === "string") return split(input);
  return input.map(split);
}
```

### Prefer flat code over nested code

Write code that's easy to scan and understand. Check error conditions first and
return early to keep the happy path clear and free of nesting. Skip unnecessary
variables and comments when the code speaks for itself. Flat code reads linearly
without indentation creep, making the main logic obvious at a glance.

**GOOD**: Flat and concise code

```ts
export function parse(input?: string): string | undefined {
  if (!input) return undefined;
  const [type] = input.split(":");
  return type?.trim();
}
```

**BAD**: Nested and verbose code

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

Use shorter names when a single word gets the meaning across. Save longer names
for when they add real clarity. Or even better, think about your scope or
abstraction so single words make sense. This keeps code concise and easier to
read, while pushing you to think about the right scope and state.

**GOOD**: Concise naming

```ts
export function parse(message?: string) {
  const first = message?.split("\n")[0];
  return first?.trim()?.replace(/^(fix|feat|chore):\s*/, "");
}
```

**BAD**: Long variable names

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

Spell out words when you can. It improves readability and reduces ambiguity.
Abbreviations can be unclear to new readers or people unfamiliar with your
codebase. That said, widely-recognized abbreviations like "cwd" (current working
directory) or "id" (identifier) are fine when they're standard in the industry
or help keep names as single words.

## Types

### Prefer `interface` over `type`

This is mainly for consistency, as these two language features largely overlap
with each other. Use `interface` for both data shapes and method interfaces.
Readability is improved when the `type` keyword is reserved only for type
manipulation.

**EXAMPLE**: Defining types

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

Use the optional field syntax (`?`) instead of explicit union with `undefined`.
It's more concise and conventional in TypeScript. With the
`exactOptionalPropertyTypes` compiler setting, this prevents mixing two
different states: an "unset" field and a field explicitly set to `undefined`.
This helps catch subtle bugs early.

**GOOD**: Optional fields

```ts
export interface ParseOptions {
  format?: string;
  strict?: boolean;
}
```

**BAD**: Explicit `undefined`

```ts
export interface ParseOptions {
  format: string | undefined;
  strict: boolean | undefined;
}
```

### Avoid classes except for errors

Classes add unnecessary complexity to the codebase. Interfaces and functions can
be used instead of classes in a more idiomatic TypeScript. The only exception is
for error types, where runtime type identification is often needed.

## Errors

### Assert assumptions

Use assertions to validate internal assumptions and invariants in your code.
Throw `AssertionError` for conditions that should never happen if the code is
correct. These are bugs, not error conditions.

**EXAMPLE**: Using assertions

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

### Throw errors for failure conditions

Throw instances of specific error classes for different failure conditions that
can happen during runtime. A good approach is to have one custom error class per
package. For example, `@roka/git` has `GitError`.

**EXAMPLE**: Using error classes

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

**EXAMPLE**: Using error causes

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

Write specific, actionable, and consistent error messages. End without
punctuation. Include brief contextual data. Never include sensitive data like
tokens or passwords.

**GOOD**: Clear messages

```ts
throw new Error("Unknown commit type");
throw new Error("Input must contain delimiter");
throw new Error(`Failed to parse file at ${path}`);
```

**BAD**: Vague or redundant messages

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

**EXAMPLE**: Testing a new feature

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

**EXAMPLE**: Testing a regression

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

**EXAMPLE**: Testing a test utility

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

**GOOD**: Explicit test names

```ts
Deno.test("parse() extracts commit type", () => {});
Deno.test("parse() rejects empty input", () => {});
Deno.test("parse({ strict }) rejects missing whitespace in delimiter", () => {});
```

**BAD**: Vague test names

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

**EXAMPLE**: Ordering tests

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

### Document all public functions

The documentation lives alongside the code, and deserves the same care. Good
documentation should explain what the function does and provide working
examples.

**EXAMPLE**: Documenting a function

````ts
/**
 * Parses a conventional commit message into its components.
 *
 * @example
 * ```ts
 * const result = parse("feat: add new feature");
 * // Returns "feat"
 * ```
 * @param message Commit message in conventional commit format
 */
export function parse(message: string): string {}
````

### Avoid redundant documentation

Skip self-explanatory parameters and return values. Document only where
additional context helps understanding. Describe parameter formats, constraints,
and error conditions when they're not obvious from the type signature. Omit
TypeScript type annotations in JSDoc since the code already provides them. Don't
use dashes between parameter names and descriptions.

**GOOD**: Valuable documentation

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

**BAD**: Redundant documentation

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

### Document all modules

Each module should have a module-level JSDoc comment with a clear description
and practical usage example. This appears at the top of generated documentation
and gives users their first understanding of what the module does. Good module
documentation explains the purpose, shows common usage patterns, and helps
developers decide if this is the right module for their needs.

**EXAMPLE**: Documenting a module

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

### Document all exported symbols

In addition to functions, other exported symbols such as types or interfaces
need JSDoc comments. Anything exported is part of the public API and needs an
explanation what it is for. Comprehensive documentation makes the entire API
discoverable and understandable.

**EXAMPLE**: Documenting an interface

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

Document functions with a description that begins with a verb phrase that
describes what the function does. Write this description in the third person
indicative mood: "[the function] does something". Don't write descriptions in an
imperative sentence: "do something". Parameters and fields are described as noun
phrases.

**GOOD**: Indicative mood

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

**BAD**: Imperative mood

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

Use `@todo` tags to document known limitations and missing features directly in
the code. These are intended as an inline guidance for the next person on the
current state of the code, and not as a replacement for project management. Keep
`@todo`s brief, specific and actionable.

**EXAMPLE**: Documenting limitations

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

All JSDoc sentences end with proper punctuation.

**GOOD**: Sentence with punctuation

```ts
/** Parses a conventional commit message. */
export function parse(message: string) {}
```

**BAD**: Sentence without punctuation

```ts
/** Parses a conventional commit message */
export function parse(message: string) {}
```
