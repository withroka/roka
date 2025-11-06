# Coding Agents Guidelines

## Directories

- Core libraries: `core/`
- **flow** tool: `tool/flow/`
- **forge** tool: `tool/forge/`

## Workflow

- Run `deno task forge list --modules` to explore modules.
- Make code changes.
- Run `deno task flow` to test changed files.
- Before commit: `deno task flow .` must pass.

## Coding

Match style from the surrounding code and adhere to
[CONTRIBUTING.md](./CONTRIBUTING.md).

### ❌ Avoid unnecessary variables and comments

```ts
export function validate(input?: string): string | undefined {
  // Check if input exists
  const hasInput = input !== undefined;

  // If no input, return undefined
  if (!hasInput) {
    return undefined;
  }

  // Trim the input
  const trimmed = input.trim();

  // Return the result
  return trimmed;
}
```

### ✅ Prefer minimal code with early returns

```ts
export function validate(input?: string): string | undefined {
  if (!input) return undefined;
  return input.trim();
}
```

### ❌ Avoid nested conditions

```ts
export function process(value?: string): string | undefined {
  if (value !== undefined) {
    if (value.length > 0) {
      return value.toLowerCase();
    } else {
      return undefined;
    }
  } else {
    return undefined;
  }
}
```

### ✅ Prefer guard clauses

```ts
export function process(value?: string): string | undefined {
  if (!value || value.length === 0) return undefined;
  return value.toLowerCase();
}
```

### ❌ Avoid long variable names

```ts
export function parse(commitMessage?: string): string | undefined {
  const trimmedCommitMessage = commitMessage?.trim();
  const firstLineOfCommitMessage = trimmedCommitMessage?.split("\n")[0];
  const commitMessageWithoutPrefix = firstLineOfCommitMessage?.replace(
    /^(fix|feat|chore):\s*/,
    "",
  );
  return commitMessageWithoutPrefix;
}
```

### ✅ Prefer concise names

```ts
export function parse(message?: string): string | undefined {
  const trimmed = message?.trim();
  const first = trimmed?.split("\n")[0];
  return first?.replace(/^(fix|feat|chore):\s*/, "");
}
```

## Restrictions

- Do not create new packages without discussion.
- Do not delete tests without discussion.
- Focus on code quality and tests passing locally.

## PRs

- Prefer minimal, atomic pull requests.
- Use conventional commits (`fix(git): fix bug in git package`).
