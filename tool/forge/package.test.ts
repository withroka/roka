import {
  commits,
  PackageError,
  packageInfo,
  releases,
  workspace,
} from "@roka/forge/package";
import { tempPackage, testPackage } from "@roka/forge/testing";
import { GitError } from "@roka/git";
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
  await using repo = await tempDirectory();
  const directory = repo.path();
  await testPackage(directory, { name: "@scope/name", version: "1.2.3" });
  assertEquals(await packageInfo({ directory }), {
    name: "name",
    directory,
    root: directory,
    version: "1.2.3",
    config: { name: "@scope/name", version: "1.2.3" },
  });
});

Deno.test("packageInfo() returns release version at release commit", async () => {
  await using repo = await tempRepository();
  const directory = repo.path();
  await testPackage(directory, { name: "@scope/name", version: "1.2.3" });
  await repo.commits.create("initial", { allowEmpty: true });
  const tag = await repo.tags.create("name@1.2.3");
  assertEquals(await packageInfo({ directory }), {
    name: "name",
    directory,
    root: directory,
    version: "1.2.3",
    config: { name: "@scope/name", version: "1.2.3" },
    latest: { version: "1.2.3", tag, range: { to: tag.commit.hash } },
    changes: [],
  });
});

Deno.test("packageInfo() calculates patch version update", async () => {
  await using repo = await tempRepository();
  const directory = repo.path();
  await testPackage(directory, { name: "@scope/name", version: "1.2.3" });
  await repo.commits.create("initial", { allowEmpty: true });
  const tag = await repo.tags.create("name@1.2.3");
  const commit = await repo.commits.create("fix: patch", {
    allowEmpty: true,
  });
  assertEquals(await packageInfo({ directory }), {
    name: "name",
    directory,
    root: directory,
    version: `1.2.4-pre.1+${commit.short}`,
    config: { name: "@scope/name", version: "1.2.3" },
    latest: { version: "1.2.3", tag, range: { to: tag.commit.hash } },
    changes: [conventional(commit)],
  });
});

Deno.test("packageInfo() calculates minor version update", async () => {
  await using repo = await tempRepository();
  const directory = repo.path();
  await testPackage(directory, { name: "@scope/name", version: "1.2.3" });
  await repo.commits.create("initial", { allowEmpty: true });
  const tag = await repo.tags.create("name@1.2.3");
  const commit = await repo.commits.create("feat: minor", {
    allowEmpty: true,
  });
  assertEquals(await packageInfo({ directory }), {
    name: "name",
    directory,
    root: directory,
    version: `1.3.0-pre.1+${commit.short}`,
    config: { name: "@scope/name", version: "1.2.3" },
    latest: { version: "1.2.3", tag, range: { to: tag.commit.hash } },
    changes: [conventional(commit)],
  });
});

Deno.test("packageInfo() calculates major version update", async () => {
  await using repo = await tempRepository();
  const directory = repo.path();
  await testPackage(directory, { name: "@scope/name", version: "1.2.3" });
  await repo.commits.create("initial", { allowEmpty: true });
  const tag = await repo.tags.create("name@1.2.3");
  const commit = await repo.commits.create("feat!: major", {
    allowEmpty: true,
  });
  assertEquals(await packageInfo({ directory }), {
    name: "name",
    directory,
    root: directory,
    version: `2.0.0-pre.1+${commit.short}`,
    config: { name: "@scope/name", version: "1.2.3" },
    latest: { version: "1.2.3", tag, range: { to: tag.commit.hash } },
    changes: [conventional(commit)],
  });
});

Deno.test("packageInfo() matches all scopes for non-workspace", async () => {
  await using repo = await tempRepository();
  const directory = repo.path();
  await testPackage(directory, { name: "@scope/name" });
  await repo.commits.create("initial", { allowEmpty: true });
  const commit1 = await repo.commits.create("fix(something): patch", {
    allowEmpty: true,
  });
  const commit2 = await repo.commits.create("fix: patch", { allowEmpty: true });
  assertEquals(await packageInfo({ directory }), {
    name: "name",
    directory,
    root: directory,
    version: `0.0.1-pre.2+${commit2.short}`,
    config: { name: "@scope/name" },
    changes: [conventional(commit2), conventional(commit1)],
  });
});

