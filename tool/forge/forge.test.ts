// deno-lint-ignore-file no-console
import { forge } from "@roka/forge";
import { tempWorkspace, type TempWorkspaceOptions } from "@roka/forge/testing";
import { git } from "@roka/git";
import { tempRepository } from "@roka/git/testing";
import { fakeRepository } from "@roka/github/testing";
import { fakeConsole } from "@roka/testing/fake";
import { assertEquals, assertExists } from "@std/assert";
import { join } from "@std/path";
import { common } from "@std/path/common";
import { assertSnapshot } from "@std/testing/snapshot";

const WORKSPACE: TempWorkspaceOptions = {
  configs: [
    {
      name: "@scope/name1",
      version: "1.0.0",
      exports: { ".": "./name2.ts", "./main": "./main.ts" },
      compile: { main: "main.ts", target: ["aarch64-unknown-linux-gnu"] },
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
      name: "@scope/dir/name5",
    },
  ],
  commits: [
    { summary: "initial", tags: ["name1@1.0.0-pre.1", "name4@4.0.0"] },
    { summary: "fix(name1): bug", tags: ["name2@2.0.0"] },
    { summary: "feat(name2): feature", tags: ["name3@2.0.0"] },
    { summary: "style(name3)!:tabs over spaces" },
    { summary: "docs(name4): fix typo" },
  ],
};

const TESTS = [
  "list",
  "list --modules name1 name2",
  "list name*",
  "list dir/*",
  "changelog",
  "changelog --all --emoji",
  "changelog --type docs --no-breaking",
  "changelog --breaking --markdown",
  "compile --target aarch64-unknown-linux-gnu --bundle --install=<root>/install --concurrency=2",
  "bump --release --pr --changelog=<root>/CHANGELOG.md --emoji",
  "release --draft --emoji",
];

for (const test of TESTS) {
  Deno.test(`forge ${test}`, async (t) => {
    await using console = fakeConsole();
    await using remote = await tempRepository();
    await using packages = await tempWorkspace({
      ...WORKSPACE,
      repo: { clone: remote.path() },
    });
    const [pkg1] = packages;
    assertExists(pkg1);
    await Deno.writeTextFile(
      join(pkg1.directory, "main.ts"),
      "console.log('Hello, World!');",
    );
    Deno.env.set("GITHUB_TOKEN", "token");
    const root = common(packages.map((pkg) => pkg.root));
    const repo = fakeRepository({ url: "<url>", git: git({ cwd: root }) });
    const args = test.replaceAll("<root>", root).split(" ");
    assertEquals(await forge(args, { repo }), 0);
    console.calls.forEach((call) => {
      call.data = call.data.map((line) => {
        if (typeof line === "string") {
          return line
            .replaceAll(root, "<root>")
            .replace(/(\d+\.\d+\.\d+-\w+\.\d+)\+(.......)/g, "$1+<hash>");
        }
        return line;
      });
    });
    await assertSnapshot(t, console.calls);
  });
}
