import { type Config, getPackage, getWorkspace } from "@roka/build/package";
import { type Git, git } from "@roka/git";
import { conventional } from "@roka/git/conventional";
import { tempDir } from "@roka/testing";
import { assertEquals, assertRejects } from "@std/assert";
import { join } from "@std/path/join";

async function tempRepo(
  { bare, clone, remote }: { bare?: boolean; clone?: Git; remote?: string } =
    {},
): Promise<Git & AsyncDisposable> {
  const cwd = await Deno.makeTempDir();
  const config = {
    user: { name: "A U Thor", email: "author@example.com" },
    commit: { gpgsign: false },
    tag: { gpgsign: false },
  };
  bare ??= false;
  const repo = git({ cwd });
  if (clone) {
    await git({ cwd }).clone(clone.directory, {
      bare,
      config,
      ...remote && { remote },
    });
  } else {
    await repo.init({ bare });
    await repo.config(config);
  }
  Object.assign(repo, {
    [Symbol.asyncDispose]: () =>
      Deno.remove(repo.directory, { recursive: true }),
  });
  return repo as Git & AsyncDisposable;
}

async function createPackage(
  directory: string,
  options?: Partial<Config>,
): Promise<void> {
  await Deno.mkdir(directory, { recursive: true });
  await Deno.writeTextFile(
    join(directory, "deno.json"),
    JSON.stringify({ ...options }),
  );
}

Deno.test("getPackage() fails on non-Deno package", async () => {
  await using repo = await tempRepo();
  await assertRejects(() => getPackage({ directory: repo.directory }));
});

Deno.test("getPackage() returns current package", async () => {
  const pkg = await getPackage();
  assertEquals(pkg.config.name, "@roka/build");
});

Deno.test("getPackage() returns given package", async () => {
  await using directory = await tempDir();
  await createPackage(directory.path, {
    name: "@scope/module",
    version: "1.2.3",
  });
  assertEquals(await getPackage({ directory: directory.path }), {
    directory: directory.path,
    module: "module",
    version: "1.2.3",
    config: { name: "@scope/module", version: "1.2.3" },
  });
});

Deno.test("getPackage() returns release version at release commit", async () => {
  await using repo = await tempRepo();
  await createPackage(repo.path(), { name: "@scope/module", version: "1.2.4" });
  await repo.commit("initial", { allowEmpty: true });
  await repo.tag("module@1.2.4");
  const pkg = await getPackage({ directory: repo.directory });
  assertEquals(pkg.version, "1.2.4");
  assertEquals(pkg.release?.version, "1.2.4");
  assertEquals(pkg.release?.tag?.name, "module@1.2.4");
  assertEquals(pkg.update, undefined);
});

Deno.test("getPackage() calculates patch version update", async () => {
  await using repo = await tempRepo();
  await createPackage(repo.path(), { name: "@scope/module", version: "1.2.3" });
  await repo.commit("initial", { allowEmpty: true });
  await repo.tag("module@1.2.3");
  const commit = await repo.commit("fix(module): patch", { allowEmpty: true });
  const pkg = await getPackage({ directory: repo.directory });
  assertEquals(pkg.version, `1.2.4-pre.1+${commit.short}`);
  assertEquals(pkg.release?.version, "1.2.3");
  assertEquals(pkg.update?.type, "patch");
  assertEquals(pkg.update?.version, `1.2.4-pre.1+${commit.short}`);
  assertEquals(pkg.update?.changelog, [conventional(commit)]);
});

Deno.test("getPackage() calculates minor version update", async () => {
  await using repo = await tempRepo();
  await createPackage(repo.path(), { name: "@scope/module", version: "1.2.3" });
  await repo.commit("initial", { allowEmpty: true });
  await repo.tag("module@1.2.3");
  const commit = await repo.commit("feat(module): minor", { allowEmpty: true });
  const pkg = await getPackage({ directory: repo.directory });
  assertEquals(pkg.version, `1.3.0-pre.1+${commit.short}`);
  assertEquals(pkg.release?.version, "1.2.3");
  assertEquals(pkg.update?.type, "minor");
  assertEquals(pkg.update?.version, `1.3.0-pre.1+${commit.short}`);
  assertEquals(pkg.update?.changelog, [conventional(commit)]);
});

Deno.test("getPackage() calculates major version update", async () => {
  await using repo = await tempRepo();
  await createPackage(repo.path(), { name: "@scope/module", version: "1.2.3" });
  await repo.commit("initial", { allowEmpty: true });
  await repo.tag("module@1.2.3");
  const commit = await repo.commit("feat(module)!: major", {
    allowEmpty: true,
  });
  const pkg = await getPackage({ directory: repo.directory });
  assertEquals(pkg.version, `2.0.0-pre.1+${commit.short}`);
  assertEquals(pkg.release?.version, "1.2.3");
  assertEquals(pkg.update?.type, "major");
  assertEquals(pkg.update?.version, `2.0.0-pre.1+${commit.short}`);
  assertEquals(pkg.update?.changelog, [conventional(commit)]);
});

Deno.test("getPackage() handles multiple commits in changelog", async () => {
  await using repo = await tempRepo();
  await createPackage(repo.path(), { name: "@scope/module", version: "1.2.3" });
  await repo.commit("initial", { allowEmpty: true });
  await repo.tag("module@1.2.3");
  const commit1 = await repo.commit("fix(module): 1", { allowEmpty: true });
  const commit2 = await repo.commit("feat(module): 2", { allowEmpty: true });
  const commit3 = await repo.commit("fix(module): 3", { allowEmpty: true });
  const pkg = await getPackage({ directory: repo.directory });
  assertEquals(pkg.version, `1.3.0-pre.3+${commit3.short}`);
  assertEquals(pkg.release?.version, "1.2.3");
  assertEquals(pkg.update?.type, "minor");
  assertEquals(pkg.update?.version, `1.3.0-pre.3+${commit3.short}`);
  assertEquals(pkg.update?.changelog, [
    conventional(commit3),
    conventional(commit2),
    conventional(commit1),
  ]);
});

