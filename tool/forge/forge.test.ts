import { git } from "@roka/git";
import { tempRepository } from "@roka/git/testing";
import { fakeRepository } from "@roka/github/testing";
import { fakeArgs, fakeConsole, fakeEnv } from "@roka/testing/fake";
import { assertExists } from "@std/assert";
import { common, join } from "@std/path";
import { assertSnapshot } from "@std/testing/snapshot";
import { forge } from "./forge.ts";
import { tempWorkspace } from "./testing.ts";

const WORKSPACE = {
  configs: [
    {
      name: "@scope/name1",
      version: "1.0.0",
      exports: { ".": "./name2.ts", "./main": "./main.ts" },
      forge: { main: "main.ts", target: ["aarch64-unknown-linux-gnu"] },
    },
    {
      name: "@scope/name2",
      version: "2.0.0",
      exports: "./name1",
    },
    {
      name: "@scope/name3",
      version: "3.0.0",
    },
    {
      name: "@scope/name4",
      version: "4.0.0",
    },
    {
      version: "0.0.0",
      name: "@scope/dir/name5",
    },
    {
      name: "@scope/dir/name6",
    },
  ],
  commits: [
    { summary: "initial", tags: ["name1@1.0.0-pre.1", "name4@4.0.0"] },
    { summary: "feat(name2): name2", tags: ["name2@1.0.0"] },
    { summary: "fix(name1): bug", tags: ["name2@2.0.0"] },
    { summary: "refactor(name2): rewrite" },
    { summary: "feat(name2): feature", tags: ["name3@2.0.0"] },
    { summary: "docs(name3): fix typo" },
    { summary: "refactor(name4)!: redesign api" },
    { summary: "style(name5): tabs over spaces" },
  ],
};

async function run(context: Deno.TestContext) {
  await using remote = await tempRepository();
  await using packages = await tempWorkspace({
    ...WORKSPACE,
    repo: { clone: remote.path() },
  });
  assertExists(packages[0]);
  const pkg = packages[0];
  const root = common(packages.map((pkg) => pkg.root));
  const repo = fakeRepository({ url: "<url>", git: git({ cwd: root }) });
  await Deno.writeTextFile(
    join(pkg.directory, "main.ts"),
    "console.log('Hello, World!');",
  );
  using _args = fakeArgs(
    context.name
      .replaceAll("[package]", pkg.name)
      .replaceAll("[packages...]", packages.map((pkg) => pkg.name).join(" "))
      .replaceAll("[pattern]", "name*")
      .replaceAll("[directory]", root)
      .replaceAll("<file>", join(root, "CHANGELOG.md"))
      .replaceAll("<type>", "feat")
      .replaceAll("<target>", "aarch64-unknown-linux-gnu")
      .split(" ").slice(1),
  );
  using _env = fakeEnv({ GITHUB_TOKEN: "token" });
  using console = fakeConsole();
  const cwd = Deno.cwd();
  try {
    Deno.chdir(root);
    const code = await forge({ repo });
    return {
      code,
      // deno-lint-ignore no-console
      output: console
        .output({ stripAnsi: true, stripCss: true, trimEnd: true, wrap: "\n" })
        .replace(/(?<=\n)((?:.*?):\s*)\d+(\.\d+)+(?:.*)?/g, "$1<version>")
        .replace(/(?<=(\d+\.\d+\.\d+-\w+\.\d+)\+)(.......)/g, "<hash>")
        .replaceAll(root, "<directory>"),
    };
  } finally {
    Deno.chdir(cwd);
  }
}

async function test(t: Deno.TestContext) {
  await assertSnapshot(t, await run(t));
}

Deno.test("forge --help", test);
Deno.test("forge list", test);
Deno.test("forge list --modules [packages...]", test);
Deno.test("forge list [pattern]", test);
Deno.test("forge list [directory]", test);
Deno.test("forge changelog", test);
Deno.test("forge changelog --all --emoji", test);
Deno.test("forge changelog --type <type>", test);
Deno.test("forge changelog --type <type> --no-breaking --all", test);
Deno.test("forge changelog --breaking --markdown", test);
Deno.test("forge compile --target <target> --bundle --install", test);
Deno.test("forge bump --release --pr --changelog=<file> --emoji", test);
Deno.test("forge release --draft --emoji", test);
