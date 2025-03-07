import { pool } from "@roka/async/pool";
import { bump } from "@roka/forge/bump";
import { PackageError, packageInfo } from "@roka/forge/package";
import { tempRepository } from "@roka/git/testing";
import { fakeRepository } from "@roka/github/testing";
import {
  assertEquals,
  assertExists,
  assertMatch,
  assertRejects,
} from "@std/assert";

Deno.test("bump() rejects package without version", async () => {
  await using git = await tempRepository();
  const config = { name: "@scope/name" };
  await Deno.writeTextFile(git.path("deno.json"), JSON.stringify(config));
  await git.index.add("deno.json");
  await git.commits.create("feat(name): introduce package");
  await git.tags.create("name@0.1.0");
  const pkg = await packageInfo({ directory: git.path() });
  await assertRejects(() => bump([pkg]), PackageError);
});

Deno.test("bump() rejects package without update", async () => {
  await using git = await tempRepository();
  const config = { name: "@scope/name", version: "0.1.0" };
  await Deno.writeTextFile(git.path("deno.json"), JSON.stringify(config));
  await git.index.add("deno.json");
  await git.commits.create("feat(name): introduce package");
  await git.tags.create("name@0.1.0");
  const pkg = await packageInfo({ directory: git.path() });
  await assertRejects(() => bump([pkg]), PackageError);
});

Deno.test("bump() updates package", async () => {
  await using git = await tempRepository();
  const config = { name: "@scope/name", version: "0.1.0" };
  await Deno.writeTextFile(git.path("deno.json"), JSON.stringify(config));
  await git.index.add("deno.json");
  await git.commits.create("feat(name): introduce package");
  await git.tags.create("name@0.1.0");
  await git.commits.create("fix(name): fix code", { allowEmpty: true });
  const pkg = await packageInfo({ directory: git.path() });
  const pr = await bump([pkg]);
  assertEquals(pr, undefined);
  const updated = await packageInfo({ directory: git.path() });
  assertEquals(updated.config, { ...pkg.config, version: "0.1.1" });
  const commit = await git.commits.head();
  assertEquals(commit.summary, "fix(name): fix code");
});

Deno.test("bump() minor updates unreleased package", async () => {
  await using git = await tempRepository();
  const config = { name: "@scope/name", version: "0.0.0" };
  await Deno.writeTextFile(git.path("deno.json"), JSON.stringify(config));
  await git.index.add("deno.json");
  await git.commits.create("feat(name): introduce package");
  const pkg = await packageInfo({ directory: git.path() });
  const pr = await bump([pkg]);
  assertEquals(pr, undefined);
  const updated = await packageInfo({ directory: git.path() });
  assertEquals(updated.config, { ...pkg.config, version: "0.1.0" });
});

Deno.test("bump() patch updates unreleased package", async () => {
  await using git = await tempRepository();
  const config = { name: "@scope/name", version: "0.0.0" };
  await Deno.writeTextFile(git.path("deno.json"), JSON.stringify(config));
  await git.index.add("deno.json");
  await git.commits.create("fix(name): introduce package with a fix");
  const pkg = await packageInfo({ directory: git.path() });
  const pr = await bump([pkg]);
  assertEquals(pr, undefined);
  const updated = await packageInfo({ directory: git.path() });
  assertEquals(updated.config, { ...pkg.config, version: "0.0.1" });
});

Deno.test("bump() creates pull request", async () => {
  await using remote = await tempRepository();
  await using git = await tempRepository({ clone: remote });
  const repo = fakeRepository({ git });
  const config = { name: "@scope/name", version: "0.0.0" };
  await Deno.writeTextFile(git.path("deno.json"), JSON.stringify(config));
  await git.index.add("deno.json");
  await git.commits.create("feat(name): introduce package");
  const pkg = await packageInfo({ directory: git.path() });
  const pr = await bump([pkg], {
    repo,
    pr: true,
    user: { name: "bump-name", email: "bump-email" },
  });
  assertExists(pr);
  assertEquals(pr.title, "chore: bump name version");
  assertMatch(pr.body, /## name@0.1.0 \[minor\]/);
  assertMatch(pr.body, /feat\(name\): introduce package/);
  const updated = await packageInfo({ directory: git.path() });
  assertEquals(updated.config, { ...pkg.config, version: "0.1.0" });
  const commit = await git.commits.head();
  assertEquals(commit.summary, "chore: bump name version");
  assertEquals(commit.author.name, "bump-name");
  assertEquals(commit.author.email, "bump-email");
});

Deno.test("bump() updates pull request", async () => {
  await using remote = await tempRepository({ bare: true });
  await using git = await tempRepository({ clone: remote });
  const repo = fakeRepository({ git });
  const config = { name: "@scope/name", version: "0.0.0" };
  await Deno.writeTextFile(git.path("deno.json"), JSON.stringify(config));
  await git.index.add("deno.json");
  await git.commits.create("feat(name): introduce package");
  const defaultBranch = await git.branches.current();
  assertExists(defaultBranch);
  const pkg = await packageInfo({ directory: git.path() });
  const [pr1, pr2] = await pool(
    [1, 2],
    async () => {
      const pr = await bump([pkg], { repo, pr: true });
      const branch = await git.branches.current();
      assertExists(branch);
      await git.branches.checkout({ target: defaultBranch });
      await git.branches.delete(branch, { force: true });
      return pr;
    },
    { concurrency: 1 },
  );
  assertEquals(pr1?.number, pr2?.number);
});

Deno.test("bump() updates multiple packages", async () => {
  await using remote = await tempRepository();
  await using git = await tempRepository({ clone: remote });
  const repo = fakeRepository({ git });
  const config1 = { name: "@scope/name1", version: "0.0.0" };
  const config2 = { name: "@scope/name2", version: "0.0.0" };
  await Deno.mkdir(git.path("name1"));
  await Deno.mkdir(git.path("name2"));
  await Deno.writeTextFile(
    git.path("name1/deno.json"),
    JSON.stringify(config1),
  );
  await Deno.writeTextFile(
    git.path("name2/deno.json"),
    JSON.stringify(config2),
  );
  await git.index.add("name1/deno.json");
  await git.index.add("name2/deno.json");
  await git.commits.create("feat(name1,name2): introduce packages");
  const pkg1 = await packageInfo({ directory: git.path("name1") });
  const pkg2 = await packageInfo({ directory: git.path("name2") });
  const pr = await bump([pkg1, pkg2], { repo, pr: true });
  assertExists(pr);
  assertEquals(pr.title, "chore: bump versions");
  assertMatch(pr.body, /## name1@0.1.0 \[minor\]/);
  assertMatch(pr.body, /## name2@0.1.0 \[minor\]/);
  assertMatch(pr.body, /feat\(name1,name2\): introduce packages/);
  const updated1 = await packageInfo({ directory: git.path("name1") });
  const updated2 = await packageInfo({ directory: git.path("name2") });
  assertEquals(updated1.config, { ...pkg1.config, version: "0.1.0" });
  assertEquals(updated2.config, { ...pkg2.config, version: "0.1.0" });
  const commit = await git.commits.head();
  assertEquals(commit.summary, "chore: bump versions");
});
