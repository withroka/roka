import { pool } from "@roka/async/pool";
import { find } from "@roka/fs/find";
import { tempRepository } from "@roka/git/testing";
import { fakeArgs, fakeConsole } from "@roka/testing/fake";
import { basename, dirname, fromFileUrl, join } from "@std/path";
import { assertSnapshot } from "@std/testing/snapshot";
import { flow } from "./flow.ts";

async function run(context: Deno.TestContext) {
  await using remote = await tempRepository();
  await remote.commit.create("initial", { allowEmpty: true });
  await using repo = await tempRepository({ clone: remote, chdir: true });
  const dataDirectory = join(
    dirname(fromFileUrl(context.origin)),
    "__testdata__",
  );
  const files = await Array.fromAsync(find([dataDirectory], { type: "file" }));
  await pool(
    files,
    (path) => Deno.copyFile(path, basename(repo.path(path))),
  );
  await Deno.mkdir(repo.path("empty-directory"));
  await repo.index.add(files.map((path) => basename(path)));
  await repo.commit.create("commit");
  using _args = fakeArgs(
    context.name
      .replaceAll("[valid-code]", "valid-code.ts")
      .replaceAll("[valid-doc]", "valid-doc.md")
      .replaceAll("[invalid-code]", "invalid-code.ts")
      .replaceAll("[invalid-comment]", "invalid-comment.ts")
      .replaceAll("[invalid-doc]", "invalid-doc.md")
      .replaceAll("[empty-directory]", "empty-directory")
      .replaceAll("[missing-file]", "missing-file.ts")
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
      .replace(/\(\d+ms\)/g, "(?ms)")
      .replaceAll(Deno.cwd(), "<directory>"),
  };
}

async function test(t: Deno.TestContext) {
  await assertSnapshot(t, await run(t));
}

Deno.test("flow --help", test);
Deno.test("flow", test);
Deno.test("flow [valid-code]", test);
Deno.test("flow [valid-doc]", test);
Deno.test("flow [empty-directory]", test);
Deno.test("flow [missing-file]", test);
Deno.test("flow --check", test);
Deno.test("flow --check [valid-code]", test);
Deno.test("flow --check [valid-doc]", test);
Deno.test("flow fmt [invalid-code]", test);
Deno.test("flow fmt [invalid-comment]", test);
Deno.test("flow fmt [invalid-doc]", test);
Deno.test("flow fmt [empty-directory]", test);
Deno.test("flow fmt [missing-file]", test);
Deno.test("flow fmt --check [valid-code]", test);
Deno.test("flow fmt --check [valid-doc]", test);
Deno.test("flow fmt --check [invalid-code]", test);
Deno.test("flow fmt --check [invalid-comment]", test);
Deno.test("flow fmt --check [invalid-doc]", test);
Deno.test("flow check [valid-code]", test);
Deno.test("flow check [valid-doc]", test);
Deno.test("flow check [invalid-code]", test);
Deno.test("flow check [invalid-comment]", test);
Deno.test("flow check [invalid-doc]", test);
Deno.test("flow check [empty-directory]", test);
Deno.test("flow check [missing-file]", test);
Deno.test("flow lint [valid-code]", test);
Deno.test("flow lint [valid-doc]", test);
Deno.test("flow lint [invalid-code]", test);
Deno.test("flow lint [invalid-comment]", test);
Deno.test("flow lint [invalid-doc]", test);
Deno.test("flow lint [empty-directory]", test);
Deno.test("flow lint [missing-file]", test);
Deno.test("flow lint --fix [valid-code]", test);
Deno.test("flow lint --fix [valid-doc]", test);
Deno.test("flow lint --fix [invalid-code]", test);
Deno.test("flow lint --fix [invalid-comment]", test);
Deno.test("flow lint --fix [invalid-doc]", test);
Deno.test("flow test [valid-code]", test);
Deno.test("flow test [valid-doc]", test);
Deno.test("flow test [invalid-code]", test);
Deno.test("flow test [invalid-comment]", test);
Deno.test("flow test [invalid-doc]", test);
Deno.test("flow test [empty-directory]", test);
Deno.test("flow test [missing-file]", test);
Deno.test("flow test --update [valid-code]", test);
Deno.test("flow test --update [valid-doc]", test);
