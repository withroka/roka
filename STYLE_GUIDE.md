# Style Guide

## Principles

### Prefer existing style

The codebase already has lint rules for strict requirements, and this guide
helps stay consistent beyond those. When this guide conflicts with existing
code, please keep writing in the existing style. It can be confusing for readers
when styles change within the same file.

### Design for usability

Frameworks are most useful when they're straightforward. Optimize for what 80%
of users will do 80% of the time. Make common tasks easy, even if it means
repetition or extra work in the implementation. Users shouldn't have to think
hard about how to use modules and functions.

✅️ **Good**: Simple function signature

```ts
export function parse(subject: string) {
  const [type, description] = subject.split(": ", 2);
  return { type, description };
}
```

❌ **Bad**: Unnecessary abstraction

```ts
export function parser() {
  return {
    parse(subject: string) {
      const [type, description] = subject.split(": ", 2);
      return { type, description };
    },
  };
}
```

### Write simple code

Simple code is easy to understand and maintain. Prefer simplicity over
performance unless profiling shows a real bottleneck. Don't optimize
speculatively before measuring. Yet, be pragmatic. Don't write O(N²) code when
O(N) is just one more line.

✅️ **Good**: Simple and clear code

```ts
export function parse(subject: string) {
  const [type, description] = subject.split(": ", 2);
  return { type, description };
}
```

❌ **Bad**: Premature optimization

```ts
export function parse(subject: string) {
  const index = subject.indexOf(": ");
  if (index === -1) return { type: subject, description: undefined };
  const type = subject.substring(0, index);
  const description = subject.substring(index + 2);
  return { type, description };
}
```

### Write inclusive code

