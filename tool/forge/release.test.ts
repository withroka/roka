import { assertArrayObjectMatch } from "@roka/assert";
import { git } from "@roka/git";
import { fakeRelease, fakeRepository } from "@roka/github/testing";
import {
  assert,
  assertEquals,
  assertFalse,
  assertObjectMatch,
  assertRejects,
} from "@std/assert";
import { assertExists } from "@std/assert/exists";
import { dirname, join } from "@std/path";
import { canRelease, release } from "./release.ts";
import { tempPackage, unstableTestImports } from "./testing.ts";
import { PackageError } from "./workspace.ts";

Deno.test("release() rejects package without version", async () => {
  await using pkg = await tempPackage({
    config: { name: "@scope/name" },
    commit: [{ subject: "feat: new feature" }],
  });
  const repo = fakeRepository({ git: git({ directory: pkg.root }) });
  await assertRejects(() => release(pkg, { repo }), PackageError);
});

Deno.test("release() rejects version downgrade", async () => {
  await using pkg = await tempPackage({
    config: { name: "@scope/name", version: "0.1.0" },
    commit: [{ subject: "feat: new feature", tag: ["name@0.1.1"] }],
  });
  const repo = fakeRepository({ git: git({ directory: pkg.root }) });
  await assertRejects(() => release(pkg, { repo }), PackageError);
});

Deno.test("release() rejects version downgrade during migration", async () => {
  await using pkg = await tempPackage({
    config: { name: "@scope/name", version: "0.1.0" },
    commit: [{
      subject: "feat: new feature",
      config: [{ name: "@scope/name", version: "0.1.0" }],
    }, {
      subject: "feat: new feature",
      config: [{ name: "@scope/name", version: "0.1.1" }],
    }],
  });
  const repo = fakeRepository({ git: git({ directory: pkg.root }) });
  await assertRejects(() => release(pkg, { repo }), PackageError);
});

Deno.test("release() rejects no change", async () => {
  await using pkg = await tempPackage({
    config: { name: "@scope/name", version: "0.1.0" },
    commit: [{ subject: "feat: new feature", tag: ["name@0.1.0"] }],
  });
  const repo = fakeRepository({ git: git({ directory: pkg.root }) });
  await assertRejects(() => release(pkg, { repo }), PackageError);
});

Deno.test("release() accepts no change during migration", async () => {
  await using pkg = await tempPackage({
    config: { name: "@scope/name", version: "0.1.0" },
    commit: [{
      subject: "feat: new feature",
      config: [{ name: "@scope/name", version: "0.1.0" }],
    }],
  });
  const repo = fakeRepository({ git: git({ directory: pkg.root }) });
  const rls = await release(pkg, { repo });
  assertExists(rls);
  assertEquals(rls.release.tag, "name@0.1.0");
});

Deno.test("release() accepts first release", async () => {
  await using pkg = await tempPackage({
    config: { name: "@scope/name", version: "0.1.0" },
    commit: [{
      subject: "feat: new feature",
      config: [{ name: "@scope/name", version: "0.0.0" }],
    }],
  });
  const repo = fakeRepository({ git: git({ directory: pkg.root }) });
  const rls = await release(pkg, { repo });
  assertExists(rls);
  assertEquals(rls.release.tag, "name@0.1.0");
});

Deno.test("release() rejects 0.0.0", async () => {
  await using pkg = await tempPackage({
    config: { name: "@scope/name", version: "0.0.0" },
    commit: [{ subject: "feat: new feature" }],
  });
  const repo = fakeRepository({ git: git({ directory: pkg.root }) });
  await assertRejects(() => release(pkg, { repo }), PackageError);
});

Deno.test("release() rejects migrating 0.0.0", async () => {
  await using pkg = await tempPackage({
    config: { name: "@scope/name", version: "0.0.0" },
    commit: [{
      subject: "feat: new feature",
      config: [{ name: "@scope/name", version: "0.0.0" }],
    }],
  });
  const repo = fakeRepository({ git: git({ directory: pkg.root }) });
  await assertRejects(() => release(pkg, { repo }), PackageError);
});

Deno.test("release() creates initial release", async () => {
  await using pkg = await tempPackage({
    config: { name: "@scope/name", version: "0.1.0" },
    commit: [
      { subject: "fix: bug fix (#2)" },
      { subject: "feat: new feature (#1)" },
    ],
  });
  const repo = fakeRepository({
    url: new URL("https://host/repo"),
    git: git({ directory: pkg.root }),
  });
  const { release: rls, assets } = await release(pkg, { repo });
  assertObjectMatch(rls, {
    tag: "name@0.1.0",
    name: "name@0.1.0",
    body: [
      "## Initial release",
      "",
      "feat: new feature (#1)",
      "fix: bug fix (#2)",
      "",
      "### Details",
      "",
      `- [Full changelog](https://host/repo/commits/name@0.1.0/${pkg.directory})`,
      "- [Documentation](https://jsr.io/@scope/name@0.1.0)",
      "",
    ].join("\n"),
    prerelease: false,
    draft: false,
  });
  assertEquals(assets, []);
});

Deno.test("release() creates update release", async () => {
  await using pkg = await tempPackage({
    config: { name: "@scope/name", version: "1.3.0" },
    commit: [
      { subject: "initial", tag: ["name@1.2.3"] },
      { subject: "feat: new feature (#1)" },
    ],
  });
  const repo = fakeRepository({
    url: new URL("https://host/repo"),
    git: git({ directory: pkg.root }),
  });
  const { release: rls, assets } = await release(pkg, { repo });
  assertObjectMatch(rls, {
    tag: "name@1.3.0",
    name: "name@1.3.0",
    body: [
      "## Changes",
      "",
      "feat: new feature (#1)",
      "",
      "### Details",
      "",
      "- [Full changelog](https://host/repo/compare/name@1.2.3...name@1.3.0)",
      "- [Documentation](https://jsr.io/@scope/name@1.3.0)",
      "",
    ].join("\n"),
  });
  assertEquals(assets, []);
});

