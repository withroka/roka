import {
  type Config,
  type Package,
  PackageError,
  packageInfo,
  workspace,
} from "@roka/forge/package";
import { conventional } from "@roka/git/conventional";
import { tempRepository } from "@roka/git/testing";
import { tempDirectory } from "@roka/testing";
import { assertEquals, assertRejects } from "@std/assert";
import { join } from "@std/path/join";

async function createPackage(
  directory: string,
  options?: Partial<Config>,
): Promise<Package> {
  await Deno.mkdir(directory, { recursive: true });
  await Deno.writeTextFile(
    join(directory, "deno.json"),
    JSON.stringify({ ...options }),
  );
  return await packageInfo({ directory });
}

Deno.test("getPackage() rejects non-Deno package", async () => {
  await using repo = await tempRepository();
  const directory = repo.path();
  await assertRejects(() => packageInfo({ directory }), PackageError);
});

Deno.test("packageInfo() returns current package", async () => {
  const pkg = await packageInfo();
  assertEquals(pkg.config.name, "@roka/forge");
});

Deno.test("packageInfo() returns given package", async () => {
  await using repo = await tempDirectory();
  const directory = repo.path();
  await createPackage(repo.path(), {
    name: "@scope/module",
    version: "1.2.3",
  });
  assertEquals(await packageInfo({ directory }), {
    directory,
    module: "module",
    version: "1.2.3",
    config: { name: "@scope/module", version: "1.2.3" },
  });
});

Deno.test("packageInfo() returns release version at release commit", async () => {
  await using repo = await tempRepository();
  const directory = repo.path();
  await createPackage(repo.path(), { name: "@scope/module", version: "1.2.4" });
  await repo.commits.create("initial", { allowEmpty: true });
  const tag = await repo.tags.create("module@1.2.4");
  assertEquals(await packageInfo({ directory }), {
    directory,
    module: "module",
    version: "1.2.4",
    config: { name: "@scope/module", version: "1.2.4" },
    release: { version: "1.2.4", tag },
  });
});

Deno.test("packageInfo() calculates patch version update", async () => {
  await using repo = await tempRepository();
  const directory = repo.path();
  await createPackage(repo.path(), { name: "@scope/module", version: "1.2.3" });
  await repo.commits.create("initial", { allowEmpty: true });
  const tag = await repo.tags.create("module@1.2.3");
  const commit = await repo.commits.create("fix(module): patch", {
    allowEmpty: true,
  });
  assertEquals(await packageInfo({ directory }), {
    directory,
    module: "module",
    version: `1.2.4-pre.1+${commit.short}`,
    config: { name: "@scope/module", version: "1.2.3" },
    release: { version: "1.2.3", tag },
    update: {
      version: `1.2.4-pre.1+${commit.short}`,
      type: "patch",
      changelog: [conventional(commit)],
    },
  });
});

Deno.test("packageInfo() calculates minor version update", async () => {
  await using repo = await tempRepository();
  const directory = repo.path();
  await createPackage(repo.path(), { name: "@scope/module", version: "1.2.3" });
  await repo.commits.create("initial", { allowEmpty: true });
  const tag = await repo.tags.create("module@1.2.3");
  const commit = await repo.commits.create("feat(module): minor", {
    allowEmpty: true,
  });
  assertEquals(await packageInfo({ directory }), {
    directory,
    module: "module",
    version: `1.3.0-pre.1+${commit.short}`,
    config: { name: "@scope/module", version: "1.2.3" },
    release: { version: "1.2.3", tag },
    update: {
      version: `1.3.0-pre.1+${commit.short}`,
      type: "minor",
      changelog: [conventional(commit)],
    },
  });
});

Deno.test("packageInfo() calculates major version update", async () => {
  await using repo = await tempRepository();
  const directory = repo.path();
  await createPackage(repo.path(), { name: "@scope/module", version: "1.2.3" });
  await repo.commits.create("initial", { allowEmpty: true });
  const tag = await repo.tags.create("module@1.2.3");
  const commit = await repo.commits.create("feat(module)!: major", {
    allowEmpty: true,
  });
  assertEquals(await packageInfo({ directory }), {
    directory,
    module: "module",
    version: `2.0.0-pre.1+${commit.short}`,
    config: { name: "@scope/module", version: "1.2.3" },
    release: { version: "1.2.3", tag },
    update: {
      version: `2.0.0-pre.1+${commit.short}`,
      type: "major",
      changelog: [conventional(commit)],
    },
  });
});

Deno.test("packageInfo() handles multiple commits in changelog", async () => {
  await using repo = await tempRepository();
  const directory = repo.path();
  await createPackage(repo.path(), { name: "@scope/module", version: "1.2.3" });
  await repo.commits.create("initial", { allowEmpty: true });
  const tag = await repo.tags.create("module@1.2.3");
  const commit1 = await repo.commits.create("fix(module): 1", {
    allowEmpty: true,
  });
  const commit2 = await repo.commits.create("feat(module): 2", {
    allowEmpty: true,
  });
  const commit3 = await repo.commits.create("fix(module): 3", {
    allowEmpty: true,
  });
  assertEquals(await packageInfo({ directory }), {
    directory,
    module: "module",
    version: `1.3.0-pre.3+${commit3.short}`,
    config: { name: "@scope/module", version: "1.2.3" },
    release: { version: "1.2.3", tag },
    update: {
      version: `1.3.0-pre.3+${commit3.short}`,
      type: "minor",
      changelog: [
        conventional(commit3),
        conventional(commit2),
        conventional(commit1),
      ],
    },
  });
});

