import {
  commits,
  type Package,
  PackageError,
  packageInfo,
  releases,
  workspace,
} from "@roka/forge/package";
import { tempPackage, tempWorkspace } from "@roka/forge/testing";
import { git, GitError } from "@roka/git";
import { conventional } from "@roka/git/conventional";
import { tempRepository } from "@roka/git/testing";
import { tempDirectory } from "@roka/testing/temp";
import { assertEquals, assertExists, assertRejects } from "@std/assert";

Deno.test("packageInfo() rejects non-Deno package", async () => {
  await using repo = await tempRepository();
  const directory = repo.path();
  await assertRejects(() => packageInfo({ directory }), PackageError);
});

Deno.test("packageInfo() returns current package", async () => {
  const pkg = await packageInfo();
  assertEquals(pkg.config.name, "@roka/forge");
});

Deno.test("packageInfo() returns package from directory", async () => {
  await using temp = await tempPackage({
    config: { name: "@scope/name", version: "1.2.3" },
  });
  const directory = temp.directory;
  assertEquals(await packageInfo({ directory }), {
    name: "name",
    version: "1.2.3",
    directory,
    root: directory,
    config: { name: "@scope/name", version: "1.2.3" },
  });
});

Deno.test("packageInfo() rejects invalid version", async () => {
  await using directory = await tempDirectory();
  await Deno.writeTextFile(
    directory.path("deno.json"),
    JSON.stringify({ name: "name", version: "beta" }),
  );
  await assertRejects(
    () => packageInfo({ directory: directory.path() }),
    PackageError,
  );
});

Deno.test("packageInfo() returns release version at release commit", async () => {
  await using temp = await tempPackage({
    config: { name: "@scope/name", version: "1.2.3" },
    commits: [{ summary: "initial", tags: ["name@1.2.3"] }],
  });
  const directory = temp.directory;
  const [tag] = await git({ cwd: directory }).tags.list();
  assertExists(tag);
  assertEquals(await packageInfo({ directory }), {
    name: "name",
    version: "1.2.3",
    directory,
    root: directory,
    config: { name: "@scope/name", version: "1.2.3" },
    latest: { version: "1.2.3", tag, range: { to: tag.commit.hash } },
    changes: [],
  });
});

Deno.test("packageInfo() calculates patch version update", async () => {
  await using temp = await tempPackage({
    config: { name: "@scope/name", version: "1.2.3" },
    commits: [
      { summary: "initial", tags: ["name@1.2.3"] },
      { summary: "fix: bug fix" },
    ],
  });
  const directory = temp.directory;
  const repo = git({ cwd: directory });
  const commit = await repo.commits.head();
  const [tag] = await repo.tags.list();
  assertExists(tag);
  assertEquals(await packageInfo({ directory }), {
    name: "name",
    version: `1.2.4-pre.1+${commit.short}`,
    directory,
    root: directory,
    config: { name: "@scope/name", version: "1.2.3" },
    latest: { version: "1.2.3", tag, range: { to: tag.commit.hash } },
    changes: [conventional(commit)],
  });
});

Deno.test("packageInfo() calculates minor version update", async () => {
  await using temp = await tempPackage({
    config: { name: "@scope/name", version: "1.2.3" },
    commits: [
      { summary: "initial", tags: ["name@1.2.3"] },
      { summary: "feat: new feature" },
    ],
  });
  const directory = temp.directory;
  const repo = git({ cwd: directory });
  const commit = await repo.commits.head();
  const [tag] = await repo.tags.list();
  assertExists(tag);
  assertEquals(await packageInfo({ directory }), {
    name: "name",
    version: `1.3.0-pre.1+${commit.short}`,
    directory,
    root: directory,
    config: { name: "@scope/name", version: "1.2.3" },
    latest: { version: "1.2.3", tag, range: { to: tag.commit.hash } },
    changes: [conventional(commit)],
  });
});

Deno.test("packageInfo() calculates major version update", async () => {
  await using temp = await tempPackage({
    config: { name: "@scope/name", version: "1.2.3" },
    commits: [
      { summary: "initial", tags: ["name@1.2.3"] },
      { summary: "fix!: breaking change" },
    ],
  });
  const directory = temp.directory;
  const repo = git({ cwd: directory });
  const commit = await repo.commits.head();
  const [tag] = await repo.tags.list();
  assertExists(tag);
  assertEquals(await packageInfo({ directory }), {
    name: "name",
    version: `2.0.0-pre.1+${commit.short}`,
    directory,
    root: directory,
    config: { name: "@scope/name", version: "1.2.3" },
    latest: { version: "1.2.3", tag, range: { to: tag.commit.hash } },
    changes: [conventional(commit)],
  });
});

