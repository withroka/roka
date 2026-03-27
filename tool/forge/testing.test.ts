import { releases } from "@roka/forge/workspace";
import { git } from "@roka/git";
import { conventional } from "@roka/git/conventional";
import { assertEquals, assertExists, assertRejects } from "@std/assert";
import { omit } from "@std/collections";
import { join } from "@std/path";
import { tempPackage, tempWorkspace } from "./testing.ts";

Deno.test("tempPackage() creates a disposable package", async () => {
  let directory: string;
  {
    await using pkg = await tempPackage({
      config: { name: "@scope/name", version: "1.2.3" },
    });
    directory = pkg.directory;
    assertEquals(omit(pkg, [Symbol.asyncDispose]), {
      name: "name",
      version: "1.2.3",
      directory,
      root: directory,
      config: { name: "@scope/name", version: "1.2.3" },
      changes: [],
    });
    await Deno.stat(directory);
  }
  await assertRejects(() => Deno.stat(directory));
});

Deno.test("tempPackage() creates package in a repository", async () => {
  await using pkg = await tempPackage({
    config: { name: "@scope/name", version: "1.2.3" },
    commit: [
      {
        subject: "chore: bump",
        config: [{ name: "@scope/name", version: "1.2.3" }],
      },
      { subject: "feat: feature", tag: ["name@1.2.4"] },
      { subject: "fix: bug" },
    ],
  });
  const repo = git({ directory: pkg.root });
  const [commit3, _, commit1] = await repo.commit.log();
  assertExists(commit1);
  assertExists(commit3);
  assertEquals(await releases(pkg), [{
    tag: "name@1.2.4",
    version: "1.2.4",
    range: { from: commit1.hash, to: "name@1.2.4" },
  }, {
    version: "1.2.3",
    range: { to: commit1.hash },
  }]);
  assertEquals(omit(pkg, [Symbol.asyncDispose]), {
    name: "name",
    version: `1.2.5-pre.1+${commit3.short}`,
    directory: repo.path(),
    root: repo.path(),
    config: { name: "@scope/name", version: "1.2.3" },
    latest: {
      version: "1.2.4",
      tag: "name@1.2.4",
      range: { from: commit1.hash, to: "name@1.2.4" },
    },
    changes: [conventional(commit3)],
  });
});

Deno.test("tempPackage() creates a package with no config", async () => {
  await using pkg = await tempPackage();
  assertEquals(pkg.version, "0.0.0");
  assertEquals(pkg.config, {});
});

Deno.test("tempPackage() creates a package with release tag", async () => {
  await using pkg = await tempPackage({
    config: { name: "@scope/name" },
    commit: [{ subject: "release", tag: ["name@1.2.3"] }],
  });
  assertEquals(pkg.version, "1.2.3");
});

Deno.test("tempWorkspace() creates a disposable workspace", async () => {
  let root: string;
  {
    await using packages = await tempWorkspace({
      config: [{ name: "@scope/name", version: "1.2.3" }],
    });
    const [pkg] = packages;
    assertExists(pkg);
    root = pkg.root;
    assertEquals([...packages], [{
      name: "name",
      version: "1.2.3",
      directory: join(root, "name"),
      root,
      config: { name: "@scope/name", version: "1.2.3" },
      changes: [],
    }]);
    await Deno.stat(root);
  }
  await assertRejects(() => Deno.stat(root));
});

Deno.test("tempWorkspace() creates workspace in a repository", async () => {
  await using packages = await tempWorkspace({
    config: [
      { name: "@scope/name1" },
      { name: "@scope/name2" },
      { name: "@scope/name3" },
    ],
    commit: [
      { subject: "fix(name1): bug" },
      { subject: "feat(name2): feature" },
      { subject: "feat(name3)!: breaking" },
    ],
  });
  const [pkg1, pkg2, pkg3] = packages;
  assertExists(pkg1);
  assertExists(pkg2);
  assertExists(pkg3);
  const root = pkg1.root;
  const repo = git({ directory: pkg1.root });
  const [commit3, commit2, commit1] = await repo.commit.log();
  assertExists(commit1);
  assertExists(commit2);
  assertExists(commit3);
  assertEquals([...packages], [{
    name: "name1",
    version: `0.0.1-pre.1+${commit3.short}`,
    directory: join(root, "name1"),
    root,
    config: { name: "@scope/name1" },
    changes: [conventional(commit1)],
  }, {
    name: "name2",
    version: `0.1.0-pre.1+${commit3.short}`,
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

Deno.test("tempWorkspace() can create a workspace with a nameless package", async () => {
  await using packages = await tempWorkspace({ config: [{}] });
  const [pkg] = packages;
  assertExists(pkg);
  assertEquals(pkg.version, "0.0.0");
  assertEquals(pkg.config, {});
});

Deno.test("tempWorkspace() can create a workspace with no packages", async () => {
  await using packages = await tempWorkspace({});
  assertEquals([...packages], []);
});

Deno.test("tempWorkspace() can change working directory", async () => {
  const cwd = Deno.cwd();
  {
    await using repo = await tempWorkspace({
      config: [{ name: "@scope/name", version: "1.2.3" }],
      repo: { chdir: true },
    });
    const root = repo[0]?.root;
    assertExists(root);
    assertEquals(
      await Deno.realPath(Deno.cwd()),
      await Deno.realPath(root),
    );
  }
  assertEquals(Deno.cwd(), cwd);
});