Deno.test("packageInfo() skips change if type is not feat or fix", async () => {
  await using repo = await tempRepository();
  const directory = repo.path();
  await testPackage(directory, { name: "@scope/name", version: "1.2.3" });
  await repo.commits.create("initial", { allowEmpty: true });
  const tag = await repo.tags.create("name@1.2.3");
  await repo.commits.create("refactor: patch", {
    allowEmpty: true,
  });
  assertEquals(await packageInfo({ directory }), {
    name: "name",
    directory,
    root: directory,
    version: "1.2.3",
    config: { name: "@scope/name", version: "1.2.3" },
    latest: { version: "1.2.3", tag, range: { to: tag.commit.hash } },
    changes: [],
  });
});

Deno.test("packageInfo() considers all breaking changes", async () => {
  await using repo = await tempRepository();
  const directory = repo.path();
  await testPackage(directory, { name: "@scope/name", version: "1.2.3" });
  await repo.commits.create("initial", { allowEmpty: true });
  const tag = await repo.tags.create("name@1.2.3");
  const commit = await repo.commits.create("refactor!: patch", {
    allowEmpty: true,
  });
  assertEquals(await packageInfo({ directory }), {
    name: "name",
    directory,
    root: directory,
    version: `2.0.0-pre.1+${commit.short}`,
    config: { name: "@scope/name", version: "1.2.3" },
    latest: { version: "1.2.3", tag, range: { to: tag.commit.hash } },
    changes: [conventional(commit)],
  });
});

Deno.test("packageInfo() handles multiple commits in changelog", async () => {
  await using repo = await tempRepository();
  const directory = repo.path();
  await testPackage(directory, { name: "@scope/name", version: "1.2.3" });
  await repo.commits.create("initial", { allowEmpty: true });
  const tag = await repo.tags.create("name@1.2.3");
  const commit1 = await repo.commits.create("fix: fix", { allowEmpty: true });
  const commit2 = await repo.commits.create("feat: fix", { allowEmpty: true });
  const commit3 = await repo.commits.create("fix: fix", { allowEmpty: true });
  assertEquals(await packageInfo({ directory }), {
    name: "name",
    directory,
    root: directory,
    version: `1.3.0-pre.3+${commit3.short}`,
    config: { name: "@scope/name", version: "1.2.3" },
    latest: { version: "1.2.3", tag, range: { to: tag.commit.hash } },
    changes: [
      conventional(commit3),
      conventional(commit2),
      conventional(commit1),
    ],
  });
});

Deno.test("packageInfo() handles forced patch update", async () => {
  await using repo = await tempRepository();
  const directory = repo.path();
  await testPackage(directory, { name: "@scope/name", version: "1.2.4" });
  await repo.commits.create("initial", { allowEmpty: true });
  const tag = await repo.tags.create("name@1.2.3");
  assertEquals(await packageInfo({ directory }), {
    name: "name",
    directory,
    root: directory,
    version: "1.2.4",
    config: { name: "@scope/name", version: "1.2.4" },
    latest: { version: "1.2.3", tag, range: { to: tag.commit.hash } },
    changes: [],
  });
});

Deno.test("packageInfo() handles forced minor update", async () => {
  await using repo = await tempRepository();
  const directory = repo.path();
  await testPackage(directory, { name: "@scope/name", version: "1.3.0" });
  await repo.commits.create("initial", { allowEmpty: true });
  const tag = await repo.tags.create("name@1.2.3");
  assertEquals(await packageInfo({ directory }), {
    name: "name",
    directory,
    root: directory,
    version: "1.3.0",
    config: { name: "@scope/name", version: "1.3.0" },
    latest: { version: "1.2.3", tag, range: { to: tag.commit.hash } },
    changes: [],
  });
});

Deno.test("packageInfo() handles forced major update", async () => {
  await using repo = await tempRepository();
  const directory = repo.path();
  await testPackage(directory, { name: "@scope/name", version: "2.0.0" });
  await repo.commits.create("initial", { allowEmpty: true });
  const tag = await repo.tags.create("name@1.2.3");
  assertEquals(await packageInfo({ directory }), {
    name: "name",
    directory,
    root: directory,
    version: "2.0.0",
    config: { name: "@scope/name", version: "2.0.0" },
    latest: { version: "1.2.3", tag, range: { to: tag.commit.hash } },
    changes: [],
  });
});

