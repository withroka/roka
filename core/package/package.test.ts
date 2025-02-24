import { conventional } from "@roka/git/conventional";
import { tempRepository } from "@roka/git/testing";
import {
  type Config,
  getPackage,
  getWorkspace,
  type Package,
} from "@roka/package";
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
  return await getPackage({ directory });
}

Deno.test("getPackage() fails on non-Deno package", async () => {
  await using repo = await tempRepository();
  await assertRejects(() => getPackage({ directory: repo.path() }));
});

Deno.test("getPackage() returns current package", async () => {
  const pkg = await getPackage();
  assertEquals(pkg.config.name, "@roka/package");
});

Deno.test("getPackage() returns given package", async () => {
  await using directory = await tempDirectory();
  await createPackage(directory.path(), {
    name: "@scope/module",
    version: "1.2.3",
  });
  assertEquals(await getPackage({ directory: directory.path() }), {
    directory: directory.path(),
    module: "module",
    version: "1.2.3",
    config: { name: "@scope/module", version: "1.2.3" },
  });
});

Deno.test("getPackage() returns release version at release commit", async () => {
  await using repo = await tempRepository();
  await createPackage(repo.path(), { name: "@scope/module", version: "1.2.4" });
  await repo.commits.create("initial", { allowEmpty: true });
  const tag = await repo.tags.create("module@1.2.4");
  const pkg = await getPackage({ directory: repo.path() });
  assertEquals(pkg, {
    directory: repo.path(),
    module: "module",
    version: "1.2.4",
    config: { name: "@scope/module", version: "1.2.4" },
    release: { version: "1.2.4", tag },
  });
});

