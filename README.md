# roka

[![JSR @roka](https://jsr.io/badges/@roka)](https://jsr.io/@roka)
[![codecov](https://codecov.io/gh/withroka/roka/branch/main/graph/badge.svg)](https://codecov.io/gh/withroka/roka)
[![ci](https://github.com/withroka/roka/actions/workflows/ci.yml/badge.svg)](https://github.com/withroka/roka/actions/workflows/ci.yml)
[![license](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/withroka/roka/blob/main/LICENSE)

Roka is a [Deno](https://deno.com)/[TypeScript](https://www.typescriptlang.org)
toolkit for building and shipping packages.

> [!WARNING]
> This is still in an early stage. Expect breaking changes.

## Components

### forge ⚒️

A CLI for managing Deno packages hosted on GitHub. It compiles binaries,
calculates versions, and creates GitHub releases from
[Conventional Commits](https://www.conventionalcommits.org). It supports both
single-package repositories and monorepos using
[workspaces](https://docs.deno.com/runtime/fundamentals/workspaces/). See the
package [documentation](https://jsr.io/@roka/forge) for details.

### flow 🍃

A CLI that runs quality checks and unit tests for Deno projects. Running it
without arguments verifies that checks and tests affected by unmerged changes
pass across code and documentation blocks. See the package
[documentation](https://jsr.io/@roka/flow) for details.

### core 🧩

Shared libraries for common tasks like network requests and testing. Each
package can be used on its own. See the [documentation](https://jsr.io/@roka)
for more details.

## Contributing

Want to contribute? See the [contribution guide](./CONTRIBUTING.md).
