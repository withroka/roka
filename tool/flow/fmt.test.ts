import { tempDirectory } from "@roka/fs/temp";
import { fakeCommand } from "@roka/testing/fake";
import { assertEquals, assertRejects } from "@std/assert";
import { fmt } from "./fmt.ts";

Deno.test("fmt() accepts empty array", async () => {
  using command = fakeCommand();
  await fmt([]);
  assertEquals(command.runs, []);
});

Deno.test("fmt() formats code", async () => {
  await using _ = await tempDirectory({ chdir: true });
  await Deno.writeTextFile("file.ts", "export   const y= 1");
  await fmt(["file.ts"]);
  const formatted = await Deno.readTextFile("file.ts");
  assertEquals(formatted, "export const y = 1;\n");
});

Deno.test("fmt() formats code blocks and file content", async () => {
  await using _ = await tempDirectory({ chdir: true });
  await Deno.writeTextFile(
    "file.ts",
    [
      "/**",
      " * Example",
      " * ```ts",
      " * const   x= {a:1}",
      " * console.log(  x )",
      " * ```",
      " */",
      "export   const y= 1",
      "",
    ].join("\n"),
  );
  await fmt(["file.ts"]);
  const formatted = await Deno.readTextFile("file.ts");
  assertEquals(
    formatted,
    [
      "/**",
      " * Example",
      " * ```ts",
      " * const x = { a: 1 };",
      " * console.log(x);",
      " * ```",
      " */",
      "export const y = 1;",
      "",
    ].join("\n"),
  );
});

Deno.test("fmt() leaves already formatted code block unchanged", async () => {
  await using _ = await tempDirectory({ chdir: true });
  const content = [
    "/**",
    " * Example",
    " * ```ts",
    " * const x = 1;",
    " * ```",
    " */",
    "export const y = 1;",
    "",
  ].join("\n");
  await Deno.writeTextFile("file.ts", content);
  await fmt(["file.ts"]);
  const formatted = await Deno.readTextFile("file.ts");
  assertEquals(formatted, content);
});

Deno.test("fmt() ignores code blocks with no extension specified", async () => {
  await using _ = await tempDirectory({ chdir: true });
  const content = [
    "/**",
    " * Some text",
    " * ```",
    " * const   x= 2;",
    " * ```",
    " */",
    "",
  ].join("\n");
  await Deno.writeTextFile("file.ts", content);
  await fmt(["file.ts"]);
  const formatted = await Deno.readTextFile("file.ts");
  assertEquals(formatted, content);
});

Deno.test("fmt() ignores code blocks in Markdown with no extension specified", async () => {
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
  await fmt(["file.md"]);
  const formatted = await Deno.readTextFile("file.md");
  assertEquals(formatted, content);
});

Deno.test("fmt() rejects file with invalid code block", async () => {
  await using _ = await tempDirectory({ chdir: true });
  await Deno.writeTextFile("file.ts", "const x = {");
  await assertRejects(() => fmt(["file.ts"]), Error, "Formatting failed");
});

Deno.test("fmt() rejects Markdown file with invalid code block", async () => {
  await using _ = await tempDirectory({ chdir: true });
  await Deno.writeTextFile(
    "file.md",
    [
      "# Title",
      "",
      "Some text",
      "",
      "```ts",
      "if (true) {",
      "```",
      "",
      "End of file",
    ].join("\n"),
  );
  await assertRejects(() => fmt(["file.md"]), Error, "Formatting failed");
});
