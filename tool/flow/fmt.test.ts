import { tempDirectory } from "@roka/fs/temp";
import { fakeCommand } from "@roka/testing/fake";
import { assertEquals } from "@std/assert";
import { fmt } from "./fmt.ts";

Deno.test("fmt() accepts empty array", async () => {
  using command = fakeCommand();
  assertEquals(await Array.fromAsync(fmt([])), []);
  assertEquals(command.runs, []);
});

Deno.test("fmt() formats code", async () => {
  await using _ = await tempDirectory({ chdir: true });
  await Deno.writeTextFile(
    "file.ts",
    [
      "export   const y= 1",
      "function f(){return 42}",
    ].join("\n"),
  );
  assertEquals(await Array.fromAsync(fmt(["file.ts"])), []);
  assertEquals(
    await Deno.readTextFile("file.ts"),
    [
      "export const y = 1;",
      "function f() {",
      "  return 42;",
      "}",
      "",
    ].join("\n"),
  );
});

Deno.test("fmt() formats JSDoc code blocks", async () => {
  await using _ = await tempDirectory({ chdir: true });
  await Deno.writeTextFile(
    "file.ts",
    [
      "/**",
      " * Example",
      " * ```ts",
      " * export   const y= 1",
      " * function f(){return 42}",
      " * ```",
      " */",
      "export   const y= 1",
      "",
    ].join("\n"),
  );
  assertEquals(await Array.fromAsync(fmt(["file.ts"])), []);
  assertEquals(
    await Deno.readTextFile("file.ts"),
    [
      "/**",
      " * Example",
      " * ```ts",
      " * export const y = 1;",
      " * function f() {",
      " *   return 42;",
      " * }",
      " * ```",
      " */",
      "export const y = 1;",
      "",
    ].join("\n"),
  );
});

Deno.test("fmt() formats Markdown code blocks", async () => {
  await using _ = await tempDirectory({ chdir: true });
  await Deno.writeTextFile(
    "file.md",
    [
      "# Title",
      "",
      "Some text",
      "",
      "```ts",
      "export   const y= 1",
      "function f(){return 42}",
      "```",
      "",
      "End of file",
      "",
    ].join("\n"),
  );
  assertEquals(await Array.fromAsync(fmt(["file.md"])), []);
  assertEquals(
    await Deno.readTextFile("file.md"),
    [
      "# Title",
      "",
      "Some text",
      "",
      "```ts",
      "export const y = 1;",
      "function f() {",
      "  return 42;",
      "}",
      "```",
      "",
      "End of file",
      "",
    ].join("\n"),
  );
});

Deno.test("fmt() leaves already formatted JSDoc code block unchanged", async () => {
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
  assertEquals(await Array.fromAsync(fmt(["file.ts"])), []);
  assertEquals(await Deno.readTextFile("file.ts"), content);
});

Deno.test("fmt() leaves already formatted Markdown code block unchanged", async () => {
  await using _ = await tempDirectory({ chdir: true });
  const content = [
    "# Title",
    "",
    "Some text",
    "",
    "```ts",
    "const x = 1;",
    "```",
    "",
    "End of file",
    "",
  ].join("\n");
  await Deno.writeTextFile("file.md", content);
  assertEquals(await Array.fromAsync(fmt(["file.md"])), []);
  assertEquals(await Deno.readTextFile("file.md"), content);
});

Deno.test("fmt() ignores JSDoc code blocks with no extension specified", async () => {
  await using _ = await tempDirectory({ chdir: true });
  const content = [
    "/**",
    " * Example",
    " * ```",
    " * const x = {a:1}",
    " * console.log(  x )",
    " * ```",
    " */",
    "export const y = 1;",
    "",
  ].join("\n");
  await Deno.writeTextFile("file.ts", content);
  assertEquals(await Array.fromAsync(fmt(["file.ts"])), []);
  assertEquals(await Deno.readTextFile("file.ts"), content);
});

Deno.test("fmt() ignores Markdown code blocks with no extension specified", async () => {
  await using _ = await tempDirectory({ chdir: true });
  const content = [
    "# Title",
    "",
    "Some text",
    "",
    "```",
    "const x = {a:1}",
    "console.log(  x )",
    "```",
    "",
    "End of file",
    "",
  ].join("\n");
  await Deno.writeTextFile("file.md", content);
  assertEquals(await Array.fromAsync(fmt(["file.md"])), []);
  assertEquals(await Deno.readTextFile("file.md"), content);
});
