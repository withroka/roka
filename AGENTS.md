# Coding Agents Guidelines

## Coding

- Coding style in [CONTRIBUTING.md](./CONTRIBUTING.md).
- Prefer style from the surrounding code.

## Directories

- Core libraries: `core/`
- **forge**: `tool/forge/`

## Commands

- Formatting: `deno fmt`
- Testing: `deno test -P <package_folder>`
- All checks: `deno task ok`
  - must be passing before committing
- Run forge locally: `deno task forge`
- Behind a firewall: `export DENO_TLS_CA_STORE=system`
  - to resolve firewall and certificate related problems

## PRs

- Prefer minimal, atomic pull requests.
- Use conventional commits (`fix(git): fix bug in git package`).