Deno.test("packageInfo() matches all scopes for non-workspace", async () => {
  await using temp = await tempPackage({
    config: { name: "@scope/name" },
    commits: [
      { summary: "fix(something): done" },
      { summary: "fix: something else" },
    ],
  });
  const directory = temp.directory;
  const repo = git({ cwd: directory });
  const [commit2, commit1] = await repo.commits.log();
  assertExists(commit2);
  assertExists(commit1);
  assertEquals(await packageInfo({ directory }), {
    name: "name",
    version: `0.0.1-pre.2+${commit2.short}`,
    directory,
    root: directory,
    config: { name: "@scope/name" },
    changes: [conventional(commit2), conventional(commit1)],
  });
});

Deno.test("packageInfo() skips change if type is not feat or fix", async () => {
  await using temp = await tempPackage({
    config: { name: "@scope/name" },
    commits: [
      { summary: "fix: fix bug" },
      { summary: "style: argue on whitespace" },
    ],
  });
  const directory = temp.directory;
  const repo = git({ cwd: directory });
  const [_, fix] = await repo.commits.log();
  assertExists(fix);
  assertEquals(await packageInfo({ directory }), {
    name: "name",
    version: `0.0.1-pre.1+${fix.short}`,
    directory,
    root: directory,
    config: { name: "@scope/name" },
    changes: [conventional(fix)],
  });
});

Deno.test("packageInfo() considers all breaking changes", async () => {
  await using temp = await tempPackage({
    config: { name: "@scope/name" },
    commits: [
      { summary: "fix: fix bug" },
      { summary: "style!: api breaking whitespace changes" },
    ],
  });
  const directory = temp.directory;
  const repo = git({ cwd: directory });
  const [style, fix] = await repo.commits.log();
  assertExists(style);
  assertExists(fix);
  assertEquals(await packageInfo({ directory }), {
    name: "name",
    version: `0.1.0-pre.2+${style.short}`,
    directory,
    root: directory,
    config: { name: "@scope/name" },
    changes: [conventional(style), conventional(fix)],
  });
});

Deno.test("packageInfo() skips over pre-release versions", async () => {
  await using temp = await tempPackage({
    config: { name: "@scope/name", version: "1.2.3" },
    commits: [
      { summary: "initial", tags: ["name@1.2.3"] },
      { summary: "feat: new feature" },
      { summary: "fix: bug fix", tags: ["name@1.3.0-pre.2+fedcba9"] },
      { summary: "docs: fix typo" },
      { summary: "feat: another feature" },
    ],
  });
  const directory = temp.directory;
  const repo = git({ cwd: directory });
  const [feat2, docs, fix, feat1, initial] = await repo.commits.log();
  assertExists(feat2);
  assertExists(docs);
  assertExists(fix);
  assertExists(feat1);
  assertExists(initial);
  const [tag123] = await repo.tags.list({ name: "name@1.2.3" });
  assertExists(tag123);
  assertEquals(await packageInfo({ directory }), {
    name: "name",
    version: `1.3.0-pre.3+${feat2.short}`,
    directory,
    root: directory,
    config: { name: "@scope/name", version: "1.2.3" },
    latest: { version: "1.2.3", tag: tag123, range: { to: initial.hash } },
    changes: [conventional(feat2), conventional(fix), conventional(feat1)],
  });
});

Deno.test("packageInfo() uses forced version for unreleased package", async () => {
  await using temp = await tempPackage({
    config: { name: "@scope/name", version: "1.2.3" },
    commits: [{ summary: "initial" }],
  });
  const directory = temp.directory;
  assertEquals(await packageInfo({ directory }), {
    name: "name",
    version: "1.2.3",
    directory,
    root: directory,
    config: { name: "@scope/name", version: "1.2.3" },
    changes: [],
  });
});

Deno.test("packageInfo() uses forced version for released package", async () => {
  await using temp = await tempPackage({
    config: { name: "@scope/name", version: "1.2.4" },
    commits: [{ summary: "initial", tags: ["name@1.2.3"] }],
  });
  const directory = temp.directory;
  const [tag] = await git({ cwd: directory }).tags.list();
  assertExists(tag);
  assertEquals(await packageInfo({ directory }), {
    name: "name",
    version: "1.2.4",
    directory,
    root: directory,
    config: { name: "@scope/name", version: "1.2.4" },
    latest: { version: "1.2.3", tag, range: { to: tag.commit.hash } },
    changes: [],
  });
});

