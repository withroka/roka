import { assertArrayObjectMatch } from "@roka/assert";
import { tempDirectory } from "@roka/fs/temp";
import { assertEquals, assertRejects } from "@std/assert";
import { stripAnsiCode } from "@std/fmt/colors";
import { resolve } from "@std/path";
import { deno, DenoError, type FileResult } from "./deno.ts";

function assertResults(
  actual: FileResult[],
  expected: FileResult[],
  options?: { replace?: [RegExp, string][] },
): void {
  const { replace = [] } = options ?? {};
  assertEquals(
    actual.map((r) => ({
      ...r,
      error: r.error.map((p) => ({
        ...Object.fromEntries(
          Object.entries(p).map(([k, v]) => {
            if (typeof v === "string") {
              v = replace.reduce((s, p) => s.replace(...p), stripAnsiCode(v));
            }
            return [k, v];
          }),
        ),
      })),
      info: r.info.map((p) => ({
        ...Object.fromEntries(
          Object.entries(p).map(([k, v]) => {
            if (typeof v === "string") {
              v = replace.reduce((s, p) => s.replace(...p), stripAnsiCode(v));
            }
            return [k, v];
          }),
        ),
      })),
    })),
    expected,
  );
}

Deno.test("deno().path() is persistent with absolute path", async () => {
  await using directory = await tempDirectory();
  const repo = deno({ cwd: directory.path() });
  assertEquals(repo.path(), directory.path());
  {
    await using _ = await tempDirectory({ chdir: true });
    assertEquals(resolve(repo.path()), directory.path());
  }
});

Deno.test("deno().path() is persistent with relative path", async () => {
  await using directory = await tempDirectory({ chdir: true });
  const repo = deno({ cwd: "." });
  assertEquals(
    await Deno.realPath(repo.path()),
    await Deno.realPath(directory.path()),
  );
  {
    await using _ = await tempDirectory({ chdir: true });
    assertEquals(
      await Deno.realPath(repo.path()),
      await Deno.realPath(directory.path()),
    );
  }
});

Deno.test("deno().check() rejects empty array", async () => {
  await using _ = await tempDirectory({ chdir: true });
  await assertRejects(
    () => deno().check([]),
    DenoError,
    "No target files found",
  );
});

Deno.test("deno().check() rejects missing file", async () => {
  await using _ = await tempDirectory({ chdir: true });
  await assertRejects(() => deno().check(["file.ts"]), DenoError);
});

Deno.test("deno().check() rejects non-script file", async () => {
  await using _ = await tempDirectory({ chdir: true });
  await Deno.writeTextFile("file.txt", "Just some text");
  await assertRejects(
    () => deno().check(["file.txt"]),
    DenoError,
    "No target files found",
  );
});

Deno.test("deno().check() rejects syntax errors", async () => {
  await using _ = await tempDirectory({ chdir: true });
  const content = "function f( {";
  await Deno.writeTextFile("file.ts", content);
  await assertRejects(
    () => deno().check(["file.ts"]),
    DenoError,
    "Unexpected token",
  );
  assertEquals(await Deno.readTextFile("file.ts"), content);
});

Deno.test("deno().check() rejects syntax errors in JSDoc code blocks", async () => {
  await using _ = await tempDirectory({ chdir: true });
  const content = [
    "/**",
    " * Some text",
    " *",
    " * ```ts",
    " * function f( {",
    " * ```",
    " */",
    "export const y = 1;",
    "",
  ].join("\n");
  await Deno.writeTextFile("file.ts", content);
  await assertRejects(
    () => deno().check(["file.ts"]),
    DenoError,
    "Unexpected token",
  );
  assertEquals(await Deno.readTextFile("file.ts"), content);
});

Deno.test("deno().check() rejects syntax errors in Markdown code blocks", async () => {
  await using _ = await tempDirectory({ chdir: true });
  const content = [
    "# Title",
    "",
    "Some text",
    "",
    "```ts",
    "function f( {",
    "```",
    "",
    "End of file",
    "",
  ].join("\n");
  await Deno.writeTextFile("file.md", content);
  await assertRejects(
    () => deno().check(["file.md"]),
    DenoError,
    "Unexpected token",
  );
  assertEquals(await Deno.readTextFile("file.md"), content);
});

Deno.test("deno().check() accepts file with no errors", async () => {
  await using _ = await tempDirectory({ chdir: true });
  const content = [
    "/**",
    " * Some text",
    " *",
    " * ```ts",
    " * Number(42);",
    " * ```",
    " */",
    "export function f(): number { return 42; }",
  ].join("\n");
  await Deno.writeTextFile("file.ts", content);
  const results = await deno().check(["file.ts"]);
  assertResults(results, [{ file: "file.ts", error: [], info: [] }]);
  assertEquals(await Deno.readTextFile("file.ts"), content);
});

Deno.test("deno().check() handles multiple files", async () => {
  await using _ = await tempDirectory({ chdir: true });
  const content = [
    "/**",
    " * Some text",
    " *",
    " * ```ts",
    " * Number(42);",
    " * ```",
    " */",
    "export function f(): number { return 42; }",
  ].join("\n");
  await Deno.writeTextFile("file1.ts", content);
  await Deno.writeTextFile("file2.ts", content);
  const results = await deno().check(["file1.ts", "file2.ts"]);
  assertResults(results, [
    { file: "file1.ts", error: [], info: [] },
    { file: "file2.ts", error: [], info: [] },
  ]);
});

Deno.test("deno().check() reports type errors", async () => {
  await using _ = await tempDirectory({ chdir: true });
  await Deno.writeTextFile(
    "file.ts",
    [
      "const x = { value: 42 };",
      'x === "string";',
      "if (true) x = false;",
      "x.value = false;",
    ].join("\n"),
  );
  const results = await deno().check(["file.ts"]);
  assertResults(results, [{
    file: "file.ts",
    error: [{
      kind: "check" as const,
      file: "file.ts",
      line: 2,
      column: 1,
      rule: "TS2367",
      reason: "This comparison appears to be unintentional because " +
        "the types '{ value: number; }' and 'string' have no overlap.",
      message: [
        "TS2367 [ERROR]: This comparison appears to be unintentional because " +
        "the types '{ value: number; }' and 'string' have no overlap.",
        'x === "string";',
        "~~~~~~~~~~~~~~",
        `    at file://${Deno.cwd()}/file.ts:2:1`,
      ].join("\n"),
    }, {
      kind: "check" as const,
      file: "file.ts",
      line: 3,
      column: 11,
      rule: "TS2588",
      reason: "Cannot assign to 'x' because it is a constant.",
      message: [
        "TS2588 [ERROR]: Cannot assign to 'x' because it is a constant.",
        "if (true) x = false;",
        "          ^",
        `    at file://${Deno.cwd()}/file.ts:3:11`,
      ].join("\n"),
    }, {
      kind: "check" as const,
      file: "file.ts",
      line: 4,
      column: 1,
      rule: "TS2322",
      reason: "Type 'boolean' is not assignable to type 'number'.",
      message: [
        "TS2322 [ERROR]: Type 'boolean' is not assignable to type 'number'.",
        "x.value = false;",
        "~~~~~~~",
        `    at file://${Deno.cwd()}/file.ts:4:1`,
      ].join("\n"),
    }],
    info: [],
  }]);
});

Deno.test("deno().check() reports type errors in code blocks in JSDoc", async () => {
  await using _ = await tempDirectory({ chdir: true });
  const content = [
    "/**",
    " * Some text",
    " *",
    " * ```ts",
    " * const x = { value: 42 };",
    ' * x === "string";',
    " *",
    " * if (true) x = false;",
    " * x.value = false;",
    " * ```",
    " */",
    "export const y = 1;",
    "",
  ].join("\n");
  await Deno.writeTextFile("file.ts", content);
  const results = await deno().check(["file.ts"]);
  assertResults(results, [
    {
      file: "file.ts",
      error: [{
        kind: "check" as const,
        file: "file.ts",
        line: 6,
        column: 4,
        rule: "TS2367",
        reason: "This comparison appears to be unintentional because " +
          "the types '{ value: number; }' and 'string' have no overlap.",
        message: [
          "TS2367 [ERROR]: This comparison appears to be unintentional " +
          "because the types '{ value: number; }' and 'string' have no overlap.",
          'x === "string";',
          "~~~~~~~~~~~~~~",
          `    at file://${Deno.cwd()}/file.ts:6:4`,
        ].join("\n"),
      }, {
        kind: "check" as const,
        file: "file.ts",
        line: 8,
        column: 14,
        rule: "TS2588",
        reason: "Cannot assign to 'x' because it is a constant.",
        message: [
          "TS2588 [ERROR]: Cannot assign to 'x' because it is a constant.",
          "if (true) x = false;",
          "          ^",
          `    at file://${Deno.cwd()}/file.ts:8:14`,
        ].join("\n"),
      }, {
        kind: "check" as const,
        file: "file.ts",
        line: 9,
        column: 4,
        rule: "TS2322",
        reason: "Type 'boolean' is not assignable to type 'number'.",
        message: [
          "TS2322 [ERROR]: Type 'boolean' is not assignable to type 'number'.",
          "x.value = false;",
          "~~~~~~~",
          `    at file://${Deno.cwd()}/file.ts:9:4`,
        ].join("\n"),
      }],
      info: [],
    },
  ]);
  assertEquals(await Deno.readTextFile("file.ts"), content);
});