Deno.test("packageInfo() overrides calculated update", async () => {
  await using repo = await tempRepository();
  const directory = repo.path();
  await testPackage(directory, { name: "@scope/name", version: "2.2.2" });
  await repo.commits.create("initial", { allowEmpty: true });
  const tag = await repo.tags.create("name@1.2.3");
  const commit = await repo.commits.create("fix(name): description", {
    allowEmpty: true,
  });
  assertEquals(await packageInfo({ directory }), {
    name: "name",
    directory,
    root: directory,
    version: "2.2.2",
    config: { name: "@scope/name", version: "2.2.2" },
    latest: { version: "1.2.3", tag, range: { to: tag.commit.hash } },
    changes: [conventional(commit)],
  });
});

Deno.test("packageInfo() uses higher config version", async () => {
  await using repo = await tempRepository();
  const directory = repo.path();
  await testPackage(directory, { name: "@scope/name", version: "1.2.3" });
  await repo.commits.create("initial", { allowEmpty: true });
  const tag = await repo.tags.create("name@1.2.2");
  assertEquals(await packageInfo({ directory }), {
    name: "name",
    directory,
    root: directory,
    version: "1.2.3",
    config: { name: "@scope/name", version: "1.2.3" },
    latest: { version: "1.2.2", tag, range: { to: tag.commit.hash } },
    changes: [],
  });
});

Deno.test("packageInfo() ignores lower config version", async () => {
  await using repo = await tempRepository();
  const directory = repo.path();
  await testPackage(directory, { name: "@scope/name", version: "1.2.3" });
  await repo.commits.create("initial", { allowEmpty: true });
  const tag = await repo.tags.create("name@1.2.4");
  assertEquals(await packageInfo({ directory }), {
    name: "name",
    directory,
    root: directory,
    version: "1.2.4",
    config: { name: "@scope/name", version: "1.2.3" },
    latest: { version: "1.2.4", tag, range: { to: tag.commit.hash } },
    changes: [],
  });
});

Deno.test("packageInfo() returns returns first version", async () => {
  await using repo = await tempRepository();
  const directory = repo.path();
  await testPackage(directory, { name: "@scope/name" });
  await repo.commits.create("initial", { allowEmpty: true });
  assertEquals(await packageInfo({ directory }), {
    name: "name",
    directory,
    root: directory,
    version: "0.0.0",
    config: { name: "@scope/name" },
    changes: [],
  });
});

Deno.test("packageInfo() returns update at initial version", async () => {
  await using repo = await tempRepository();
  const directory = repo.path();
  await testPackage(directory, { name: "@scope/name", version: "0.1.0" });
  const commit = await repo.commits.create("feat(name): introduce package", {
    allowEmpty: true,
  });
  assertEquals(await packageInfo({ directory }), {
    name: "name",
    directory,
    root: directory,
    version: "0.1.0",
    config: { name: "@scope/name", version: "0.1.0" },
    changes: [conventional(commit)],
  });
});

Deno.test("workspace() returns simple package", async () => {
  await using repo = await tempDirectory();
  const directory = repo.path();
  await testPackage(directory, { name: "pkg" });
  assertEquals(await workspace({ directory }), [{
    name: "pkg",
    directory,
    root: directory,
    version: "0.0.0",
    config: { name: "pkg" },
  }]);
});

Deno.test("workspace() returns monorepo packages", async () => {
  await using repo = await tempDirectory();
  const directory = repo.path();
  await testPackage(directory, { workspace: ["./pkg1", "./pkg2"] });
  await testPackage(repo.path("pkg1"), { name: "pkg1", version: "0.1.0" });
  await testPackage(repo.path("pkg2"), { name: "pkg2" });
  assertEquals(await workspace({ directory }), [{
    name: "pkg1",
    directory: repo.path("pkg1"),
    root: repo.path(),
    version: "0.1.0",
    config: { name: "pkg1", version: "0.1.0" },
  }, {
    name: "pkg2",
    directory: repo.path("pkg2"),
    root: repo.path(),
    version: "0.0.0",
    config: { name: "pkg2" },
  }]);
});