Deno.test("packageInfo() handles forced patch update", async () => {
  await using repo = await tempRepository();
  const directory = repo.path();
  await createPackage(repo.path(), { name: "@scope/module", version: "1.2.4" });
  await repo.commits.create("initial", { allowEmpty: true });
  const tag = await repo.tags.create("module@1.2.3");
  assertEquals(await packageInfo({ directory }), {
    directory,
    module: "module",
    version: "1.2.4",
    config: { name: "@scope/module", version: "1.2.4" },
    release: { version: "1.2.3", tag },
    update: { version: "1.2.4", type: "patch", changelog: [] },
  });
});

Deno.test("packageInfo() handles forced minor update", async () => {
  await using repo = await tempRepository();
  const directory = repo.path();
  await createPackage(repo.path(), { name: "@scope/module", version: "1.3.0" });
  await repo.commits.create("initial", { allowEmpty: true });
  const tag = await repo.tags.create("module@1.2.3");
  assertEquals(await packageInfo({ directory }), {
    directory,
    module: "module",
    version: "1.3.0",
    config: { name: "@scope/module", version: "1.3.0" },
    release: { version: "1.2.3", tag },
    update: { version: "1.3.0", type: "minor", changelog: [] },
  });
});

Deno.test("packageInfo() handles forced major update", async () => {
  await using repo = await tempRepository();
  const directory = repo.path();
  await createPackage(repo.path(), { name: "@scope/module", version: "2.0.0" });
  await repo.commits.create("initial", { allowEmpty: true });
  const tag = await repo.tags.create("module@1.2.3");
  assertEquals(await packageInfo({ directory }), {
    directory,
    module: "module",
    version: "2.0.0",
    config: { name: "@scope/module", version: "2.0.0" },
    release: { version: "1.2.3", tag },
    update: { version: "2.0.0", type: "major", changelog: [] },
  });
});

Deno.test("packageInfo() overrides calculated update", async () => {
  await using repo = await tempRepository();
  const directory = repo.path();
  await createPackage(repo.path(), { name: "@scope/module", version: "2.2.2" });
  await repo.commits.create("initial", { allowEmpty: true });
  const tag = await repo.tags.create("module@1.2.3");
  const commit = await repo.commits.create("fix(module): description", {
    allowEmpty: true,
  });
  assertEquals(await packageInfo({ directory }), {
    directory,
    module: "module",
    version: "2.2.2",
    config: { name: "@scope/module", version: "2.2.2" },
    release: { version: "1.2.3", tag },
    update: {
      version: "2.2.2",
      type: "major",
      changelog: [conventional(commit)],
    },
  });
});

Deno.test("packageInfo() rejects forced downgrade", async () => {
  await using repo = await tempRepository();
  const directory = repo.path();
  await createPackage(repo.path(), { name: "@scope/module", version: "1.2.0" });
  await repo.commits.create("initial", { allowEmpty: true });
  await repo.tags.create("module@1.2.4");
  await assertRejects(() => packageInfo({ directory }), PackageError);
});

Deno.test("packageInfo() returns empty release tag at initial version", async () => {
  await using repo = await tempRepository();
  const directory = repo.path();
  await createPackage(repo.path(), { name: "@scope/module", version: "0.0.0" });
  await repo.commits.create("initial", { allowEmpty: true });
  assertEquals(await packageInfo({ directory }), {
    directory,
    module: "module",
    version: "0.0.0",
    config: { name: "@scope/module", version: "0.0.0" },
    release: { version: "0.0.0" },
  });
});

Deno.test("packageInfo() returns update at initial version", async () => {
  await using repo = await tempRepository();
  const directory = repo.path();
  await createPackage(repo.path(), { name: "@scope/module", version: "0.1.0" });
  await repo.commits.create("feat(module): introduce module", {
    allowEmpty: true,
  });
  assertEquals(await packageInfo({ directory }), {
    directory,
    module: "module",
    version: "0.1.0",
    config: { name: "@scope/module", version: "0.1.0" },
    release: { version: "0.0.0" },
    update: { version: "0.1.0", type: "minor", changelog: [] },
  });
});

Deno.test("workspace() returns simple package", async () => {
  await using repo = await tempDirectory();
  const directory = repo.path();
  const pkg = await createPackage(repo.path(), { name: "pkg" });
  assertEquals(await workspace({ directory }), [pkg]);
});

Deno.test("workspace() returns monorepo packages", async () => {
  await using repo = await tempDirectory();
  const directory = repo.path();
  await createPackage(repo.path(), { workspace: ["./pkg1", "./pkg2"] });
  const pkg1 = await createPackage(repo.path("pkg1"), { name: "pkg1" });
  const pkg2 = await createPackage(repo.path("pkg2"), { name: "pkg2" });
  assertEquals(await workspace({ directory }), [pkg1, pkg2]);
});

Deno.test("workspace() does not return nested workspace packages", async () => {
  await using repo = await tempDirectory();
  const directory = repo.path();
  await createPackage(repo.path(), { workspace: ["./pkg1"] });
  const pkg1 = await createPackage(repo.path("pkg1"), {
    name: "pkg1",
    workspace: ["./pkg2"],
  });
  await createPackage(repo.path("pkg1", "pkg2"), { name: "pkg2" });
  assertEquals(await workspace({ directory }), [pkg1]);
});

Deno.test("workspace() filters packages", async () => {
  await using repo = await tempDirectory();
  const directory = repo.path();
  await createPackage(repo.path(), {
    workspace: ["./dir1/pkg1", "./dir2/pkg2", "./dir2/pkg3"],
  });
  const p1 = await createPackage(repo.path("dir1/pkg1"), { name: "pkg1" });
  const p2 = await createPackage(repo.path("dir2/pkg2"), { name: "pkg2" });
  const p3 = await createPackage(repo.path("dir2/pkg3"), { name: "pkg3" });
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