Deno.test("deno().check() reports type errors in code blocks in Markdown", async () => {
  await using _ = await tempDirectory({ chdir: true });
  const content = [
    "# Title",
    "",
    "Some text",
    "",
    "```ts",
    "const x = { value: 42 };",
    'x === "string";',
    "",
    "if (true) x = false;",
    "x.value = false;",
    "```",
    "",
    "End of file",
    "",
  ].join("\n");
  await Deno.writeTextFile("file.md", content);
  const results = await deno().check(["file.md"]);
  assertResults(results, [
    {
      file: "file.md",
      error: [{
        kind: "check" as const,
        file: "file.md",
        line: 7,
        column: 1,
        rule: "TS2367",
        reason: "This comparison appears to be unintentional because " +
          "the types '{ value: number; }' and 'string' have no overlap.",
        message: [
          "TS2367 [ERROR]: This comparison appears to be unintentional " +
          "because the types '{ value: number; }' and 'string' have no overlap.",
          'x === "string";',
          "~~~~~~~~~~~~~~",
          `    at file://${Deno.cwd()}/file.md:7:1`,
        ].join("\n"),
      }, {
        kind: "check" as const,
        file: "file.md",
        line: 9,
        column: 11,
        rule: "TS2588",
        reason: "Cannot assign to 'x' because it is a constant.",
        message: [
          "TS2588 [ERROR]: Cannot assign to 'x' because it is a constant.",
          "if (true) x = false;",
          "          ^",
          `    at file://${Deno.cwd()}/file.md:9:11`,
        ].join("\n"),
      }, {
        kind: "check" as const,
        file: "file.md",
        line: 10,
        column: 1,
        rule: "TS2322",
        reason: "Type 'boolean' is not assignable to type 'number'.",
        message: [
          "TS2322 [ERROR]: Type 'boolean' is not assignable to type 'number'.",
          "x.value = false;",
          "~~~~~~~",
          `    at file://${Deno.cwd()}/file.md:10:1`,
        ].join("\n"),
      }],
      info: [],
    },
  ]);
  assertEquals(await Deno.readTextFile("file.md"), content);
});

Deno.test("deno().check() ignores code blocks with no language in JSDoc", async () => {
  await using _ = await tempDirectory({ chdir: true });
  const content = [
    "/**",
    " * ```",
    " * const x = { value: 42 };",
    ' * x === "string";',
    " *",
    " * x = false;",
    " * x.value = false;",
    " * ```",
    " */",
    "export const y = 1;",
    "",
  ].join("\n");
  await Deno.writeTextFile("file.ts", content);
  const results = await deno().check(["file.ts"]);
  assertArrayObjectMatch(results, [{ file: "file.ts" }]);
  assertEquals(await Deno.readTextFile("file.ts"), content);
});

Deno.test("deno().check() ignores code blocks with no language in Markdown", async () => {
  await using _ = await tempDirectory({ chdir: true });
  const content = [
    "# Title",
    "",
    "Some text",
    "",
    "```",
    "const x = { value: 42 };",
    'x === "string";',
    "",
    "x = false;",
    "x.value = false;",
    "```",
    "",
    "End of file",
    "",
  ].join("\n");
  await Deno.writeTextFile("file.md", content);
  const results = await deno().check(["file.md"]);
  assertArrayObjectMatch(results, [{ file: "file.md" }]);
  assertEquals(await Deno.readTextFile("file.md"), content);
});

Deno.test("deno().check() ignores code blocks with untyped language in JSDoc", async () => {
  await using _ = await tempDirectory({ chdir: true });
  const content = [
    "/**",
    " * ```js",
    " * const x = { value: 42 };",
    ' * x === "string";',
    " *",
    " * x = false;",
    " * x.value = false;",
    " * ```",
    " */",
    "export const y = 1;",
    "",
  ].join("\n");
  await Deno.writeTextFile("file.ts", content);
  const results = await deno().check(["file.ts"]);
  assertArrayObjectMatch(results, [{ file: "file.ts" }]);
  assertEquals(await Deno.readTextFile("file.ts"), content);
});

Deno.test("deno().check() ignores code blocks with untyped language in Markdown", async () => {
  await using _ = await tempDirectory({ chdir: true });
  const content = [
    "# Title",
    "",
    "Some text",
    "",
    "```js",
    "const x = 42;",
    'let y = "str";',
    "y = x;",
    "```",
    "",
    "End of file",
    "",
  ].join("\n");
  await Deno.writeTextFile("file.md", content);
  const results = await deno().check(["file.md"]);
  assertArrayObjectMatch(results, [{ file: "file.md" }]);
  assertEquals(await Deno.readTextFile("file.md"), content);
});

Deno.test("deno().check() reports errors from multiple files", async () => {
  await using _ = await tempDirectory({ chdir: true });
  await Deno.writeTextFile(
    "file1.ts",
    "function f(a?: string, b: number) { return a.concat(b); }",
  );
  await Deno.writeTextFile("file2.ts", "let x: number = 'string';");
  const results = await deno().check(["file1.ts", "file2.ts"]);
  assertResults(results, [{
    file: "file1.ts",
    error: [{
      kind: "check" as const,
      file: "file1.ts",
      line: 1,
      column: 24,
      rule: "TS1016",
      reason: "A required parameter cannot follow an optional parameter.",
      message: [
        "TS1016 [ERROR]: A required parameter cannot follow an optional parameter.",
        "function f(a?: string, b: number) { return a.concat(b); }",
        "                       ^",
        `    at file://${Deno.cwd()}/file1.ts:1:24`,
      ].join("\n"),
    }, {
      kind: "check" as const,
      file: "file1.ts",
      line: 1,
      column: 44,
      rule: "TS18048",
      reason: "'a' is possibly 'undefined'.",
      message: [
        "TS18048 [ERROR]: 'a' is possibly 'undefined'.",
        "function f(a?: string, b: number) { return a.concat(b); }",
        "                                           ^",
        `    at file://${Deno.cwd()}/file1.ts:1:44`,
      ].join("\n"),
    }, {
      kind: "check" as const,
      file: "file1.ts",
      line: 1,
      column: 53,
      rule: "TS2345",
      reason:
        "Argument of type 'number' is not assignable to parameter of type 'string'.",
      message: [
        "TS2345 [ERROR]: Argument of type 'number' is not assignable to " +
        "parameter of type 'string'.",
        "function f(a?: string, b: number) { return a.concat(b); }",
        "                                                    ^",
        `    at file://${Deno.cwd()}/file1.ts:1:53`,
      ].join("\n"),
    }],
    info: [],
  }, {
    file: "file2.ts",
    error: [{
      kind: "check" as const,
      file: "file2.ts",
      line: 1,
      column: 5,
      rule: "TS2322",
      reason: "Type 'string' is not assignable to type 'number'.",
      message: [
        "TS2322 [ERROR]: Type 'string' is not assignable to type 'number'.",
        "let x: number = 'string';",
        "    ^",
        `    at file://${Deno.cwd()}/file2.ts:1:5`,
      ].join("\n"),
    }],
    info: [],
  }]);
});

Deno.test("deno().fmt() rejects empty array", async () => {
  await using _ = await tempDirectory({ chdir: true });
  await assertRejects(() => deno().fmt([]), DenoError, "No target files found");
});

Deno.test("deno().fmt() rejects missing file", async () => {
  await using _ = await tempDirectory({ chdir: true });
  await assertRejects(
    () => deno().fmt(["file.ts"]),
    DenoError,
    "No target files found",
  );
});

Deno.test("deno().fmt() rejects non-script file", async () => {
  await using _ = await tempDirectory({ chdir: true });
  await Deno.writeTextFile("file.txt", "Just some text");
  await assertRejects(
    () => deno().fmt(["file.txt"]),
    DenoError,
    "No target files found",
  );
});

Deno.test("deno().fmt() rejects syntax errors", async () => {
  await using _ = await tempDirectory({ chdir: true });
  const content = "function f( {";
  await Deno.writeTextFile("file.ts", content);
  await assertRejects(
    () => deno().fmt(["file.ts"]),
    DenoError,
    "Unexpected token",
  );
  assertEquals(await Deno.readTextFile("file.ts"), content);
});

Deno.test("deno().fmt() rejects syntax errors in JSDoc code blocks", async () => {
  await using _ = await tempDirectory({ chdir: true });
  const content = [
    "/**",
    " * Some text",
    " *",
    " * ```ts",
    " * function f( {",
    " * ```",
    " */",
    "export const y = 1;",
    "",
  ].join("\n");
  await Deno.writeTextFile("file.ts", content);
  await assertRejects(
    () => deno().fmt(["file.ts"]),
    DenoError,
    "Unexpected token",
  );
  assertEquals(await Deno.readTextFile("file.ts"), content);
});

Deno.test("deno().fmt() accepts syntax errors in Markdown code blocks", async () => {
  await using _ = await tempDirectory({ chdir: true });
  const content = [
    "# Title",
    "",
    "Some text",
    "",
    "```ts",
    "function f( {",
    "```",
    "",
    "End of file",
    "",
  ].join("\n");
  await Deno.writeTextFile("file.md", content);
  const results = await deno().fmt(["file.md"]);
  assertResults(results, [{ file: "file.md", error: [], info: [] }]);
  assertEquals(await Deno.readTextFile("file.md"), content);
});

