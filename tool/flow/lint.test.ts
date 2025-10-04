import { tempDirectory } from "@roka/fs/temp";
import { fakeCommand } from "@roka/testing/fake";
import { assertEquals, assertStringIncludes } from "@std/assert";
import { lint } from "./lint.ts";

Deno.test("lint() accepts empty array", async () => {
  using command = fakeCommand();
  assertEquals(await Array.fromAsync(lint([])), []);
  assertEquals(command.runs, []);
});

Deno.test("lint() accepts file with no errors", async () => {
  await using _ = await tempDirectory({ chdir: true });
  const content = [
    "/**",
    " * Some text",
    " * ```ts",
    " * Deno.exit(0);",
    " * ```",
    " */",
    "export function f(): number { return 42; }",
  ].join("\n");
  await Deno.writeTextFile("file.ts", content);
  assertEquals(await Array.fromAsync(lint(["file.ts"])), []);
  assertEquals(await Deno.readTextFile("file.ts"), content);
});

Deno.test("lint() reports lint errors", async () => {
  await using _ = await tempDirectory({ chdir: true });
  await Deno.writeTextFile(
    "file.ts",
    [
      "function f() { if(true) {}; }",
    ].join("\n"),
  );
  const problems = await Array.fromAsync(lint(["file.ts"]));
  assertEquals(problems.length, 3);
  assertStringIncludes(problems[0]?.message ?? "", "no-unused-vars");
  assertStringIncludes(problems[1]?.message ?? "", "no-constant-condition");
  assertStringIncludes(problems[2]?.message ?? "", "no-empty");
});

Deno.test("lint() reports lint errors in JSDoc code blocks", async () => {
  await using _ = await tempDirectory({ chdir: true });
  const content = [
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
  ].join("\n");
  await Deno.writeTextFile("file.ts", content);
  const problems = await Array.fromAsync(lint(["file.ts"]));
  assertEquals(problems.length, 3);
  assertStringIncludes(problems[0]?.message ?? "", "no-unused-vars");
  assertStringIncludes(problems[1]?.message ?? "", "no-constant-condition");
  assertStringIncludes(problems[2]?.message ?? "", "no-empty");
  assertEquals(await Deno.readTextFile("file.ts"), content);
});

Deno.test("lint() reports lint errors in Markdown code blocks", async () => {
  await using _ = await tempDirectory({ chdir: true });
  const content = [
    "# Title",
    "",
    "Some text",
    "",
    "```ts",
    "const x = 2;",
    "if (true) {}",
    "```",
    "",
    "End of file",
    "",
  ].join("\n");
  await Deno.writeTextFile("file.md", content);
  const problems = await Array.fromAsync(lint(["file.md"]));
  assertEquals(problems.length, 3);
  assertStringIncludes(problems[0]?.message ?? "", "no-unused-vars");
  assertStringIncludes(problems[1]?.message ?? "", "no-constant-condition");
  assertStringIncludes(problems[2]?.message ?? "", "no-empty");
  assertEquals(await Deno.readTextFile("file.md"), content);
});

Deno.test("lint() ignores code blocks in JSDoc with no extension specified", async () => {
  await using _ = await tempDirectory({ chdir: true });
  const content = [
    "/**",
    " * ```",
    " * if (true) {}",
    " * ```",
    " */",
  ].join("\n");
  await Deno.writeTextFile("file.ts", content);
  assertEquals(await Array.fromAsync(lint(["file.ts"])), []);
  assertEquals(await Deno.readTextFile("file.ts"), content);
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
  assertEquals(await Array.fromAsync(lint(["file.md"])), []);
  assertEquals(await Deno.readTextFile("file.md"), content);
});

Deno.test("lint() reports problems from multiple files", async () => {
  await using _ = await tempDirectory({ chdir: true });
  await Deno.writeTextFile("file1.ts", "export function f() { if(true) {} }");
  await Deno.writeTextFile("file2.ts", "const x = 2;");
  const problems = await Array.fromAsync(lint(["file1.ts", "file2.ts"]));
  assertEquals(problems.length, 3);
  assertStringIncludes(problems[0]?.message ?? "", "file1.ts");
  assertStringIncludes(problems[0]?.message ?? "", "no-constant-condition");
  assertStringIncludes(problems[1]?.message ?? "", "file1.ts");
  assertStringIncludes(problems[1]?.message ?? "", "no-empty");
  assertStringIncludes(problems[2]?.message ?? "", "file2.ts");
  assertStringIncludes(problems[2]?.message ?? "", "no-unused-vars");
});
