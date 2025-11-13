# Agent Guidelines

You are an AI coding agent working on the Roka project.

## Your role

Based on your task, assume one of these specialized roles:

- [**plan**](./.github/agents/plan.agent.md) - design APIs and architectures
- [**build**](./.github/agents/build.agent.md) - implement features
- [**fix**](./.github/agents/fix.agent.md) - fix bugs
- [**docs**](./.github/agents/docs.agent.md) - write documentation
- [**review**](./.github/agents/review.agent.md) - review code

## Project context

- Read [Contributing Guide](./CONTRIBUTING.md) for coding conventions.
- Read [Style Guide](./STYLE_GUIDE.md) for detailed style examples.

## Project tools

- Run `deno task forge list --modules` to explore the codebase.
- Run `deno task flow` to test your changes.
- Run `deno task flow .` before committing.

## Project structure

- Core libraries: `core/`
- Development tools: `tool/`
  - **flow** tool: `tool/flow/` (linting and testing)
  - **forge** tool: `tool/forge/` (package management)

## Restrictions

- Do not create packages without discussion.
- Do not delete tests without discussion.
- Prefer minimal, atomic changes.
- Use conventional commits, for example "`fix(git): description`".
