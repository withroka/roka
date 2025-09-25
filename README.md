# 🌱 Roka

[![JSR @roka](https://jsr.io/badges/@roka)](https://jsr.io/@roka)
[![codecov](https://codecov.io/gh/withroka/roka/branch/main/graph/badge.svg)](https://codecov.io/gh/withroka/roka)
[![ci](https://github.com/withroka/roka/actions/workflows/ci.yml/badge.svg)](https://github.com/withroka/roka/actions/workflows/ci.yml)
[![license](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/withroka/roka/blob/main/LICENSE)

Hey! 👋

Welcome to our development repository! It’s a collection of tools and libraries
that help streamline product development. It is built with
[Deno](https://deno.com) and [TypeScript](https://www.typescriptlang.org).

> [!WARNING]
> This is still in an early stage, so everything is subject to change. 🚀

## Components

### 🧩 core

This is a collection of libraries for common tasks like network requests and
testing. It’s the backbone of the **Roka** project. You can use the published
packages independently with Deno. Take a look at the
[documentation](https://jsr.io/@roka) on JSR for more details.

### ⚒️ forge

This is a command-line application for managing Deno packages hosted on GitHub.
It can compile binaries, calculate versions, and create GitHub releases from
[Conventional Commits](https://www.conventionalcommits.org). It supports both
single package repositories and monorepos using
[workspaces](https://docs.deno.com/runtime/fundamentals/workspaces/). See the
[documentation](https://jsr.io/@roka/forge) for more details.

## Contributing

Would you like to contribute? That’s wonderful! Please take a look at the
[contribution guide](./CONTRIBUTING.md).
