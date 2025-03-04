import { PackageError, packageInfo } from "@roka/forge/package";
import { release } from "@roka/forge/release";
import { tempRepository } from "@roka/git/testing";
import { testRepository } from "@roka/github/testing";
import { assertEquals, assertMatch, assertRejects } from "@std/assert";

Deno.test("release() rejects package without version", async () => {
  await using git = await tempRepository();
  const config = { name: "@scope/module" };
  await Deno.writeTextFile(git.path("deno.json"), JSON.stringify(config));
  const pkg = await packageInfo({ directory: git.path() });
  await assertRejects(() => release(pkg), PackageError);
});

Deno.test("release() creates initial release", async () => {
  await using git = await tempRepository();
  const repo = testRepository({ git });
  const config = { name: "@scope/module", version: "1.2.3" };
  await Deno.writeTextFile(git.path("deno.json"), JSON.stringify(config));
  await git.index.add("deno.json");
  await git.commits.create("feat(module): introduce module");
  const pkg = await packageInfo({ directory: git.path() });
  const [rls, assets] = await release(pkg, { repo });
  assertEquals(rls.tag, "module@1.2.3");
  assertEquals(rls.name, "module@1.2.3");
  assertMatch(rls.body, /## Initial release/);
  assertMatch(rls.body, /module@1.2.3/);
  assertMatch(rls.body, /feat\(module\): introduce module/);
  assertEquals(assets.length, 0);
});

Deno.test("release() creates bump release", async () => {
  await using git = await tempRepository();
  const repo = testRepository({ git });
  const config = { name: "@scope/module", version: "1.2.3" };
  await Deno.writeTextFile(git.path("deno.json"), JSON.stringify(config));
  await git.index.add("deno.json");
  await git.commits.create("feat(module): introduce module");
  await git.tags.create("module@1.2.3");
  await git.commits.create("fix(module): fix module", { allowEmpty: true });
  const pkg = await packageInfo({ directory: git.path() });
  const [rls, assets] = await release(pkg, { repo });
  assertEquals(rls.tag, "module@1.2.3");
  assertEquals(rls.name, "module@1.2.3");
  assertMatch(rls.body, /## Changelog/);
  assertMatch(rls.body, /module@1.2.3/);
  assertMatch(rls.body, /fix\(module\): fix module/);
  assertEquals(assets.length, 0);
});

Deno.test("release() creates draft release", async () => {
  await using git = await tempRepository();
  const repo = testRepository({ git });
  const config = { name: "@scope/module", version: "1.2.3" };
  await Deno.writeTextFile(git.path("deno.json"), JSON.stringify(config));
  await git.index.add("deno.json");
  await git.commits.create("feat(module): introduce module");
  const pkg = await packageInfo({ directory: git.path() });
  const [rls] = await release(pkg, { repo, draft: true });
  assertEquals(rls.draft, true);
});

Deno.test("release() updates existing release", async () => {
  await using git = await tempRepository();
  const repo = testRepository({ git });
  const config = { name: "@scope/module", version: "1.2.3" };
  await Deno.writeTextFile(git.path("deno.json"), JSON.stringify(config));
  await git.index.add("deno.json");
  await git.commits.create("feat(module): introduce module");
  const pkg = await packageInfo({ directory: git.path() });
  const [rls1] = await release(pkg, { repo });
  const [rls2] = await release(pkg, { repo });
  assertEquals(rls1.id, rls2.id);
});
