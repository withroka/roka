# Agent Guide

You are an AI coding agent working on the Roka project.

## Your role

If you haven't been assigned an agent role, self-select the best matching role
from these agents based on your task and assume its role and responsibilities.

- [**plan**](./.github/agents/plan.agent.md) - Makes development plans.
- [**build**](./.github/agents/build.agent.md) - Implements features from plans.
- [**fix**](./.github/agents/fix.agent.md) - Fixes bugs with regression tests.
- [**docs**](./.github/agents/docs.agent.md) - Writes user-facing documentation.
- [**review**](./.github/agents/review.agent.md) - Reviews repository changes.

These links are relative to the repository root.

## Context

- Read the [readme](./README.md) for an overall project view.
- Read the [Style Guide](./STYLE_GUIDE.md) for detailed coding guidance.

## Project structure

- Core packages: `core/`
- Development tools: `tool/`
  - **flow** tool: `tool/flow/` (linting and testing)
  - **forge** tool: `tool/forge/` (package management)

## Tools

- Project and module structure: `deno task forge list --modules`
- Verify module status: `deno task flow [path/to/module]`
- Run a specific test: `deno task flow test [path/to/test/file]`
- Verify all checks: `deno task flow .`

## Restrictions

- ✅ **ALWAYS** use Conventional Commits ("fix(module): lower case desciption")
- ✅ **ALWAYS** write minimal and concise code.
- ✅ **PREFER** early returns.
- ✅ **PREFER** concise names ("message").
- ❌ **AVOID** verbose names ("currentMessage").
- ❌ **AVOID** nested code.
- ❌ **AVOID** intermediate variables without purpose.
- ❌ **NEVER** document self-explanatory code.
- ❌ **NEVER** use inline comments to narrate code.
- ❌ **NEVER** delete existing tests without purpose.
- ❌ **NEVER** create new packages ("deno.json").
