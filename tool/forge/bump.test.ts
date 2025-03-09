import { bump } from "@roka/forge/bump";
import { PackageError, packageInfo } from "@roka/forge/package";
import { testPackage } from "@roka/forge/testing";
import { tempRepository } from "@roka/git/testing";
import { fakePullRequest, fakeRepository } from "@roka/github/testing";
import {
  assertEquals,
  assertExists,
  assertMatch,
  assertRejects,
} from "@std/assert";

Deno.test("bump() bumps config version", async () => {
  await using git = await tempRepository();
  await git.commits.create("initial", { allowEmpty: true });
  await git.tags.create("name@1.2.3");
  const commit = await git.commits.create("fix(name): fix code", {
    allowEmpty: true,
  });
  const pkg = await testPackage(git.path(), {
    name: "@scope/name",
    version: "1.2.3",
  });
  const pr = await bump([pkg]);
  assertEquals(pr, undefined);
  assertEquals(pkg.config.version, `1.2.4-pre.1+${commit.short}`);
  const updated = await packageInfo({ directory: git.path() });
  assertEquals(updated.config, pkg.config);
  const head = await git.commits.head();
  assertEquals(head.summary, "fix(name): fix code");
});

Deno.test("bump() minor updates unreleased package", async () => {
  await using git = await tempRepository();
  await testPackage(git.path(), { name: "@scope/name" });
  await git.index.add("deno.json");
  const commit = await git.commits.create("feat(name): introduce package");
  const pkg = await packageInfo({ directory: git.path() });
  await bump([pkg]);
  assertEquals(pkg.config.version, `0.1.0-pre.1+${commit.short}`);
});

Deno.test("bump() patch updates unreleased package", async () => {
  await using git = await tempRepository();
  await testPackage(git.path(), { name: "@scope/name" });
  await git.index.add("deno.json");
  const commit = await git.commits.create("fix(name): introduce package");
  const pkg = await packageInfo({ directory: git.path() });
  await bump([pkg]);
  assertEquals(pkg.config.version, `0.0.1-pre.1+${commit.short}`);
});

Deno.test("bump() bumps to release version", async () => {
  await using git = await tempRepository();
  await git.commits.create("initial", { allowEmpty: true });
  await git.tags.create("name@1.2.3");
  const commit = await git.commits.create("feat(name): new feature", {
    allowEmpty: true,
  });
  const pkg = await testPackage(git.path(), { name: "@scope/name" });
  await bump([pkg]);
  assertEquals(pkg.version, `1.3.0-pre.1+${commit.short}`);
  assertEquals(pkg.config.version, pkg.version);
  await bump([pkg], { release: true });
  assertEquals(pkg.version, "1.3.0");
  assertEquals(pkg.config.version, pkg.version);
});

Deno.test("bump() creates a pull request", async () => {
  await using remote = await tempRepository();
  await using git = await tempRepository({ clone: remote });
  await testPackage(git.path(), { name: "@scope/name" });
  const repo = fakeRepository({ git });
  await git.index.add("deno.json");
  await git.commits.create("initial");
  await git.tags.create("name@1.2.3");
  await git.commits.create("feat(name): new feature", { allowEmpty: true });
  const pkg = await packageInfo({ directory: git.path() });
  const pr = await bump([pkg], {
    repo,
    release: true,
    pr: true,
    user: { name: "bump-name", email: "bump-email" },
  });
  assertExists(pr);
  assertEquals(pr.title, "chore: bump name version");
  assertMatch(pr.body, /## name@1.3.0 \[minor\]/);
  assertMatch(pr.body, /feat\(name\): new feature/);
  const commit = await git.commits.head();
  assertEquals(commit.summary, "chore: bump name version");
  assertEquals(commit.author.name, "bump-name");
  assertEquals(commit.author.email, "bump-email");
});

Deno.test("bump() rejects pr without update", async () => {
  await using git = await tempRepository();
  await git.commits.create("feat(name): introduce", { allowEmpty: true });
  await git.tags.create("name@0.1.0");
  await testPackage(git.path(), { name: "@scope/name", version: "0.1.0" });
  const pkg = await packageInfo({ directory: git.path() });
  await assertRejects(() => bump([pkg], { pr: true }), PackageError);
});

Deno.test("bump() updates pull request", async () => {
  await using remote = await tempRepository({ bare: true });
  await using git = await tempRepository({ clone: remote });
  await testPackage(git.path(), { name: "@scope/name" });
  const repo = fakeRepository({ git });
  const existing = fakePullRequest({
    repo,
    number: 42,
    title: "chore: bump name version",
  });
  repo.pulls.list = async () => await Promise.resolve([existing]);
  await git.index.add("deno.json");
  await git.commits.create("initial");
  await git.tags.create("name@1.2.3");
  await git.commits.create("feat(name): new feature", { allowEmpty: true });
  const pkg = await packageInfo({ directory: git.path() });
  const pr = await bump([pkg], {
    repo,
    release: true,
    pr: true,
    user: { name: "bump-name", email: "bump-email" },
  });
  assertExists(pr);
  assertEquals(pr.number, 42);
  assertMatch(pr.body, /## name@1.3.0 \[minor\]/);
  assertMatch(pr.body, /feat\(name\): new feature/);
});

Deno.test("bump() updates multiple packages", async () => {
  await using remote = await tempRepository();
  await using git = await tempRepository({ clone: remote });
  const repo = fakeRepository({ git });
  await testPackage(git.path("name1"), { name: "@scope/name1" });
  await testPackage(git.path("name2"), { name: "@scope/name2" });
  await git.index.add("name1/deno.json");
  await git.index.add("name2/deno.json");
  await git.commits.create("feat(name1,name2): introduce packages");
  const pkg1 = await packageInfo({ directory: git.path("name1") });
  const pkg2 = await packageInfo({ directory: git.path("name2") });
  const pr = await bump([pkg1, pkg2], { repo, release: true, pr: true });
  assertExists(pr);
  assertEquals(pr.title, "chore: bump versions");
  assertMatch(pr.body, /## name1@0.1.0 \[minor\]/);
  assertMatch(pr.body, /## name2@0.1.0 \[minor\]/);
  assertMatch(pr.body, /feat\(name1,name2\): introduce packages/);
  const updated1 = await packageInfo({ directory: git.path("name1") });
  const updated2 = await packageInfo({ directory: git.path("name2") });
  assertEquals(updated1.config, { ...pkg1.config, version: "0.1.0" });
  assertEquals(updated2.config, { ...pkg2.config, version: "0.1.0" });
  const commit = await git.commits.head();
  assertEquals(commit.summary, "chore: bump versions");
});

Deno.test("bump() does not mutate package on failure", async () => {
  await using git = await tempRepository();
  await testPackage(git.path(), { name: "@scope/name", version: "0.0.1" });
  await git.commits.create("initial", { allowEmpty: true });
  await git.tags.create("name@0.0.1");
  await git.commits.create("feat(name): new feature", { allowEmpty: true });
  const pkg = await packageInfo({ directory: git.path() });
  await Deno.remove(git.path("deno.json"));
  await Deno.mkdir(git.path("deno.json"));
  await assertRejects(() => bump([pkg], { release: true }));
  assertEquals(pkg.config.version, "0.0.1");
});
