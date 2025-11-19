# Agent Guide

You are an AI coding agent working on the Roka project.

## Your role

If you haven't been assigned an agent role, self-select the best matching role
from these agents based on your task and assume its role and responsibilities.

- [**Specify**](./.github/agents/specify.agent.md) - Designs APIs, frameworks,
  and features.
- [**Build**](./.github/agents/build.agent.md) - Implements new features from
  specifications.
- [**Fix**](./.github/agents/fix.agent.md) - Identifies and fixes bugs with
  regression tests.
- [**Document**](./.github/agents/document.agent.md) - Writes API and module
  documentation.
- [**Review**](./.github/agents/review.agent.md) - Reviews code changes.

Start the conversation by identifying your agent role briefly. If you are
unsure, ask for clarification.

These links are relative to the repository root.

## Project structure

- Core packages: `core/`
- Development tools: `tool/`
  - **flow** tool: `tool/flow/` (linting and testing)
  - **forge** tool: `tool/forge/` (package management)

## Tools

- Project and module structure: `deno task forge list --modules`
- Verify module status: `deno task flow [path/to/module]`
- Run a specific test: `deno task flow test [path/to/test/file]`
- Update mocks and snapshots: `deno task flow test [path/to/test/file] --update`
- Verify all checks: `deno task flow .`

## Commit conventions

This project uses [Conventional Commits](https://www.conventionalcommits.org/).

- **feat**: New features
- **fix**: Bug fixes
- **test**: Test additions or modifications
- **refactor**: Code restructuring without behavior changes
- **docs**: Documentation changes
- **ci**: Continuous integration changes (workflows, CI checks, etc.)
- **chore**: Maintenance tasks (tooling, dependencies, releases etc.)
- **perf**: Performance improvements
- **style**: Code style changes

## Coding style

- ✅ **ALWAYS** write minimal and concise code.
- ✅ **ALWAYS** use early returns to avoid nesting.
- ✅ **ALWAYS** use complete words for variable names: `message`, `delimiter`
- ✅ **EXCEPTION**: industry-standard abbreviations are allowed: `url`, `cwd`
- ❌ **NEVER** abbreviate common words: `message` not `msg`
- ❌ **NEVER** add redundant context: `message` not `commitMessage`
- ❌ **NEVER** use nested if/else blocks when early returns work.
- ❌ **NEVER** create intermediate variables when oneliners suffice.
- ❌ **NEVER** document self-explanatory code.
- ❌ **NEVER** use inline comments to narrate what code does.
- ❌ **NEVER** add empty lines within function bodies.
- ❌ **NEVER** delete existing tests without purpose.
- ❌ **NEVER** create helper modules.

### Examples

✅️ **Good**: Clear and concise code with early returns

```ts
export function fibonacci(n: number): number {
  if (n <= 1) return n;
  let previous = 0;
  let current = 1;
  for (let i = 2; i <= n; i++) {
    [previous, current] = [current, previous + current];
  }
  return current;
}
```

❌ **Bad**: Inline comments narrating code

```ts
export function fibonacci(n: number): number {
  // Check if n is 0 or 1
  if (n <= 1) return n;
  // Initialize variables for tracking
  let previous = 0;
  let current = 1;
  // Iterate from 2 to n, no need to use 1 as it's already handled
  for (let i = 2; i <= n; i++) {
    // Calculate the next Fibonacci number, and update previous and current
    [previous, current] = [current, previous + current];
  }
  // Return the result
  return current;
}
```

❌ **Bad**: Intermediate variables and long names

```ts
export function fibonacci(fibonacciNumber: number): number {
  if (fibonacciNumber <= 1) return fibonacciNumber;
  let previousFibonacciValue = 0;
  let currentFibonacciValue = 1;
  for (let i = 2; i <= fibonacciNumber; i++) {
    const nextFibonacciValue = previousFibonacciValue + currentFibonacciValue;
    previousFibonacciValue = currentFibonacciValue;
    currentFibonacciValue = nextFibonacciValue;
  }
  return currentFibonacciValue;
}
```

❌ **Bad**: Abbreviated variable names

```ts
export function fibonacci(n: number): number {
  if (n <= 1) return n;
  let prev = 0;
  let curr = 1;
  for (let i = 2; i <= n; i++) {
    [prev, curr] = [curr, prev + curr];
  }
  return curr;
}
```

❌ **Bad**: Redundant context in names

```ts
export function parseCommit(commitMessage: string) {
  const commitDelimiter = ": ";
  const [commitType, commitSummary] = commitMessage.split(commitDelimiter, 2);
  return { type: commitType, summary: commitSummary };
}
```

✅️ **Good**: Names without redundant context

```ts
export function parseCommit(message: string) {
  const delimiter = ": ";
  const [type, summary] = message.split(delimiter, 2);
  return { type, summary };
}
```

❌ **Bad**: Empty lines within function bodies

```ts
export function fibonacci(n: number): number {
  if (n <= 1) return n;

  let previous = 0;
  let current = 1;

  for (let i = 2; i <= n; i++) {
    [previous, current] = [current, previous + current];
  }

  return current;
}
```

✅️ **Good**: Focused and concise testing

```ts
import { assertEquals } from "@std/assert";

export function fibonacci(n: number): number {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}

Deno.test("fibonacci() returns correct sequence", () => {
  assertEquals(fibonacci(0), 0);
  assertEquals(fibonacci(1), 1);
  assertEquals(fibonacci(6), 8);
});

Deno.test("fibonacci() handles negative input", () => {
  assertEquals(fibonacci(-1), -1);
});
```

❌ **Bad**: Explanatory testing

```ts
import { assertEquals } from "@std/assert";

export function fibonacci(n: number): number {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}

Deno.test("fibonacci() returns correct sequence", () => {
  // Given the fibonacci sequence starts with 0, 1
  const firstNumber = 0;
  // When we calculate the 0th fibonacci number
  const result0 = fibonacci(firstNumber);
  // Then we expect it to be 0
  assertEquals(result0, 0);
  // Given we want the first fibonacci number
  const secondNumber = 1;
  // When we calculate it
  const result1 = fibonacci(secondNumber);
  // Then it should be 1
  assertEquals(result1, 1);
  // Given we want the 6th fibonacci number
  // The sequence is: 0, 1, 1, 2, 3, 5, 8
  const sixthIndex = 6;
  // When we calculate it
  const result6 = fibonacci(sixthIndex);
  // Then it should be 8
  assertEquals(result6, 8);
  // End of test
});
```
