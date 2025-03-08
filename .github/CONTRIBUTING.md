# How to contribute

## 👋 Hello!

Glad you stopped by! Here’s how you can help out and some general rules to
follow.

## 🤝 Contributing

### Issues

You are welcome to reach out with any questions, bugs, or feature requests. You
can create a GitHub issue to report them. When reporting bugs, try to come up
with a short code example that can reproduce the issue. Ideally, this should be
less than ten lines long.

### Pull requests

If you want to make small changes, you can fork and send a pull request. For
more significant changes, start a discussion with a new issue first. The
[documentation](https://jsr.io/@roka) can be a great resource to help you
navigate the code.

When working on the code, you can run all checks by running `deno task ok` in
the root of the repository. For coding style, try to match the surrounding code.
If you’re unsure, see the code conventions section below.

Pull request titles will be checked to make sure they follow the
[Conventional Commits](https://www.conventionalcommits.org) style.

### Terms

By contributing to this repository, you agree to follow the code of conduct, and
to let everyone use your contributions under the same terms as the project.

## 🙌 Project structure

All Roka products, libraries, and tools are created in this single repository.
The code is organized into **categories**, **packages**, **modules**, and
**symbols**. The `core` category includes core libraries, and the `tool`
category contains development tools. As the codebase grows, new categories like
`ui` or `data` will be added.

## 👉 Coding conventions

### General

- Prefer surrounding style over this guide.
- Prefer ease of use for public interfaces.
- Prefer simplicity to speed in implementation.
- Write
  [inclusive](https://chromium.googlesource.com/chromium/src/+/HEAD/styleguide/inclusive_code.md)
  code.
- Prefer singular names _-_(e.g., `tool`, not `tools`)_.

### Packages

- Group modules around a subject into a package _(e.g.,
  [**@roka/testing**][testing])_.

### Modules

- Export core functionality from the default module _(e.g.,
  [**@roka/git**][git])_.
- Group common functionality into submodules _(e.g.,
  [**@roka/git/conventional**][conventional])_.
- Export a function with the same name as the module _(e.g., `conventional()`)_.
- Avoid relative imports _(e.g., `"./conventional.ts"`)_.
- Avoid circular imports.
- Avoid re-exports.
- Avoid internal modules.

### Symbols

- Export functionality with functions.
- Also export types used in the function interface.
- Export data as plain objects _(use `as const`)_.
- Do not export classes, except for errors.

### Files

- Name the default package file after the package _(e.g., `git.ts`, not
  `mod.ts`)_.
- Name the module files after the module _(e.g., `conventional.ts` and
  `conventional.test.ts`)_.

### Functions

- Accept at most two required arguments and an optional options object.
- Avoid parameter types that cannot be distinguished at runtime, except for
  options.
- Prefer overloads for different input variants.
- Name the options type after the function _(e.g., `GitOptions`)_.

### Types

- Use `interface` for both data and functionality.
- Use `type` for type utilities and aliases
- Prefer no definition over `undefined` or `null` _(e.g., `x?: bool`, and not
  `x: bool | undefined`)_.
- Name the data types after their factory functions _(e.g., `Git`)_.
- Do not export classes, except for errors.

### Errors

- Assert code assumptions _(i.e., throw an `AssertionError`)_.
- Throw a specific type on runtime errors.
- Name error classes after their package or module _(e.g., `GitError`)_.
- Provide re-thrown errors as
  [`cause`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error/cause).
- Write clear, concise, and consistent error messages.
- Sentence case error messages, but do not end with a dot

### Testing

- Add tests for new features.
- Add tests for fixed bugs.
- Name tests explicitly _(e.g., `"git().clone() clones a repo"`)_.

### Documentation

- Use [JSDoc](https://jsdoc.app) for documentation.
- Document every module with example usage and `@module`.
- Document every exported symbol.
- Document missing features or known bugs with `@todo`.
- Do not document self-explanatory parameters, returns, or throws.

[git]: https://jsr.io/@roka/git
[conventional]: https://jsr.io/@roka/git/conventional
[forge]: https://jsr.io/@roka/forge
[testing]: https://jsr.io/@roka/testing
