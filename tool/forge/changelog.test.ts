import { testCommit } from "@roka/git/testing";
import { assertEquals } from "@std/assert";
import { changelog } from "./changelog.ts";

Deno.test("changelog() generates Markdown changelog", () => {
  const commits = [
    testCommit({ summary: "feat(name): introduce" }),
    testCommit({ summary: "build(name)!: breaking" }),
    testCommit({ summary: "fix: fix code" }),
    testCommit({ summary: "no type" }),
  ];
  assertEquals(
    changelog(commits),
    [
      "- feat(name): introduce",
      "- build(name)!: breaking",
      "- fix: fix code",
      "- no type",
      "",
    ].join("\n"),
  );
});

Deno.test("changelog() allows custom content", () => {
  const commits = [
    testCommit({ summary: "feat: introduce" }),
    testCommit({ summary: "fix: fix code" }),
  ];
  assertEquals(
    changelog(commits, {
      content: {
        title: "Title",
        footer: { title: "Footer", items: ["item1", "item2"] },
      },
    }),
    [
      "## Title",
      "",
      "- feat: introduce",
      "- fix: fix code",
      "",
      "### Footer",
      "",
      "- item1",
      "- item2",
      "",
    ].join("\n"),
  );
});

Deno.test("changelog() allows custom Markdown", () => {
  const commits = [
    testCommit({ summary: "feat: introduce" }),
    testCommit({ summary: "fix: fix code" }),
  ];
  assertEquals(
    changelog(commits, {
      content: {
        title: "Title",
        footer: { title: "Footer", items: ["item1", "item2"] },
      },
      markdown: { heading: "# ", subheading: "## ", bullet: "* " },
    }),
    [
      "# Title",
      "",
      "* feat: introduce",
      "* fix: fix code",
      "",
      "## Footer",
      "",
      "* item1",
      "* item2",
      "",
    ].join("\n"),
  );
});

Deno.test("changelog() can sort commits by importance", () => {
  const commits = [
    testCommit({ summary: "style!: breaking-style-1" }),
    testCommit({ summary: "build: build" }),
    testCommit({ summary: "build!: breaking-build" }),
    testCommit({ summary: "chore: chore" }),
    testCommit({ summary: "ci: ci" }),
    testCommit({ summary: "docs: docs" }),
    testCommit({ summary: "fix: fix" }),
    testCommit({ summary: "fix!: breaking-fix" }),
    testCommit({ summary: "perf: perf-1" }),
    testCommit({ summary: "refactor: refactor" }),
    testCommit({ summary: "revert: revert" }),
    testCommit({ summary: "style: style" }),
    testCommit({ summary: "style!: breaking-style-2" }),
    testCommit({ summary: "test: test" }),
    testCommit({ summary: "perf: perf-2" }),
    testCommit({ summary: "unknown: unknown" }),
    testCommit({ summary: "no type" }),
    testCommit({ summary: "feat: feat-1" }),
    testCommit({ summary: "feat: feat-2" }),
    testCommit({ summary: "feat!: breaking-feat" }),
  ];
  assertEquals(
    changelog(commits, {
      commit: { sort: "importance" },
    }),
    [
      "- feat!: breaking-feat",
      "- fix!: breaking-fix",
      "- build!: breaking-build",
      "- style!: breaking-style-1",
      "- style!: breaking-style-2",
      "- feat: feat-1",
      "- feat: feat-2",
      "- fix: fix",
      "- build: build",
      "- chore: chore",
      "- ci: ci",
      "- docs: docs",
      "- perf: perf-1",
      "- perf: perf-2",
      "- refactor: refactor",
      "- revert: revert",
      "- style: style",
      "- test: test",
      "- unknown: unknown",
      "- no type",
      "",
    ].join("\n"),
  );
});

Deno.test("changelog() generates frivolous changelog with emojis", () => {
  const commits = [
    testCommit({ summary: "build(name)!: breaking" }),
    testCommit({ summary: "build: build" }),
    testCommit({ summary: "chore(name): chore" }),
    testCommit({ summary: "ci: ci" }),
    testCommit({ summary: "docs(name): docs" }),
    testCommit({ summary: "feat: feat" }),
    testCommit({ summary: "fix(module): fix" }),
    testCommit({ summary: "perf: perf" }),
    testCommit({ summary: "refactor(name/unstable): refactor" }),
    testCommit({ summary: "revert: revert" }),
    testCommit({ summary: "style(name): style" }),
    testCommit({ summary: "test: test" }),
    testCommit({ summary: "unknown(name): unknown" }),
    testCommit({ summary: "no type" }),
  ];
  assertEquals(
    changelog(commits, {
      commit: { emoji: true },
      markdown: { bullet: "" },
    }),
    [
      "🔧 breaking 💥",
      "🔧 build",
      "🧹 chore",
      "👷 ci",
      "📝 docs",
      "✨ feat",
      "🐛 fix",
      "⚡️ perf",
      "♻️ refactor",
      "⏪ revert",
      "🎨 style",
      "🧪 test",
      "🔖 unknown",
      "🔖 no type",
      "",
    ].join("\n"),
  );
});

Deno.test("changelog() generates commit hashes", () => {
  const commits = [
    testCommit({ summary: "fix code (#1)" }),
    testCommit({ summary: "not a number (#this is not)", short: "short-1" }),
    testCommit({ summary: "no number", short: "short-2" }),
  ];
  assertEquals(
    changelog(commits, { commit: { hash: true } }),
    [
      "- fix code (#1)",
      "- not a number (#this is not) (short-1)",
      "- no number (short-2)",
      "",
    ].join("\n"),
  );
});

Deno.test("changelog() generates pull request numbers", () => {
  const commits = [
    testCommit({ summary: "feat(name): introduce (#3)" }),
    testCommit({ summary: "build(name)!: breaking (#2)" }),
    testCommit({ summary: "fix: fix code (#1)" }),
    testCommit({ summary: "fix: not a number (#this is not)" }),
    testCommit({ summary: "no number" }),
  ];
  assertEquals(
    changelog(commits, { commit: { github: true } }),
    [
      "- #3",
      "- #2",
      "- #1",
      "- fix: not a number (#this is not)",
      "- no number",
      "",
    ].join("\n"),
  );
});

Deno.test("changelog() generates pull request numbers with emojis", () => {
  const commits = [
    testCommit({ summary: "feat(name): introduce (#3)" }),
    testCommit({ summary: "build(name)!: breaking (#2)" }),
    testCommit({ summary: "fix: fix code (#1)" }),
    testCommit({ summary: "fix: not a number (#this is not)" }),
    testCommit({ summary: "no number" }),
  ];
  assertEquals(
    changelog(commits, { commit: { emoji: true, github: true } }),
    [
      "- ✨ #3",
      "- 🔧 #2 💥",
      "- 🐛 #1",
      "- 🐛 not a number (#this is not)",
      "- 🔖 no number",
      "",
    ].join("\n"),
  );
});
