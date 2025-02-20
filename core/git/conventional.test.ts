import { conventional } from "@roka/git/conventional";
import { testCommit } from "@roka/git/testing";
import { assertEquals } from "@std/assert";

Deno.test("conventional() creates conventional commits", () => {
  const commit = testCommit({ summary: "feat(module): description" });
  assertEquals(conventional(commit), {
    ...commit,
    description: "description",
    type: "feat",
    modules: ["module"],
    breaking: false,
  });
});

Deno.test("conventional() accepts be simple commits", () => {
  const commit = testCommit({ summary: "description" });
  assertEquals(conventional(commit), {
    ...commit,
    description: "description",
    type: undefined,
    modules: [],
    breaking: false,
  });
});

Deno.test("conventional() can create breaking commits", () => {
  const commit = testCommit({ summary: "feat!: description" });
  assertEquals(conventional(commit), {
    ...commit,
    description: "description",
    type: "feat",
    modules: [],
    breaking: true,
  });
});

Deno.test("conventional() can create breaking commits from footer", () => {
  const commit = {
    ...testCommit({ summary: "feat: description" }),
    body: "BREAKING CHANGE: breaking",
  };
  assertEquals(conventional(commit), {
    ...commit,
    description: "description",
    type: "feat",
    modules: [],
    breaking: true,
  });
});

Deno.test("conventional() can create breaking commit with module", () => {
  const commit = testCommit({ summary: "feat(module)!: description" });
  assertEquals(conventional(commit), {
    ...commit,
    description: "description",
    type: "feat",
    modules: ["module"],
    breaking: true,
  });
});

Deno.test("conventional() can create multiple modules", () => {
  const commit = testCommit({ summary: "feat(module1,module2): description" });
  assertEquals(conventional(commit), {
    ...commit,
    description: "description",
    type: "feat",
    modules: ["module1", "module2"],
    breaking: false,
  });
});

Deno.test("conventional() commits must have a description", () => {
  const commit = testCommit({ summary: "feat(module): " });
  assertEquals(conventional(commit), {
    ...commit,
    description: "feat(module): ",
    type: undefined,
    modules: [],
    breaking: false,
  });
});
