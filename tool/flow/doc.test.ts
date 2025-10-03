import { assertArrayObjectMatch } from "@roka/assert";
import { tempDirectory } from "@roka/fs/temp";
import { fakeCommand } from "@roka/testing/fake";
import { assertEquals } from "@std/assert";
import { toFileUrl } from "@std/path";
import { doc } from "./doc.ts";

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
