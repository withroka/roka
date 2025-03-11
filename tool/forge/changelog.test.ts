import { changelog } from "@roka/forge/changelog";
import { testCommit } from "@roka/git/testing";
import { assertEquals } from "@std/assert";

Deno.test("changelog() generates Markdown changelog", () => {
  const commits = [
    testCommit({ summary: "feat(name): introduce" }),
    testCommit({ summary: "build(name)!: breaking" }),
    testCommit({ summary: "fix(name): fix code" }),
    testCommit({ summary: "no type" }),
  ];
  assertEquals(
    changelog(commits),
    [
      "- feat(name): introduce",
      "- build(name)!: breaking",
      "- fix(name): fix code",
      "- no type",
      "",
    ].join("\n"),
  );
});

Deno.test("changelog() adds title and footer", () => {
  const commits = [
    testCommit({ summary: "feat(name): introduce" }),
    testCommit({ summary: "fix(name): fix code" }),
  ];
  assertEquals(
    changelog(commits, {
      title: "Title",
      footer: { title: "Footer", items: ["item1", "item2"] },
    }),
    [
      "## Title",
      "",
      "- feat(name): introduce",
      "- fix(name): fix code",
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
    testCommit({ summary: "feat(name): introduce" }),
    testCommit({ summary: "fix(name): fix code" }),
  ];
  assertEquals(
    changelog(commits, {
      title: "Title",
      footer: { title: "Footer", items: ["item1", "item2"] },
      markdown: { heading: "# ", subheading: "## ", bullet: "* " },
    }),
    [
      "# Title",
      "",
      "* feat(name): introduce",
      "* fix(name): fix code",
      "",
      "## Footer",
      "",
      "* item1",
      "* item2",
      "",
    ].join("\n"),
  );
});

Deno.test("changelog() generates frivolous changelog with emojis", () => {
  const commits = [
    testCommit({ summary: "build(name)!: breaking" }),
    testCommit({ summary: "build(name): build" }),
    testCommit({ summary: "chore(name): chore" }),
    testCommit({ summary: "ci(name): ci" }),
    testCommit({ summary: "docs(name): docs" }),
    testCommit({ summary: "feat(name): feat" }),
    testCommit({ summary: "fix(name): fix" }),
    testCommit({ summary: "perf(name): perf" }),
    testCommit({ summary: "refactor(name): refactor" }),
    testCommit({ summary: "revert(name): revert" }),
    testCommit({ summary: "style(name): style" }),
    testCommit({ summary: "test(name): test" }),
    testCommit({ summary: "unknown(name): unknown" }),
    testCommit({ summary: "no type" }),
  ];
  assertEquals(
    changelog(commits, { emoji: true, markdown: { bullet: "" } }),
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
