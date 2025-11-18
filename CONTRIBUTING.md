# Contributing Guide

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

When working on the code, you can run all checks by running `deno task flow` in
the root of the repository. For coding style, try to match the surrounding code.
If you’re unsure, see the [Style Guide](./STYLE_GUIDE.md).

Pull request titles will be checked to make sure they follow the
[Conventional Commits](https://www.conventionalcommits.org) style.

### Terms

By contributing to this repository, you agree to follow the
[Code of Conduct](./CODE_OF_CONDUCT.md), and to let everyone use your
contributions under the same terms as the project.

## 🙌 Project structure

All Roka products, libraries, and tools are created in this single repository.
The public API is organized into **packages**, **modules**, and **functions**.

- Core packages: `core/`
- Development tools: `tool/`
  - **flow** tool: `tool/flow/` (linting and testing)
  - **forge** tool: `tool/forge/` (package management)

## 🤖 Coding agents

If you are an AI coding agent, you should also read the
[Agent Guide](./AGENTS.md).