Deno.test("getPackage() calculates patch version update", async () => {
  await using repo = await tempRepository();
  await createPackage(repo.path(), { name: "@scope/module", version: "1.2.3" });
  await repo.commits.create("initial", { allowEmpty: true });
  const tag = await repo.tags.create("module@1.2.3");
  const commit = await repo.commits.create("fix(module): patch", {
    allowEmpty: true,
  });
  const pkg = await getPackage({ directory: repo.path() });
  assertEquals(pkg, {
    directory: repo.path(),
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

Deno.test("getPackage() calculates minor version update", async () => {
  await using repo = await tempRepository();
  await createPackage(repo.path(), { name: "@scope/module", version: "1.2.3" });
  await repo.commits.create("initial", { allowEmpty: true });
  const tag = await repo.tags.create("module@1.2.3");
  const commit = await repo.commits.create("feat(module): minor", {
    allowEmpty: true,
  });
  const pkg = await getPackage({ directory: repo.path() });
  assertEquals(pkg, {
    directory: repo.path(),
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

Deno.test("getPackage() calculates major version update", async () => {
  await using repo = await tempRepository();
  await createPackage(repo.path(), { name: "@scope/module", version: "1.2.3" });
  await repo.commits.create("initial", { allowEmpty: true });
  const tag = await repo.tags.create("module@1.2.3");
  const commit = await repo.commits.create("feat(module)!: major", {
    allowEmpty: true,
  });
  const pkg = await getPackage({ directory: repo.path() });
  assertEquals(pkg, {
    directory: repo.path(),
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

Deno.test("getPackage() handles multiple commits in changelog", async () => {
  await using repo = await tempRepository();
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
  const pkg = await getPackage({ directory: repo.path() });
  assertEquals(pkg, {
    directory: repo.path(),
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

Deno.test("getPackage() handles forced patch update", async () => {
  await using repo = await tempRepository();
  await createPackage(repo.path(), { name: "@scope/module", version: "1.2.4" });
  await repo.commits.create("initial", { allowEmpty: true });
  const tag = await repo.tags.create("module@1.2.3");
  const pkg = await getPackage({ directory: repo.path() });
  assertEquals(pkg, {
    directory: repo.path(),
    module: "module",
    version: "1.2.4",
    config: { name: "@scope/module", version: "1.2.4" },
    release: { version: "1.2.3", tag },
    update: { version: "1.2.4", type: "patch", changelog: [] },
  });
});

Deno.test("getPackage() handles forced minor update", async () => {
  await using repo = await tempRepository();
  await createPackage(repo.path(), { name: "@scope/module", version: "1.3.0" });
  await repo.commits.create("initial", { allowEmpty: true });
  const tag = await repo.tags.create("module@1.2.3");
  const pkg = await getPackage({ directory: repo.path() });
  assertEquals(pkg, {
    directory: repo.path(),
    module: "module",
    version: "1.3.0",
    config: { name: "@scope/module", version: "1.3.0" },
    release: { version: "1.2.3", tag },
    update: { version: "1.3.0", type: "minor", changelog: [] },
  });
});

Deno.test("getPackage() handles forced major update", async () => {
  await using repo = await tempRepository();
  await createPackage(repo.path(), { name: "@scope/module", version: "2.0.0" });
  await repo.commits.create("initial", { allowEmpty: true });
  const tag = await repo.tags.create("module@1.2.3");
  const pkg = await getPackage({ directory: repo.path() });
  assertEquals(pkg, {
    directory: repo.path(),
    module: "module",
    version: "2.0.0",
    config: { name: "@scope/module", version: "2.0.0" },
    release: { version: "1.2.3", tag },
    update: { version: "2.0.0", type: "major", changelog: [] },
  });
});

Deno.test("getPackage() overrides calculated update", async () => {
  await using repo = await tempRepository();
  await createPackage(repo.path(), { name: "@scope/module", version: "2.2.2" });
  await repo.commits.create("initial", { allowEmpty: true });
  const tag = await repo.tags.create("module@1.2.3");
  const commit = await repo.commits.create("fix(module): description", {
    allowEmpty: true,
  });
  const pkg = await getPackage({ directory: repo.path() });
  assertEquals(pkg, {
    directory: repo.path(),
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

Deno.test("getPackage() returns rejects forced downgrade", async () => {
  await using repo = await tempRepository();
  await createPackage(repo.path(), { name: "@scope/module", version: "1.2.0" });
  await repo.commits.create("initial", { allowEmpty: true });
  await repo.tags.create("module@1.2.4");
  await assertRejects(() => getPackage({ directory: repo.path() }));
});

Deno.test("getPackage() returns empty release tag at initial version", async () => {
  await using repo = await tempRepository();
  await createPackage(repo.path(), { name: "@scope/module", version: "0.0.0" });
  await repo.commits.create("initial", { allowEmpty: true });
  const pkg = await getPackage({ directory: repo.path() });
  assertEquals(pkg, {
    directory: repo.path(),
    module: "module",
    version: "0.0.0",
    config: { name: "@scope/module", version: "0.0.0" },
    release: { version: "0.0.0" },
  });
});

Deno.test("getPackage() returns update at initial version", async () => {
  await using repo = await tempRepository();
  await createPackage(repo.path(), { name: "@scope/module", version: "0.1.0" });
  await repo.commits.create("feat(module): introduce module", {
    allowEmpty: true,
  });
  const pkg = await getPackage({ directory: repo.path() });
  assertEquals(pkg, {
    directory: repo.path(),
    module: "module",
    version: "0.1.0",
    config: { name: "@scope/module", version: "0.1.0" },
    release: { version: "0.0.0" },
    update: { version: "0.1.0", type: "minor", changelog: [] },
  });
});

Deno.test("getWorkspace() returns non-workspace package", async () => {
  await using directory = await tempDirectory();
  await createPackage(directory.path(), { name: "name", version: "version" });
  const packages = await getWorkspace({ directories: [directory.path()] });
  assertEquals(packages, [{
    directory: directory.path(),
    module: "name",
    version: "version",
    config: { name: "name", version: "version" },
  }]);
});

Deno.test("getWorkspace() returns workspace packages", async () => {
  await using directory = await tempDirectory();
  const root = await createPackage(directory.path(), {
    name: "root",
    workspace: ["./first", "./second"],
  });
  const pkg1 = await createPackage(directory.path("first"), {
    name: "first",
    version: "first_version",
  });
  const pkg2 = await createPackage(directory.path("second"), {
    name: "second",
    version: "second_version",
  });
  const packages = await getWorkspace({ directories: [directory.path()] });
  assertEquals(packages, [root, pkg1, pkg2]);
});

Deno.test("getWorkspace() returns nested workspace packages", async () => {
  await using directory = await tempDirectory();
  const root = await createPackage(directory.path(), {
    name: "root",
    workspace: ["./first"],
  });
  const pkg1 = await createPackage(directory.path("first"), {
    name: "first",
    version: "first_version",
    workspace: ["./second"],
  });
  const pkg2 = await createPackage(directory.path("first", "second"), {
    name: "second",
    version: "second_version",
  });
  const packages = await getWorkspace({ directories: [directory.path()] });
  assertEquals(packages, [root, pkg1, pkg2]);
});