Deno.test("packageInfo() ignores forced lower version", async () => {
  await using temp = await tempPackage({
    config: { name: "@scope/name", version: "1.2.2" },
    commits: [{ summary: "initial", tags: ["name@1.2.3"] }],
  });
  const directory = temp.directory;
  const [tag] = await git({ cwd: directory }).tags.list();
  assertExists(tag);
  assertEquals(await packageInfo({ directory }), {
    name: "name",
    version: "1.2.3",
    directory,
    root: directory,
    config: { name: "@scope/name", version: "1.2.2" },
    latest: { version: "1.2.3", tag, range: { to: tag.commit.hash } },
    changes: [],
  });
});

Deno.test("workspace() returns simple package", async () => {
  await using temp = await tempWorkspace({
    configs: [{ name: "pkg" }],
  });
  const [pkg] = temp;
  assertExists(pkg);
  const directory = pkg.root;
  assertEquals(await workspace({ directory }), [{
    name: "pkg",
    version: "0.0.0",
    directory: pkg.directory,
    root: directory,
    config: { name: "pkg" },
  }]);
});

Deno.test("workspace() returns monorepo packages", async () => {
  await using temp = await tempWorkspace({
    configs: [
      { name: "pkg1", version: "0.1.0" },
      { name: "pkg2" },
      { name: "pkg2/pkg3" },
    ],
  });
  const [pkg1, pkg2, pkg3] = temp;
  assertExists(pkg1);
  assertExists(pkg2);
  assertExists(pkg3);
  const directory = pkg1.root;
  assertEquals(await workspace({ directory }), [{
    name: "pkg1",
    version: "0.1.0",
    directory: pkg1.directory,
    root: directory,
    config: { name: "pkg1", version: "0.1.0" },
  }, {
    name: "pkg2",
    version: "0.0.0",
    directory: pkg2.directory,
    root: directory,
    config: { name: "pkg2" },
  }, {
    name: "pkg3",
    version: "0.0.0",
    directory: pkg3.directory,
    root: directory,
    config: { name: "pkg2/pkg3" },
  }]);
});

Deno.test("workspace() does not return nested workspace packages", async () => {
  await using temp = await tempWorkspace({
    configs: [
      { name: "pkg1" },
      { name: "pkg2", workspace: ["./something"] },
    ],
  });
  const [pkg1, pkg2] = temp;
  assertExists(pkg1);
  const directory = pkg1.root;
  assertEquals(await workspace({ directory }), [pkg1, pkg2]);
});

Deno.test("workspace() filters packages", async () => {
  await using temp = await tempWorkspace({
    configs: [
      { name: "dir1/pkg1" },
      { name: "dir2/pkg2" },
      { name: "dir2/pkg3" },
    ],
  });
  const [p1, p2, p3] = temp;
  assertExists(p1);
  assertExists(p2);
  assertExists(p3);
  const directory = p1.root;
  assertEquals(await workspace({ directory, filters: ["pkg1"] }), [p1]);
  assertEquals(await workspace({ directory, filters: ["pkg2"] }), [p2]);
  assertEquals(await workspace({ directory, filters: ["*1"] }), [p1]);
  assertEquals(await workspace({ directory, filters: ["pkg*"] }), [p1, p2, p3]);
  assertEquals(await workspace({ directory, filters: ["dir1/pkg1"] }), [p1]);
  assertEquals(await workspace({ directory, filters: ["*1/*"] }), [p1]);
  assertEquals(await workspace({ directory, filters: ["*2/pkg?"] }), [p2, p3]);
  assertEquals(await workspace({ directory, filters: ["dir2/*"] }), [p2, p3]);
  assertEquals(await workspace({ directory, filters: ["*/pkg2"] }), [p2]);
  assertEquals(await workspace({ directory, filters: ["none*"] }), []);
  assertEquals(await workspace({ directory, filters: ["*2", "*3"] }), [p2, p3]);
});

