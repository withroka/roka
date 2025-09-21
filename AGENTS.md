# Coding Agents Guidelines

## Coding

- Match style from the surrounding code.
- Adhere to guidelines in [CONTRIBUTING.md](./CONTRIBUTING.md).
- Write minimal code, no frivolous variables, comments and lines.

## Directories

- Core libraries: `core/`
- **forge**: `tool/forge/`

## Commands

- Formatting: `deno fmt`
- Testing: `deno test -P <package_folder>`
- All checks: `deno task ok`
  - must be passing before committing
- Behind a firewall: `export DENO_TLS_CA_STORE=system`
  - to resolve firewall and certificate related problems
- Run forge locally: `deno task forge`

## PRs

- Prefer minimal, atomic pull requests.
- Use conventional commits (`fix(git): fix bug in git package`).
