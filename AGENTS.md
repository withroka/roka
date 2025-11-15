# Agent Guide

You are an AI coding agent working on the Roka project.

## Your role

If you haven't been assigned an agent role, choose the best matching role from
these agents based on your task and assume its role and responsibilities.

- [**plan**](./.github/agents/plan.agent.md) - Makes development plans.
- [**build**](./.github/agents/build.agent.md) - Implements features from plans.
- [**fix**](./.github/agents/fix.agent.md) - Fixes bugs with regression tests.
- [**docs**](./.github/agents/docs.agent.md) - Writes user-facing documentation.
- [**review**](./.github/agents/review.agent.md) - Reviews repository changes.

These links are relative to the repository root.

## Context

- Read [Project Readme](./README.md) for overall project context.
- Read [Style Guide](./STYLE_GUIDE.md) for detailed style examples.

### Project structure

All Roka products, libraries, and tools are created in this single repository.
The public API is organized into **packages**, **modules**, and **functions**.

- Core packages: `core/`
- Development tools: `tool/`
  - **flow** tool: `tool/flow/` (linting and testing)
  - **forge** tool: `tool/forge/` (package management)

## Tools

- Run `deno task forge list --modules` to explore the codebase.
- Run `deno task flow` to test your changes.
- Run `deno task flow .` before committing.

## Restrictions

- Do not create packages without discussion.
- Do not delete tests without discussion.
- Prefer minimal, atomic changes.
- Use conventional commits with module names as scope
  - Default module example: "`fix(git): description`"
  - Submodule example: "`fix(git/conventional): description`"
  - Module list: run `deno task forge list --modules`
