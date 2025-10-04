import { tempDirectory } from "@roka/fs/temp";
import { fakeCommand, fakeEnv } from "@roka/testing/fake";
import { assertEquals, assertRejects } from "@std/assert";
import type { Problem } from "./deno.ts";
import { lint } from "./lint.ts";

Deno.test("lint() accepts empty array", async () => {
  using command = fakeCommand();
  const [problems, fileCount] = await (async (gen) => {
    const out: Problem[] = [];
    while (true) {
      // deno-lint-ignore no-await-in-loop
      const { done, value } = await gen.next();
      if (done) return [out, value];
      out.push(value);
    }
  })(lint([]));
  assertEquals(fileCount, 0);
  assertEquals(problems, []);
  assertEquals(command.runs, []);
});

Deno.test("lint() accepts file with no errors", async () => {
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
  assertEquals(await Array.fromAsync(lint(["file.ts"])), []);
});

Deno.test("lint() reports lint errors", async () => {
  using _env = fakeEnv({ NO_COLOR: "1" });
  await using _dir = await tempDirectory({ chdir: true });
  await Deno.writeTextFile(
    "file.ts",
    [
      "function f() { if(true) {}; }",
    ].join("\n"),
  );
  assertEquals(await Array.fromAsync(lint(["file.ts"])), [
    {
      message: [
        "error[no-unused-vars]: `f` is never used",
        ` --> ${Deno.cwd()}/file.ts:1:10`,
        "  | ",
        "1 | function f() { if(true) {}; }",
        "  |          ^",
        "  = hint: If this is intentional, prefix it with an underscore like `_f`",
        "",
        "  docs: https://docs.deno.com/lint/rules/no-unused-vars",
      ].join("\n"),
    },
    {
      message: [
        "error[no-constant-condition]: Use of a constant expressions as conditions is not allowed.",
        ` --> ${Deno.cwd()}/file.ts:1:19`,
        "  | ",
        "1 | function f() { if(true) {}; }",
        "  |                   ^^^^",
        "  = hint: Remove the constant expression",
        "",
        "  docs: https://docs.deno.com/lint/rules/no-constant-condition",
      ].join("\n"),
    },
    {
      message: [
        "error[no-empty]: Empty block statement\n" +
        ` --> ${Deno.cwd()}/file.ts:1:25`,
        "  | ",
        "1 | function f() { if(true) {}; }",
        "  |                         ^^",
        "  = hint: Add code or comment to the empty block",
        "",
        "  docs: https://docs.deno.com/lint/rules/no-empty",
      ].join("\n"),
    },
  ]);
});

Deno.test("lint() reports lint errors in JSDoc code blocks", async () => {
  using _env = fakeEnv({ NO_COLOR: "1" });
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
    ].join("\n"),
  );
  // console.error(
  //   (await Array.fromAsync(lint(["file.ts"]))).map((p) =>
  //     p.message.split("\n")
  //   ),
  // );
  assertEquals(await Array.fromAsync(lint(["file.ts"])), [
    {
      message: [
        "error[no-unused-vars]: `x` is never used",
        ` --> ${Deno.cwd()}/file.ts:4:10`,
        "  | ",
        "1 | const x = 2;",
        "  |       ^",
        "  = hint: If this is intentional, prefix it with an underscore like `_x`",
        "",
        "  docs: https://docs.deno.com/lint/rules/no-unused-vars",
      ].join("\n"),
    },
    {
      message: [
        "error[no-constant-condition]: Use of a constant expressions as conditions is not allowed.",
        ` --> ${Deno.cwd()}/file.ts:9:8`,
        "  | ",
        "2 | if (true) {}",
        "  |     ^^^^",
        "  = hint: Remove the constant expression",
        "",
        "  docs: https://docs.deno.com/lint/rules/no-constant-condition",
      ].join("\n"),
    },
    {
      message: [
        "error[no-empty]: Empty block statement",
        ` --> ${Deno.cwd()}/file.ts:9:14`,
        "  | ",
        "2 | if (true) {}",
        "  |           ^^",
        "  = hint: Add code or comment to the empty block",
        "",
        "  docs: https://docs.deno.com/lint/rules/no-empty",
      ].join("\n"),
    },
  ]);
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
