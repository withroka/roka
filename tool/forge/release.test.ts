import { PackageError } from "@roka/forge/package";
import { release } from "@roka/forge/release";
import { tempPackage } from "@roka/forge/testing";
import { fakeRelease, fakeRepository } from "@roka/github/testing";
import { assertEquals, assertRejects } from "@std/assert";
import { git } from "../../core/git/git.ts";

Deno.test("release() rejects package without version", async () => {
  await using pkg = await tempPackage({
    config: { name: "@scope/name" },
    commits: [{ summary: "feat: new feature" }],
  });
  const repo = fakeRepository({ git: git({ cwd: pkg.directory }) });
  await assertRejects(() => release(pkg, { repo }), PackageError);
});

Deno.test("release() rejects version downgrade", async () => {
  await using pkg = await tempPackage({
    config: { name: "@scope/name", version: "0.1.0" },
    commits: [{ summary: "feat: new feature", tags: ["name@0.1.1"] }],
  });
  const repo = fakeRepository({ git: git({ cwd: pkg.directory }) });
  await assertRejects(() => release(pkg, { repo }), PackageError);
});

Deno.test("release() rejects no change", async () => {
  await using pkg = await tempPackage({
    config: { name: "@scope/name", version: "0.1.0" },
    commits: [{ summary: "feat: new feature", tags: ["name@0.1.0"] }],
  });
  const repo = fakeRepository({ git: git({ cwd: pkg.directory }) });
  await assertRejects(() => release(pkg, { repo }), PackageError);
});

Deno.test("release() rejects 0.0.0", async () => {
  await using pkg = await tempPackage({
    config: { name: "@scope/name", version: "0.0.0" },
    commits: [{ summary: "feat: new feature" }],
  });
  const repo = fakeRepository({ git: git({ cwd: pkg.directory }) });
  await assertRejects(() => release(pkg, { repo }), PackageError);
});

Deno.test("release() creates initial release", async () => {
  await using pkg = await tempPackage({
    config: { name: "@scope/name", version: "0.1.0" },
    commits: [{ summary: "feat: new feature" }],
  });
  const repo = fakeRepository({ git: git({ cwd: pkg.directory }) });
  const [rls, assets] = await release(pkg, { repo });
  assertEquals(rls.tag, "name@0.1.0");
  assertEquals(rls.name, "name@0.1.0");
  assertEquals(
    rls.body,
    [
      "## Initial release",
      "",
      "feat: new feature",
      "",
      "### Details",
      "",
      `- [Full changelog](url/commits/name@0.1.0/${pkg.directory})`,
      "- [Documentation](https://jsr.io/@scope/name@0.1.0)",
      "",
    ].join("\n"),
  );
  assertEquals(assets.length, 0);
  assertEquals(rls.prerelease, false);
  assertEquals(rls.draft, false);
});

Deno.test("release() creates update release", async () => {
  await using pkg = await tempPackage({
    config: { name: "@scope/name", version: "1.3.0" },
    commits: [
      { summary: "initial", tags: ["name@1.2.3"] },
      { summary: "feat: new feature" },
    ],
  });
  const repo = fakeRepository({ git: git({ cwd: pkg.directory }) });
  const [rls, assets] = await release(pkg, { repo });
  assertEquals(rls.tag, "name@1.3.0");
  assertEquals(rls.name, "name@1.3.0");
  assertEquals(
    rls.body,
    [
      "## Changes",
      "",
      "feat: new feature",
      "",
      "### Details",
      "",
      `- [Full changelog](url/compare/name@1.2.3...name@1.3.0)`,
      "- [Documentation](https://jsr.io/@scope/name@1.3.0)",
      "",
    ].join("\n"),
  );
  assertEquals(assets.length, 0);
});

Deno.test("release() creates draft release", async () => {
  await using pkg = await tempPackage({
    config: { name: "@scope/name", version: "1.3.0" },
    commits: [
      { summary: "initial", tags: ["name@1.2.3"] },
      { summary: "feat: new feature" },
    ],
  });
  const repo = fakeRepository({ git: git({ cwd: pkg.directory }) });
  const [rls] = await release(pkg, { repo, draft: true });
  assertEquals(rls.draft, true);
});

Deno.test("release() creates pre-release", async () => {
  await using pkg = await tempPackage({
    config: { name: "@scope/name", version: `1.3.0-pre.1+fedcba9` },
    commits: [
      { summary: "initial", tags: ["name@1.2.3"] },
      { summary: "feat: new feature" },
    ],
  });
  const repo = fakeRepository({ git: git({ cwd: pkg.directory }) });
  const [rls] = await release(pkg, { repo, draft: true });
  assertEquals(rls.name, `name@1.3.0-pre.1+fedcba9`);
  assertEquals(rls.prerelease, true);
});

Deno.test("release() updates existing release", async () => {
  await using pkg = await tempPackage({
    config: { name: "@scope/name", version: `1.3.0` },
    commits: [
      { summary: "initial", tags: ["name@1.2.3"] },
      { summary: "feat: new feature" },
    ],
  });
  const repo = fakeRepository({ git: git({ cwd: pkg.directory }) });
  const existing = fakeRelease({ repo, id: 42, tag: "name@1.2.3" });
  repo.releases.list = async () => await Promise.resolve([existing]);
  const [rls] = await release(pkg, { repo });
  assertEquals(rls.id, 42);
  assertEquals(
    rls.body,
    [
      "## Changes",
      "",
      "feat: new feature",
      "",
      "### Details",
      "",
      `- [Full changelog](url/compare/name@1.2.3...name@1.3.0)`,
      "- [Documentation](https://jsr.io/@scope/name@1.3.0)",
      "",
    ].join("\n"),
  );
});
