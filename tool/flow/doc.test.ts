import { assertArrayObjectMatch } from "@roka/assert";
import { tempDirectory } from "@roka/fs/temp";
import { fakeCommand } from "@roka/testing/fake";
import { assertEquals } from "@std/assert";
import { resolve, toFileUrl } from "@std/path";
import { blocks, doc } from "./doc.ts";

Deno.test("doc() accepts empty array", async () => {
  using command = fakeCommand();
  assertEquals(await doc([]), []);
  assertEquals(command.runs, []);
});

Deno.test("doc() returns JSDoc annotations", async () => {
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
      "export function f() { return 42; }",
      "",
      "/** A constant. */",
      "export const X = false;",
    ].join("\n"),
  );
  assertArrayObjectMatch(await doc(["file.ts"]), [
    {
      name: "f",
      isDefault: false,
      location: {
        filename: toFileUrl(await Deno.realPath("file.ts")).toString(),
        line: 7,
        col: 0,
        byteIndex: 54,
      },
      declarationKind: "export",
      jsDoc: { doc: "Some text\n```ts\nDeno.exit(0);\n```" },
      kind: "function",
    },
    {
      name: "X",
      isDefault: false,
      location: {
        filename: toFileUrl(await Deno.realPath("file.ts")).toString(),
        line: 10,
        col: 13,
        byteIndex: 122,
      },
      declarationKind: "export",
      jsDoc: { doc: "A constant." },
      kind: "variable",
    },
  ]);
});

Deno.test("doc() can return JSDoc annotations from multiple files", async () => {
  await using _ = await tempDirectory({ chdir: true });
  await Deno.writeTextFile(
    "a.ts",
    [
      "/** A function. */",
      "export function a() { return 1; }",
    ].join("\n"),
  );
  await Deno.writeTextFile(
    "b.ts",
    [
      "/** A variable. */",
      "export const b = 2;",
    ].join("\n"),
  );
  assertArrayObjectMatch(
    await doc(["a.ts", "b.ts"]),
    [
      {
        name: "a",
        location: {
          filename: toFileUrl(await Deno.realPath("a.ts")).toString(),
          line: 2,
          col: 0,
          byteIndex: 19,
        },
        declarationKind: "export",
        jsDoc: { doc: "A function." },
        kind: "function",
      },
      {
        name: "b",
        location: {
          filename: toFileUrl(await Deno.realPath("b.ts")).toString(),
          line: 2,
          col: 13,
          byteIndex: 32,
        },
        declarationKind: "export",
        jsDoc: { doc: "A variable." },
        kind: "variable",
      },
    ],
  );
});

Deno.test("doc() ignores files with unsupported extensions", async () => {
  await using _ = await tempDirectory({ chdir: true });
  await Deno.writeTextFile(
    "file.txt",
    [
      "/** A function. */",
      "export function a() { return 1; }",
    ].join("\n"),
  );
  assertEquals(await doc(["file.txt"]), []);
});

Deno.test("blocks() accepts empty array", async () => {
  assertEquals(await blocks([]), []);
});

Deno.test("blocks() returns code blocks from JSDoc", async () => {
  await using _ = await tempDirectory({ chdir: true });
  await Deno.writeTextFile(
    "file.ts",
    [
      "/**",
      " * Some text",
      " * ```ts",
      " * console.log('hello');",
      " * ```",
      " * @example",
      " * ```js",
      " * console.log('world');",
      " * ```",
      " */",
      "export function f() { return 42; }",
      "",
      "/** A constant. */",
      "export const X = false;",
    ].join("\n"),
  );
  assertEquals(await blocks(["file.ts"]), [
    {
      location: {
        filename: toFileUrl(resolve("file.ts")),
        line: 3,
        col: 3,
        byteIndex: 17,
      },
      indent: " * ",
      lang: "ts",
      content: "console.log('hello');\n",
    },
    {
      location: {
        filename: toFileUrl(resolve("file.ts")),
        line: 7,
        col: 3,
        byteIndex: 70,
      },
      indent: " * ",
      lang: "js",
      content: "console.log('world');\n",
    },
  ]);
});

Deno.test("blocks() supports all extensions", async () => {
  await using _ = await tempDirectory({ chdir: true });
  await Deno.writeTextFile(
    "file.md",
    [
      "## Some text",
      "",
      "```ts",
      "console.log('hello');",
      "```",
      "",
    ].join("\n"),
  );
  assertEquals(await blocks(["file.md"]), [
    {
      location: {
        filename: toFileUrl(resolve("file.md")),
        col: 0,
        line: 3,
        byteIndex: 14,
      },
      indent: "",
      lang: "ts",
      content: "console.log('hello');\n",
    },
  ]);
});

Deno.test("blocks() returns code blocks with no extension specified", async () => {
  await using _ = await tempDirectory({ chdir: true });
  await Deno.writeTextFile(
    "file.md",
    [
      "## Some text",
      "",
      "```",
      "console.log('hello');",
      "```",
      "",
    ].join("\n"),
  );
  assertEquals(await blocks(["file.md"]), [
    {
      location: {
        filename: toFileUrl(resolve("file.md")),
        line: 3,
        col: 0,
        byteIndex: 14,
      },
      indent: "",
      content: "console.log('hello');\n",
    },
  ]);
});

Deno.test("blocks() returns code blocks from nodes with depth", async () => {
  await using _ = await tempDirectory({ chdir: true });
  await Deno.writeTextFile(
    "file.ts",
    [
      "export interface A {",
      "  a: {",
      "    /**",
      "     * A method. */",
      "     *",
      "     * ```ts",
      "     * function method(): void {};",
      "     * ```",
      "     */",
      "    method(): void;",
      "    /** A nested object. */",
      "    nested: {",
      "      /** A function. */",
      "      func(): void;",
      "    };",
      "  };",
      "}",
    ].join("\n"),
  );
  assertEquals(await blocks(["file.ts"]), [
    {
      location: {
        filename: toFileUrl(resolve("file.ts")),
        line: 6,
        col: 7,
        byteIndex: 63,
      },
      indent: "     * ",
      lang: "ts",
      content: "function method(): void {};\n",
    },
  ]);
});

Deno.test("blocks() can return code blocks from multiple files", async () => {
  await using _ = await tempDirectory({ chdir: true });
  await Deno.writeTextFile(
    "a.ts",
    [
      "/**",
      " * Some text",
      " * ```ts",
      " * console.log('hello');",
      " * ```",
      " */",
      "export function f() { return 42; }",
    ].join("\n"),
  );
  await Deno.writeTextFile(
    "b.md",
    [
      "## Some text",
      "",
      "```js",
      "console.log('world');",
      "```",
      "",
    ].join("\n"),
  );
  assertEquals(
    await blocks(["a.ts", "b.md"]),
    [
      {
        location: {
          filename: toFileUrl(resolve("a.ts")),
          line: 3,
          col: 3,
          byteIndex: 17,
        },
        indent: " * ",
        lang: "ts",
        content: "console.log('hello');\n",
      },
      {
        location: {
          filename: toFileUrl(resolve("b.md")),
          line: 3,
          col: 0,
          byteIndex: 14,
        },
        indent: "",
        lang: "js",
        content: "console.log('world');\n",
      },
    ],
  );
});
