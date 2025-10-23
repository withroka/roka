# Coding Agents Guidelines

## Coding

- Match style from the surrounding code and adhere to
  [CONTRIBUTING.md](./CONTRIBUTING.md).
- Write minimal code, avoiding unnecessary variables, comments, and lines.

## Directories

- Core libraries: `core/`
- **flow** tool: `tool/flow/`
- **forge** tool: `tool/forge/`

## Commands

- Check changed code: `deno task flow`
- Check all code: `deno task flow .`
  - must be passing before commit
- Behind a firewall: `export DENO_TLS_CA_STORE=system`
  - to resolve firewall and certificate related problems
- Run forge locally: `deno task forge`

## PRs

- Prefer minimal, atomic pull requests.
- Use conventional commits (`fix(git): fix bug in git package`).