Deno.test("release() can create a pre-release", async () => {
  await using pkg = await tempPackage({
    config: { name: "@scope/name", version: "1.3.0-pre.1+fedcba9" },
    commit: [
      { subject: "initial", tag: ["name@1.2.3"] },
      { subject: "feat: new feature" },
    ],
  });
  const repo = fakeRepository({ git: git({ directory: pkg.root }) });
  const { release: rls } = await release(pkg, { repo });
  assertObjectMatch(rls, {
    name: "name@1.3.0-pre.1+fedcba9",
    prerelease: true,
  });
});

Deno.test("release() can update an existing release", async () => {
  await using pkg = await tempPackage({
    config: { name: "@scope/name", version: "1.3.0" },
    commit: [
      { subject: "initial", tag: ["name@1.2.3"] },
      { subject: "feat: new feature (#1)" },
    ],
  });
  const repo = fakeRepository({
    url: new URL("https://host/repo"),
    git: git({ directory: pkg.root }),
  });
  const existing = fakeRelease({ repo, id: 42, tag: "name@1.2.3" });
  repo.releases.list = async () => await Promise.resolve([existing]);
  const { release: rls } = await release(pkg, { repo });
  assertObjectMatch(rls, {
    id: 42,
    body: [
      "## Changes",
      "",
      "feat: new feature (#1)",
      "",
      "### Details",
      "",
      "- [Full changelog](https://host/repo/compare/name@1.2.3...name@1.3.0)",
      "- [Documentation](https://jsr.io/@scope/name@1.3.0)",
      "",
    ].join("\n"),
  });
});

Deno.test("release() can compile and upload release assets", async () => {
  await using pkg = await tempPackage({
    config: {
      name: "@scope/name",
      version: "1.2.3",
      forge: {
        main: "./main.ts",
        target: ["x86_64-unknown-linux-gnu", "x86_64-pc-windows-msvc"],
      },
      exports: { ".": "./main.ts" },
      imports: await unstableTestImports(),
    },
    repo: {
      // run this test inside a clone of roka repository
      // so we can test local changes to the version import below
      clone: dirname(dirname(import.meta.dirname ?? ".")),
    },
  });
  await Deno.writeTextFile(
    join(pkg.directory, "main.ts"),
    [
      'import { version } from "@roka/forge/version";',
      "console.log(await version());",
    ].join("\n"),
  );
  const repo = fakeRepository({ git: git({ directory: pkg.root }) });
  const existing = fakeRelease({ repo, id: 42, tag: "name@1.2.3" });
  repo.releases.list = async () => await Promise.resolve([existing]);
  const { release: rls, assets } = await release(pkg, { repo });
  assertEquals(rls.id, 42);
  assertArrayObjectMatch(assets, [
    { release: rls, name: "x86_64-unknown-linux-gnu.tar.gz" },
    { release: rls, name: "x86_64-pc-windows-msvc.zip" },
    { release: rls, name: "sha256.txt" },
  ]);
});

Deno.test("release({ draft }) creates draft release", async () => {
  await using pkg = await tempPackage({
    config: { name: "@scope/name", version: "1.3.0" },
    commit: [
      { subject: "initial", tag: ["name@1.2.3"] },
      { subject: "feat: new feature" },
    ],
  });
  const repo = fakeRepository({ git: git({ directory: pkg.root }) });
  const { release: rls } = await release(pkg, { repo, draft: true });
  assertEquals(rls.draft, true);
});

Deno.test("canRelease() filters for untagged packages that can be released", async () => {
  const pkg = {
    ...await tempPackage({
      commit: [{
        subject: "bump version",
        config: [{ name: "@scope/name", version: "1.2.2" }],
      }, {
        subject: "bump version",
        config: [{ name: "@scope/name", version: "1.2.3" }],
      }],
    }),
    config: { version: "1.2.3" },
  };
  const latest = (version: string) => ({ version, range: { to: "to" } });
  assertFalse(canRelease({ ...pkg }));
  assertFalse(canRelease({ ...pkg, latest: latest("1.2.4") }));
  assertFalse(canRelease({ ...pkg, latest: latest("1.2.4-pre") }));
  assertFalse(canRelease({ ...pkg, latest: latest("1.2.3") }));
  assert(canRelease({ ...pkg, latest: latest("1.2.3-pre") }));
  assert(canRelease({ ...pkg, latest: latest("1.2.2") }));
});

Deno.test("canRelease() filters for tagged packages that can be released", async () => {
  const pkg = {
    ...await tempPackage(),
    version: "1.2.3",
    latest: {
      tag: "name@1.2.3",
      version: "1.2.3",
      range: { to: "name@1.2.3" },
    },
  };
  assertFalse(canRelease({ ...pkg }));
  assertFalse(canRelease({ ...pkg, config: { version: "0.0.0" } }));
  assertFalse(canRelease({ ...pkg, config: { version: "1.2.2" } }));
  assertFalse(canRelease({ ...pkg, config: { version: "1.2.3-pre" } }));
  assertFalse(canRelease({ ...pkg, config: { version: "1.2.3" } }));
  assert(canRelease({ ...pkg, config: { version: "1.2.4-pre" } }));
  assert(canRelease({ ...pkg, config: { version: "1.2.4" } }));
});
