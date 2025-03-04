import { pool } from "@roka/async/pool";
import { bump } from "@roka/forge/bump";
import { PackageError, packageInfo } from "@roka/forge/package";
import { tempRepository } from "@roka/git/testing";
import { testRepository } from "@roka/github/testing";
import {
  assertEquals,
  assertExists,
  assertMatch,
  assertRejects,
} from "@std/assert";

Deno.test("bump() rejects package without version", async () => {
  await using git = await tempRepository();
  const config = { name: "@scope/module" };
  await Deno.writeTextFile(git.path("deno.json"), JSON.stringify(config));
  await git.index.add("deno.json");
  await git.commits.create("feat(module): introduce module");
  await git.tags.create("module@0.1.0");
  const pkg = await packageInfo({ directory: git.path() });
  await assertRejects(() => bump([pkg]), PackageError);
});

Deno.test("bump() rejects package without update", async () => {
  await using git = await tempRepository();
  const config = { name: "@scope/module", version: "0.1.0" };
  await Deno.writeTextFile(git.path("deno.json"), JSON.stringify(config));
  await git.index.add("deno.json");
  await git.commits.create("feat(module): introduce module");
  await git.tags.create("module@0.1.0");
  const pkg = await packageInfo({ directory: git.path() });
  await assertRejects(() => bump([pkg]), PackageError);
});

Deno.test("bump() updates package", async () => {
  await using git = await tempRepository();
  const config = { name: "@scope/module", version: "0.1.0" };
  await Deno.writeTextFile(git.path("deno.json"), JSON.stringify(config));
  await git.index.add("deno.json");
  await git.commits.create("feat(module): introduce module");
  await git.tags.create("module@0.1.0");
  await git.commits.create("fix(module): fix module", { allowEmpty: true });
  const pkg = await packageInfo({ directory: git.path() });
  const pr = await bump([pkg]);
  assertEquals(pr, undefined);
  const updated = await packageInfo({ directory: git.path() });
  assertEquals(updated.config, { ...pkg.config, version: "0.1.1" });
  const commit = await git.commits.head();
  assertEquals(commit.summary, "fix(module): fix module");
});

Deno.test("bump() minor updates unreleased package", async () => {
  await using git = await tempRepository();
  const config = { name: "@scope/module", version: "0.0.0" };
  await Deno.writeTextFile(git.path("deno.json"), JSON.stringify(config));
  await git.index.add("deno.json");
  await git.commits.create("feat(module): introduce module");
  const pkg = await packageInfo({ directory: git.path() });
  const pr = await bump([pkg]);
  assertEquals(pr, undefined);
  const updated = await packageInfo({ directory: git.path() });
  assertEquals(updated.config, { ...pkg.config, version: "0.1.0" });
});

Deno.test("bump() patch updates unreleased package", async () => {
  await using git = await tempRepository();
  const config = { name: "@scope/module", version: "0.0.0" };
  await Deno.writeTextFile(git.path("deno.json"), JSON.stringify(config));
  await git.index.add("deno.json");
  await git.commits.create("fix(module): introduce module with a fix");
  const pkg = await packageInfo({ directory: git.path() });
  const pr = await bump([pkg]);
  assertEquals(pr, undefined);
  const updated = await packageInfo({ directory: git.path() });
  assertEquals(updated.config, { ...pkg.config, version: "0.0.1" });
});

Deno.test("bump() creates pull request", async () => {
  await using remote = await tempRepository();
  await using git = await tempRepository({ clone: remote });
  const repo = testRepository({ git });
  const config = { name: "@scope/module", version: "0.0.0" };
  await Deno.writeTextFile(git.path("deno.json"), JSON.stringify(config));
  await git.index.add("deno.json");
  await git.commits.create("feat(module): introduce module");
  const pkg = await packageInfo({ directory: git.path() });
  const pr = await bump([pkg], {
    repo,
    pr: true,
    user: { name: "bump-name", email: "bump-email" },
  });
  assertExists(pr);
  assertEquals(pr.title, "chore: bump module version");
  assertMatch(pr.body, /## module@0.1.0 \[minor\]/);
  assertMatch(pr.body, /feat\(module\): introduce module/);
  const updated = await packageInfo({ directory: git.path() });
  assertEquals(updated.config, { ...pkg.config, version: "0.1.0" });
  const commit = await git.commits.head();
  assertEquals(commit.summary, "chore: bump module version");
  assertEquals(commit.author.name, "bump-name");
  assertEquals(commit.author.email, "bump-email");
});

Deno.test("bump() updates pull request", async () => {
  await using remote = await tempRepository({ bare: true });
  await using git = await tempRepository({ clone: remote });
  const repo = testRepository({ git });
  const config = { name: "@scope/module", version: "0.0.0" };
  await Deno.writeTextFile(git.path("deno.json"), JSON.stringify(config));
  await git.index.add("deno.json");
  await git.commits.create("feat(module): introduce module");
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
  const repo = testRepository({ git });
  const config1 = { name: "@scope/module1", version: "0.0.0" };
  const config2 = { name: "@scope/module2", version: "0.0.0" };
  await Deno.mkdir(git.path("module1"));
  await Deno.mkdir(git.path("module2"));
  await Deno.writeTextFile(
    git.path("module1/deno.json"),
    JSON.stringify(config1),
  );
  await Deno.writeTextFile(
    git.path("module2/deno.json"),
    JSON.stringify(config2),
  );
  await git.index.add("module1/deno.json");
  await git.index.add("module2/deno.json");
  await git.commits.create("feat(module1,module2): introduce modules");
  const pkg1 = await packageInfo({ directory: git.path("module1") });
  const pkg2 = await packageInfo({ directory: git.path("module2") });
  const pr = await bump([pkg1, pkg2], { repo, pr: true });
  assertExists(pr);
  assertEquals(pr.title, "chore: bump versions");
  assertMatch(pr.body, /## module1@0.1.0 \[minor\]/);
  assertMatch(pr.body, /## module2@0.1.0 \[minor\]/);
  assertMatch(pr.body, /feat\(module1,module2\): introduce modules/);
  const updated1 = await packageInfo({ directory: git.path("module1") });
  const updated2 = await packageInfo({ directory: git.path("module2") });
  assertEquals(updated1.config, { ...pkg1.config, version: "0.1.0" });
  assertEquals(updated2.config, { ...pkg2.config, version: "0.1.0" });
  const commit = await git.commits.head();
  assertEquals(commit.summary, "chore: bump versions");
});
