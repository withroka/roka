// deno-lint-ignore-file no-console
import { git } from "@roka/git";
import { tempRepository } from "@roka/git/testing";
import { fakeRepository } from "@roka/github/testing";
import { fakeConsole } from "@roka/testing/fake";
import { assertEquals, assertExists } from "@std/assert";
import { common, join } from "@std/path";
import { assertSnapshot } from "@std/testing/snapshot";
import { forge } from "./forge.ts";
import { tempWorkspace, type TempWorkspaceOptions } from "./testing.ts";

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
    { summary: "refactor(name4): rewrite" },
    { summary: "style(name5)!:tabs over spaces" },
  ],
};

const TESTS = [
  "list",
  "list --modules [packages...]",
  "list [pattern]",
  "list [directory]",
  "changelog",
  "changelog --all --emoji",
  "changelog --type <type>",
  "changelog --type <type> --no-breaking --all",
  "changelog --breaking --markdown",
  "compile --target <target> --bundle --install",
  "bump --release --pr --changelog=<file> --emoji",
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
    const args = test
      .replaceAll("[package]", pkg1.name)
      .replaceAll("[packages...]", packages.map((pkg) => pkg.name).join(" "))
      .replaceAll("[pattern]", "name*")
      .replaceAll("[directory]", root)
      .replaceAll("<file>", join(root, "CHANGELOG.md"))
      .replaceAll("<type>", "feat")
      .replaceAll("<target>", "aarch64-unknown-linux-gnu")
      .split(" ");
    assertEquals(await forge(args, { repo }), 0);
    console.calls.forEach((call) => {
      call.data = call.data.map((line) => {
        if (typeof line === "string") {
          return line
            .replaceAll(root, "<directory>")
            .replace(/(\d+\.\d+\.\d+-\w+\.\d+)\+(.......)/g, "$1+<hash>");
        }
        return line;
      });
    });
    await assertSnapshot(t, console.output({ trimEnd: true, wrap: "\n" }));
  });
}