Deno.test("workspace() matches commit scope", async () => {
  await using temp = await tempWorkspace({
    configs: [
      { name: "pkg1" },
      { name: "pkg2" },
    ],
    commits: [
      { summary: "initial" },
      { summary: "fix(pkg1): fix" },
      { summary: "fix(pkg2): fix" },
    ],
  });
  const [pkg1, pkg2] = temp;
  assertExists(pkg1);
  assertExists(pkg2);
  const directory = pkg1.root;
  const [commit2, commit1] = await git({ cwd: pkg1.directory }).commits.log();
  assertExists(commit1);
  assertExists(commit2);
  assertEquals(await workspace({ directory }), [{
    name: "pkg1",
    version: `0.0.1-pre.1+${commit1.short}`,
    directory: pkg1.directory,
    root: directory,
    config: { name: "pkg1" },
    changes: [conventional(commit1)],
  }, {
    name: "pkg2",
    version: `0.0.1-pre.1+${commit2.short}`,
    directory: pkg2.directory,
    root: directory,
    config: { name: "pkg2" },
    changes: [conventional(commit2)],
  }]);
});

Deno.test("releases() returns releases for a package", async () => {
  await using pkg = await tempPackage({
    config: { name: "@scope/name", version: "1.2.3" },
    commits: [
      { summary: "first", tags: ["name@1.2.0", "name@1.2.1"] },
      { summary: "second", tags: ["name@1.2.2"] },
      { summary: "third", tags: ["name@1.2.3"] },
    ],
  });
  const [tag123, tag122, tag121, tag120] = await git({ cwd: pkg.directory })
    .tags.list({ sort: "version" });
  assertExists(tag123);
  assertExists(tag122);
  assertExists(tag121);
  assertExists(tag120);
  assertEquals(await releases(pkg), [
    {
      version: "1.2.3",
      tag: tag123,
      range: { from: tag122.commit.hash, to: tag123.commit.hash },
    },
    {
      version: "1.2.2",
      tag: tag122,
      range: { from: tag121.commit.hash, to: tag122.commit.hash },
    },
    {
      version: "1.2.1",
      tag: tag121,
      range: { from: tag120.commit.hash, to: tag121.commit.hash },
    },
    {
      version: "1.2.0",
      tag: tag120,
      range: { to: tag120.commit.hash },
    },
  ]);
});

Deno.test("releases() excludes pre-releases", async () => {
  await using pkg = await tempPackage({
    config: { name: "@scope/name" },
    commits: [
      { summary: "1.2.3", tags: ["name@1.2.3"] },
      { summary: "2.0.0-pre", tags: ["name@2.0.0-pre.42+fedcba9"] },
      { summary: "2.0.0", tags: ["name@2.0.0"] },
    ],
  });
  const repo = git({ cwd: pkg.directory });
  const [tag200] = await repo.tags.list({ name: "name@2.0.0" });
  const [tag123] = await repo.tags.list({ name: "name@1.2.3" });
  assertExists(tag200);
  assertExists(tag123);
  assertEquals(await releases(pkg), [
    {
      version: "2.0.0",
      tag: tag200,
      range: { from: tag123.commit.hash, to: tag200.commit.hash },
    },
    {
      version: "1.2.3",
      tag: tag123,
      range: { to: tag123.commit.hash },
    },
  ]);
});

Deno.test("releases() can include pre-releases", async () => {
  await using pkg = await tempPackage({
    config: { name: "@scope/name" },
    commits: [
      { summary: "1.2.3", tags: ["name@1.2.3"] },
      { summary: "2.0.0-pre", tags: ["name@2.0.0-pre.42+fedcba9"] },
      { summary: "2.0.0", tags: ["name@2.0.0"] },
    ],
  });
  const repo = git({ cwd: pkg.directory });
  const [tag200] = await repo.tags.list({ name: "name@2.0.0" });
  const [tag200pre] = await repo.tags.list({
    name: "name@2.0.0-pre.42+fedcba9",
  });
  const [tag123] = await repo.tags.list({ name: "name@1.2.3" });
  assertExists(tag200);
  assertExists(tag200pre);
  assertExists(tag123);
  assertEquals(await releases(pkg, { prerelease: true }), [
    {
      version: "2.0.0",
      tag: tag200,
      range: { from: tag123.commit.hash, to: tag200.commit.hash },
    },
    {
      version: "2.0.0-pre.42+fedcba9",
      tag: tag200pre,
      range: { from: tag123.commit.hash, to: tag200pre.commit.hash },
    },
    {
      version: "1.2.3",
      tag: tag123,
      range: { to: tag123.commit.hash },
    },
  ]);
});

Deno.test("releases() ignores unknown tag format", async () => {
  await using pkg = await tempPackage({
    config: { name: "@scope/name" },
    commits: [
      { summary: "first", tags: ["beta"] },
      { summary: "second", tags: ["1.2.3"] },
    ],
  });
  assertEquals(await releases(pkg), []);
});

