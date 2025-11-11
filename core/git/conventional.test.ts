import { testCommit } from "@roka/git/testing";
import { assertEquals } from "@std/assert";
import { conventional } from "./conventional.ts";

Deno.test("conventional() creates conventional commits", () => {
  const commit = testCommit({ summary: "feat(scope): description" });
  assertEquals(conventional(commit), {
    ...commit,
    description: "description",
    type: "feat",
    scopes: ["scope"],
    footers: {},
  });
});

Deno.test("conventional() accepts simple commits", () => {
  const commit = testCommit({ summary: "description" });
  assertEquals(conventional(commit), {
    ...commit,
    description: "description",
    scopes: [],
    footers: {},
  });
});

Deno.test("conventional() accepts commits without scope", () => {
  const commit = testCommit({ summary: "feat: description" });
  assertEquals(conventional(commit), {
    ...commit,
    description: "description",
    type: "feat",
    scopes: [],
    footers: {},
  });
});

Deno.test("conventional() accepts empty scope", () => {
  const commit = testCommit({ summary: "feat(): description" });
  assertEquals(conventional(commit), {
    ...commit,
    description: "description",
    type: "feat",
    scopes: [],
    footers: {},
  });
});

Deno.test("conventional() accepts empty scopes", () => {
  const commit = testCommit({ summary: "feat(,): description" });
  assertEquals(conventional(commit), {
    ...commit,
    type: "feat",
    description: "description",
    scopes: [],
    footers: {},
  });
});

Deno.test("conventional() can create multiple scopes", () => {
  const commit = testCommit({ summary: "feat(scope1,scope2): description" });
  assertEquals(conventional(commit), {
    ...commit,
    description: "description",
    type: "feat",
    scopes: ["scope1", "scope2"],
    footers: {},
  });
});

Deno.test("conventional() accepts uppercase type and scopes", () => {
  const commit = testCommit({ summary: "FEAT(SCOPE): description" });
  assertEquals(conventional(commit), {
    ...commit,
    description: "description",
    type: "feat",
    scopes: ["scope"],
    footers: {},
  });
});

Deno.test("conventional() accepts no space after scope", () => {
  const commit = testCommit({ summary: "feat:summary" });
  assertEquals(conventional(commit), {
    ...commit,
    description: "summary",
    type: "feat",
    scopes: [],
    footers: {},
  });
});

Deno.test("conventional() accepts wild summary formatting", () => {
  const commit = testCommit({
    summary: " feat(  scoPE1, SCOPe2  ):  description ",
  });
  assertEquals(conventional(commit), {
    ...commit,
    description: "description ",
    type: "feat",
    scopes: ["scope1", "scope2"],
    footers: {},
  });
});

Deno.test("conventional() accepts scope with backticks", () => {
  const commit = testCommit({ summary: "feat(`scope`): description" });
  assertEquals(conventional(commit), {
    ...commit,
    type: "feat",
    description: "description",
    scopes: ["`scope`"],
    footers: {},
  });
});

Deno.test("conventional() can create breaking commits", () => {
  const commit = testCommit({ summary: "feat!: description" });
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
  const commit = testCommit({
    summary: "feat: description",
    trailers: { "BREAKING-CHANGE": "breaking" },
  });
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
  const commit = testCommit({
    summary: "feat: description",
    body: "BREAKING-CHANGE: breaking",
  });
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
  const commit = testCommit({
    summary: "feat: description",
    body: "BREAKING CHANGE: breaking",
  });
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
  const commit = testCommit({ summary: "feat(scope)!: description" });
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
  const commit = testCommit({ summary: "feat(scope): " });
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
  });
  assertEquals(conventional(commit), {
    ...commit,
    description: "description",
    type: "feat",
    scopes: ["scope"],
    footers: { fixes: "123", closes: "456" },
  });
});
