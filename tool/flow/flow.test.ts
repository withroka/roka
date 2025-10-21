import { pool } from "@roka/async/pool";
import { find } from "@roka/fs/find";
import { tempDirectory } from "@roka/fs/temp";
import { fakeArgs, fakeConsole } from "@roka/testing/fake";
import { basename, dirname, fromFileUrl, join } from "@std/path";
import { assertSnapshot } from "@std/testing/snapshot";
import { flow } from "./flow.ts";

async function run(context: Deno.TestContext) {
  await using directory = await tempDirectory({ chdir: true });
  const dataDirectory = join(
    dirname(fromFileUrl(context.origin)),
    "__testdata__",
  );
  await pool(
    find([dataDirectory], { type: "file" }),
    (path) => Deno.copyFile(path, basename(directory.path(path))),
  );
  using _args = fakeArgs(
    context.name
      .replaceAll("[valid]", "valid.ts")
      .replaceAll("[invalid-code]", "invalid-code.ts")
      .replaceAll("[invalid-comment]", "invalid-comment.ts")
      .replaceAll("[invalid-doc]", "invalid-doc.md")
      .split(" ").slice(1),
  );
  using console = fakeConsole();
  const code = await flow();
  return {
    code,
    // deno-lint-ignore no-console
    output: console
      .output({ stripAnsi: true, stripCss: true, trimEnd: true, wrap: "\n" })
      .replace(/(?<=\n)((?:.*?):\s*)\d+(\.\d+)+(?:.*)?/g, "$1<version>")
      .replaceAll(Deno.cwd(), "<directory>"),
  };
}

async function test(t: Deno.TestContext) {
  await assertSnapshot(t, await run(t));
}

Deno.test("flow --help", test);
Deno.test("flow [valid]", test);
Deno.test("flow --check [valid]", test);
Deno.test("flow fmt [invalid-code]", test);
Deno.test("flow fmt [invalid-comment]", test);
Deno.test("flow fmt [invalid-doc]", test);
Deno.test("flow fmt --check [valid]", test);
Deno.test("flow fmt --check [invalid-code]", test);
Deno.test("flow fmt --check [invalid-comment]", test);
Deno.test("flow fmt --check [invalid-doc]", test);
Deno.test("flow check [valid]", test);
Deno.test("flow check [invalid-code]", test);
Deno.test("flow check [invalid-comment]", test);
Deno.test("flow check [invalid-doc]", test);
Deno.test("flow lint [valid]", test);
Deno.test("flow lint [invalid-code]", test);
Deno.test("flow lint [invalid-comment]", test);
Deno.test("flow lint [invalid-doc]", test);
Deno.test("flow lint --fix [valid]", test);
Deno.test("flow lint --fix [invalid-code]", test);
Deno.test("flow lint --fix [invalid-comment]", test);
Deno.test("flow lint --fix [invalid-doc]", test);
Deno.test("flow test [valid]", test);
Deno.test("flow test [invalid-code]", test);
Deno.test("flow test [invalid-comment]", test);
Deno.test("flow test [invalid-doc]", test);
