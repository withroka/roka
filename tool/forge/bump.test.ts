import { bump } from "@roka/forge/bump";
import { PackageError, packageInfo } from "@roka/forge/package";
import { tempPackage, tempWorkspace } from "@roka/forge/testing";
import { git } from "@roka/git";
import { tempRepository } from "@roka/git/testing";
import { fakePullRequest, fakeRepository } from "@roka/github/testing";
import { assertEquals, assertExists, assertRejects } from "@std/assert";
import { join } from "@std/path";

Deno.test("bump() minor updates released package", async () => {
  await using pkg = await tempPackage({
    config: { name: "@scope/name", version: `1.2.3` },
    commits: [
      { summary: "initial", tags: ["name@1.2.3"] },
      { summary: "feat: new feature" },
    ],
  });
  const repo = git({ cwd: pkg.directory });
  const commit = await repo.commits.head();
  const pr = await bump([pkg]);
  assertEquals(pr, undefined);
  assertEquals(pkg.config.version, `1.3.0-pre.1+${commit.short}`);
  const updated = await packageInfo({ directory: pkg.directory });
  assertEquals(updated.config, pkg.config);
  const head = await repo.commits.head();
  assertEquals(head.summary, "feat: new feature");
});

Deno.test("bump() minor updates unreleased package", async () => {
  await using pkg = await tempPackage({
    config: { name: "@scope/name" },
    commits: [{ summary: "feat: new feature" }],
  });
  const repo = git({ cwd: pkg.directory });
  const commit = await repo.commits.head();
  await bump([pkg]);
  assertEquals(pkg.config.version, `0.1.0-pre.1+${commit.short}`);
});

Deno.test("bump() patch updates unreleased package", async () => {
  await using pkg = await tempPackage({
    config: { name: "@scope/name" },
    commits: [{ summary: "fix: bug fix" }],
  });
  const repo = git({ cwd: pkg.directory });
  const commit = await repo.commits.head();
  await bump([pkg]);
  assertEquals(pkg.config.version, `0.0.1-pre.1+${commit.short}`);
});

Deno.test("bump() bumps to release version", async () => {
  await using pkg = await tempPackage({
    config: { name: "@scope/name", version: `1.2.3` },
    commits: [
      { summary: "initial", tags: ["name@1.2.3"] },
      { summary: "feat: new feature" },
    ],
  });
  await bump([pkg], { release: true });
  assertEquals(pkg.config.version, "1.3.0");
});

Deno.test("bump() does not mutate package on failure", async () => {
  await using pkg = await tempPackage({
    config: { name: "@scope/name", version: "0.0.1" },
    commits: [
      { summary: "initial", tags: ["name@0.0.1"] },
      { summary: "feat: new feature" },
    ],
  });
  await Deno.remove(join(pkg.directory, "deno.json"));
  await Deno.mkdir(join(pkg.directory, "deno.json"));
  await assertRejects(() => bump([pkg], { pr: true }));
  assertEquals(pkg.config.version, "0.0.1");
});

Deno.test("bump() updates workspace", async () => {
  const packages = await tempWorkspace({
    configs: [
      { name: "@scope/name1" },
      { name: "@scope/name2" },
      { name: "@scope/name3" },
    ],
    commits: [
      {
        summary: "initial",
        tags: ["name1@1.2.3", "name2@1.2.3", "name3@1.2.3"],
      },
      { summary: "fix(name1): fix bug (#1)" },
      { summary: "feat(name2): new feature (#2)" },
      { summary: "feat(name3)!: breaking changes (#3)" },
    ],
  });
  await bump(packages, { release: true });
  assertEquals(packages[0]?.config.version, "1.2.4");
  assertEquals(packages[1]?.config.version, "1.3.0");
  assertEquals(packages[2]?.config.version, "2.0.0");
});

Deno.test("bump() creates a changelog file", async () => {
  const packages = await tempWorkspace({
    configs: [
      { name: "@scope/name1" },
      { name: "@scope/name2" },
    ],
    commits: [
      { summary: "fix(name1): fix bug (#1)" },
      { summary: "fix(name2): fix bug (#2)" },
    ],
  });
  const root = packages[0]?.root;
  assertExists(root);
  const changelog = join(root, "changelog.txt");
  await bump(packages, { release: true, changelog });
  assertEquals(
    await Deno.readTextFile(changelog),
    [
      "## name1@0.0.1",
      "",
      "- fix(name1): fix bug (#1)",
      "",
      "## name2@0.0.1",
      "",
      "- fix(name2): fix bug (#2)",
      "",
    ].join("\n"),
  );
});

