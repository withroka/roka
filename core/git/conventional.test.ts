import type { Commit } from "@roka/git";
import { conventional } from "@roka/git/conventional";
import { assertEquals } from "@std/assert";

function testCommit(summary: string): Commit {
  return {
    hash: "hash",
    short: "short",
    author: { name: "author-name", email: "author-email" },
    committer: { name: "committer-name", email: "committer-email" },
    summary: summary,
    body: "body",
  };
}

Deno.test("conventional() creates conventional commits", () => {
  const commit = testCommit("feat(module): description");
  assertEquals(conventional(commit), {
    ...commit,
    description: "description",
    type: "feat",
    modules: ["module"],
    breaking: false,
  });
});

Deno.test("conventional() accepts be simple commits", () => {
  const commit = testCommit("description");
  assertEquals(conventional(commit), {
    ...commit,
    description: "description",
    type: undefined,
    modules: [],
    breaking: false,
  });
});

Deno.test("conventional() can create breaking commits", () => {
  const commit = testCommit("feat!: description");
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
    ...testCommit("feat: description"),
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
  const commit = testCommit("feat(module)!: description");
  assertEquals(conventional(commit), {
    ...commit,
    description: "description",
    type: "feat",
    modules: ["module"],
    breaking: true,
  });
});

Deno.test("conventional() can create multiple modules", () => {
  const commit = testCommit("feat(module1,module2): description");
  assertEquals(conventional(commit), {
    ...commit,
    description: "description",
    type: "feat",
    modules: ["module1", "module2"],
    breaking: false,
  });
});

Deno.test("conventional() commits must have a description", () => {
  const commit = testCommit("feat(module): ");
  assertEquals(conventional(commit), {
    ...commit,
    description: "feat(module): ",
    type: undefined,
    modules: [],
    breaking: false,
  });
});
