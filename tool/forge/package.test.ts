import { PackageError, packageInfo, workspace } from "@roka/forge/package";
import { testPackage } from "@roka/forge/testing";
import { conventional } from "@roka/git/conventional";
import { tempRepository } from "@roka/git/testing";
import { tempDirectory } from "@roka/testing/temp";
import { assertEquals, assertRejects } from "@std/assert";

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
    directory,
    name: "name",
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
    directory,
    name: "name",
    version: "1.2.3",
    config: { name: "@scope/name", version: "1.2.3" },
    latest: { version: "1.2.3", tag },
    changelog: [],
  });
});

Deno.test("packageInfo() calculates patch version update", async () => {
  await using repo = await tempRepository();
  const directory = repo.path();
  await testPackage(directory, { name: "@scope/name", version: "1.2.3" });
  await repo.commits.create("initial", { allowEmpty: true });
  const tag = await repo.tags.create("name@1.2.3");
  const commit = await repo.commits.create("fix(name): patch", {
    allowEmpty: true,
  });
  assertEquals(await packageInfo({ directory }), {
    directory,
    name: "name",
    version: `1.2.4-pre.1+${commit.short}`,
    config: { name: "@scope/name", version: "1.2.3" },
    latest: { version: "1.2.3", tag },
    changelog: [conventional(commit)],
  });
});

Deno.test("packageInfo() calculates minor version update", async () => {
  await using repo = await tempRepository();
  const directory = repo.path();
  await testPackage(directory, { name: "@scope/name", version: "1.2.3" });
  await repo.commits.create("initial", { allowEmpty: true });
  const tag = await repo.tags.create("name@1.2.3");
  const commit = await repo.commits.create("feat(name): minor", {
    allowEmpty: true,
  });
  assertEquals(await packageInfo({ directory }), {
    directory,
    name: "name",
    version: `1.3.0-pre.1+${commit.short}`,
    config: { name: "@scope/name", version: "1.2.3" },
    latest: { version: "1.2.3", tag },
    changelog: [conventional(commit)],
  });
});

Deno.test("packageInfo() calculates major version update", async () => {
  await using repo = await tempRepository();
  const directory = repo.path();
  await testPackage(directory, { name: "@scope/name", version: "1.2.3" });
  await repo.commits.create("initial", { allowEmpty: true });
  const tag = await repo.tags.create("name@1.2.3");
  const commit = await repo.commits.create("feat(name)!: major", {
    allowEmpty: true,
  });
  assertEquals(await packageInfo({ directory }), {
    directory,
    name: "name",
    version: `2.0.0-pre.1+${commit.short}`,
    config: { name: "@scope/name", version: "1.2.3" },
    latest: { version: "1.2.3", tag },
    changelog: [conventional(commit)],
  });
});

Deno.test("packageInfo() ignores commits for other package", async () => {
  await using repo = await tempRepository();
  const directory = repo.path();
  await testPackage(directory, { name: "@scope/name", version: "1.2.3" });
  await repo.commits.create("initial", { allowEmpty: true });
  const tag = await repo.tags.create("name@1.2.3");
  await repo.commits.create("fix(other): patch", { allowEmpty: true });
  assertEquals(await packageInfo({ directory }), {
    directory,
    name: "name",
    version: `1.2.3`,
    config: { name: "@scope/name", version: "1.2.3" },
    latest: { version: "1.2.3", tag },
    changelog: [],
  });
});

Deno.test("packageInfo() updates for any commit type", async () => {
  await using repo = await tempRepository();
  const directory = repo.path();
  await testPackage(directory, { name: "@scope/name", version: "1.2.3" });
  await repo.commits.create("initial", { allowEmpty: true });
  const tag = await repo.tags.create("name@1.2.3");
  const commit = await repo.commits.create("refactor(name): patch", {
    allowEmpty: true,
  });
  assertEquals(await packageInfo({ directory }), {
    directory,
    name: "name",
    version: `1.2.4-pre.1+${commit.short}`,
    config: { name: "@scope/name", version: "1.2.3" },
    latest: { version: "1.2.3", tag },
    changelog: [conventional(commit)],
  });
});