Neutral names should be preferred over those associated with gender, race, or
other personal characteristics. For instance, use _"allow"_ and _"deny"_ to
express permissions instead of _"whitelist"_ and _"blacklist."_ Similarly, avoid
loaded language like _"master"_ when _"main"_ is fine. Everyone has the right to
participate and contribute to the project. See the
[Chromium style guide](https://chromium.googlesource.com/chromium/src/+/HEAD/styleguide/inclusive_code.md)
for more guidance.

## Modules

### Organize by packages and modules

Modules should be organized into packages by their subject area or domain. For
example, any functionality around Git goes into `@roka/git` instead of its own
package. Modules can be renamed between versions, but packages are forever.

### Use default modules for core features

The default module of a package exports what users need most. This makes the API
straightforward. Users can import directly from the package without needing to
know about submodules. For example, the `@roka/git` package exports the `git()`
function directly.

When a package serves as a collection of related functionality where no single
function dominates, nothing will be exported from the main module, and users
will import from submodules instead. The `@roka/testing` package works this way.

### Use submodules for secondary features

Secondary or specialized features should be in submodules. For example,
`conventional()` lives in `@roka/git/conventional`. This keeps the main package
focused, makes secondary features easier to find, and keeps the number of
packages in check.

### Avoid generic utility modules

Large helper modules, such as `util` or `common`, gather many concerns into a
single place and expose them to a significant portion of the codebase. It's
better to create dedicated modules for specific needs. If a function doesn't fit
in anywhere but is useful everywhere, it can be its own package. The
`@roka/maybe` package does that with a single `maybe()` function.

### Avoid internal modules

Code sharing can introduce intricate coupling, making code changes trickier.
When shared functionality is needed, prefer code duplication over internal
modules. If duplication feels wrong, this might be a sign of poor abstraction.
Either merge the modules or extract the shared code into its own public module.

### Avoid re-exporting symbols

Symbols should have a canonical import source. This keeps the public interface
predictable and simple. Export symbols from the most specialized module. This is
usually where they're defined. For example, the `conventional()` function can
only be imported from `@roka/git/conventional`, not from `@roka/git`.

### Prefer singular names

For module names, singular words, like _"tool"_, should be preferred over
plurals, like _"tools"_. This makes the public surface more predictable. The
only exception is when you're extending the standard library. For example,
`@roka/streams` can extend `@std/streams`.

### Name files after their module

The default module lives in a file named after the package. For example,
`@roka/git` code goes in `git.ts`. The module tests will be under `git.test.ts`.
Avoid using `mod.ts` as the main module file.

Submodules follow the same pattern. For example, the code for
`@roka/git/conventional` goes into `conventional.ts`, and its tests go into
`conventional.test.ts`.

## Functions

### Design around functions

Functions are the primary abstraction. Everything else, including types, errors,
and constants, are complementary. Export a single function with the same name as
the module. For instance, the `conventional()` function is exported in the
`@roka/git/conventional` module. Alternatively, a group of functions with a
closely related purpose can be exported from a single module. For example, the
`@roka/testing/fake` module provides fakes by exporting multiple functions such
as `fakeConsole()` and `fakeCommand()`.

### Limit required parameters

Functions with many positional parameters are hard to use. Stick to two required
parameters and use an optional `options` object for everything else. This keeps
the common case simple while providing flexibility.

✅️ **Good**: A few parameters

```ts
export interface ParseOptions {
  delimiter?: string;
  strict?: boolean;
  trim?: boolean;
}

export function parse(subject: string, options?: ParseOptions) {
  const { delimiter = ": ", strict = false, trim = false } = options ?? {};
  const [type, description] = subject.split(delimiter, 2);
  if (strict && (!type || !description)) {
    throw new Error("Invalid commit subject format");
  }
  return {
    type: trim ? type?.trim() : type,
    description: trim ? description?.trim() : description,
  };
}
```

❌ **Bad**: Too many parameters

```ts
export function parse(
  subject: string,
  delimiter: string,
  strict: boolean,
  trim: boolean,
) {
  const [type, description] = subject.split(delimiter, 2);
  if (strict && (!type || !description)) {
    throw new Error("Invalid commit subject format");
  }
  return {
    type: trim ? type?.trim() : type,
    description: trim ? description?.trim() : description,
  };
}
```

### Use distinguishable parameter types

Parameters should only have types that can be distinguished from plain objects
at runtime. This allows the API to evolve in a backwards-compatible way even
when parameter positions change. Reserve plain objects only for the `options`
parameter, unless they can be discriminated with runtime checks, for example
with `Symbol` properties.

✅️ **Good**: Distinguishable types

```ts
export function parse(
  lines: string | string[],
  options?: { delimiter?: string },
) {
  const { delimiter = ": " } = options ?? {};
  lines = typeof lines === "string" ? [lines] : lines;
  return lines.map((subject) => {
    const [type, description] = subject.split(delimiter, 2);
    return { type, description };
  });
}
```

❌ **Bad**: Ambiguity with plain objects

```ts
export function parse(
  input: { lines?: string[] },
  config: { delimiter?: string },
) {
  return input.lines?.map((x) => {
    const [type, description] = x.split(config.delimiter ?? ": ", 2);
    return { type, description };
  }) ?? [];
}
const input = JSON.parse('{"lines":["feat: add new feature"]}');
const config = JSON.parse('{"delimiter":": "}');
parse(input, config); // passes type checks
parse(config, input); // also passes type checks
```

### Prefer function overloads

A function can accept different input types that produce different types. Use
function overloads to achieve this instead of returning union types in the
public interface. This makes the function easier to use and understand and
improves type-safety for callers.

✅️ **Good**: Function overloads

```ts
export interface ParsedCommit {
  type: string;
  description: string;
}

export function parse(subject: string): ParsedCommit;
export function parse(subjects: string[]): ParsedCommit[];

// the implementation body is not visible to outside
export function parse(input: string | string[]) {
  function inner(subject: string) {
    const [type, description] = subject.split(": ", 2);
    if (!type || !description) throw new Error("Invalid commit subject format");
    return { type, description };
  }
  return (typeof input === "string") ? inner(input) : input.map(inner);
}
```

❌ **Bad**: Union return types

```ts
export interface ParsedCommit {
  type: string;
  description: string;
}

export function parse(input: string | string[]): ParsedCommit | ParsedCommit[] {
  function inner(subject: string) {
    const [type, description] = subject.split(": ", 2);
    if (!type || !description) throw new Error("Invalid commit subject format");
    return { type, description };
  }
  return (typeof input === "string") ? inner(input) : input.map(inner);
}
```

### Write flat code

Code that is long and deeply indented is hard to scan and understand. Check
error conditions first and return early to keep the happy path clear and free of
nesting.

✅️ **Good**: Flat and concise code

```ts
export function parse(subject?: string) {
  if (!subject) return undefined;
  const [type, description] = subject.split(": ", 2);
  if (!description) throw new Error("Missing description");
  return { type, description };
}
```

❌ **Bad**: Overly nested code

```ts
export function parse(subject?: string) {
  if (subject !== undefined) {
    if (subject.length > 0) {
      const parts = subject.split(": ", 2);
      const type = parts[0];
      const description = parts[1];
      if (description !== undefined) {
        return { type, description };
      } else {
        throw new Error("Missing description");
      }
    } else {
      return undefined;
    }
  }
  return undefined;
}
```

### Avoid inline comments

Code should be self-explanatory with clear naming and structure. Inline comments
indicate unclear code. If code needs to be explained, consider refactoring it so
that it doesn't. Inline comments should only be added for tricky logic that
can't be expressed clearly otherwise.

✅️ **Good**: Clear code without inline comments

```ts
export function parse(subject: string) {
  if (!subject) return undefined;
  const [type, description] = subject.split(": ", 2);
  if (!description) throw new Error("Missing description");
  return { type, description };
}
```

❌ **Bad**: Inline comments narrating code

```ts
export function parse(subject: string) {
  // Check if subject exists
  if (!subject) return undefined;
  // Split the subject into parts
  const [type, description] = subject.split(": ", 2);
  // Validate that we have a description
  if (!description) throw new Error("Missing description");
  // Return the parsed result
  return { type, description };
}
```

### Use concise and clear names

Good names balance brevity with clarity. Prefer single words when they capture
the meaning, but don't sacrifice understanding for shorter names. Avoid
abbreviations unless they are widely recognized industry standards (like _"id"_,
_"url"_, or _"cwd"_).

✅️ **Good**: Clear and appropriately scoped

```ts
export function parse(subject: string, delimiter: string = ": ") {
  const [type, description] = subject.split(delimiter, 2);
  return { type, description };
}
```

❌ **Bad**: Unnecessarily verbose

```ts
export function parse(commitSubject: string, splitDelimiter: string = ": ") {
  const commitTypeAndDescription = commitSubject.split(splitDelimiter, 2);
  return {
    type: commitTypeAndDescription[0],
    description: commitTypeAndDescription[1],
  };
}
```

❌ **Bad**: Unclear abbreviations

```ts
export function parse(sub: string, delim: string = ": ") {
  const [type, desc] = sub.split(delim, 2);
  return { type, desc };
}
```

## Types

### Prefer `interface` over `type`

The two features for defining types in TypeScript largely overlap with each
other. For consistency, use `interface` for both data shapes and method
interfaces. Use the `type` keyword only for type manipulation.

💡 **Example**: Defining types

```ts
export interface ParsedCommit {
  type: string;
  description: string;
}

export class ParseError extends Error {
  constructor(subject: string, cause?: Error) {
    super(subject, { cause });
    this.name = "ParseError";
  }
}

export type Parseable = string | string[];
export type ParseResult = ParsedCommit | ParseError;
```

### Prefer optional fields over `undefined`

The optional field syntax with `?` is semantically different than explicit union
with `undefined`. The former states that a value doesn't need to be set, while
the latter states that the value `undefined` is accepted. The
`exactOptionalPropertyTypes` compiler setting prohibits mixing the two and helps
catch subtle bugs early. Prefer the optional field syntax since it is more
idiomatic and easier to use.

✅️ **Good**: Optional fields

```ts
export interface ParseOptions {
  delimiter?: string;
  strict?: boolean;
  trim?: boolean;
}
```

❌ **Bad**: Explicit `undefined`

```ts
export interface ParseOptions {
  delimiter: string | undefined;
  strict: boolean | undefined;
  trim: boolean | undefined;
}
```

### Return `undefined` for missing values

Functions should produce optional results by returning a union with `undefined`.
This forces the caller to handle missing cases using the type system. One
exception is when it is unlikely that the value will be missing, in which case
throwing an error is acceptable to keep the types simpler.

💡 **Example**: Optional return values

```ts
export interface ParsedCommit {
  type: string;
  description: string;
}

export function parse(subject?: string): ParsedCommit | undefined {
  if (!subject) return undefined;
  const [type, description] = subject.split(": ", 2);
  if (!type || !description) throw new Error("Invalid commit subject format");
  return { type, description };
}
```

### Avoid classes except for errors

Classes add unnecessary complexity to the codebase. Method interfaces and
functions can be used instead of classes in a more idiomatic TypeScript. The
only exception is for error types, where runtime type identification is often
needed.

## Errors

### Throw errors for external conditions

Failures that happen due to unsupported usage or external conditions should
throw instances of specific error classes. A common approach is to have one
custom error class per package. For example, `@roka/git` has `GitError`.

💡 **Example**: Using error classes

```ts
export class ParseError extends Error {
  constructor(subject: string) {
    super(subject);
    this.name = "ParseError";
  }
}

export function parse(subject: string) {
  const [type, description] = subject.split(": ", 2);
  if (!type || !description) {
    throw new ParseError("Invalid commit subject format");
  }
  return { type, description };
}
```

### Include original errors as `cause`

Errors can contain source information to preserve the error chain and help with
debugging. When catching and re-throwing errors, include the original error as
the `cause`.

💡 **Example**: Using error causes

```ts
export class ParseError extends Error {
  constructor(subject: string, options?: { cause?: unknown }) {
    super(subject, options);
    this.name = "ParseError";
  }
}

export async function parse(path: string) {
  try {
    const subject = await Deno.readTextFile(path);
    const [type, description] = subject.split(": ", 2);
    return { type, description };
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

✅️ **Good**: Clear messages

```ts
export function parse(subject: string) {
  if (!subject) throw new Error("Subject not provided");
  const [type, description] = subject.split(": ", 2);
  if (!type || !description) {
    throw new Error([
      `Invalid commit subject format: ${subject}`,
      "  Expected delimiter: ':'",
    ].join("\n\n"));
  }
  return { type, description };
}
```

❌ **Bad**: Vague or redundant messages

```ts
export function parse(subject: string) {
  if (!subject) throw new Error("Error"); // too vague
  const [type, description] = subject.split(": ", 2);
  if (!type || !description) {
    throw new Error("Error: invalid commit subject format"); // redundant prefix
  }
  return { type, description };
}
```

### Assert assumptions

Internal assumptions and invariants should be validated with assertions. These
are conditions that should always happen if the code is correct. They make the
code robust against bugs while being self-documenting. Assertions also steer the
type checker and simplify lines following the assertion. Use them liberally and
treat their failures as bugs.

💡 **Example**: Using assertions

```ts
import { assertExists } from "@std/assert";

export function parse(subject: string, delimiter = ":") {
  if (!subject) return undefined;
  const parts = subject.split(delimiter, 2);
  const type = parts[0];
  assertExists(type); // type narrowing
  const description = parts[1];
  return { type, description };
}
```

## Testing

### Write minimal and focused tests

The primary aim of tests is to verify code, not to document it. Avoid
explanatory tests describing behavior. Focus on asserting the contract, not
demonstrating how the code functions.

✅️ **Good**: Focused and concise testing

```ts
import { assertEquals } from "@std/assert";

export function parse(subject: string) {
  const [type, description] = subject.split(": ", 2);
  return { type, description };
}

Deno.test("parse() returns commit type and description", () => {
  assertEquals(parse("feat: add new feature"), {
    type: "feat",
    description: "add new feature",
  });
});
```

❌ **Bad**: Explanatory testing

```ts
import { assertEquals } from "@std/assert";

export function parse(subject: string) {
  const [type, description] = subject.split(": ", 2);
  return { type, description };
}

Deno.test("parse() returns commit type and description", () => {
  // Given a conventional commit subject
  const subject = "feat: add new feature";
  // When we parse the subject
  const result = parse(subject);
  // Then we expect the type to be "feat"
  assertEquals(result.type, "feat");
  // And we expect the description to be "add new feature"
  assertEquals(result.description, "add new feature");
  // Verify the result object is serializable
  // This ensures no functions or complex types are returned
  assertEquals(JSON.parse(JSON.stringify(result)), {
    type: "feat",
    description: "add new feature",
  });
  // End of test
});
```

### Use descriptive test names

Test names should clearly describe what's being tested and the expected
behavior. Use the format `functionName() behavior` or
`functionName({ option }) behavior` to keep names consistent and scannable. When
a test fails, the name should tell developers exactly what broke without reading
the test code.

✅️ **Good**: Explicit test names

```ts
Deno.test("parse() extracts type and description from subject", () => {});
Deno.test("parse() rejects empty commit subject", () => {});
Deno.test("parse({ delimiter }) splits by custom delimiter", () => {});
```

❌ **Bad**: Vague test names

```ts
Deno.test("parse test", () => {});
Deno.test("parse() error on empty input", () => {});
Deno.test("parse_delimiter", () => {});
```

### Organize tests logically

Group tests by their options usage, starting with no options to a logical
ordering of options. If no logic arises, sort options alphabetically. Within
each option group, test common functionality first, then edge cases, then error
conditions.

💡 **Example**: Ordering tests

```ts
Deno.test("parse() extracts type and description from subject", () => {});
Deno.test("parse() handles subjects without type", () => {});
Deno.test("parse() rejects empty commit subject", () => {});
Deno.test("parse({ delimiter }) splits by custom delimiter", () => {});
Deno.test("parse({ delimiter }) can split by regular expression", () => {});
Deno.test("parse({ strict }) rejects invalid commit subject format", () => {});
Deno.test("parse({ trim }) trims type and description", () => {});
```

### Add tests for testing utilities

Testing modules require tests as well. The test infrastructure must be reliable,
or the tests that depend on it can't be trusted. Broken testing tools result in
false positives, shipped bugs, and hours of debugging.

💡 **Example**: Testing a test utility

```ts
import { assertEquals } from "@std/assert";

export function testSubject(type: string) {
  return `${type}: commit subject`;
}

Deno.test("testSubject() returns commit subject", () => {
  assertEquals(testSubject("feat"), "feat: commit subject");
  assertEquals(testSubject("fix"), "fix: commit subject");
});
```

## Documentation

### Use JSDoc for documentation

Documentation is automatically generated from [JSDoc](https://jsdoc.app) markup
in the source code. Provide a brief description for each public symbol, and
include any additional context if it helps understanding. Self-explanatory
parameters and return values should not be documented. Omit type annotations if
they are already provided by the type system. Don't use dashes between parameter
names and descriptions.

✅️ **Good**: Valuable documentation

```ts
/**
 * Parses a conventional commit subject into its components.
 *
 * @param delimiter Delimiter string separating type and description.
 * @throws {Error} If the subject format is invalid.
 */
export function parse(subject: string, delimiter: string = ": ") {
  const [type, description] = subject.split(delimiter, 2);
  if (!type || !description) throw new Error("Invalid commit subject format");
  return { type, description };
}
```

❌ **Bad**: Redundant documentation

```ts
/**
 * Parses a subject.
 *
 * @param {string} subject - The subject.
 * @param {string} delimiter - The delimiter.
 * @returns The parsed string.
 */
export function parse(subject: string, delimiter: string = ": ") {
  const [type, description] = subject.split(delimiter, 2);
  if (!type || !description) throw new Error("Invalid commit subject format");
  return { type, description };
}
```

### Document all modules

Each module needs a clear description. Good module documentation explains the
purpose, shows common usage patterns, and helps developers decide if this is the
right module for their needs. Examples should be valid code snippets.

💡 **Example**: Documenting a module

````ts
/**
 * This module provides the {@linkcode parse} function for parsing and
 * validating conventional commit subjects.
 *
 * @example
 * ```
 * import { parse } from "@roka/parse";
 * import { assertEquals } from "@std/assert";
 *
 * const result = parse("feat: add new feature");
 * assertEquals(result, { type: "feat", description: "add new feature" });
 * ```
 *
 * @module parse
 */
````

### Use indicative mood in descriptions

Function descriptions should begin with a verb phrase that describes what the
function does. Write this description in the third person indicative mood:
_"[the function] does something"_. Don't write descriptions in an imperative
sentence: _"do something"_. The same applies to descriptions for parameters and
fields that begin with a verb.

✅️ **Good**: Indicative mood

```ts
/** Parses a conventional commit subject into its components. */
export function parse() {}

/**
 * Options for the {@linkcode parse} function.
 */
export interface ParseOptions {
  /** Splits the subject using the given delimiter. */
  delimiter?: string;
}
```

❌ **Bad**: Imperative mood

```ts
/** Parse a conventional commit subject into its components. */
export function parse() {}

/**
 * Options for the {@linkcode parse} function.
 */
export interface ParseOptions {
  /** Split the subject using the given delimiter. */
  delimiter?: string;
}
```

### Document limitations with `@todo`

The `@todo` tags can document known limitations and missing features directly in
the code. These are intended as an inline guidance for the next person on the
current state of the code, and not as a replacement for issue tracking. Keep
`@todo`s brief, specific, and actionable.

💡 **Example**: Documenting limitations

```ts
/**
 * Parses a conventional commit subject into its components.
 *
 * @todo Add support for multi-line commit bodies.
 * @todo Validate commit type against allowed types.
 */
export function parse(subject: string) {
  const [type, description] = subject.split(": ", 2);
  return { type, description };
}
```

### End sentences with punctuation

All JSDoc sentences should end with proper punctuation.

✅️ **Good**: Sentence with punctuation

```ts
/** Parses a conventional commit subject. */
export function parse(subject: string) {
  const [type, description] = subject.split(": ", 2);
  return { type, description };
}
```

❌ **Bad**: Sentence without punctuation

```ts
/** Parses a conventional commit subject */
export function parse(subject: string) {
  const [type, description] = subject.split(": ", 2);
  return { type, description };
}
```
