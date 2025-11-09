import { pool } from "@roka/async/pool";
import { find } from "@roka/fs/find";
import { tempRepository } from "@roka/git/testing";
import { fakeArgs, fakeConsole } from "@roka/testing/fake";
import { basename, dirname, fromFileUrl, join } from "@std/path";
import { assertSnapshot } from "@std/testing/snapshot";
import { flow } from "./flow.ts";

interface Options {
  input?: string;
}

async function run(context: Deno.TestContext, options?: Options) {
  const { input } = options ?? {};
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
  if (input !== undefined) {
    Object.defineProperty(Deno.stdin, "readable", {
      get: () => ReadableStream.from([new TextEncoder().encode(input)]),
      configurable: true,
    });
  }
  const stdin = input !== undefined
    ? Object.getOwnPropertyDescriptor(Deno.stdin, "readable")
    : undefined;
  try {
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
  } finally {
    if (stdin) Object.defineProperty(Deno.stdin, "readable", stdin);
  }
}

async function test(t: Deno.TestContext, options?: Options) {
  await assertSnapshot(t, await run(t, options));
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
Deno.test("flow --doc [valid-code]", test);
Deno.test("flow --doc [invalid-code]", test);
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
Deno.test("flow fmt --stdin", (t) => test(t, { input: "console.log( )" }));
Deno.test("flow fmt --stdin=json", (t) => test(t, { input: "{a: 0}" }));
Deno.test("flow fmt --stdin=.json", (t) => test(t, { input: "{a: 0}" }));
Deno.test("flow fmt --stdin=valid.json", (t) => test(t, { input: "{}" }));
Deno.test("flow fmt --stdin=dir/file.json", (t) => test(t, { input: "{}" }));
Deno.test("flow fmt --stdin=invalid.json", (t) => test(t, { input: "{a:}" }));
Deno.test("flow fmt --stdin=unknown", (t) => test(t, { input: "{}" }));
Deno.test("flow fmt [valid-code] --stdin", test);
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
Deno.test("flow lint --doc [valid-code]", test);
Deno.test("flow lint --doc [invalid-code]", test);
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
