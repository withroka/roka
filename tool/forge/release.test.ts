import { PackageError, packageInfo } from "@roka/forge/package";
import { release } from "@roka/forge/release";
import { tempRepository } from "@roka/git/testing";
import { fakeRepository } from "@roka/github/testing";
import { assertEquals, assertMatch, assertRejects } from "@std/assert";

Deno.test("release() rejects package without version", async () => {
  await using git = await tempRepository();
  const config = { name: "@scope/name" };
  await Deno.writeTextFile(git.path("deno.json"), JSON.stringify(config));
  const pkg = await packageInfo({ directory: git.path() });
  await assertRejects(() => release(pkg), PackageError);
});

Deno.test("release() creates initial release", async () => {
  await using git = await tempRepository();
  const repo = fakeRepository({ git });
  const config = { name: "@scope/name", version: "1.2.3" };
  await Deno.writeTextFile(git.path("deno.json"), JSON.stringify(config));
  await git.index.add("deno.json");
  await git.commits.create("feat(name): introduce package");
  const pkg = await packageInfo({ directory: git.path() });
  const [rls, assets] = await release(pkg, { repo });
  assertEquals(rls.tag, "name@1.2.3");
  assertEquals(rls.name, "name@1.2.3");
  assertMatch(rls.body, /## Initial release/);
  assertMatch(rls.body, /name@1.2.3/);
  assertMatch(rls.body, /feat\(name\): introduce package/);
  assertEquals(assets.length, 0);
});

Deno.test("release() creates bump release", async () => {
  await using git = await tempRepository();
  const repo = fakeRepository({ git });
  const config = { name: "@scope/name", version: "1.2.3" };
  await Deno.writeTextFile(git.path("deno.json"), JSON.stringify(config));
  await git.index.add("deno.json");
  await git.commits.create("feat(name): introduce package");
  await git.tags.create("name@1.2.3");
  await git.commits.create("fix(name): fix code", { allowEmpty: true });
  const pkg = await packageInfo({ directory: git.path() });
  const [rls, assets] = await release(pkg, { repo });
  assertEquals(rls.tag, "name@1.2.3");
  assertEquals(rls.name, "name@1.2.3");
  assertMatch(rls.body, /## Changelog/);
  assertMatch(rls.body, /name@1.2.3/);
  assertMatch(rls.body, /fix\(name\): fix code/);
  assertEquals(assets.length, 0);
});

Deno.test("release() creates draft release", async () => {
  await using git = await tempRepository();
  const repo = fakeRepository({ git });
  const config = { name: "@scope/name", version: "1.2.3" };
  await Deno.writeTextFile(git.path("deno.json"), JSON.stringify(config));
  await git.index.add("deno.json");
  await git.commits.create("feat(name): introduce package");
  const pkg = await packageInfo({ directory: git.path() });
  const [rls] = await release(pkg, { repo, draft: true });
  assertEquals(rls.draft, true);
});

Deno.test("release() updates existing release", async () => {
  await using git = await tempRepository();
  const repo = fakeRepository({ git });
  const config = { name: "@scope/name", version: "1.2.3" };
  await Deno.writeTextFile(git.path("deno.json"), JSON.stringify(config));
  await git.index.add("deno.json");
  await git.commits.create("feat(name): introduce package");
  const pkg = await packageInfo({ directory: git.path() });
  const [rls1] = await release(pkg, { repo });
  const [rls2] = await release(pkg, { repo });
  assertEquals(rls1.id, rls2.id);
});
