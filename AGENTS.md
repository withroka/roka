# Agent Guide

## Subagents

⛔ **STOP**: Do not start any work before choosing a subagent. Do not directly
work on the task. No task is too trivial to not use an agent.

The project has subagents with clear instructions to handle any task.
Proactively use a subagent available through your tooling for every task.

## Tools

- Project and module structure: `deno task forge list --modules`
- Run a specific test:
  `deno task flow test [path/to/module] --filter "[test name]"`
- Update mocks and snapshots: `deno task flow test [path/to/test/file] --update`
- Verify changes before commit: `deno task ok`

## Commit conventions

This project uses [Conventional Commits](https://www.conventionalcommits.org/).

- **feat**: New features
- **fix**: Bug fixes
- **test**: Test additions or modifications
- **refactor**: Code restructuring without behavior changes
- **docs**: Documentation changes
- **ci**: Continuous integration changes (workflows, CI checks, etc.)
- **chore**: Maintenance tasks (tooling, dependencies, releases, etc.)
- **perf**: Performance improvements
- **style**: Code style changes

Use scopes to specify the package or module:

- `feat(git): add tag support`
- `fix(http): handle timeout errors`
- `docs(async): add usage examples`

Omit scopes for changes across multiple packages or general changes:

- `docs: update contributing guide`
- `chore: update dependencies`

## Coding style

- ✅ **ALWAYS** name the files after the module: `name.ts` and `name.test.ts`.
- ✅ **ALWAYS** write minimal and concise code.
- ✅ **ALWAYS** use early returns to avoid nesting.
- ✅ **ALWAYS** use complete words for variable names: `message`, `delimiter`
- ✅ **EXCEPTION**: industry-standard abbreviations are allowed: `url`, `cwd`
- ❌ **NEVER** create `mod.ts`.
- ❌ **NEVER** create helper modules.
- ❌ **NEVER** abbreviate common words: `message` not `msg`
- ❌ **NEVER** add redundant context: `message` not `commitMessage`
- ❌ **NEVER** use nested if/else blocks when early returns work.
- ❌ **NEVER** add empty lines within function bodies.
- ❌ **NEVER** create intermediate variables when oneliners suffice.
- ❌ **NEVER** use inline comments to narrate what code does.
- ❌ **NEVER** delete existing tests without purpose.
- ❌ **NEVER** document self-explanatory code.

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
export function parseCommit(commitSubject: string) {
  const commitDelimiter = ": ";
  const [commitType, commitDescription] = commitSubject.split(
    commitDelimiter,
    2,
  );
  return { type: commitType, description: commitDescription };
}
```

✅️ **Good**: Names without redundant context

```ts
export function parseCommit(subject: string) {
  const delimiter = ": ";
  const [type, description] = subject.split(delimiter, 2);
  return { type, description };
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
