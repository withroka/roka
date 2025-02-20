import { conventional } from "@roka/git/conventional";
import { testCommit } from "@roka/git/testing";
import { assertEquals } from "@std/assert";

Deno.test("conventional() creates conventional commits", () => {
  const commit = testCommit({
    summary: "feat(scope): description",
    trailers: {},
  });
  assertEquals(conventional(commit), {
    ...commit,
    description: "description",
    type: "feat",
    scopes: ["scope"],
    footers: {},
  });
});

Deno.test("conventional() accepts be simple commits", () => {
  const commit = testCommit({ summary: "description", trailers: {} });
  assertEquals(conventional(commit), {
    ...commit,
    description: "description",
    scopes: [],
    footers: {},
  });
});

Deno.test("conventional() can create multiple scopes", () => {
  const commit = testCommit({
    summary: "feat(scope1,scope2): description",
    trailers: {},
  });
  assertEquals(conventional(commit), {
    ...commit,
    description: "description",
    type: "feat",
    scopes: ["scope1", "scope2"],
    footers: {},
  });
});

Deno.test("conventional() accepts uppercase type and scopes", () => {
  const commit = testCommit({
    summary: "FEAT(SCOPE): description",
    trailers: {},
  });
  assertEquals(conventional(commit), {
    ...commit,
    description: "description",
    type: "feat",
    scopes: ["scope"],
    footers: {},
  });
});

Deno.test("conventional() can create breaking commits", () => {
  const commit = testCommit({ summary: "feat!: description", trailers: {} });
  assertEquals(conventional(commit), {
    ...commit,
    description: "description",
    type: "feat",
    scopes: [],
    breaking: "description",
    footers: {},
  });
});

Deno.test("conventional() can create breaking commits from trailers", () => {
  const commit = {
    ...testCommit({
      summary: "feat: description",
      trailers: { "BREAKING-CHANGE": "breaking" },
    }),
  };
  assertEquals(conventional(commit), {
    ...commit,
    description: "description",
    type: "feat",
    scopes: [],
    breaking: "breaking",
    footers: { "BREAKING-CHANGE": "breaking" },
  });
});

Deno.test("conventional() can create breaking commits from body footer", () => {
  const commit = {
    ...testCommit({ summary: "feat: description", trailers: {} }),
    body: "BREAKING-CHANGE: breaking",
  };
  assertEquals(conventional(commit), {
    ...commit,
    description: "description",
    type: "feat",
    scopes: [],
    breaking: "breaking",
    footers: { "BREAKING-CHANGE": "breaking" },
  });
});

Deno.test("conventional() breaking footer can contain whitespace", () => {
  const commit = {
    ...testCommit({ summary: "feat: description", trailers: {} }),
    body: "BREAKING CHANGE: breaking",
  };
  assertEquals(conventional(commit), {
    ...commit,
    description: "description",
    type: "feat",
    scopes: [],
    breaking: "breaking",
    footers: { "BREAKING-CHANGE": "breaking" },
  });
});

Deno.test("conventional() can create breaking commit with scope", () => {
  const commit = testCommit({
    summary: "feat(scope)!: description",
    trailers: {},
  });
  assertEquals(conventional(commit), {
    ...commit,
    description: "description",
    type: "feat",
    scopes: ["scope"],
    breaking: "description",
    footers: {},
  });
});

Deno.test("conventional() commits must have a description", () => {
  const commit = testCommit({ summary: "feat(scope): ", trailers: {} });
  assertEquals(conventional(commit), {
    ...commit,
    description: "feat(scope): ",
    scopes: [],
    footers: {},
  });
});

Deno.test("conventional() can parse footers", () => {
  const commit = testCommit({
    summary: "feat(scope): description",
    body: "Detailed commit explanation.\n\nFixes #123\nCloses #456",
    trailers: {},
  });
  assertEquals(conventional(commit), {
    ...commit,
    description: "description",
    type: "feat",
    scopes: ["scope"],
    footers: { fixes: "123", closes: "456" },
  });
});
