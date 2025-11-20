import { testCommit } from "@roka/git/testing";
import { assertEquals, assertExists } from "@std/assert";
import { conventional } from "./conventional.ts";

Deno.test("conventional() creates conventional commits", () => {
  const commit = testCommit({ subject: "feat(scope): description" });
  assertExists(commit.trailers);
  assertEquals(conventional(commit), {
    ...commit,
    type: "feat",
    description: "description",
    breaking: false,
    scopes: ["scope"],
    ...commit.trailers && { footers: { ...commit.trailers } },
  });
});

Deno.test("conventional() accepts simple commits", () => {
  const commit = testCommit({ subject: "description" });
  assertEquals(conventional(commit), {
    ...commit,
    description: "description",
    breaking: false,
    ...commit.trailers && { footers: { ...commit.trailers } },
  });
});

Deno.test("conventional() accepts commits without scope", () => {
  const commit = testCommit({ subject: "feat: description" });
  assertEquals(conventional(commit), {
    ...commit,
    type: "feat",
    description: "description",
    breaking: false,
    ...commit.trailers && { footers: { ...commit.trailers } },
  });
});

Deno.test("conventional() accepts empty scope", () => {
  const commit = testCommit({ subject: "feat(): description" });
  assertEquals(conventional(commit), {
    ...commit,
    type: "feat",
    description: "description",
    breaking: false,
    scopes: [],
    ...commit.trailers && { footers: { ...commit.trailers } },
  });
});

Deno.test("conventional() accepts empty scopes", () => {
  const commit = testCommit({ subject: "feat(,): description" });
  assertEquals(conventional(commit), {
    ...commit,
    type: "feat",
    description: "description",
    breaking: false,
    scopes: [],
    ...commit.trailers && { footers: { ...commit.trailers } },
  });
});

Deno.test("conventional() can create multiple scopes", () => {
  const commit = testCommit({ subject: "feat(scope1,scope2): description" });
  assertEquals(conventional(commit), {
    ...commit,
    type: "feat",
    description: "description",
    breaking: false,
    scopes: ["scope1", "scope2"],
    ...commit.trailers && { footers: { ...commit.trailers } },
  });
});

Deno.test("conventional() accepts uppercase type and scopes", () => {
  const commit = testCommit({ subject: "FEAT(SCOPE): description" });
  assertEquals(conventional(commit), {
    ...commit,
    type: "feat",
    description: "description",
    breaking: false,
    scopes: ["scope"],
    ...commit.trailers && { footers: { ...commit.trailers } },
  });
});

Deno.test("conventional() accepts no space after scope", () => {
  const commit = testCommit({ subject: "feat:description" });
  assertEquals(conventional(commit), {
    ...commit,
    type: "feat",
    description: "description",
    breaking: false,
    ...commit.trailers && { footers: { ...commit.trailers } },
  });
});

Deno.test("conventional() accepts wild subject formatting", () => {
  const commit = testCommit({
    subject: " feat(  scoPE1, SCOPe2  ):  description ",
  });
  assertEquals(conventional(commit), {
    ...commit,
    type: "feat",
    description: "description ",
    breaking: false,
    scopes: ["scope1", "scope2"],
    ...commit.trailers && { footers: { ...commit.trailers } },
  });
});

Deno.test("conventional() accepts scope with backticks", () => {
  const commit = testCommit({ subject: "feat(`scope`): description" });
  assertEquals(conventional(commit), {
    ...commit,
    type: "feat",
    description: "description",
    breaking: false,
    scopes: ["`scope`"],
    ...commit.trailers && { footers: { ...commit.trailers } },
  });
});

Deno.test("conventional() can create breaking commits", () => {
  const commit = testCommit({ subject: "feat!: description" });
  assertEquals(conventional(commit), {
    ...commit,
    type: "feat",
    description: "description",
    breaking: true,
    ...commit.trailers && { footers: { ...commit.trailers } },
  });
});

Deno.test("conventional() can create breaking commits from trailers", () => {
  const commit = testCommit({
    subject: "feat: description",
    trailers: { "BREAKING-CHANGE": "breaking" },
  });
  assertEquals(conventional(commit), {
    ...commit,
    type: "feat",
    description: "description",
    breaking: true,
    footers: { "BREAKING-CHANGE": "breaking" },
  });
});

Deno.test("conventional() can create breaking commits from body footer", () => {
  const commit = testCommit({
    subject: "feat: description",
    body: "BREAKING-CHANGE: breaking",
    trailers: {},
  });
  assertEquals(conventional(commit), {
    ...commit,
    type: "feat",
    description: "description",
    breaking: true,
    footers: { "BREAKING-CHANGE": "breaking" },
  });
});

Deno.test("conventional() breaking footer can contain whitespace", () => {
  const commit = testCommit({
    subject: "feat: description",
    body: "BREAKING CHANGE: breaking",
    trailers: {},
  });
  assertEquals(conventional(commit), {
    ...commit,
    type: "feat",
    description: "description",
    breaking: true,
    footers: { "BREAKING-CHANGE": "breaking" },
  });
});

Deno.test("conventional() can create breaking commit with scope", () => {
  const commit = testCommit({ subject: "feat(scope)!: description" });
  assertEquals(conventional(commit), {
    ...commit,
    type: "feat",
    description: "description",
    breaking: true,
    scopes: ["scope"],
    ...commit.trailers && { footers: { ...commit.trailers } },
  });
});

Deno.test("conventional() commits must have a description", () => {
  const commit = testCommit({ subject: "feat(scope): " });
  assertEquals(conventional(commit), {
    ...commit,
    description: "feat(scope): ",
    breaking: false,
    ...commit.trailers && { footers: { ...commit.trailers } },
  });
});

Deno.test("conventional() can parse footers", () => {
  const commit = testCommit({
    subject: "feat(scope): description",
    body: "Detailed commit explanation.\n\nFixes #123\nCloses #456",
    trailers: {},
  });
  assertEquals(conventional(commit), {
    ...commit,
    type: "feat",
    description: "description",
    breaking: false,
    scopes: ["scope"],
    footers: {
      fixes: "123",
      closes: "456",
    },
  });
});

Deno.test("conventional() treats trailers as footers", () => {
  const commit = testCommit({
    subject: "feat(scope): description",
    trailers: { "Signed-off-by": "author-name <author-email>" },
  });
  assertEquals(conventional(commit), {
    ...commit,
    type: "feat",
    description: "description",
    breaking: false,
    scopes: ["scope"],
    footers: {
      "Signed-off-by": "author-name <author-email>",
    },
  });
});