Deno.test("bump() updates changelog file", async () => {
  await using pkg = await tempPackage({
    config: { name: "@scope/name" },
    commits: [{ summary: "fix: bug (#42)" }],
  });
  const changelog = join(pkg.directory, "changelog.txt");
  await Deno.writeTextFile(
    changelog,
    [
      "## previous release",
      "",
      "- old feature",
      "",
    ].join("\n"),
  );
  await bump([pkg], { release: true, changelog });
  assertEquals(
    await Deno.readTextFile(changelog),
    [
      "## name@0.0.1",
      "",
      "- fix: bug (#42)",
      "",
      "## previous release",
      "",
      "- old feature",
      "",
    ].join("\n"),
  );
});

Deno.test("bump() rejects pull request without update", async () => {
  await using pkg = await tempPackage({
    config: { name: "@scope/name", version: "0.1.0" },
    commits: [{ summary: "feat: new feature", tags: ["name@0.1.0"] }],
  });
  await assertRejects(() => bump([pkg], { pr: true }), PackageError);
});

Deno.test("bump() creates a pull request", async () => {
  await using remote = await tempRepository({ bare: true });
  await using pkg = await tempPackage({
    config: { name: "@scope/name", version: "1.2.3" },
    repo: { clone: remote },
    commits: [
      { summary: "initial", tags: ["name@1.2.3"] },
      { summary: "feat: new feature (#42)" },
      { summary: "fix: force pushed" },
    ],
  });
  const repo = fakeRepository({ git: git({ cwd: pkg.directory }) });
  const pr = await bump([pkg], {
    release: true,
    pr: true,
    repo,
    name: "bump-name",
    email: "bump-email",
  });
  assertExists(pr);
  assertEquals(pr.title, "chore: bump name version");
  assertEquals(
    pr.body,
    [
      "## name@1.3.0",
      "",
      "- fix: force pushed",
      "- #42",
      "",
    ].join("\n"),
  );
  const [commit] = await remote.commits.log({
    range: { to: "automated/bump/name" },
  });
  assertExists(commit);
  assertEquals(commit.summary, "chore: bump name version");
  assertEquals(commit.author.name, "bump-name");
  assertEquals(commit.author.email, "bump-email");
});

Deno.test("bump() updates pull request", async () => {
  await using remote = await tempRepository({ bare: true });
  await using pkg = await tempPackage({
    config: { name: "@scope/name", version: "1.2.3" },
    repo: { clone: remote },
    commits: [
      { summary: "initial", tags: ["name@1.2.3"] },
      { summary: "feat: new feature (#42)" },
    ],
  });
  const repo = fakeRepository({ git: git({ cwd: pkg.directory }) });
  const existing = fakePullRequest({
    repo,
    number: 42,
    title: "chore: bump name version",
  });
  repo.pulls.list = async () => await Promise.resolve([existing]);
  const pr = await bump([pkg], {
    release: true,
    pr: true,
    repo,
    name: "bump-name",
    email: "bump-email",
  });
  assertExists(pr);
  assertEquals(pr.number, 42);
  assertEquals(pr.title, "chore: bump name version");
  assertEquals(
    pr.body,
    [
      "## name@1.3.0",
      "",
      "- #42",
      "",
    ].join("\n"),
  );
});

Deno.test("bump() creates a pull request against the current branch", async () => {
  await using remote = await tempRepository();
  await remote.branches.checkout({ new: "release" });
  await using pkg = await tempPackage({
    config: { name: "@scope/name" },
    repo: { clone: remote },
    commits: [{ summary: "feat: new feature" }],
  });
  const repo = fakeRepository({ git: git({ cwd: pkg.directory }) });
  const pr = await bump([pkg], {
    release: true,
    pr: true,
    repo,
    name: "bump-name",
    email: "bump-email",
  });
  assertExists(pr);
  assertEquals(pr.base, "release");
});
