# Style Guide

## General rules

### Prefer surrounding style over this guide

If the current style is different from this guide but still works well, feel
free to keep writing in that way. It’s a bit jarring for readers when styles
change within the same file. We can always update the style later in a separate,
more thorough change.

### Design simple interfaces

Public interfaces should be easy to use and understand. Optimize for the common
case and make common tasks simple, even if it means repetitive code, or extra
work when implementing.

#### ✅ Write functions with simple interfaces

```ts
/** usage: parse("feat: add new feature"); */
export function parse(message: string) {
  const [type, summary] = message.split(": ");
  return { type, summary };
}
```

#### ❌ Avoid abstractions that hinder usability

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

Write code that's easy to understand and maintain. Obviously, don't write O(N²),
code when O(N) is just one more line. But, don't sweat over CPU cycles when we
can optimize later if needed, or switch to a native language.

## Modules and exports

### Group modules around a subject into a package

Organize related modules into packages by their subject area or domain, for
example, any functionality around Git goes into `@roka/git` instead of its own
package. Packages cannot be renamed, but modules can be be renamed between
versions.

### Use default modules for core functionality

The default module of a package should export the primary functionality that the
users need. This makes the API straightforward. Users can import directly from
the package without needing to know about submodules. For example, the
`@roka/git` packages exports the `git()` function directly.

Sometimes a package may not have a clear primary functionality. In those cases,
the package will not export anything directly, and users will need to import
from submodules. For example, the `@roka/testing` package does not export
anything.

The default module is written files named after the package. For example,
`@roka/git` code lives in `git.ts`, and its tests in `git_test.ts`. Avoid using
`mod.ts` as the main module file.

### Use submodules for secondary functionality

Secondary or specialized features go in submodules, for example `conventional()`
in `@roka/git/conventional`. This increases the usability of the main package,
increases the findability of the secondary features, and keeps the number of
packages in check.

The submodule is written under files named after the submodule. For example,
`@roka/git/conventional` code lives in `conventional.ts`, and its tests in
`conventional_test.ts`.

### Export functionality as functions

The core interface of a module is the function or functions it exports.
Everything else, like types or errors, are complementary to the function
interface. This enforces a simple overall design that is based around functions.

A module should preferably export a single function that has the same name as
the module, for example `conventional()` in `@roka/git/conventional`. In cases
where function overloading doesn't work, the module can provide multiple
variants of the same functionality with different names. For example the
`@roka/testing/fake` module does this by exporting `fakeConsole()`,
`fakeCommand()` functions.

### Export types used in the function interface

All symbols used in the function interface must be exported. For example, a
function `git()` that is accepting `GitOptions` and returning `Git` must export
both types. This ensures the whole public interface is documented.

### Do not export data directly

Data that is part of functionality should exposed through functions. This makes
the public interface more stable, for example when the data is no longer a
constant.

#### ✅ Export data through functions

```ts
export function targets() {
  return ["aarch64", "x86_64", "armv7"];
}
```

#### ❌ Avoid exporting data directly

```ts
export const TARGETS = ["aarch64", "x86_64", "armv7"];
```

### Avoid re-exports

Symbols should be exported from the module where they are defined. This ensures
symbols having a canonical and unambiguous import source, simplifying the public
surface.

### Avoid internal modules.

Internal modules makes it harder to work on the codebase, making tasks harder to
be confined to a single source file. Modules should communicate with each other
through their public interfaces, and functionality that is shared between
modules can be made high quality enough to be shared publicly. If neither is
possible, code duplication is acceptable.

### Avoid generic packages or modules

Packages and modules like `util` or `common` are too generic and do not convey
meaningful information about their purpose. It is better to create new modules
for bespoke functionality in the public interface. A utility that does not fit
in in any package, but that is useful for all contexts can be its own package.
The `@roka/maybe` package is just that with a single `maybe()` function.

### Do not export classes, except for errors

Classes add unnecessary complexity to the codebase. Interfaces and functions can
be used insteda of classes in a more idiomatic TypeScript. The only exceptionto
this rule is for error types, where runtime type identification is often needed.

