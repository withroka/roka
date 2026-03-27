import { git } from "@roka/git";
import { tempRepository } from "@roka/git/testing";
import { fakeRepository } from "@roka/github/testing";
import { fakeArgs, fakeConsole, fakeEnv } from "@roka/testing/fake";
import { assertExists } from "@std/assert";
import { common, join } from "@std/path";
import { assertSnapshot } from "@std/testing/snapshot";
import { forge } from "./forge.ts";
import { tempWorkspace, type TempWorkspaceOptions } from "./testing.ts";

const WORKSPACE: TempWorkspaceOptions = {
  config: [
    {
      name: "@scope/package1",
      version: "1.0.0",
      exports: { ".": "./package2.ts", "./main": "./main.ts" },
      forge: { main: "main.ts", target: ["aarch64-unknown-linux-gnu"] },
    },
    { name: "@scope/package2", version: "2.0.0", exports: "./package1.ts" },
    { name: "@scope/package3", version: "3.0.0" },
    { name: "@scope/package4", version: "4.0.0" },
    { name: "@scope/directory/package5", version: "0.0.0" },
    { name: "@scope/package6", version: "0.1.0" },
    { name: "@scope/package7" },
  ],
  commit: [
    { subject: "initial", tag: ["package1@1.0.0-pre.1", "package4@4.0.0"] },
    { subject: "feat(package2): package2", tag: ["package2@1.0.0"] },
    { subject: "fix(package1): bug", tag: ["package2@2.0.0"] },
    { subject: "refactor(package2): rewrite" },
    { subject: "feat(package2): feature", tag: ["package3@2.0.0"] },
    { subject: "docs(package3): fix typo" },
    { subject: "refactor(package4)!: redesign api" },
    { subject: "style(package5): tabs over spaces" },
    {
      subject: "chore(package6): bump version",
      config: [{ name: "@scope/package6", version: "0.1.0" }],
    },
  ],
};

async function run(context: Deno.TestContext) {
  await using remote = await tempRepository();
  await remote.commit.create({ subject: "initial", allowEmpty: true });
  await using packages = await tempWorkspace({
    ...WORKSPACE,
    repo: { clone: remote.path(), chdir: true },
  });
  assertExists(packages[0]);
  const pkg = packages[0];
  const root = common(packages.map((pkg) => pkg.root));
  const repo = fakeRepository({ git: git({ directory: root }) });
  await Deno.writeTextFile(
    join(pkg.directory, "main.ts"),
    "console.log('Hello, World!');",
  );
  using _args = fakeArgs(
    context.name
      .replaceAll("[packages...]", packages.map((pkg) => pkg.name).join(" "))
      .split(" ").slice(1)
      .map((arg) =>
        arg.replaceAll("[package]", pkg.name)
          .replaceAll("[pattern]", "package*")
          .replaceAll("[directory]", "dir")
          .replaceAll("[unknown]", "unknown")
          .replaceAll("<file>", join(root, "CHANGELOG.md"))
          .replaceAll("<types>", "fix,feat")
          .replaceAll("<target>", "aarch64-unknown-linux-gnu")
          .replaceAll("<unscoped>", "fix: bug")
          .replaceAll("<scoped>", "fix(package1): bug")
          .replaceAll("<unknown>", "fix(unknown): bug")
      ).flat(),
  );
  using _env = fakeEnv({ GITHUB_TOKEN: "token" });
  using console = fakeConsole();
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
}

async function test(t: Deno.TestContext) {
  await assertSnapshot(t, await run(t));
}

Deno.test("forge --help", test);
Deno.test("forge list", test);
Deno.test("forge list --modules [packages...]", test);
Deno.test("forge list [pattern]", test);
Deno.test("forge list [directory]/*", test);
Deno.test("forge list [unknown]", test);
Deno.test("forge changelog", test);
Deno.test("forge changelog --all --emoji", test);
Deno.test("forge changelog --types <types>", test);
Deno.test("forge changelog --types <types> --no-breaking --all", test);
Deno.test("forge changelog --breaking --markdown", test);
Deno.test("forge changelog [unknown]", test);
Deno.test("forge compile --target <target> --bundle --install", test);
Deno.test("forge compile [unknown]", test);
Deno.test("forge bump --release --pr --changelog=<file> --emoji", test);
Deno.test("forge bump [unknown]", test);
Deno.test("forge release --draft --emoji", test);
Deno.test("forge release [unknown]", test);
Deno.test("forge title <unscoped>", test);
Deno.test("forge title <scoped>", test);
Deno.test("forge title <unknown>", test);
Deno.test("forge title <scoped> --types <types>", test);