Deno.test("releases() fails on non-repository", async () => {
  await using directory = await tempDirectory();
  const pkg: Package = {
    name: "name",
    version: "0.0.0",
    directory: directory.path(),
    root: directory.path(),
    config: { name: "name" },
  };
  await assertRejects(() => releases(pkg), GitError);
});

Deno.test("commits() returns all history", async () => {
  await using pkg = await tempPackage({
    config: { name: "@scope/name" },
    commits: [
      { summary: "feat: new feature" },
      { summary: "fix!: fix bug", tags: ["name@1.2.3"] },
      { summary: "docs: add docs" },
    ],
  });
  const [docs, fix, feat] = await git({ cwd: pkg.directory }).commits.log();
  assertExists(docs);
  assertExists(fix);
  assertExists(feat);
  assertEquals(
    await commits(pkg),
    [conventional(docs), conventional(fix), conventional(feat)],
  );
});

Deno.test("commits() can return from a range", async () => {
  await using pkg = await tempPackage({
    config: { name: "@scope/name" },
    commits: [
      { summary: "feat: new feature" },
      { summary: "fix!: fix bug", tags: ["name@1.2.3"] },
      { summary: "docs: add docs" },
    ],
  });
  assertExists(pkg.latest);
  const [_, fix, feat] = await git({ cwd: pkg.directory }).commits.log();
  assertExists(fix);
  assertExists(feat);
  assertEquals(
    await commits(pkg, { range: pkg.latest?.range }),
    [conventional(fix), conventional(feat)],
  );
});

Deno.test("commits() filters by type", async () => {
  await using pkg = await tempPackage({
    config: { name: "@scope/name" },
    commits: [
      { summary: "feat: new feature" },
      { summary: "fix!: fix bug" },
      { summary: "docs: add docs" },
    ],
  });
  const [_, fix, feat] = await git({ cwd: pkg.directory }).commits.log();
  assertExists(fix);
  assertExists(feat);
  assertEquals(
    await commits(pkg, { type: ["feat", "fix"] }),
    [conventional(fix), conventional(feat)],
  );
});

Deno.test("commits() includes breaking changes", async () => {
  await using pkg = await tempPackage({
    config: { name: "@scope/name" },
    commits: [
      { summary: "feat: new feature" },
      { summary: "fix!: fix bug" },
      { summary: "docs: add docs" },
    ],
  });
  const [docs, fix] = await git({ cwd: pkg.directory }).commits.log();
  assertExists(docs);
  assertExists(fix);
  assertEquals(
    await commits(pkg, { type: ["docs"] }),
    [conventional(docs), conventional(fix)],
  );
});

Deno.test("commits() can filter breaking changes", async () => {
  await using pkg = await tempPackage({
    config: { name: "@scope/name" },
    commits: [
      { summary: "feat: new feature" },
      { summary: "fix!: fix bug" },
      { summary: "docs: add docs" },
    ],
  });
  const [_, fix] = await git({ cwd: pkg.directory }).commits.log();
  assertExists(fix);
  assertEquals(
    await commits(pkg, { breaking: true }),
    [conventional(fix)],
  );
});

Deno.test("commits() can filter non-breaking changes", async () => {
  await using pkg = await tempPackage({
    config: { name: "@scope/name" },
    commits: [
      { summary: "feat: new feature" },
      { summary: "fix!: fix bug" },
      { summary: "docs: add docs" },
    ],
  });
  const [docs] = await git({ cwd: pkg.directory }).commits.log();
  assertExists(docs);
  assertEquals(
    await commits(pkg, { type: ["docs"], breaking: false }),
    [conventional(docs)],
  );
});

Deno.test("commits() enforces scope for workspace members", async () => {
  const [pkg1, pkg2] = await tempWorkspace({
    configs: [
      { name: "@scope/name1" },
      { name: "@scope/name2" },
    ],
    commits: [
      { summary: "feat: new feature" },
      { summary: "fix(name1)!: fix bug" },
      { summary: "docs(name2): add docs" },
    ],
  });
  assertExists(pkg1);
  assertExists(pkg2);
  const [docs, fix] = await git({ cwd: pkg1.directory }).commits.log();
  assertExists(docs);
  assertExists(fix);
  assertEquals(await commits(pkg1), [conventional(fix)]);
  assertEquals(await commits(pkg2), [conventional(docs)]);
});