Deno.test("workspace() does not return nested workspace packages", async () => {
  await using repo = await tempDirectory();
  const directory = repo.path();
  await testPackage(directory, { workspace: ["./pkg1"] });
  const pkg1 = await testPackage(repo.path("pkg1"), {
    name: "pkg1",
    root: repo.path(),
    workspace: ["./pkg2"],
  });
  await testPackage(repo.path("pkg1", "pkg2"), { name: "pkg2" });
  assertEquals(await workspace({ directory }), [pkg1]);
});

Deno.test("workspace() filters packages", async () => {
  await using repo = await tempDirectory();
  const directory = repo.path();
  await testPackage(directory, {
    workspace: ["./dir1/pkg1", "./dir2/pkg2", "./dir2/pkg3"],
  });
  const p1 = await testPackage(
    repo.path("dir1/pkg1"),
    { name: "pkg1", root: repo.path() },
  );
  const p2 = await testPackage(
    repo.path("dir2/pkg2"),
    { name: "pkg2", root: repo.path() },
  );
  const p3 = await testPackage(
    repo.path("dir2/pkg3"),
    { name: "pkg3", root: repo.path() },
  );
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
  await using repo = await tempRepository();
  const directory = repo.path("name");
  await testPackage(repo.path(), { workspace: ["./name"] });
  await testPackage(directory, { name: "@scope/name" });
  await repo.commits.create("initial", { allowEmpty: true });
  await repo.commits.create("fix(something): patch", { allowEmpty: true });
  const commit = await repo.commits.create("fix(name): fix", {
    allowEmpty: true,
  });
  await repo.commits.create("fix: patch", { allowEmpty: true });
  assertEquals(await workspace({ directory: repo.path() }), [{
    name: "name",
    directory,
    root: repo.path(),
    version: `0.0.1-pre.1+${commit.short}`,
    config: { name: "@scope/name" },
    changes: [conventional(commit)],
  }]);
});

Deno.test("releases() returns releases for a package", async () => {
  await using git = await tempRepository();
  await git.commits.create("summary", { allowEmpty: true });
  const tag1 = await git.tags.create("name@1.2.3");
  await git.commits.create("summary", { allowEmpty: true });
  const tag2 = await git.tags.create("name@1.2.4");
  await git.tags.create("other@0.1.0");
  const pkg = await testPackage(git.path(), { name: "@scope/name" });
  assertEquals(await releases(pkg), [
    {
      version: "1.2.4",
      tag: tag2,
      range: { from: tag1.commit.hash, to: tag2.commit.hash },
    },
    {
      version: "1.2.3",
      tag: tag1,
      range: { to: tag1.commit.hash },
    },
  ]);
});

Deno.test("releases() ignores unknown tag format", async () => {
  await using git = await tempRepository();
  await git.commits.create("summary", { allowEmpty: true });
  await git.tags.create("v1.2.3");
  const pkg = await testPackage(git.path(), { name: "@scope/name" });
  assertEquals(await releases(pkg), []);
});

Deno.test("releases() fails on non-repository", async () => {
  await using pkg = await tempPackage({ name: "@scope/name" });
  await assertRejects(() => releases(pkg), GitError);
});

Deno.test("commits() generates package changes", async () => {
  await using git = await tempRepository();
  const commit1 = await git.commits.create("feat: introduce", {
    allowEmpty: true,
  });
  const commit2 = await git.commits.create("fix(scope): fix module", {
    allowEmpty: true,
  });
  const commit3 = await git.commits.create("docs: add docs", {
    allowEmpty: true,
  });
  const pkg = await testPackage(git.path(), { name: "@scope/name" });
  assertEquals(
    await commits(pkg),
    [conventional(commit3), conventional(commit2), conventional(commit1)],
  );
});

Deno.test("commits() filters by type", async () => {
  await using git = await tempRepository();
  await git.commits.create("initial", { allowEmpty: true });
  const commit1 = await git.commits.create("feat: introduce", {
    allowEmpty: true,
  });
  const commit2 = await git.commits.create("fix: fix code", {
    allowEmpty: true,
  });
  await git.commits.create("docs: add docs", { allowEmpty: true });
  const pkg = await testPackage(git.path(), { name: "@scope/name" });
  assertEquals(
    await commits(pkg, { type: ["feat", "fix"] }),
    [conventional(commit2), conventional(commit1)],
  );
});