Deno.test("getPackage() handles forced patch update", async () => {
  await using repo = await tempRepo();
  await createPackage(repo.path(), { name: "@scope/module", version: "1.2.4" });
  await repo.commit("initial", { allowEmpty: true });
  await repo.tag("module@1.2.3");
  const pkg = await getPackage({ directory: repo.directory });
  assertEquals(pkg.version, "1.2.4");
  assertEquals(pkg.release?.version, "1.2.3");
  assertEquals(pkg.update?.type, "patch");
  assertEquals(pkg.update?.version, "1.2.4");
  assertEquals(pkg.update?.changelog, []);
});

Deno.test("getPackage() handles forced minor update", async () => {
  await using repo = await tempRepo();
  await createPackage(repo.path(), { name: "@scope/module", version: "1.3.0" });
  await repo.commit("initial", { allowEmpty: true });
  await repo.tag("module@1.2.3");
  const pkg = await getPackage({ directory: repo.directory });
  assertEquals(pkg.version, "1.3.0");
  assertEquals(pkg.release?.version, "1.2.3");
  assertEquals(pkg.update?.type, "minor");
  assertEquals(pkg.update?.version, "1.3.0");
  assertEquals(pkg.update?.changelog, []);
});

Deno.test("getPackage() handles forced major update", async () => {
  await using repo = await tempRepo();
  await createPackage(repo.path(), { name: "@scope/module", version: "2.0.0" });
  await repo.commit("initial", { allowEmpty: true });
  await repo.tag("module@1.2.3");
  const pkg = await getPackage({ directory: repo.directory });
  assertEquals(pkg.version, "2.0.0");
  assertEquals(pkg.release?.version, "1.2.3");
  assertEquals(pkg.update?.type, "major");
  assertEquals(pkg.update?.version, "2.0.0");
  assertEquals(pkg.update?.changelog, []);
});

Deno.test("getPackage() overrides calculated update", async () => {
  await using repo = await tempRepo();
  await createPackage(repo.path(), { name: "@scope/module", version: "2.2.2" });
  await repo.commit("initial", { allowEmpty: true });
  await repo.tag("module@1.2.3");
  const commit = await repo.commit("fix(module): description", {
    allowEmpty: true,
  });
  const pkg = await getPackage({ directory: repo.directory });
  assertEquals(pkg.version, "2.2.2");
  assertEquals(pkg.release?.version, "1.2.3");
  assertEquals(pkg.update?.type, "major");
  assertEquals(pkg.update?.version, "2.2.2");
  assertEquals(pkg.update?.changelog, [conventional(commit)]);
});

Deno.test("getPackage() returns rejects forced downgrade", async () => {
  await using repo = await tempRepo();
  await createPackage(repo.path(), { name: "@scope/module", version: "1.2.0" });
  await repo.commit("initial", { allowEmpty: true });
  await repo.tag("module@1.2.4");
  await assertRejects(() => getPackage({ directory: repo.directory }));
});

Deno.test("getWorkspace() returns non-workspace package", async () => {
  await using directory = await tempDir();
  await createPackage(directory.path, { name: "name", version: "version" });
  const packages = await getWorkspace({ directories: [directory.path] });
  assertEquals(packages, [{
    directory: directory.path,
    module: "name",
    version: "version",
    config: { name: "name", version: "version" },
  }]);
});

Deno.test("getWorkspace() returns workspace packages", async () => {
  await using directory = await tempDir();
  await createPackage(directory.path, {
    name: "root",
    workspace: ["./first", "./second"],
  });
  await createPackage(join(directory.path, "first"), {
    name: "first",
    version: "first_version",
  });
  await createPackage(join(directory.path, "second"), {
    name: "second",
    version: "second_version",
  });
  const packages = await getWorkspace({ directories: [directory.path] });
  assertEquals(packages, [{
    directory: directory.path,
    module: "root",
    config: { name: "root", workspace: ["./first", "./second"] },
  }, {
    directory: join(directory.path, "first"),
    module: "first",
    version: "first_version",
    config: { name: "first", version: "first_version" },
  }, {
    directory: join(directory.path, "second"),
    module: "second",
    version: "second_version",
    config: { name: "second", version: "second_version" },
  }]);
});

Deno.test("getWorkspace() returns nested workspace packages", async () => {
  await using directory = await tempDir();
  await createPackage(directory.path, { name: "root", workspace: ["./first"] });
  await createPackage(join(directory.path, "first"), {
    name: "first",
    version: "first_version",
    workspace: ["./second"],
  });
  await createPackage(join(directory.path, "first", "second"), {
    name: "second",
    version: "second_version",
  });
  const packages = await getWorkspace({ directories: [directory.path] });
  assertEquals(packages, [{
    directory: directory.path,
    module: "root",
    config: { name: "root", workspace: ["./first"] },
  }, {
    directory: join(directory.path, "first"),
    module: "first",
    version: "first_version",
    config: {
      name: "first",
      version: "first_version",
      workspace: ["./second"],
    },
  }, {
    directory: join(directory.path, "first", "second"),
    module: "second",
    version: "second_version",
    config: { name: "second", version: "second_version" },
  }]);
});
