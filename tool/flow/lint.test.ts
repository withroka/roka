import { tempDirectory } from "@roka/fs/temp";
import { fakeCommand } from "@roka/testing/fake";
import { assertEquals, assertRejects } from "@std/assert";
import { lint } from "./lint.ts";

Deno.test("lint() accepts empty array", async () => {
  using command = fakeCommand();
  await lint([]);
  assertEquals(command.runs, []);
});

Deno.test("lint() accepts file with no issues", async () => {
  await using _ = await tempDirectory({ chdir: true });
  await Deno.writeTextFile(
    "file.ts",
    [
      "/**",
      " * Some text",
      " * ```ts",
      " * Deno.exit(0);",
      " * ```",
      " */",
      "export function f(): number { return 42; }",
    ].join("\n"),
  );
  await lint(["file.ts"]);
});

Deno.test("lint() rejects file with issues", async () => {
  await using _ = await tempDirectory({ chdir: true });
  await Deno.writeTextFile(
    "file.ts",
    [
      "function f() { if(true) return 42; }",
      "```",
    ].join("\n"),
  );
  await assertRejects(() => lint(["file.ts"]), Error, "Linting failed");
});

Deno.test("lint() rejects file with issues in doc code blocks", async () => {
  await using _ = await tempDirectory({ chdir: true });
  await Deno.writeTextFile(
    "file.ts",
    [
      "/**",
      " * Some text",
      " * ```ts",
      " * const x = 2;",
      " * ```",
      " * More text",
      " * ```js",
      " * // Some comment",
      " * if (true) {}",
      " * ```",
      " */",
      "export function f() { return 42; }",
      "```",
    ].join("\n"),
  );
  await assertRejects(() => lint(["file.ts"]), Error, "Linting failed");
});

Deno.test("lint() rejects Markdown file with issues in code blocks", async () => {
  await using _ = await tempDirectory({ chdir: true });
  await Deno.writeTextFile(
    "file.md",
    [
      "# Title",
      "",
      "Some text",
      "",
      "```ts",
      "if (true) {}",
      "```",
      "",
      "End of file",
    ].join("\n"),
  );
  await assertRejects(() => lint(["file.md"]), Error, "Linting failed");
});

Deno.test("lint() ignores code blocks in Markdown with no extension specified", async () => {
  await using _ = await tempDirectory({ chdir: true });
  const content = [
    "# Title",
    "",
    "Some text",
    "",
    "```",
    "not really a code",
    "```",
    "",
    "End of file",
    "",
  ].join("\n");
  await Deno.writeTextFile("file.md", content);
  await lint(["file.md"]);
  const formatted = await Deno.readTextFile("file.md");
  assertEquals(formatted, content);
});

Deno.test("lint() ignores code blocks with no extension specified", async () => {
  await using _ = await tempDirectory({ chdir: true });
  await Deno.writeTextFile(
    "file.ts",
    [
      "/**",
      " * ```",
      " * if (true) {}",
      " * ```",
      " */",
    ].join("\n"),
  );
  await lint(["file.ts"]);
});

Deno.test("lint() rejects multiple files with issues", async () => {
  await using _ = await tempDirectory({ chdir: true });
  await Deno.writeTextFile("file1.ts", "function f() { if(true) return 42; }");
  await Deno.writeTextFile("file2.ts", "const x = 2;");
  await assertRejects(
    () => lint(["file1.ts", "file2.ts"]),
    Error,
    "Linting failed",
  );
});