Deno.test("deno().fmt() formats code", async () => {
  await using _ = await tempDirectory({ chdir: true });
  const content = [
    "export   const y= 1",
    "function f(){return 42}",
  ].join("\n");
  await Deno.writeTextFile("file.ts", content);
  const results = await deno().fmt(["file.ts"]);
  assertResults(results, [{ file: "file.ts", error: [], info: [] }]);
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

Deno.test("deno().fmt() formats code in multiple files", async () => {
  await using _ = await tempDirectory({ chdir: true });
  const content = [
    "export   const y= 1",
    "function f(){return 42}",
  ].join("\n");
  await Deno.writeTextFile("file1.ts", content);
  await Deno.writeTextFile("file2.ts", content);
  const results = await deno().fmt(["file1.ts", "file2.ts"]);
  assertResults(results, [
    { file: "file1.ts", error: [], info: [] },
    { file: "file2.ts", error: [], info: [] },
  ]);
  assertEquals(
    await Deno.readTextFile("file1.ts"),
    [
      "export const y = 1;",
      "function f() {",
      "  return 42;",
      "}",
      "",
    ].join("\n"),
  );
  assertEquals(
    await Deno.readTextFile("file2.ts"),
    [
      "export const y = 1;",
      "function f() {",
      "  return 42;",
      "}",
      "",
    ].join("\n"),
  );
});

Deno.test("deno().fmt() formats code blocks in JSDoc", async () => {
  await using _ = await tempDirectory({ chdir: true });
  await Deno.writeTextFile(
    "file.ts",
    [
      "/**",
      " * Example",
      " * ```ts",
      " * export   const y= 1",
      " *",
      " * function f(){return 42}",
      " * ```",
      " */",
      "export   const y= 1",
      "",
    ].join("\n"),
  );
  const results = await deno().fmt(["file.ts"]);
  assertResults(results, [{ file: "file.ts", error: [], info: [] }]);
  assertEquals(
    await Deno.readTextFile("file.ts"),
    [
      "/**",
      " * Example",
      " * ```ts",
      " * export const y = 1;",
      " *",
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

Deno.test("deno().fmt() formats code blocks in Markdown", async () => {
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
      "",
      "function f(){return 42}",
      "```",
      "",
      "End of file",
      "",
    ].join("\n"),
  );
  const results = await deno().fmt(["file.md"]);
  assertResults(results, [{ file: "file.md", error: [], info: [] }]);
  assertEquals(
    await Deno.readTextFile("file.md"),
    [
      "# Title",
      "",
      "Some text",
      "",
      "```ts",
      "export const y = 1;",
      "",
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

Deno.test("deno().fmt() leaves already formatted JSDoc code block unchanged", async () => {
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
  const results = await deno().fmt(["file.ts"]);
  assertResults(results, [{ file: "file.ts", error: [], info: [] }]);
  assertEquals(await Deno.readTextFile("file.ts"), content);
});

Deno.test("deno().fmt() leaves already formatted Markdown code block unchanged", async () => {
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
  const results = await deno().fmt(["file.md"]);
  assertResults(results, [{ file: "file.md", error: [], info: [] }]);
  assertEquals(await Deno.readTextFile("file.md"), content);
});

Deno.test("deno().fmt() ignores code blocks with no language in JSDoc", async () => {
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
  const results = await deno().fmt(["file.ts"]);
  assertResults(results, [{ file: "file.ts", error: [], info: [] }]);
  assertEquals(await Deno.readTextFile("file.ts"), content);
});

Deno.test("deno().fmt() ignores code blocks with no language in Markdown", async () => {
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
  const results = await deno().fmt(["file.md"]);
  assertResults(results, [{ file: "file.md", error: [], info: [] }]);
  assertEquals(await Deno.readTextFile("file.md"), content);
});

Deno.test("deno().fmt({ check }) checks formatting", async () => {
  await using _ = await tempDirectory({ chdir: true });
  const content = [
    "export const y = 1;",
    "function f() {",
    "  return 42;",
    "}",
    "",
  ].join("\n");
  await Deno.writeTextFile("file.ts", content);
  const results = await deno().fmt(["file.ts"], { check: true });
  assertResults(results, [{
    file: "file.ts",
    error: [],
    info: [],
  }]);
  assertEquals(await Deno.readTextFile("file.ts"), content);
});

Deno.test("deno().fmt({ check }) handles multiple files", async () => {
  await using _ = await tempDirectory({ chdir: true });
  const content = [
    "export const y = 1;",
    "function f() {",
    "  return 42;",
    "}",
    "",
  ].join("\n");
  await Deno.writeTextFile("file1.ts", content);
  await Deno.writeTextFile("file2.ts", content);
  const results = await deno().fmt(["file1.ts", "file2.ts"], { check: true });
  assertResults(results, [{
    file: "file1.ts",
    error: [],
    info: [],
  }, {
    file: "file2.ts",
    error: [],
    info: [],
  }]);
});

Deno.test("deno().fmt({ check }) reports formatting errors", async () => {
  await using _ = await tempDirectory({ chdir: true });
  const content = [
    "export   const y= 1",
    "function f(){return 42}",
  ].join("\n");
  await Deno.writeTextFile("file.ts", content);
  const results = await deno().fmt(["file.ts"], { check: true });
  assertResults(results, [{
    file: "file.ts",
    error: [{
      file: "file.ts",
      message: [
        `from ${Deno.cwd()}/file.ts:`,
        "1 | -export   const y= 1",
        "1 | +export const y = 1;",
        "2 | -function f(){return 42}",
        "2 | +function f() {",
        "3 | +  return 42;",
        "4 | +}",
        "5 | +",
      ].join("\n"),
    }],
    info: [],
  }]);
  assertEquals(await Deno.readTextFile("file.ts"), content);
});

Deno.test("deno().fmt({ check }) reports formatting errors from multiple files", async () => {
  await using _ = await tempDirectory({ chdir: true });
  const content = [
    "export   const y= 1",
    "function f(){return 42}",
  ].join("\n");
  await Deno.writeTextFile("file1.ts", content);
  await Deno.writeTextFile("file2.ts", content);
  const results = await deno().fmt(["file1.ts", "file2.ts"], { check: true });
  assertResults(results, [{
    file: "file1.ts",
    error: [{
      file: "file1.ts",
      message: [
        `from ${Deno.cwd()}/file1.ts:`,
        "1 | -export   const y= 1",
        "1 | +export const y = 1;",
        "2 | -function f(){return 42}",
        "2 | +function f() {",
        "3 | +  return 42;",
        "4 | +}",
        "5 | +",
      ].join("\n"),
    }],
    info: [],
  }, {
    file: "file2.ts",
    error: [{
      file: "file2.ts",
      message: [
        `from ${Deno.cwd()}/file2.ts:`,
        "1 | -export   const y= 1",
        "1 | +export const y = 1;",
        "2 | -function f(){return 42}",
        "2 | +function f() {",
        "3 | +  return 42;",
        "4 | +}",
        "5 | +",
      ].join("\n"),
    }],
    info: [],
  }]);
});

Deno.test("deno().fmt({ check }) reports formatting errors in JSDoc code blocks", async () => {
  await using _ = await tempDirectory({ chdir: true });
  const content = [
    "/**",
    " * Example",
    " * ```ts",
    " * export   const y= 1",
    " *",
    " * function f(){return 42}",
    " * ```",
    " */",
    "export const y = 1;",
    "",
  ].join("\n");
  await Deno.writeTextFile("file.ts", content);
  const results = await deno().fmt(["file.ts"], { check: true });
  assertResults(results, [{
    file: "file.ts",
    error: [{
      file: "file.ts",
      message: [
        `from ${Deno.cwd()}/file.ts:3:4:`,
        "1 | -export   const y= 1",
        "1 | +export const y = 1;",
        "3 | -function f(){return 42}",
        "3 | +function f() {",
        "4 | +  return 42;",
        "5 | +}",
      ].join("\n"),
    }],
    info: [],
  }]);
  assertEquals(await Deno.readTextFile("file.ts"), content);
});

Deno.test("deno().fmt({ check }) reports formatting errors in Markdown code blocks", async () => {
  await using _ = await tempDirectory({ chdir: true });
  const content = [
    "# Title",
    "",
    "Some text",
    "",
    "```ts",
    "export   const y= 1",
    "",
    "function f(){return 42}",
    "```",
    "",
    "End of file",
    "",
  ].join("\n");
  await Deno.writeTextFile("file.md", content);
  const results = await deno().fmt(["file.md"], { check: true });
  assertResults(results, [{
    file: "file.md",
    error: [
      {
        file: "file.md",
        message: [
          `from ${Deno.cwd()}/file.md:`,
          " 6 | -export   const y= 1",
          " 6 | +export const y = 1;",
          " 8 | -function f(){return 42}",
          " 8 | +function f() {",
          " 9 | +  return 42;",
          "10 | +}",
        ].join("\n"),
      },
    ],
    info: [],
  }]);
  assertEquals(await Deno.readTextFile("file.md"), content);
});

Deno.test("deno().doc() rejects empty array", async () => {
  await using _ = await tempDirectory({ chdir: true });
  await assertRejects(() => deno().doc([]), DenoError, "No target files found");
});

Deno.test("deno().doc() rejects missing file", async () => {
  await using _ = await tempDirectory({ chdir: true });
  await assertRejects(() => deno().doc(["file.ts"]), DenoError);
});

Deno.test("deno().doc() rejects non-script file", async () => {
  await using _ = await tempDirectory({ chdir: true });
  await Deno.writeTextFile("file.txt", "Just some text");
  await assertRejects(
    () => deno().doc(["file.txt"]),
    DenoError,
    "No target files found",
  );
});

Deno.test("deno().doc() rejects syntax errors", async () => {
  await using _ = await tempDirectory({ chdir: true });
  const content = "function f( {";
  await Deno.writeTextFile("file.ts", content);
  await assertRejects(
    () => deno().doc(["file.ts"]),
    DenoError,
    "Unexpected token",
  );
  assertEquals(await Deno.readTextFile("file.ts"), content);
});

Deno.test("deno().doc({ lint }) lint accepts file with no errors", async () => {
  await using _ = await tempDirectory({ chdir: true });
  const content = [
    "/**",
    " * Some text",
    " *",
    " * ```ts",
    " * Number(42);",
    " * ```",
    " */",
    "export function f(): number { return 42; }",
  ].join("\n");
  await Deno.writeTextFile("file.ts", content);
  const results = deno().doc(["file.ts"], { lint: true });
  assertResults(await results, [{ file: "file.ts", error: [], info: [] }]);
  assertEquals(await Deno.readTextFile("file.ts"), content);
});

Deno.test("deno().doc({ lint }) handles multiple files", async () => {
  await using _ = await tempDirectory({ chdir: true });
  const content = [
    "/**",
    " * Some text",
    " *",
    " * ```ts",
    " * Number(42);",
    " * ```",
    " */",
    "export function f(): number { return 42; }",
  ].join("\n");
  await Deno.writeTextFile("file1.ts", content);
  await Deno.writeTextFile("file2.ts", content);
  const results = deno().doc(["file1.ts", "file2.ts"], { lint: true });
  assertResults(await results, [{
    file: "file1.ts",
    error: [],
    info: [],
  }, {
    file: "file2.ts",
    error: [],
    info: [],
  }]);
});

Deno.test("deno().doc({ lint }) reports doc lint errors", async () => {
  await using _ = await tempDirectory({ chdir: true });
  const content = [
    'import type { SemVer } from "jsr:@std/semver"',
    "export function f(semver: SemVer) {}",
  ].join("\n");
  await Deno.writeTextFile("file.ts", content);
  const results = await deno().doc(["file.ts"], { lint: true });
  assertResults(results, [{
    file: "file.ts",
    error: [{
      kind: "lint" as const,
      file: "file.ts",
      line: 2,
      column: 1,
      rule: "private-type-ref",
      reason: "public type 'f' references private type 'SemVer'",
      message: [
        "error[private-type-ref]: public type 'f' references private type 'SemVer'",
        `  --> ${Deno.cwd()}/file.ts:2:1`,
        "   | ",
        " 2 | export function f(semver: SemVer) {}",
        "   | ^",
        "   = hint: make the referenced type public or remove the reference",
        "   | ",
        "54 | export interface SemVer {",
        "   | - this is the referenced type",
        "   | ",
        "",
        "  info: to ensure documentation is complete " +
        "all types that are exposed in the public API must be public",
      ].join("\n"),
    }, {
      kind: "lint" as const,
      file: "file.ts",
      line: 2,
      column: 1,
      rule: "missing-jsdoc",
      reason: "exported symbol is missing JSDoc documentation",
      message: [
        "error[missing-jsdoc]: exported symbol is missing JSDoc documentation",
        ` --> ${Deno.cwd()}/file.ts:2:1`,
        "  | ",
        "2 | export function f(semver: SemVer) {}",
        "  | ^",
      ].join("\n"),
    }],
    info: [],
  }]);
  assertEquals(await Deno.readTextFile("file.ts"), content);
});

Deno.test("deno().doc({ lint }) does not report doc lint errors in code blocks in JSDoc", async () => {
  await using _ = await tempDirectory({ chdir: true });
  const content = [
    "/**",
    " * Some text",
    " *",
    " * ```ts",
    ' * import type { SemVer } from "jsr:@std/semver"',
    " * export function f(semver: SemVer) {}",
    " * ```",
    " */",
    "export function f(): number { return 42; }",
  ].join("\n");
  await Deno.writeTextFile("file.ts", content);
  const results = await deno().doc(["file.ts"], { lint: true });
  assertResults(results, [{ file: "file.ts", error: [], info: [] }]);
  assertEquals(await Deno.readTextFile("file.ts"), content);
});

Deno.test("deno().doc({ lint }) reports errors from multiple files", async () => {
  await using _ = await tempDirectory({ chdir: true });
  await Deno.writeTextFile("file1.ts", "export function f() {}");
  await Deno.writeTextFile(
    "file2.ts",
    [
      'import type { SemVer } from "jsr:@std/semver"',
      "export function f(semver: SemVer) {}",
    ].join("\n"),
  );
  const results = await deno().doc(["file1.ts", "file2.ts"], { lint: true });
  assertResults(results, [{
    file: "file1.ts",
    error: [{
      kind: "lint" as const,
      file: "file1.ts",
      line: 1,
      column: 1,
      rule: "missing-jsdoc",
      reason: "exported symbol is missing JSDoc documentation",
      message: [
        "error[missing-jsdoc]: exported symbol is missing JSDoc documentation",
        ` --> ${Deno.cwd()}/file1.ts:1:1`,
        "  | ",
        "1 | export function f() {}",
        "  | ^",
      ].join("\n"),
    }],
    info: [],
  }, {
    file: "file2.ts",
    error: [{
      kind: "lint" as const,
      file: "file2.ts",
      line: 2,
      column: 1,
      rule: "private-type-ref",
      reason: "public type 'f' references private type 'SemVer'",
      message: [
        "error[private-type-ref]: public type 'f' references private type 'SemVer'",
        `  --> ${Deno.cwd()}/file2.ts:2:1`,
        "   | ",
        " 2 | export function f(semver: SemVer) {}",
        "   | ^",
        "   = hint: make the referenced type public or remove the reference",
        "   | ",
        "54 | export interface SemVer {",
        "   | - this is the referenced type",
        "   | ",
        "",
        "  info: to ensure documentation is complete " +
        "all types that are exposed in the public API must be public",
      ].join("\n"),
    }, {
      kind: "lint" as const,
      file: "file2.ts",
      line: 2,
      column: 1,
      rule: "missing-jsdoc",
      reason: "exported symbol is missing JSDoc documentation",
      message: [
        "error[missing-jsdoc]: exported symbol is missing JSDoc documentation",
        ` --> ${Deno.cwd()}/file2.ts:2:1`,
        "  | ",
        "2 | export function f(semver: SemVer) {}",
        "  | ^",
      ].join("\n"),
    }],
    info: [],
  }]);
});

Deno.test("deno().doc({ lint }) rejects syntax errors", async () => {
  await using _ = await tempDirectory({ chdir: true });
  await Deno.writeTextFile("file.ts", "function f( {");
  await assertRejects(
    () => deno().doc(["file.ts"]),
    DenoError,
    "Unexpected token",
  );
});

Deno.test("deno().lint() rejects empty array", async () => {
  await using _ = await tempDirectory({ chdir: true });
  await assertRejects(
    () => deno().lint([]),
    DenoError,
    "No target files found",
  );
});

Deno.test("deno().lint() rejects missing file", async () => {
  await using _ = await tempDirectory({ chdir: true });
  await assertRejects(
    () => deno().lint(["file.ts"]),
    DenoError,
    "No target files found",
  );
});

Deno.test("deno().lint() rejects non-script file", async () => {
  await using _ = await tempDirectory({ chdir: true });
  await Deno.writeTextFile("file.txt", "Just some text");
  await assertRejects(
    () => deno().lint(["file.txt"]),
    DenoError,
    "No target files found",
  );
});

Deno.test("deno().lint() rejects syntax errors", async () => {
  await using _ = await tempDirectory({ chdir: true });
  const content = "function f( {";
  await Deno.writeTextFile("file.ts", content);
  await assertRejects(
    () => deno().lint(["file.ts"]),
    DenoError,
    "Unexpected token",
  );
  assertEquals(await Deno.readTextFile("file.ts"), content);
});

Deno.test("deno().lint() rejects syntax errors in code blocks in JSDoc", async () => {
  await using _ = await tempDirectory({ chdir: true });
  const content = [
    "/**",
    " * Some text",
    " *",
    " * ```ts",
    " * function f( {",
    " * ```",
    " */",
    "export const y = 1;",
    "",
  ].join("\n");
  await Deno.writeTextFile("file.ts", content);
  await assertRejects(
    () => deno().lint(["file.ts"]),
    DenoError,
    "Unexpected token",
  );
});

Deno.test("deno().lint() rejects syntax errors in code blocks in Markdown", async () => {
  await using _ = await tempDirectory({ chdir: true });
  const content = [
    "# Title",
    "",
    "Some text",
    "",
    "```ts",
    "function f( {",
    "```",
    "",
    "End of file",
    "",
  ].join("\n");
  await Deno.writeTextFile("file.md", content);
  await assertRejects(
    () => deno().lint(["file.md"]),
    DenoError,
    "Unexpected token",
  );
  assertEquals(await Deno.readTextFile("file.md"), content);
});

Deno.test("deno().lint() accepts file with no errors", async () => {
  await using _ = await tempDirectory({ chdir: true });
  const content = [
    "/**",
    " * Some text",
    " *",
    " * ```ts",
    " * Number(42);",
    " * ```",
    " */",
    "export function f(): number { return 42; }",
  ].join("\n");
  await Deno.writeTextFile("file.ts", content);
  const results = await deno().lint(["file.ts"]);
  assertResults(results, [{ file: "file.ts", error: [], info: [] }]);
  assertEquals(await Deno.readTextFile("file.ts"), content);
});

Deno.test("deno().lint() handles multiple files", async () => {
  await using _ = await tempDirectory({ chdir: true });
  const content = [
    "/**",
    " * Some text",
    " *",
    " * ```ts",
    " * Number(42);",
    " * ```",
    " */",
    "export function f(): number { return 42; }",
  ].join("\n");
  await Deno.writeTextFile("file1.ts", content);
  await Deno.writeTextFile("file2.ts", content);
  const results = await deno().lint(["file1.ts", "file2.ts"]);
  assertResults(results, [
    { file: "file1.ts", error: [], info: [] },
    { file: "file2.ts", error: [], info: [] },
  ]);
});

Deno.test("deno().lint() reports lint errors", async () => {
  await using _ = await tempDirectory({ chdir: true });
  const content = "function f() { if(true) {}; }";
  await Deno.writeTextFile("file.ts", content);
  const results = await deno().lint(["file.ts"]);
  assertResults(results, [{
    file: "file.ts",
    error: [{
      kind: "lint" as const,
      file: "file.ts",
      line: 1,
      column: 10,
      rule: "no-unused-vars",
      reason: "`f` is never used",
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
    }, {
      kind: "lint" as const,
      file: "file.ts",
      line: 1,
      column: 19,
      rule: "no-constant-condition",
      reason: "Use of a constant expressions as conditions is not allowed.",
      message: [
        "error[no-constant-condition]: Use of a constant expressions " +
        "as conditions is not allowed.",
        ` --> ${Deno.cwd()}/file.ts:1:19`,
        "  | ",
        "1 | function f() { if(true) {}; }",
        "  |                   ^^^^",
        "  = hint: Remove the constant expression",
        "",
        "  docs: https://docs.deno.com/lint/rules/no-constant-condition",
      ].join("\n"),
    }, {
      kind: "lint" as const,
      file: "file.ts",
      line: 1,
      column: 25,
      rule: "no-empty",
      reason: "Empty block statement",
      message: [
        "error[no-empty]: Empty block statement",
        ` --> ${Deno.cwd()}/file.ts:1:25`,
        "  | ",
        "1 | function f() { if(true) {}; }",
        "  |                         ^^",
        "  = hint: Add code or comment to the empty block",
        "",
        "  docs: https://docs.deno.com/lint/rules/no-empty",
      ].join("\n"),
    }],
    info: [],
  }]);
  assertEquals(await Deno.readTextFile("file.ts"), content);
});

Deno.test("deno().lint() reports lint errors in code blocks in JSDoc", async () => {
  await using _ = await tempDirectory({ chdir: true });
  const content = [
    "/**",
    " * Some text",
    " *",
    " * ```ts",
    " * const x = 2;",
    " * ```",
    " *",
    " * More text",
    " *",
    " * ```js",
    " * // Some comment",
    " *",
    " * if (true) {}",
    " * ```",
    " */",
    "export const y = 1;",
    "",
  ].join("\n");
  await Deno.writeTextFile("file.ts", content);
  const results = await deno().lint(["file.ts"]);
  assertResults(results, [{
    file: "file.ts",
    error: [{
      kind: "lint" as const,
      file: "file.ts",
      line: 5,
      column: 10,
      rule: "no-unused-vars",
      reason: "`x` is never used",
      message: [
        "error[no-unused-vars]: `x` is never used",
        ` --> ${Deno.cwd()}/file.ts:5:10`,
        "  | ",
        "1 | const x = 2;",
        "  |       ^",
        "  = hint: If this is intentional, prefix it with an underscore like `_x`",
        "",
        "  docs: https://docs.deno.com/lint/rules/no-unused-vars",
      ].join("\n"),
    }, {
      kind: "lint" as const,
      file: "file.ts",
      line: 13,
      column: 8,
      rule: "no-constant-condition",
      reason: "Use of a constant expressions as conditions is not allowed.",
      message: [
        "error[no-constant-condition]: Use of a constant expressions " +
        "as conditions is not allowed.",
        ` --> ${Deno.cwd()}/file.ts:13:8`,
        "  | ",
        "3 | if (true) {}",
        "  |     ^^^^",
        "  = hint: Remove the constant expression",
        "",
        "  docs: https://docs.deno.com/lint/rules/no-constant-condition",
      ].join("\n"),
    }, {
      kind: "lint" as const,
      file: "file.ts",
      line: 13,
      column: 14,
      rule: "no-empty",
      reason: "Empty block statement",
      message: [
        "error[no-empty]: Empty block statement",
        ` --> ${Deno.cwd()}/file.ts:13:14`,
        "  | ",
        "3 | if (true) {}",
        "  |           ^^",
        "  = hint: Add code or comment to the empty block",
        "",
        "  docs: https://docs.deno.com/lint/rules/no-empty",
      ].join("\n"),
    }],
    info: [],
  }]);
  assertEquals(await Deno.readTextFile("file.ts"), content);
});

Deno.test("deno().lint() reports lint errors in code blocks in Markdown", async () => {
  await using _ = await tempDirectory({ chdir: true });
  const content = [
    "# Title",
    "",
    "## Some text",
    "",
    "```ts",
    "const x = 2;",
    "```",
    "",
    "More text",
    "",
    "```js",
    "// Some comment",
    "",
    "if (true) {}",
    "```",
    "",
    "End of file",
    "",
  ].join("\n");
  await Deno.writeTextFile("file.md", content);
  const results = await deno().lint(["file.md"]);
  assertResults(results, [{
    file: "file.md",
    error: [{
      kind: "lint" as const,
      file: "file.md",
      line: 6,
      column: 7,
      rule: "no-unused-vars",
      reason: "`x` is never used",
      message: [
        "error[no-unused-vars]: `x` is never used",
        ` --> ${Deno.cwd()}/file.md:6:7`,
        "  | ",
        "1 | const x = 2;",
        "  |       ^",
        "  = hint: If this is intentional, prefix it with an underscore like `_x`",
        "",
        "  docs: https://docs.deno.com/lint/rules/no-unused-vars",
      ].join("\n"),
    }, {
      kind: "lint" as const,
      file: "file.md",
      line: 14,
      column: 5,
      rule: "no-constant-condition",
      reason: "Use of a constant expressions as conditions is not allowed.",
      message: [
        "error[no-constant-condition]: Use of a constant expressions " +
        "as conditions is not allowed.",
        ` --> ${Deno.cwd()}/file.md:14:5`,
        "  | ",
        "3 | if (true) {}",
        "  |     ^^^^",
        "  = hint: Remove the constant expression",
        "",
        "  docs: https://docs.deno.com/lint/rules/no-constant-condition",
      ].join("\n"),
    }, {
      kind: "lint" as const,
      file: "file.md",
      line: 14,
      column: 11,
      rule: "no-empty",
      reason: "Empty block statement",
      message: [
        "error[no-empty]: Empty block statement",
        ` --> ${Deno.cwd()}/file.md:14:11`,
        "  | ",
        "3 | if (true) {}",
        "  |           ^^",
        "  = hint: Add code or comment to the empty block",
        "",
        "  docs: https://docs.deno.com/lint/rules/no-empty",
      ].join("\n"),
    }],
    info: [],
  }]);
  assertEquals(await Deno.readTextFile("file.md"), content);
});

Deno.test("deno().lint() ignores code blocks with no language in JSDoc", async () => {
  await using _ = await tempDirectory({ chdir: true });
  const content = [
    "/**",
    " * ```",
    " * if (true) {}",
    " * ```",
    " */",
    "export const y = 1;",
    "",
  ].join("\n");
  await Deno.writeTextFile("file.ts", content);
  const results = await deno().lint(["file.ts"]);
  assertResults(results, [{ file: "file.ts", error: [], info: [] }]);
  assertEquals(await Deno.readTextFile("file.ts"), content);
});

Deno.test("deno().lint() ignores code blocks with no language in Markdown", async () => {
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
  const results = await deno().lint(["file.md"]);
  assertResults(results, [{ file: "file.md", error: [], info: [] }]);
  assertEquals(await Deno.readTextFile("file.md"), content);
});

Deno.test("deno().lint() reports errors from multiple files", async () => {
  await using _ = await tempDirectory({ chdir: true });
  await Deno.writeTextFile("file1.ts", "export function f() { if(true) {} }");
  await Deno.writeTextFile("file2.ts", "const x = 2;");
  const results = await deno().lint(["file1.ts", "file2.ts"]);
  assertResults(results, [{
    file: "file1.ts",
    error: [{
      kind: "lint" as const,
      file: "file1.ts",
      line: 1,
      column: 26,
      rule: "no-constant-condition",
      reason: "Use of a constant expressions as conditions is not allowed.",
      message: [
        "error[no-constant-condition]: Use of a constant expressions " +
        "as conditions is not allowed.",
        ` --> ${Deno.cwd()}/file1.ts:1:26`,
        "  | ",
        "1 | export function f() { if(true) {} }",
        "  |                          ^^^^",
        "  = hint: Remove the constant expression",
        "",
        "  docs: https://docs.deno.com/lint/rules/no-constant-condition",
      ].join("\n"),
    }, {
      kind: "lint" as const,
      file: "file1.ts",
      line: 1,
      column: 32,
      rule: "no-empty",
      reason: "Empty block statement",
      message: [
        "error[no-empty]: Empty block statement",
        ` --> ${Deno.cwd()}/file1.ts:1:32`,
        "  | ",
        "1 | export function f() { if(true) {} }",
        "  |                                ^^",
        "  = hint: Add code or comment to the empty block",
        "",
        "  docs: https://docs.deno.com/lint/rules/no-empty",
      ].join("\n"),
    }],
    info: [],
  }, {
    file: "file2.ts",
    error: [{
      kind: "lint" as const,
      file: "file2.ts",
      line: 1,
      column: 7,
      rule: "no-unused-vars",
      reason: "`x` is never used",
      message: [
        "error[no-unused-vars]: `x` is never used",
        ` --> ${Deno.cwd()}/file2.ts:1:7`,
        "  | ",
        "1 | const x = 2;",
        "  |       ^",
        "  = hint: If this is intentional, prefix it with an underscore like `_x`",
        "",
        "  docs: https://docs.deno.com/lint/rules/no-unused-vars",
      ].join("\n"),
    }],
    info: [],
  }]);
});

Deno.test("deno().lint() does not fix errors", async () => {
  await using _ = await tempDirectory({ chdir: true });
  await Deno.writeTextFile("file.ts", "window.location;");
  const results = await deno().lint(["file.ts"]);
  assertResults(results, [{
    file: "file.ts",
    error: [{
      kind: "lint" as const,
      file: "file.ts",
      line: 1,
      column: 1,
      rule: "no-window",
      reason: "Window is no longer available in Deno",
      message: [
        "error[no-window]: Window is no longer available in Deno",
        ` --> ${Deno.cwd()}/file.ts:1:1`,
        "  | ",
        "1 | window.location;",
        "  | ^^^^^^",
        "  = hint: Instead, use `globalThis`",
        "",
        "  docs: https://docs.deno.com/lint/rules/no-window",
      ].join("\n"),
    }],
    info: [],
  }]);
  assertEquals(await Deno.readTextFile("file.ts"), "window.location;");
});

Deno.test("deno().lint({ fix }) fixes errors", async () => {
  await using _ = await tempDirectory({ chdir: true });
  await Deno.writeTextFile("file.ts", "window.location;");
  const results = await deno().lint(["file.ts"], { fix: true });
  assertResults(results, [{ file: "file.ts", error: [], info: [] }]);
  assertEquals(await Deno.readTextFile("file.ts"), "globalThis.location;");
});

Deno.test("deno().lint({ fix }) fixes errors in code blocks in JSDoc", async () => {
  await using _ = await tempDirectory({ chdir: true });
  const content = [
    "/**",
    " * Some text",
    " *",
    " * ```ts",
    " * window.location;",
    " * ```",
    " */",
    "export const y = 1;",
    "",
  ].join("\n");
  await Deno.writeTextFile("file.ts", content);
  const results = await deno().lint(["file.ts"], { fix: true });
  assertResults(results, [{ file: "file.ts", error: [], info: [] }]);
  assertEquals(
    await Deno.readTextFile("file.ts"),
    [
      "/**",
      " * Some text",
      " *",
      " * ```ts",
      " * globalThis.location;",
      " * ```",
      " */",
      "export const y = 1;",
      "",
    ].join("\n"),
  );
});

Deno.test("deno().lint({ fix }) fixes errors in code blocks in Markdown", async () => {
  await using _ = await tempDirectory({ chdir: true });
  const content = [
    "# Title",
    "",
    "Some text",
    "",
    "```ts",
    "window.location;",
    "```",
    "",
    "End of file",
    "",
  ].join("\n");
  await Deno.writeTextFile("file.md", content);
  const results = await deno().lint(["file.md"], { fix: true });
  assertResults(results, [{ file: "file.md", error: [], info: [] }]);
  assertEquals(
    await Deno.readTextFile("file.md"),
    [
      "# Title",
      "",
      "Some text",
      "",
      "```ts",
      "globalThis.location;",
      "```",
      "",
      "End of file",
      "",
    ].join("\n"),
  );
});

Deno.test("deno().test() rejects empty array", async () => {
  await using _ = await tempDirectory({ chdir: true });
  await assertRejects(
    () => deno().test([]),
    DenoError,
    "No target files found",
  );
});

Deno.test("deno().test() reports missing file", async () => {
  await using _ = await tempDirectory({ chdir: true });
  await assertRejects(() => deno().test(["file.ts"]), DenoError);
});

Deno.test("deno().test() rejects non-script file", async () => {
  await using _ = await tempDirectory({ chdir: true });
  await Deno.writeTextFile("file.txt", "Just some text");
  await assertRejects(
    () => deno().test(["file.txt"]),
    DenoError,
    "No target files found",
  );
});

Deno.test("deno().test() rejects syntax errors", async () => {
  await using _ = await tempDirectory({ chdir: true });
  const content = "function f( {";
  await Deno.writeTextFile("file.ts", content);
  await assertRejects(
    () => deno().test(["file.ts"]),
    DenoError,
    "Unexpected token",
  );
  assertEquals(await Deno.readTextFile("file.ts"), content);
});

Deno.test("deno().test() rejects syntax errors in JSDoc code blocks", async () => {
  await using _ = await tempDirectory({ chdir: true });
  const content = [
    "/**",
    " * Some text",
    " *",
    " * ```ts",
    " * function f( {",
    " * ```",
    " */",
    "export const y = 1;",
    "",
  ].join("\n");
  await Deno.writeTextFile("file.ts", content);
  await assertRejects(
    () => deno().test(["file.ts"]),
    DenoError,
    "Unexpected token",
  );
  assertEquals(await Deno.readTextFile("file.ts"), content);
});

Deno.test("deno().test() rejects syntax errors in Markdown code blocks", async () => {
  await using _ = await tempDirectory({ chdir: true });
  const content = [
    "# Title",
    "",
    "Some text",
    "",
    "```ts",
    "function f( {",
    "```",
    "",
    "End of file",
    "",
  ].join("\n");
  await Deno.writeTextFile("file.md", content);
  await assertRejects(
    () => deno().test(["file.md"]),
    DenoError,
    "Unexpected token",
  );
  assertEquals(await Deno.readTextFile("file.md"), content);
});

Deno.test("deno().test() rejects runtime failure", async () => {
  await using _ = await tempDirectory({ chdir: true });
  const content = [
    [
      "const x = 42;",
      "x = 13;",
    ].join("\n"),
  ].join("\n");
  await Deno.writeTextFile("file.ts", content);
  assertResults(await deno().test(["file.ts"]), [
    {
      file: "file.ts",
      error: [
        {
          file: "file.ts",
          message: [
            "./file.ts (uncaught error)",
            "error: (in promise) TypeError: Assignment to constant variable.",
            "x = 13;",
            "^",
            `    at file://${Deno.cwd()}/file.ts:2:1`,
            "This error was not caught from a test and caused the test runner to fail on the referenced module.",
            "It most likely originated from a dangling promise, event/timeout handler or top-level code.",
          ].join("\n"),
        },
        { file: "file.ts", message: "./file.ts (uncaught error)" },
      ],
      info: [],
    },
  ], { replace: [[/\d+ms/g, "?ms"]] });
  assertEquals(await Deno.readTextFile("file.ts"), content);
});

Deno.test("deno().test() rejects passing tests with the `only` option", async () => {
  await using _ = await tempDirectory({ chdir: true });
  const content = [
    "Deno.test.only('test', () => {});",
    "Deno.test('test2', () => {",
    "  throw new Error('fail');",
    "});",
    "",
  ].join("\n");
  await Deno.writeTextFile("file.ts", content);
  await assertRejects(
    () => deno().test(["file.ts"]),
    DenoError,
    'Test failed because the "only" option was used',
  );
  assertEquals(await Deno.readTextFile("file.ts"), content);
});

Deno.test("deno().test() accepts file with no tests", async () => {
  await using _ = await tempDirectory({ chdir: true });
  const content = [
    "/**",
    " * Some text",
    " */",
    "const x = 42;",
    "",
  ].join("\n");
  await Deno.writeTextFile("file.ts", content);
  const results = await deno().test(["file.ts"]);
  assertResults(results, [{ file: "file.ts", error: [], info: [] }], {
    replace: [[/\d+ms/g, "?ms"]],
  });
  assertEquals(await Deno.readTextFile("file.ts"), content);
});

Deno.test("deno().test() accepts file with no test failures", async () => {
  await using _ = await tempDirectory({ chdir: true });
  const content = [
    "/**",
    " * Some text",
    " *",
    " * ```ts",
    " * Deno.test('test1', () => {});",
    " * ```",
    " */",
    "Deno.test('test2', () => {});",
    "",
  ].join("\n");
  await Deno.writeTextFile("file.ts", content);
  const results = await deno().test(["file.ts"]);
  assertResults(results, [{
    file: "file.ts",
    error: [],
    info: [{
      kind: "test" as const,
      test: ["test2"],
      file: "file.ts",
      success: true,
      status: "ok",
      time: "?ms",
      message: "test2 ... ok (?ms)",
    }, {
      kind: "test" as const,
      test: ["test1"],
      file: "file.ts",
      line: 4,
      success: true,
      status: "ok",
      time: "?ms",
      message: "test1 ... ok (?ms)",
    }],
  }], { replace: [[/\d+ms/g, "?ms"]] });
  assertEquals(await Deno.readTextFile("file.ts"), content);
});

Deno.test("deno().test() accepts file with no test step failures", async () => {
  await using _ = await tempDirectory({ chdir: true });
  const content = [
    "Deno.test('test', async (t) => {",
    "  await t.step('step1', () => {});",
    "  await t.step('step2', async (t) => {",
    "    await t.step('step2.1', () => {});",
    "  });",
    "});",
    "",
  ].join("\n");
  await Deno.writeTextFile("file.ts", content);
  const results = await deno().test(["file.ts"]);
  assertResults(results, [{
    file: "file.ts",
    error: [],
    info: [{
      kind: "test" as const,
      test: ["test", "step1"],
      file: "file.ts",
      success: true,
      status: "ok",
      time: "?ms",
      message: "  step1 ... ok (?ms)",
    }, {
      kind: "test" as const,
      test: ["test", "step2", "step2.1"],
      file: "file.ts",
      success: true,
      status: "ok",
      time: "?ms",
      message: "    step2.1 ... ok (?ms)",
    }, {
      kind: "test" as const,
      test: ["test", "step2"],
      file: "file.ts",
      success: true,
      status: "ok",
      time: "?ms",
      message: "  step2 ... ok (?ms)",
    }, {
      kind: "test" as const,
      test: ["test"],
      file: "file.ts",
      success: true,
      status: "ok",
      time: "?ms",
      message: "test ... ok (?ms)",
    }],
  }], { replace: [[/\d+ms/g, "?ms"]] });
  assertEquals(await Deno.readTextFile("file.ts"), content);
});

Deno.test("deno().test() reports test failures", async () => {
  await using _ = await tempDirectory({ chdir: true });
  const content = [
    'import { assertEquals } from "jsr:@std/assert";',
    "",
    "Deno.test('test1', (t) => {",
    "  (() => assertEquals([1, 2], [2, 3]))();",
    "});",
    "",
    "Deno.test('test2', () => {",
    "  throw new Error('fail2');",
    "});",
    "",
  ].join("\n");
  await Deno.writeTextFile("file.ts", content);
  const results = await deno().test(["file.ts"]);
  assertResults(results, [{
    file: "file.ts",
    error: [{
      kind: "test" as const,
      test: ["test1"],
      file: "file.ts",
      line: 3,
      column: 6,
      message: [
        "test1 => ./file.ts:3:6",
        "error: AssertionError: Values are not equal.",
        "",
        "",
        "    [Diff] Actual / Expected",
        "",
        "",
        "    [",
        "-     1,",
        "      2,",
        "+     3,",
        "    ]",
        "",
        "  throw new AssertionError(message);",
        "        ^",
        "    at ...",
        `    at file://${Deno.cwd()}/file.ts:4:38`,
      ].join("\n"),
    }, {
      kind: "test" as const,
      test: ["test2"],
      file: "file.ts",
      line: 7,
      column: 6,
      message: [
        "test2 => ./file.ts:7:6",
        "error: Error: fail2",
        "  throw new Error('fail2');",
        "        ^",
        `    at file://${Deno.cwd()}/file.ts:8:9`,
      ].join("\n"),
    }],
    info: [{
      kind: "test" as const,
      file: "file.ts",
      test: ["test1"],
      success: false,
      status: "FAILED",
      time: "?ms",
      message: "test1 ... FAILED (?ms)",
    }, {
      kind: "test" as const,
      test: ["test2"],
      file: "file.ts",
      success: false,
      status: "FAILED",
      time: "?ms",
      message: "test2 ... FAILED (?ms)",
    }],
  }], {
    replace: [
      [/\d+ms/g, "?ms"],
      [/ at [\s|\S]+(?=\n *at )/, " at ..."],
    ],
  });
  assertEquals(await Deno.readTextFile("file.ts"), content);
});

Deno.test("deno().test() reports permission errors", async () => {
  await using _ = await tempDirectory({ chdir: true });
  const content = [
    "Deno.test('test', () => {",
    "  Deno.readTextFileSync('file.txt');",
    "});",
    "",
  ].join("\n");
  await Deno.writeTextFile("file.ts", content);
  const results = await deno().test(["file.ts"]);
  assertResults(results, [{
    file: "file.ts",
    error: [{
      kind: "test" as const,
      test: ["test"],
      file: "file.ts",
      line: 1,
      column: 6,
      message: [
        "test => ./file.ts:1:6",
        'error: NotCapable: Requires read access to "file.txt", ' +
        "run again with the --allow-read flag",
        "  Deno.readTextFileSync('file.txt');",
        "       ^",
        "    at ...",
        `    at file://${Deno.cwd()}/file.ts:2:8`,
      ].join("\n"),
    }],
    info: [{
      kind: "test" as const,
      test: ["test"],
      file: "file.ts",
      success: false,
      status: "FAILED",
      time: "?ms",
      message: "test ... FAILED (?ms)",
    }],
  }], {
    replace: [
      [/\d+ms/g, "?ms"],
      [/ at [\s|\S]+(?=\n *at )/, " at ..."],
    ],
  });
  assertEquals(await Deno.readTextFile("file.ts"), content);
});

Deno.test("deno().test() reports test step failures", async () => {
  await using _ = await tempDirectory({ chdir: true });
  const content = [
    'import { assertEquals } from "jsr:@std/assert";',
    "",
    "Deno.test('test', async (t) => {",
    "  await t.step('step1', () => {",
    "    throw new Error('fail1');",
    "  });",
    "  await t.step('step2', async (t) => {",
    "    await t.step('step2.1', () => {",
    "      throw new Error('fail2.1');",
    "    });",
    "  });",
    '  t.step("incomplete", () => {});',
    "});",
    "",
  ].join("\n");
  await Deno.writeTextFile("file.ts", content);
  const results = await deno().test(["file.ts"]);
  assertResults(results, [{
    file: "file.ts",
    error: [{
      kind: "test" as const,
      test: ["test", "step1"],
      file: "file.ts",
      line: 4,
      column: 11,
      message: [
        "test ... step1 => ./file.ts:4:11",
        "error: Error: fail1",
        "    throw new Error('fail1');",
        "          ^",
        "    at ...",
        `    at file://${Deno.cwd()}/file.ts:4:11`,
      ].join("\n"),
    }, {
      kind: "test" as const,
      file: "file.ts",
      test: ["test", "step2", "step2.1"],
      line: 8,
      column: 13,
      message: [
        "test ... step2 ... step2.1 => ./file.ts:8:13",
        "error: Error: fail2.1",
        "      throw new Error('fail2.1');",
        "            ^",
        "    at ...",
        `    at file://${Deno.cwd()}/file.ts:8:13`,
      ].join("\n"),
    }, {
      kind: "test" as const,
      test: ["test", "incomplete"],
      file: "file.ts",
      line: 12,
      column: 5,
      message: [
        "test ... incomplete => ./file.ts:12:5",
        "error: Didn't complete before parent. Await step with `await t.step(...)`.",
      ].join("\n"),
    }],
    info: [{
      kind: "test" as const,
      test: ["test", "step1"],
      file: "file.ts",
      success: false,
      status: "FAILED",
      time: "?ms",
      message: "  step1 ... FAILED (?ms)",
    }, {
      kind: "test" as const,
      test: ["test", "step2", "step2.1"],
      file: "file.ts",
      success: false,
      status: "FAILED",
      time: "?ms",
      message: "    step2.1 ... FAILED (?ms)",
    }, {
      kind: "test" as const,
      test: ["test", "step2"],
      file: "file.ts",
      success: false,
      status: "FAILED",
      time: "?ms",
      message: "  step2 ... FAILED (due to 1 failed step) (?ms)",
    }, {
      kind: "test" as const,
      test: ["test", "incomplete"],
      file: "file.ts",
      success: false,
      status: "INCOMPLETE",
      message: "  incomplete ... INCOMPLETE",
    }, {
      kind: "test" as const,
      test: ["test"],
      file: "file.ts",
      success: false,
      status: "FAILED",
      time: "?ms",
      message: "test ... FAILED (due to incomplete steps) (?ms)",
    }],
  }], {
    replace: [
      [/\d+ms/g, "?ms"],
      [/ at [\s|\S]+(?=\n *at )/, " at ..."],
    ],
  });
  assertEquals(await Deno.readTextFile("file.ts"), content);
});

Deno.test("deno().test() reports test failures in code blocks in JSDoc", async () => {
  await using _ = await tempDirectory({ chdir: true });
  const content = [
    "/**",
    " * Some text",
    " *",
    " * ```ts",
    " * throw new Error('fail1');",
    " * ```",
    " *",
    " * More text",
    " *",
    " * ```ts",
    " * Deno.test('test2', () => {",
    " *   throw new Error('fail2');",
    " * });",
    " * ```",
    " */",
    "Deno.test('test3', () => {",
    "  throw new Error('fail3');",
    "});",
    "",
  ].join("\n");
  await Deno.writeTextFile("file.ts", content);
  const results = await deno().test(["file.ts"]);
  assertResults(results, [{
    file: "file.ts",
    error: [{
      kind: "test" as const,
      test: ["test3"],
      file: "file.ts",
      line: 16,
      column: 6,
      message: [
        "test3 => ./file.ts:16:6",
        "error: Error: fail3",
        "  throw new Error('fail3');",
        "        ^",
        `    at file://${Deno.cwd()}/file.ts:17:9`,
      ].join("\n"),
    }, {
      kind: "test" as const,
      test: ["test2"],
      file: "file.ts",
      line: 10,
      column: 4,
      message: [
        "test2 => ./file.ts:10:2",
        "error: Error: fail2",
        "    throw new Error('fail2');",
        "          ^",
        `    at file://${Deno.cwd()}/file.ts:11:10`, // wrong column, but ok
      ].join("\n"),
    }, {
      kind: "test" as const,
      test: [`file://${Deno.cwd()}/file.ts$4-7.ts`],
      file: "file.ts",
      line: 4,
      column: 4,
      message: [
        `${`file://${Deno.cwd()}/file.ts$4-7.ts`} => ./file.ts:4:2`,
        "error: Error: fail1",
        "    throw new Error('fail1');",
        "          ^",
        `    at file://${Deno.cwd()}/file.ts:5:10`,
      ].join("\n"),
    }],
    info: [{
      kind: "test" as const,
      test: ["test3"],
      file: "file.ts",
      success: false,
      status: "FAILED",
      time: "?ms",
      message: "test3 ... FAILED (?ms)",
    }, {
      kind: "test" as const,
      test: [`file://${Deno.cwd()}/file.ts$4-7.ts`],
      file: "file.ts",
      line: 4,
      success: false,
      status: "FAILED",
      time: "?ms",
      message: `file://${Deno.cwd()}/file.ts$4-7.ts ... FAILED (?ms)`,
    }, {
      kind: "test" as const,
      test: ["test2"],
      file: "file.ts",
      line: 10,
      success: false,
      status: "FAILED",
      time: "?ms",
      message: "test2 ... FAILED (?ms)",
    }],
  }], { replace: [[/\d+ms/g, "?ms"]] });
  assertEquals(await Deno.readTextFile("file.ts"), content);
});

Deno.test("deno().test() reports test failures in code blocks in Markdown", async () => {
  await using _ = await tempDirectory({ chdir: true });
  const content = [
    "# Title",
    "",
    "Some text",
    "",
    "```ts",
    "throw new Error('fail1');",
    "```",
    "",
    "```ts",
    "Deno.test('test2', () => {",
    "  throw new Error('fail2');",
    "});",
    "```",
    "",
    "End of file",
    "",
  ].join("\n");
  await Deno.writeTextFile("file.md", content);
  const results = await deno().test(["file.md"]);
  assertResults(results, [{
    file: "file.md",
    error: [{
      kind: "test" as const,
      test: [`file://${Deno.cwd()}/file.md$5-8.ts`],
      file: "file.md",
      line: 5,
      column: 1,
      message: [
        `file://${Deno.cwd()}/file.md$5-8.ts => ./file.md:5:2`,
        "error: Error: fail1",
        "    throw new Error('fail1');",
        "          ^",
        `    at file://${Deno.cwd()}/file.md:6:7`,
      ].join("\n"),
    }, {
      kind: "test" as const,
      test: ["test2"],
      file: "file.md",
      line: 9,
      column: 1,
      message: [
        "test2 => ./file.md:9:2",
        "error: Error: fail2",
        "    throw new Error('fail2');",
        "          ^",
        `    at file://${Deno.cwd()}/file.md:10:7`, // wrong column, but ok
      ].join("\n"),
    }],
    info: [{
      kind: "test" as const,
      test: [`file://${Deno.cwd()}/file.md$5-8.ts`],
      file: "file.md",
      line: 5,
      success: false,
      status: "FAILED",
      time: "?ms",
      message: `file://${Deno.cwd()}/file.md$5-8.ts ... FAILED (?ms)`,
    }, {
      kind: "test" as const,
      test: ["test2"],
      file: "file.md",
      line: 9,
      success: false,
      status: "FAILED",
      time: "?ms",
      message: "test2 ... FAILED (?ms)",
    }],
  }], { replace: [[/\d+ms/g, "?ms"]] });
  assertEquals(await Deno.readTextFile("file.md"), content);
});

Deno.test("deno().test() ignores code blocks with no language in JSDoc", async () => {
  await using _ = await tempDirectory({ chdir: true });
  const content = [
    "/**",
    " * ```",
    " * Deno.test('test', () => {",
    " *  throw new Error('fail1');",
    " * });",
    " * ```",
    " */",
    "export const y = 1;",
    "",
  ].join("\n");
  await Deno.writeTextFile("file.ts", content);
  const results = await deno().test(["file.ts"]);
  assertResults(results, [{ file: "file.ts", error: [], info: [] }]);
  assertEquals(await Deno.readTextFile("file.ts"), content);
});

Deno.test("deno().test() ignores code blocks with no language in Markdown", async () => {
  await using _ = await tempDirectory({ chdir: true });
  const content = [
    "# Title",
    "",
    "Some text",
    "",
    "```",
    "Deno.test('test1', () => {",
    "  throw new Error('fail1');",
    "});",
    "```",
    "",
    "End of file",
    "",
  ].join("\n");
  await Deno.writeTextFile("file.md", content);
  const results = await deno().test(["file.md"]);
  assertResults(results, [{ file: "file.md", error: [], info: [] }]);
  assertEquals(await Deno.readTextFile("file.md"), content);
});

Deno.test("deno().test() reports errors from multiple files", async () => {
  await using _ = await tempDirectory({ chdir: true });
  await Deno.writeTextFile(
    "file1.ts",
    'Deno.test("test1", () => { throw Error("fail1") });',
  );
  await Deno.writeTextFile(
    "file2.ts",
    'Deno.test("test2", () => { throw Error("fail2") });',
  );
  const results = await deno().test(["file1.ts", "file2.ts"]);
  assertResults(results, [{
    file: "file1.ts",
    error: [{
      kind: "test" as const,
      test: ["test1"],
      file: "file1.ts",
      line: 1,
      column: 6,
      message: [
        "test1 => ./file1.ts:1:6",
        "error: Error: fail1",
        'Deno.test("test1", () => { throw Error("fail1") });',
        "                                 ^",
        `    at file://${Deno.cwd()}/file1.ts:1:34`,
      ].join("\n"),
    }],
    info: [{
      kind: "test" as const,
      test: ["test1"],
      file: "file1.ts",
      success: false,
      status: "FAILED",
      time: "?ms",
      message: "test1 ... FAILED (?ms)",
    }],
  }, {
    file: "file2.ts",
    error: [{
      kind: "test" as const,
      test: ["test2"],
      file: "file2.ts",
      line: 1,
      column: 6,
      message: [
        "test2 => ./file2.ts:1:6",
        "error: Error: fail2",
        'Deno.test("test2", () => { throw Error("fail2") });',
        "                                 ^",
        `    at file://${Deno.cwd()}/file2.ts:1:34`,
      ].join("\n"),
    }],
    info: [{
      kind: "test" as const,
      test: ["test2"],
      file: "file2.ts",
      success: false,
      status: "FAILED",
      time: "?ms",
      message: "test2 ... FAILED (?ms)",
    }],
  }], { replace: [[/\d+ms/g, "?ms"]] });
});

Deno.test("deno().test() reports ignored tests", {
  sanitizeOps: false,
}, async () => {
  await using _ = await tempDirectory({ chdir: true });
  const content = [
    "Deno.test.ignore('test', () => {});",
    "",
  ].join("\n");
  await Deno.writeTextFile("file.ts", content);
  const results = await deno().test(["file.ts"]);
  assertResults(results, [{
    file: "file.ts",
    error: [],
    info: [{
      kind: "test" as const,
      test: ["test"],
      file: "file.ts",
      success: true,
      status: "ignored",
      time: "?ms",
      message: "test ... ignored (?ms)",
    }],
  }], { replace: [[/\d+ms/g, "?ms"]] });
  assertEquals(await Deno.readTextFile("file.ts"), content);
});

Deno.test("deno().test() handles test output with passing tests", async () => {
  await using _ = await tempDirectory({ chdir: true });
  const content = [
    "Deno.test('test', () => {",
    "  console.log('test log output');",
    "  console.error('test error output');",
    "});",
    "",
  ].join("\n");
  await Deno.writeTextFile("file.ts", content);
  const results = await deno().test(["file.ts"]);
  assertResults(results, [{
    file: "file.ts",
    error: [],
    info: [{
      kind: "test" as const,
      test: ["test"],
      file: "file.ts",
      success: true,
      status: "ok",
      output: "test log output\ntest error output\n",
      time: "?ms",
      message: "test ... ok (?ms)",
    }],
  }], { replace: [[/\d+ms/g, "?ms"]] });
  assertEquals(await Deno.readTextFile("file.ts"), content);
});

Deno.test("deno().test() handles test output with failing tests", async () => {
  await using _ = await tempDirectory({ chdir: true });
  const content = [
    'import { assertEquals } from "jsr:@std/assert";',
    "",
    "Deno.test('test', () => {",
    "  console.log('test log output');",
    "  console.error('test error output');",
    "  assertEquals(1, 2);",
    "});",
    "",
  ].join("\n");
  await Deno.writeTextFile("file.ts", content);
  const results = await deno().test(["file.ts"]);
  assertResults(results, [{
    file: "file.ts",
    error: [{
      kind: "test" as const,
      test: ["test"],
      file: "file.ts",
      line: 3,
      column: 6,
      message: [
        "test => ./file.ts:3:6",
        "error: AssertionError: Values are not equal.",
        "",
        "",
        "    [Diff] Actual / Expected",
        "",
        "",
        "-   1",
        "+   2",
        "",
        "  throw new AssertionError(message);",
        "        ^",
        "    at ...",
        `    at file://${Deno.cwd()}/file.ts:6:3`,
      ].join("\n"),
    }],
    info: [{
      kind: "test" as const,
      test: ["test"],
      file: "file.ts",
      success: false,
      status: "FAILED",
      output: "test log output\ntest error output\n",
      time: "?ms",
      message: "test ... FAILED (?ms)",
    }],
  }], {
    replace: [
      [/\d+ms/g, "?ms"],
      [/ at [\s|\S]+(?=\n *at )/, " at ..."],
    ],
  });
  assertEquals(await Deno.readTextFile("file.ts"), content);
});

Deno.test("deno().test({ update }) updates snapshots", async () => {
  await using _ = await tempDirectory({ chdir: true });
  const content = [
    'import { assertSnapshot } from "jsr:@std/testing/snapshot";',
    "",
    "Deno.test('snapshotTest', async (t) => {",
    '  await assertSnapshot(t, "snapshot-content");',
    "});",
    "",
  ].join("\n");
  await Deno.writeTextFile("file.ts", content);
  const results = await deno().test(["file.ts"], { update: true });
  assertResults(results, [
    {
      file: "file.ts",
      error: [],
      info: [
        {
          kind: "test",
          message: [
            "snapshotTest ... ok (?ms)",
            "------- post-test output -------",
            "",
            " > 1 snapshot updated.",
            "----- post-test output end -----",
          ].join("\n"),
          test: ["snapshotTest"],
          file: "file.ts",
          success: true,
          status: "ok",
          time: "?ms",
        },
      ],
    },
  ], { replace: [[/\d+ms/g, "?ms"]] });
  assertEquals(
    await Deno.readTextFile("__snapshots__/file.ts.snap"),
    [
      "export const snapshot = {};",
      "",
      'snapshot[`snapshotTest 1`] = `"snapshot-content"`;',
      "",
    ].join("\n"),
  );
});

Deno.test("deno().test({ update }) updates mocks", async () => {
  await using _ = await tempDirectory({ chdir: true });
  const content = [
    'import { assertEquals } from "jsr:@std/assert";',
    'import { mock } from "jsr:@roka/testing/mock";',
    "",
    "Deno.test('snapshotTest', async (t) => {",
    '  const _ = { func: async (s) => await Promise.resolve("mock-output") };',
    '  using func = mock(t, _, "func");',
    '  assertEquals(func.mode, "update");',
    '  assertEquals(await _.func("mock-input"), "mock-output");',
    "});",
    "",
  ].join("\n");
  await Deno.writeTextFile("file.ts", content);
  const results = await deno().test(["file.ts"], { update: true });
  assertResults(results, [
    {
      file: "file.ts",
      error: [],
      info: [
        {
          kind: "test",
          message: [
            "snapshotTest ... ok (?ms)",
            "------- post-test output -------",
            "",
            " > 1 mock updated.",
            "   • snapshotTest > func 1",
            "----- post-test output end -----",
          ].join("\n"),
          test: ["snapshotTest"],
          file: "file.ts",
          success: true,
          status: "ok",
          time: "?ms",
        },
      ],
    },
  ], { replace: [[/\d+ms/g, "?ms"]] });
  assertEquals(
    await Deno.readTextFile("__mocks__/file.ts.mock"),
    [
      "export const mock = {};",
      "",
      "mock[`snapshotTest > func 1`] =",
      "[",
      "  {",
      "    input: [",
      '      "mock-input",',
      "    ],",
      '    output: "mock-output",',
      "  },",
      "];",
      "",
    ].join("\n"),
  );
});

Deno.test("deno().compile() rejects missing file", async () => {
  await using _ = await tempDirectory({ chdir: true });
  await assertRejects(
    () => deno().compile("file.ts"),
    DenoError,
  );
});

Deno.test("deno().compile() rejects non-script file", async () => {
  await using _ = await tempDirectory({ chdir: true });
  await Deno.writeTextFile("file.txt", "Just some text");
  await assertRejects(
    () => deno().compile("file.txt"),
    DenoError,
    "The module's source code could not be parsed",
  );
});

Deno.test("deno().compile() rejects syntax errors", async () => {
  await using _ = await tempDirectory({ chdir: true });
  const content = "function f( {";
  await Deno.writeTextFile("file.ts", content);
  await assertRejects(
    () => deno().compile("file.ts"),
    DenoError,
    "Unexpected token",
  );
});

Deno.test("deno().compile() compiles script to executable", async () => {
  await using _ = await tempDirectory({ chdir: true });
  await Deno.writeTextFile("hello.ts", "console.log('Hello, world!');");
  const results = await deno().compile("hello.ts");
  assertResults(results, [{ file: "hello.ts", error: [], info: [] }]);
  const stat = await Deno.stat("hello");
  assertEquals(stat.isFile, true);
  assertEquals((stat.mode ?? 0) & 0o111, 0o111);
  const { stdout } = await new Deno.Command("./hello").output();
  assertEquals(new TextDecoder().decode(stdout).trim(), "Hello, world!");
});

Deno.test("deno().compile({ args }) passes arguments to executable", async () => {
  await using _ = await tempDirectory({ chdir: true });
  await Deno.writeTextFile("hello.ts", 'console.log(Deno.args.join(" "));');
  const results = await deno().compile("hello.ts", {
    args: ["Hello,", "world!"],
  });
  assertResults(results, [{ file: "hello.ts", error: [], info: [] }]);
  const cmd = new Deno.Command("./hello");
  const { stdout } = await cmd.output();
  assertEquals(new TextDecoder().decode(stdout).trim(), "Hello, world!");
});

Deno.test("deno().compile({ output }) creates custom output file", async () => {
  await using _ = await tempDirectory({ chdir: true });
  await Deno.writeTextFile("hello.ts", "console.log('Hello, world!');");
  const results = await deno().compile("hello.ts", { output: "hello-out" });
  assertResults(results, [{ file: "hello.ts", error: [], info: [] }]);
  const { stdout } = await new Deno.Command("./hello-out").output();
  assertEquals(new TextDecoder().decode(stdout).trim(), "Hello, world!");
});

Deno.test("deno().compile({ target }) cross-compiles executable", async () => {
  await using _ = await tempDirectory({ chdir: true });
  await Deno.writeTextFile("hello.ts", "console.log('Hello, world!');");
  const results = await deno().compile("hello.ts", {
    target: "x86_64-unknown-linux-gnu",
  });
  assertResults(results, [{ file: "hello.ts", error: [], info: [] }]);
  const stat = await Deno.stat("hello");
  assertEquals(stat.isFile, true);
});

Deno.test("deno().compile({ include }) includes additional files", async () => {
  await using _ = await tempDirectory({ chdir: true });
  const config = [
    "{",
    '  "permissions": {',
    '    "default": {',
    '      "read": true,',
    "    },",
    "  }",
    "}",
  ].join("\n");
  const contents = [
    "import { dirname, fromFileUrl, join } from 'jsr:@std/path';",
    'const file = fromFileUrl(join(dirname(Deno.mainModule), "data.txt"));',
    "const content = await Deno.readTextFile(file);",
    "console.log(content);",
  ].join("\n");
  await Deno.writeTextFile("deno.json", config);
  await Deno.writeTextFile("hello.ts", contents);
  await Deno.writeTextFile("data.txt", "Hello, world!");
  const results = await deno().compile("hello.ts", { include: ["data.txt"] });
  assertResults(results, [{ file: "hello.ts", error: [], info: [] }]);
  const { stdout } = await new Deno.Command("./hello").output();
  assertEquals(new TextDecoder().decode(stdout).trim(), "Hello, world!");
});
