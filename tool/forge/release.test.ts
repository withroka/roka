import { PackageError, packageInfo } from "@roka/forge/package";
import { release } from "@roka/forge/release";
import { testPackage } from "@roka/forge/testing";
import { tempRepository } from "@roka/git/testing";
import { fakeRelease, fakeRepository } from "@roka/github/testing";
import { assertEquals, assertRejects } from "@std/assert";

Deno.test("release() rejects package without version", async () => {
  await using git = await tempRepository();
  const repo = fakeRepository({ git });
  await git.commits.create("initial", { allowEmpty: true });
  await testPackage(git.path(), { name: "@scope/name" });
  await git.index.add("deno.json");
  await git.commits.create("feat(name): new feature", { allowEmpty: true });
  const pkg = await packageInfo({ directory: git.path() });
  await assertRejects(() => release(pkg, { repo }), PackageError);
});

Deno.test("release() rejects version downgrade", async () => {
  await using git = await tempRepository();
  const repo = fakeRepository({ git });
  await git.commits.create("initial", { allowEmpty: true });
  await testPackage(git.path(), { name: "@scope/name", version: "0.1.0" });
  await git.index.add("deno.json");
  await git.commits.create("feat(name): new feature", { allowEmpty: true });
  await git.tags.create("name@0.1.1");
  const pkg = await packageInfo({ directory: git.path() });
  await assertRejects(() => release(pkg, { repo }), PackageError);
});

Deno.test("release() rejects no change", async () => {
  await using git = await tempRepository();
  const repo = fakeRepository({ git });
  await git.commits.create("initial", { allowEmpty: true });
  await testPackage(git.path(), { name: "@scope/name", version: "0.1.0" });
  await git.index.add("deno.json");
  await git.commits.create("feat(name): new feature", { allowEmpty: true });
  await git.tags.create("name@0.1.0");
  const pkg = await packageInfo({ directory: git.path() });
  await assertRejects(() => release(pkg, { repo }), PackageError);
});

Deno.test("release() rejects 0.0.0", async () => {
  await using git = await tempRepository();
  const repo = fakeRepository({ git });
  await git.commits.create("initial", { allowEmpty: true });
  await testPackage(git.path(), { name: "@scope/name", version: "0.0.0" });
  await git.index.add("deno.json");
  await git.commits.create("feat(name): new feature", { allowEmpty: true });
  const pkg = await packageInfo({ directory: git.path() });
  await assertRejects(() => release(pkg, { repo }), PackageError);
});

Deno.test("release() creates initial release", async () => {
  await using git = await tempRepository();
  const repo = fakeRepository({ git });
  await git.commits.create("initial", { allowEmpty: true });
  await testPackage(git.path(), {
    name: "@scope/name",
    version: "0.1.0",
  });
  await git.index.add("deno.json");
  await git.commits.create("feat(name): new feature", { allowEmpty: true });
  const pkg = await packageInfo({ directory: git.path() });
  const [rls, assets] = await release(pkg, { repo });
  assertEquals(rls.tag, "name@0.1.0");
  assertEquals(rls.name, "name@0.1.0");
  assertEquals(
    rls.body,
    [
      "## Initial release",
      "",
      "feat(name): new feature",
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
  await using git = await tempRepository();
  const repo = fakeRepository({ git });
  await git.commits.create("previous", { allowEmpty: true });
  await git.tags.create("name@1.2.3");
  await git.commits.create("feat(name): new feature", { allowEmpty: true });
  const pkg = await testPackage(git.path(), {
    name: "@scope/name",
    version: "1.3.0",
  });
  const [rls, assets] = await release(pkg, { repo });
  assertEquals(rls.tag, "name@1.3.0");
  assertEquals(rls.name, "name@1.3.0");
  assertEquals(
    rls.body,
    [
      "## Changes",
      "",
      "feat(name): new feature",
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
  await using git = await tempRepository();
  const repo = fakeRepository({ git });
  await git.commits.create("previous", { allowEmpty: true });
  await git.tags.create("name@1.2.3");
  await git.commits.create("feat(name): new feature", { allowEmpty: true });
  const pkg = await testPackage(git.path(), {
    name: "@scope/name",
    version: "1.3.0",
  });
  const [rls] = await release(pkg, { repo, draft: true });
  assertEquals(rls.draft, true);
});

Deno.test("release() creates pre-release", async () => {
  await using git = await tempRepository();
  const repo = fakeRepository({ git });
  await git.commits.create("previous", { allowEmpty: true });
  await git.tags.create("name@1.2.3");
  const commit = await git.commits.create("feat(name): new feature", {
    allowEmpty: true,
  });
  const pkg = await testPackage(git.path(), {
    name: "@scope/name",
    version: `1.3.0-pre.1+${commit.short}`,
  });
  const [rls] = await release(pkg, { repo, draft: true });
  assertEquals(rls.name, `name@1.3.0-pre.1+${commit.short}`);
  assertEquals(rls.prerelease, true);
});

Deno.test("release() updates existing release", async () => {
  await using git = await tempRepository();
  const repo = fakeRepository({ git });
  const existing = fakeRelease({ repo, id: 42, tag: "name@1.2.3" });
  repo.releases.list = async () => await Promise.resolve([existing]);
  await git.commits.create("previous", { allowEmpty: true });
  await git.tags.create("name@1.2.3");
  await git.commits.create("feat(name): new feature", { allowEmpty: true });
  const pkg = await testPackage(git.path(), {
    name: "@scope/name",
    version: "1.3.0",
  });
  const [rls] = await release(pkg, { repo });
  assertEquals(rls.id, 42);
  assertEquals(
    rls.body,
    [
      "## Changes",
      "",
      "feat(name): new feature",
      "",
      "### Details",
      "",
      `- [Full changelog](url/compare/name@1.2.3...name@1.3.0)`,
      "- [Documentation](https://jsr.io/@scope/name@1.3.0)",
      "",
    ].join("\n"),
  );
});
