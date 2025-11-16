# Agent Guide

You are an AI coding agent working on the Roka project.

## Your role

If you haven't been assigned an agent role, self-select the best matching role
from these agents based on your task and assume its role and responsibilities.

- [**Plan**](./.github/agents/plan.agent.md) - Makes development plans.
- [**Build**](./.github/agents/build.agent.md) - Implements features from plans.
- [**Fix**](./.github/agents/fix.agent.md) - Fixes bugs with regression tests.
- [**Docs**](./.github/agents/docs.agent.md) - Writes user-facing documentation.
- [**Review**](./.github/agents/review.agent.md) - Reviews codebase changes.

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

## Restrictions

- ✅ **ALWAYS** use Conventional Commits (_"fix(module): lower case
  description"_).
- ✅ **ALWAYS** write minimal and concise code.
- ✅ **PREFER** early returns.
- ✅ **PREFER** concise names (_"message"_).
- ❌ **AVOID** verbose names (_"currentMessage"_).
- ❌ **AVOID** nested code.
- ❌ **AVOID** intermediate variables without purpose.
- ❌ **NEVER** document self-explanatory code.
- ❌ **NEVER** use inline comments to narrate code.
- ❌ **NEVER** delete existing tests without purpose.

## Examples

#### ✅️ **Good**: Clear and concise code with early returns

```ts
export function parse(message: string, delimiter: string = ": ") {
  if (!message) return undefined;
  const [type, summary] = message.split(delimiter, 2);
  if (!summary) throw new Error("Missing summary");
  return { type, summary };
}
```

#### ❌ **Bad**: Inline comments narrating code

```ts
export function parse(message: string, delimiter: string = ": ") {
  // Check if message exists
  if (!message) return undefined;
  // Split the message into parts
  const [type, summary] = message.split(delimiter, 2);
  // Validate that we have a summary
  if (!summary) throw new Error("Missing summary");
  // Return the parsed result
  return { type, summary };
}
```

#### ❌ **Bad**: Intermediate variables and long names

```ts
export function parse(commitMessage: string, splitDelimiter: string = ": ") {
  const commitTypeAndSummary = commitMessage.split(splitDelimiter, 2);
  const commitType = commitTypeAndSummary[0];
  const commitSummary = commitTypeAndSummary[1];
  if (!commitSummary) {
    throw new Error("Missing summary");
  }
  return { type: commitType, summary: commitSummary };
}
```

#### ❌ **Bad**: Using abbreviations (except for well-known terms)

```ts
export function parse(msg: string, delim: string = ": ") {
  if (!msg) return undefined;
  const [type, smry] = msg.split(delim, 2);
  if (!smry) throw new Error("Missing summary");
  return { type, smry };
}
```

#### ❌ **Bad**: Whitespace to separate blocks

```ts
export function parse(message: string, delimiter: string = ": ") {
  if (!message) return undefined;

  const [type, summary] = message.split(delimiter, 2);
  if (!summary) throw new Error("Missing summary");

  return { type, summary };
}
```

#### ✅️ **Good**: Focused and concise testing

```ts
import { assertEquals } from "@std/assert";

export function parse(message: string) {
  const [type, summary] = message.split(": ", 2);
  return { type, summary };
}

Deno.test("parse() returns commit type and summary", () => {
  assertEquals(parse("feat: add new feature"), {
    type: "feat",
    summary: "add new feature",
  });
});
```

#### ❌ **Bad**: Explanatory testing

```ts
import { assertEquals } from "@std/assert";

export function parse(message: string) {
  const [type, summary] = message.split(": ", 2);
  return { type, summary };
}

Deno.test("parse() returns commit type and summary", () => {
  // Given a conventional commit message
  const message = "feat: add new feature";
  // When we parse the message
  const result = parse(message);
  // Then we expect the type to be "feat"
  assertEquals(result.type, "feat");
  // And we expect the summary to be "add new feature"
  assertEquals(result.summary, "add new feature");
  // Verify the result object is serializable
  // This ensures no functions or complex types are returned
  assertEquals(JSON.parse(JSON.stringify(result)), {
    type: "feat",
    summary: "add new feature",
  });
  // End of test
});
```