## Functions

### Accept at most two required arguments and an optional `options` object

### Avoid parameter types that cannot be distinguished at runtime, except for

`options`

### Prefer overloads for different input variants

### Name the options type after the function (`GitOptions`).

## Types

### Use `interface` for both data and functionality

### Use `type` for type utilities and aliases

### Name the data types after their factory functions (`Git`)

### Use optional definition for fields (`x?: string`, not

`x: string | undefined`).

## Errors

### Assert code assumptions (throw `AssertionError`)

### Throw a specific type on runtime errors

### Name error classes after their package or module (`GitError`)

### Provide re-thrown errors as

[`cause`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error/cause)

### Write clear, concise, and consistent error messages

### Sentence case error messages, but do not end with a dot

## Testing

### Add tests for new features

### Add tests for fixed bugs

### Add tests for `testing` modules

### Name tests explicitly (`"git().init() initializes a repository"`).

## Documentation

### Use [JSDoc](https://jsdoc.app) for documentation

### Document every module with example usage and `@module`

### Document every exported symbol

### Document missing features or known bugs with `@todo`

### Do not document self-explanatory parameters, returns, or throws

### End JSDoc sentences with a punctuation

### Optimize for document generation (no dash in `@param`).

## Naming

### Write inclusive code

Use gender-neutral and racially-neutral names. For example, use "blocklist"
instead of "blacklist". Avoid loaded language, such as "master", when "main"
works just fine. Everyone has a right to enjoy and contribute to the project.
See the
[Chromium style guide](https://chromium.googlesource.com/chromium/src/+/HEAD/styleguide/inclusive_code.md)
for detailed guidance.

### Prefer single words over multiple words

Use shorter names when a single word conveys the meaning clearly. Reserve longer
names for when they add clarity. Or even better, think of a scope or abstraction
where single words makes sense. This keeps code concise and easier to read,
while forcing us to think about the right scope and state.

#### ✅ Use single words when clear

```ts
export async function save(cache: object, path: string) {
  await Deno.writeTextFile(path, JSON.stringify(cache));
}
```

#### ❌ Avoid unnecessary compound names

```ts
export async function save(dataCache: object, filePath: string) {
  await Deno.writeTextFile(filePath, JSON.stringify(dataCache));
}
```

### Prefer full words over abbreviations

Spell out words in full to improve readability and reduce ambiguity.
Abbreviations can be unclear to new readers or those unfamiliar with your
codebase. However, widely-recognized abbreviations like "cwd" (current working
directory) or "id" (identifier) are acceptable when they're standard in the
industry or when they help keep names as single words.

### Prefer singular modules names over plural ones

Use singular names for modules and packages, for example use "tool" and not
"tools". This makes it easier to remember which one was the right name, and
forces consistency for the overall design. The only exception is when creating a
package to extend the functionality of the standard library, for example
`@roka/streams` can supplement `@std/streams`.

## Other examples

### ❌ Avoid unnecessary variables and comments

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

### ✅ Prefer minimal code with early returns

```ts
export function validate(input?: string): string | undefined {
  if (!input) return undefined;
  return input.trim();
}
```

### ❌ Avoid nested conditions

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

### ✅ Prefer guard clauses

```ts
export function process(value?: string): string | undefined {
  if (!value || value.length === 0) return undefined;
  return value.toLowerCase();
}
```

### ❌ Avoid long variable names

```ts
export function parse(commitMessage?: string): string | undefined {
  const trimmedCommitMessage = commitMessage?.trim();
  const firstLineOfCommitMessage = trimmedCommitMessage?.split("\n")[0];
  const commitMessageWithoutPrefix = firstLineOfCommitMessage?.replace(
    /^(fix|feat|chore):\s*/,
    "",
  );
  return commitMessageWithoutPrefix;
}
```

### ✅ Prefer concise names

```ts
export function parse(message?: string): string | undefined {
  const trimmed = message?.trim();
  const first = trimmed?.split("\n")[0];
  return first?.replace(/^(fix|feat|chore):\s*/, "");
}
```

```
```
