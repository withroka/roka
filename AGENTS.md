# Coding Agents Guidelines

**⚠️ Important:** AI agents and automated tools must check this file for agent-specific guidelines before working on the repository.

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
- Run forge locally: `deno task forge`

## Environment Setup

### Certificate Issues
If downloading npm packages or JSR dependencies fails with certificate validation errors (especially in environments with MITM proxies), use the system certificate store:

```bash
# For individual commands
DENO_TLS_CA_STORE=system deno cache jsr:@std/assert@^1.0.14
DENO_TLS_CA_STORE=system deno task forge

# Or export for the session
export DENO_TLS_CA_STORE=system
```

This is particularly needed when working behind corporate firewalls or proxy setups with self-signed certificates.

## PRs

- Prefer minimal, atomic pull requests.
- Use conventional commits (`fix(git): fix bug in git package`).