Deno.test("commits() includes breaking changes", async () => {
  await using git = await tempRepository();
  await git.commits.create("initial", { allowEmpty: true });
  const commit1 = await git.commits.create("feat: introduce", {
    allowEmpty: true,
  });
  const commit2 = await git.commits.create("fix: fix code", {
    allowEmpty: true,
  });
  const commit3 = await git.commits.create("refactor!: breaking", {
    allowEmpty: true,
  });
  await git.commits.create("docs: add docs", { allowEmpty: true });
  const pkg = await testPackage(git.path(), { name: "@scope/name" });
  assertEquals(
    await commits(pkg, { type: ["feat", "fix"] }),
    [conventional(commit3), conventional(commit2), conventional(commit1)],
  );
});

Deno.test("commits() can filter breaking changes", async () => {
  await using git = await tempRepository();
  await git.commits.create("initial", { allowEmpty: true });
  await git.commits.create("feat: introduce", { allowEmpty: true });
  const commit = await git.commits.create("fix!: fix code", {
    allowEmpty: true,
  });
  await git.commits.create("refactor!: breaking", { allowEmpty: true });
  await git.commits.create("docs: add docs", { allowEmpty: true });
  const pkg = await testPackage(git.path(), { name: "@scope/name" });
  assertEquals(
    await commits(pkg, { type: ["feat", "fix"], breaking: true }),
    [conventional(commit)],
  );
});

Deno.test("commits() can filter non-breaking changes", async () => {
  await using git = await tempRepository();
  await git.commits.create("initial", { allowEmpty: true });
  const commit1 = await git.commits.create("feat: introduce", {
    allowEmpty: true,
  });
  const commit2 = await git.commits.create("fix: fix code", {
    allowEmpty: true,
  });
  await git.commits.create("refactor!: breaking", { allowEmpty: true });
  await git.commits.create("docs: add docs", { allowEmpty: true });
  const pkg = await testPackage(git.path(), { name: "@scope/name" });
  assertEquals(
    await commits(pkg, { type: ["feat", "fix"], breaking: false }),
    [conventional(commit2), conventional(commit1)],
  );
});

Deno.test("commits() can return breaking changes only", async () => {
  await using git = await tempRepository();
  await git.commits.create("initial", { allowEmpty: true });
  git.commits.create("feat: introduce", { allowEmpty: true });
  await git.commits.create("fix: fix code", { allowEmpty: true });
  const commit = await git.commits.create("refactor!: breaking", {
    allowEmpty: true,
  });
  await git.commits.create("docs: add docs", { allowEmpty: true });
  const pkg = await testPackage(git.path(), { name: "@scope/name" });
  assertEquals(
    await commits(pkg, { breaking: true }),
    [conventional(commit)],
  );
});

Deno.test("commits() generates changelog since the latest release", async () => {
  await using git = await tempRepository();
  await git.commits.create("fix: fix", { allowEmpty: true });
  await git.tags.create("name@1.2.3");
  const commit1 = await git.commits.create("fix: fix", { allowEmpty: true });
  const commit2 = await git.commits.create("fix: fix", { allowEmpty: true });
  const pkg = await testPackage(git.path(), { name: "@scope/name" });
  assertExists(pkg.latest);
  assertEquals(
    await commits(pkg, { range: { from: pkg.latest.tag } }),
    [conventional(commit2), conventional(commit1)],
  );
});

Deno.test("commits() generates changelog for a release", async () => {
  await using git = await tempRepository();
  await git.commits.create("fix(name): fix", { allowEmpty: true });
  await git.tags.create("name@1.2.3");
  const commit1 = await git.commits.create("fix: fix", { allowEmpty: true });
  const commit2 = await git.commits.create("fix: fix", { allowEmpty: true });
  await git.tags.create("name@1.2.4");
  await git.commits.create("fix: fix", { allowEmpty: true });
  const pkg = await testPackage(git.path(), { name: "@scope/name" });
  const [latest] = await releases(pkg);
  assertExists(latest);
  assertEquals(
    await commits(pkg, { range: latest.range }),
    [conventional(commit2), conventional(commit1)],
  );
});

Deno.test("commits() enforces scope for workspace members", async () => {
  await using git = await tempRepository();
  await git.commits.create("fix(other): fix", { allowEmpty: true });
  const commit = await git.commits.create("fix(name): fix", {
    allowEmpty: true,
  });
  const pkg = await testPackage(git.path(), { name: "@scope/name", root: "?" });
  assertEquals(await commits(pkg), [conventional(commit)]);
});