Deno.test("packageInfo() handles multiple commits in changelog", async () => {
  await using repo = await tempRepository();
  const directory = repo.path();
  await testPackage(directory, { name: "@scope/name", version: "1.2.3" });
  await repo.commits.create("initial", { allowEmpty: true });
  const tag = await repo.tags.create("name@1.2.3");
  const commit1 = await repo.commits.create("fix(name): 1", {
    allowEmpty: true,
  });
  const commit2 = await repo.commits.create("feat(name): 2", {
    allowEmpty: true,
  });
  const commit3 = await repo.commits.create("fix(name): 3", {
    allowEmpty: true,
  });
  assertEquals(await packageInfo({ directory }), {
    directory,
    name: "name",
    version: `1.3.0-pre.3+${commit3.short}`,
    config: { name: "@scope/name", version: "1.2.3" },
    latest: { version: "1.2.3", tag },
    changelog: [
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
    directory,
    name: "name",
    version: "1.2.4",
    config: { name: "@scope/name", version: "1.2.4" },
    latest: { version: "1.2.3", tag },
    changelog: [],
  });
});

Deno.test("packageInfo() handles forced minor update", async () => {
  await using repo = await tempRepository();
  const directory = repo.path();
  await testPackage(directory, { name: "@scope/name", version: "1.3.0" });
  await repo.commits.create("initial", { allowEmpty: true });
  const tag = await repo.tags.create("name@1.2.3");
  assertEquals(await packageInfo({ directory }), {
    directory,
    name: "name",
    version: "1.3.0",
    config: { name: "@scope/name", version: "1.3.0" },
    latest: { version: "1.2.3", tag },
    changelog: [],
  });
});

Deno.test("packageInfo() handles forced major update", async () => {
  await using repo = await tempRepository();
  const directory = repo.path();
  await testPackage(directory, { name: "@scope/name", version: "2.0.0" });
  await repo.commits.create("initial", { allowEmpty: true });
  const tag = await repo.tags.create("name@1.2.3");
  assertEquals(await packageInfo({ directory }), {
    directory,
    name: "name",
    version: "2.0.0",
    config: { name: "@scope/name", version: "2.0.0" },
    latest: { version: "1.2.3", tag },
    changelog: [],
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
    directory,
    name: "name",
    version: "2.2.2",
    config: { name: "@scope/name", version: "2.2.2" },
    latest: { version: "1.2.3", tag },
    changelog: [conventional(commit)],
  });
});

Deno.test("packageInfo() uses higher config version", async () => {
  await using repo = await tempRepository();
  const directory = repo.path();
  await testPackage(directory, { name: "@scope/name", version: "1.2.3" });
  await repo.commits.create("initial", { allowEmpty: true });
  const tag = await repo.tags.create("name@1.2.2");
  assertEquals(await packageInfo({ directory }), {
    directory,
    name: "name",
    version: "1.2.3",
    config: { name: "@scope/name", version: "1.2.3" },
    latest: { version: "1.2.2", tag },
    changelog: [],
  });
});

Deno.test("packageInfo() ignores lower config version", async () => {
  await using repo = await tempRepository();
  const directory = repo.path();
  await testPackage(directory, { name: "@scope/name", version: "1.2.3" });
  await repo.commits.create("initial", { allowEmpty: true });
  const tag = await repo.tags.create("name@1.2.4");
  assertEquals(await packageInfo({ directory }), {
    directory,
    name: "name",
    version: "1.2.4",
    config: { name: "@scope/name", version: "1.2.3" },
    latest: { version: "1.2.4", tag },
    changelog: [],
  });
});

Deno.test("packageInfo() returns returns first version", async () => {
  await using repo = await tempRepository();
  const directory = repo.path();
  await testPackage(directory, { name: "@scope/name" });
  await repo.commits.create("initial", { allowEmpty: true });
  assertEquals(await packageInfo({ directory }), {
    directory,
    name: "name",
    version: "0.0.0",
    config: { name: "@scope/name" },
    changelog: [],
  });
});

Deno.test("packageInfo() returns update at initial version", async () => {
  await using repo = await tempRepository();
  const directory = repo.path();
  await testPackage(directory, { name: "@scope/name", version: "0.1.0" });
  await repo.commits.create("feat(name): introduce package", {
    allowEmpty: true,
  });
  assertEquals(await packageInfo({ directory }), {
    directory,
    name: "name",
    version: "0.1.0",
    config: { name: "@scope/name", version: "0.1.0" },
    changelog: [],
  });
});

Deno.test("workspace() returns simple package", async () => {
  await using repo = await tempDirectory();
  const directory = repo.path();
  const pkg = await testPackage(directory, { name: "pkg" });
  assertEquals(await workspace({ directory }), [pkg]);
});

Deno.test("workspace() returns monorepo packages", async () => {
  await using repo = await tempDirectory();
  const directory = repo.path();
  await testPackage(directory, { workspace: ["./pkg1", "./pkg2"] });
  const pkg1 = await testPackage(repo.path("pkg1"), { name: "pkg1" });
  const pkg2 = await testPackage(repo.path("pkg2"), { name: "pkg2" });
  assertEquals(await workspace({ directory }), [pkg1, pkg2]);
});

Deno.test("workspace() does not return nested workspace packages", async () => {
  await using repo = await tempDirectory();
  const directory = repo.path();
  await testPackage(directory, { workspace: ["./pkg1"] });
  const pkg1 = await testPackage(repo.path("pkg1"), {
    name: "pkg1",
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
  const p1 = await testPackage(repo.path("dir1/pkg1"), { name: "pkg1" });
  const p2 = await testPackage(repo.path("dir2/pkg2"), { name: "pkg2" });
  const p3 = await testPackage(repo.path("dir2/pkg3"), { name: "pkg3" });
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
