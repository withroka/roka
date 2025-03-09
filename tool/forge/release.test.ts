import { packageInfo } from "@roka/forge/package";
import { release } from "@roka/forge/release";
import { tempRepository } from "@roka/git/testing";
import { fakeRelease, fakeRepository } from "@roka/github/testing";
import { assertEquals, assertMatch } from "@std/assert";
import { testPackage } from "./testing.ts";

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
  assertMatch(rls.body, /## Initial release/);
  assertMatch(rls.body, /name@0.1.0/);
  assertMatch(rls.body, /feat\(name\): new feature/);
  assertEquals(assets.length, 0);
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
  assertMatch(rls.body, /## Changelog/);
  assertMatch(rls.body, /name@1.3.0/);
  assertMatch(rls.body, /feat\(name\): new feature/);
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
  assertMatch(rls.body, /## Changelog/);
  assertMatch(rls.body, /name@1.3.0/);
  assertMatch(rls.body, /feat\(name\): new feature/);
});
