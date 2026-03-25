import { testCommit } from "@roka/git/testing";
import { assertEquals, assertExists } from "@std/assert";
import { conventional } from "./conventional.ts";

Deno.test("conventional() creates conventional commits from full commit", () => {
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

Deno.test("conventional() creates conventional commits from commit message", () => {
  assertEquals(conventional({ subject: "feat(scope): description" }), {
    subject: "feat(scope): description",
    type: "feat",
    description: "description",
    breaking: false,
    scopes: ["scope"],
  });
});

Deno.test("conventional() accepts simple commits", () => {
  assertEquals(conventional({ subject: "description" }), {
    subject: "description",
    description: "description",
    breaking: false,
  });
});

Deno.test("conventional() accepts commits without scope", () => {
  assertEquals(conventional({ subject: "feat: description" }), {
    subject: "feat: description",
    type: "feat",
    description: "description",
    breaking: false,
  });
});

Deno.test("conventional() accepts empty scope", () => {
  assertEquals(conventional({ subject: "feat(): description" }), {
    subject: "feat(): description",
    type: "feat",
    description: "description",
    breaking: false,
    scopes: [],
  });
});

Deno.test("conventional() accepts empty scopes", () => {
  assertEquals(conventional({ subject: "feat(,): description" }), {
    subject: "feat(,): description",
    type: "feat",
    description: "description",
    breaking: false,
    scopes: [],
  });
});

Deno.test("conventional() can create multiple scopes", () => {
  assertEquals(conventional({ subject: "feat(scope1,scope2): description" }), {
    subject: "feat(scope1,scope2): description",
    type: "feat",
    description: "description",
    breaking: false,
    scopes: ["scope1", "scope2"],
  });
});

Deno.test("conventional() accepts uppercase type and scopes", () => {
  assertEquals(conventional({ subject: "FEAT(SCOPE): description" }), {
    subject: "FEAT(SCOPE): description",
    type: "feat",
    description: "description",
    breaking: false,
    scopes: ["scope"],
  });
});

Deno.test("conventional() accepts no space after scope", () => {
  assertEquals(conventional({ subject: "feat:description" }), {
    subject: "feat:description",
    type: "feat",
    description: "description",
    breaking: false,
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
  assertEquals(conventional({ subject: "feat(`scope`): description" }), {
    subject: "feat(`scope`): description",
    type: "feat",
    description: "description",
    breaking: false,
    scopes: ["`scope`"],
  });
});

Deno.test("conventional() can create breaking commits", () => {
  assertEquals(conventional({ subject: "feat!: description" }), {
    subject: "feat!: description",
    type: "feat",
    description: "description",
    breaking: true,
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
  assertEquals(conventional({ subject: "feat(scope)!: description" }), {
    subject: "feat(scope)!: description",
    type: "feat",
    description: "description",
    breaking: true,
    scopes: ["scope"],
  });
});

Deno.test("conventional() can create breaking commit from type", () => {
  assertEquals(conventional({ subject: "BREAKING: description" }), {
    subject: "BREAKING: description",
    type: "breaking",
    description: "description",
    breaking: true,
  });
});

Deno.test("conventional() can create breaking commit from type with scope", () => {
  assertEquals(conventional({ subject: "BREAKING(scope): description" }), {
    subject: "BREAKING(scope): description",
    type: "breaking",
    description: "description",
    breaking: true,
    scopes: ["scope"],
  });
});

Deno.test("conventional() does not accept lowercase breaking type", () => {
  assertEquals(conventional({ subject: "breaking: description" }), {
    subject: "breaking: description",
    type: "breaking",
    description: "description",
    breaking: false,
  });
});

Deno.test("conventional() commits must have a description", () => {
  assertEquals(conventional({ subject: "feat(scope): " }), {
    subject: "feat(scope): ",
    description: "feat(scope): ",
    breaking: false,
  });
});

Deno.test("conventional() can parse footers", () => {
  assertEquals(
    conventional({
      subject: "feat(scope): description",
      body: "Detailed commit explanation.\n\nFixes #123\nCloses #456",
    }),
    {
      subject: "feat(scope): description",
      body: "Detailed commit explanation.\n\nFixes #123\nCloses #456",
      type: "feat",
      description: "description",
      breaking: false,
      scopes: ["scope"],
      footers: {
        fixes: "123",
        closes: "456",
      },
    },
  );
});

Deno.test("conventional() treats trailers as footers", () => {
  assertEquals(
    conventional({
      subject: "feat(scope): description",
      trailers: { "Signed-off-by": "author-name <author-email>" },
    }),
    {
      subject: "feat(scope): description",
      trailers: { "Signed-off-by": "author-name <author-email>" },
      type: "feat",
      description: "description",
      breaking: false,
      scopes: ["scope"],
      footers: {
        "Signed-off-by": "author-name <author-email>",
      },
    },
  );
});
