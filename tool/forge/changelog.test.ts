import { testCommit } from "@roka/git/testing";
import { assertEquals } from "@std/assert";
import { changelog } from "./changelog.ts";

Deno.test("changelog() generates Markdown changelog", () => {
  const commits = [
    testCommit({ subject: "feat(name): introduce" }),
    testCommit({ subject: "build(name)!: breaking" }),
    testCommit({ subject: "fix: fix code" }),
    testCommit({ subject: "no type" }),
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
    testCommit({ subject: "feat: introduce" }),
    testCommit({ subject: "fix: fix code" }),
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
    testCommit({ subject: "feat: introduce" }),
    testCommit({ subject: "fix: fix code" }),
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
    testCommit({ subject: "style!: breaking-style-1" }),
    testCommit({ subject: "build: build" }),
    testCommit({ subject: "build!: breaking-build" }),
    testCommit({ subject: "chore: chore" }),
    testCommit({ subject: "ci: ci" }),
    testCommit({ subject: "docs: docs" }),
    testCommit({ subject: "fix: fix" }),
    testCommit({ subject: "fix!: breaking-fix" }),
    testCommit({ subject: "perf: perf-1" }),
    testCommit({ subject: "refactor: refactor" }),
    testCommit({ subject: "revert: revert" }),
    testCommit({ subject: "style: style" }),
    testCommit({ subject: "style!: breaking-style-2" }),
    testCommit({ subject: "test: test" }),
    testCommit({ subject: "perf: perf-2" }),
    testCommit({ subject: "unknown: unknown" }),
    testCommit({ subject: "no type" }),
    testCommit({ subject: "feat: feat-1" }),
    testCommit({ subject: "feat: feat-2" }),
    testCommit({ subject: "feat!: breaking-feat" }),
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
    testCommit({ subject: "build(name)!: breaking" }),
    testCommit({ subject: "build: build" }),
    testCommit({ subject: "chore(name): chore" }),
    testCommit({ subject: "ci: ci" }),
    testCommit({ subject: "docs(name): docs" }),
    testCommit({ subject: "feat: feat" }),
    testCommit({ subject: "fix(module/submodule): fix" }),
    testCommit({ subject: "perf: perf" }),
    testCommit({ subject: "refactor(name/unstable): refactor" }),
    testCommit({ subject: "revert: revert" }),
    testCommit({ subject: "style(name): style" }),
    testCommit({ subject: "test: test" }),
    testCommit({ subject: "unknown(name): unknown" }),
    testCommit({ subject: "no type" }),
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
    testCommit({ subject: "fix code (#1)" }),
    testCommit({ subject: "not a number (#this is not)", short: "short-1" }),
    testCommit({ subject: "no number", short: "short-2" }),
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
    testCommit({ subject: "feat(name): introduce (#3)" }),
    testCommit({ subject: "build(name/submodule)!: breaking (#2)" }),
    testCommit({ subject: "fix: fix code (#1)" }),
    testCommit({ subject: "fix: not a number (#this is not)" }),
    testCommit({ subject: "no number" }),
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
    testCommit({ subject: "feat(name): introduce (#3)" }),
    testCommit({ subject: "build(name/submodule)!: breaking (#2)" }),
    testCommit({ subject: "fix: fix code (#1)" }),
    testCommit({ subject: "fix: not a number (#this is not)" }),
    testCommit({ subject: "no number" }),
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
