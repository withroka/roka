import { tempPackage, tempWorkspace } from "@roka/forge/testing";
import { git } from "@roka/git";
import { conventional } from "@roka/git/conventional";
import { assertEquals, assertExists, assertRejects } from "@std/assert";
import { omit } from "@std/collections";
import { join } from "@std/path";

Deno.test("tempPackage() creates a disposable package", async () => {
  let directory: string;
  {
    await using pkg = await tempPackage({
      config: { name: "@scope/name", version: "1.2.3" },
    });
    directory = pkg.directory;
    assertEquals(omit(pkg, [Symbol.asyncDispose]), {
      name: "name",
      version: `1.2.3`,
      directory,
      root: directory,
      config: { name: "@scope/name", version: "1.2.3" },
    });
    await Deno.stat(directory);
  }
  await assertRejects(() => Deno.stat(directory));
});

Deno.test("tempPackage() creates package in a repository", async () => {
  await using pkg = await tempPackage({
    config: { name: "@scope/name" },
    commits: [
      { summary: "feat: feature", tags: ["name@1.2.3"] },
      { summary: "fix: bug" },
    ],
  });
  const repo = git({ cwd: pkg.root });
  const commit = await git({ cwd: pkg.root }).commits.head();
  assertExists(commit);
  assertEquals(omit(pkg, [Symbol.asyncDispose]), {
    name: "name",
    version: `1.2.4-pre.1+${commit.short}`,
    directory: repo.path(),
    root: repo.path(),
    config: { name: "@scope/name" },
    latest: { version: "1.2.3", range: { to: "name@1.2.3" } },
    changes: [conventional(commit)],
  });
});

Deno.test("tempPackage() creates a package with no config", async () => {
  await using pkg = await tempPackage();
  assertEquals(pkg.version, "0.0.0");
  assertEquals(pkg.config, {});
});

Deno.test("tempWorkspace() creates a disposable workspace", async () => {
  let root: string;
  {
    await using packages = await tempWorkspace({
      configs: [{ name: "@scope/name", version: "1.2.3" }],
    });
    const [pkg] = packages;
    assertExists(pkg);
    root = pkg.root;
    assertEquals([...packages], [{
      name: "name",
      version: `1.2.3`,
      directory: join(root, "name"),
      root,
      config: { name: "@scope/name", version: "1.2.3" },
    }]);
    await Deno.stat(root);
  }
  await assertRejects(() => Deno.stat(root));
});

Deno.test("tempWorkspace() creates workspace in a repository", async () => {
  await using packages = await tempWorkspace({
    configs: [
      { name: "@scope/name1" },
      { name: "@scope/name2" },
      { name: "@scope/name3" },
    ],
    commits: [
      { summary: "fix(name1): bug" },
      { summary: "feat(name2): feature" },
      { summary: "feat(name3)!: breaking" },
    ],
  });
  const [pkg1, pkg2, pkg3] = packages;
  assertExists(pkg1);
  assertExists(pkg2);
  assertExists(pkg3);
  const root = pkg1.root;
  const repo = git({ cwd: pkg1.root });
  const [commit3, commit2, commit1] = await repo.commits.log();
  assertExists(commit1);
  assertExists(commit2);
  assertExists(commit3);
  assertEquals([...packages], [{
    name: "name1",
    version: `0.0.1-pre.1+${commit1.short}`,
    directory: join(root, "name1"),
    root,
    config: { name: "@scope/name1" },
    changes: [conventional(commit1)],
  }, {
    name: "name2",
    version: `0.1.0-pre.1+${commit2.short}`,
    directory: join(root, "name2"),
    root,
    config: { name: "@scope/name2" },
    changes: [conventional(commit2)],
  }, {
    name: "name3",
    version: `0.1.0-pre.1+${commit3.short}`,
    directory: join(root, "name3"),
    root,
    config: { name: "@scope/name3" },
    changes: [conventional(commit3)],
  }]);
});

Deno.test("tempWorkspace() creates workspace a nameless package", async () => {
  await using packages = await tempWorkspace({ configs: [{}] });
  const [pkg] = packages;
  assertExists(pkg);
  assertEquals(pkg.version, "0.0.0");
  assertEquals(pkg.config, {});
});

Deno.test("tempWorkspace() creates workspace with no packages", async () => {
  await using packages = await tempWorkspace({});
  assertEquals([...packages], []);
});
