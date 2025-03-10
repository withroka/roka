import { changelog } from "@roka/forge/changelog";
import { testPackage } from "@roka/forge/testing";
import { conventional } from "@roka/git/conventional";
import { tempRepository } from "@roka/git/testing";
import { assertEquals } from "@std/assert/equals";

Deno.test("changelog() generates package changelog", async () => {
  await using git = await tempRepository();
  await git.commits.create("initial", { allowEmpty: true });
  const commit1 = await git.commits.create("feat(name): introduce", {
    allowEmpty: true,
  });
  const commit2 = await git.commits.create("fix(name): fix code", {
    allowEmpty: true,
  });
  await git.commits.create("fix(other): fix other", { allowEmpty: true });
  await git.commits.create("ci: unrelated", { allowEmpty: true });
  const commit3 = await git.commits.create("docs(name): add docs", {
    allowEmpty: true,
  });
  const pkg = await testPackage(git.path(), { name: "@scope/name" });
  assertEquals(
    await changelog(pkg),
    [conventional(commit3), conventional(commit2), conventional(commit1)],
  );
});

Deno.test("changelog() filters by type", async () => {
  await using git = await tempRepository();
  await git.commits.create("initial", { allowEmpty: true });
  const commit1 = await git.commits.create("feat(name): introduce", {
    allowEmpty: true,
  });
  const commit2 = await git.commits.create("fix(name): fix code", {
    allowEmpty: true,
  });
  await git.commits.create("docs(name): add docs", {
    allowEmpty: true,
  });
  const pkg = await testPackage(git.path(), { name: "@scope/name" });
  assertEquals(
    await changelog(pkg, { type: ["feat", "fix"] }),
    [conventional(commit2), conventional(commit1)],
  );
});

Deno.test("changelog() includes breaking changes", async () => {
  await using git = await tempRepository();
  await git.commits.create("initial", { allowEmpty: true });
  const commit1 = await git.commits.create("feat(name): introduce", {
    allowEmpty: true,
  });
  const commit2 = await git.commits.create("fix(name): fix code", {
    allowEmpty: true,
  });
  const commit3 = await git.commits.create("refactor(name)!: breaking", {
    allowEmpty: true,
  });
  await git.commits.create("docs(name): add docs", {
    allowEmpty: true,
  });
  const pkg = await testPackage(git.path(), { name: "@scope/name" });
  assertEquals(
    await changelog(pkg, { type: ["feat", "fix"] }),
    [conventional(commit3), conventional(commit2), conventional(commit1)],
  );
});

Deno.test("changelog() can filter breaking changes", async () => {
  await using git = await tempRepository();
  await git.commits.create("initial", { allowEmpty: true });
  await git.commits.create("feat(name): introduce", {
    allowEmpty: true,
  });
  const commit = await git.commits.create("fix(name)!: fix code", {
    allowEmpty: true,
  });
  await git.commits.create("refactor(name)!: breaking", {
    allowEmpty: true,
  });
  await git.commits.create("docs(name): add docs", {
    allowEmpty: true,
  });
  const pkg = await testPackage(git.path(), { name: "@scope/name" });
  assertEquals(
    await changelog(pkg, { type: ["feat", "fix"], breaking: true }),
    [conventional(commit)],
  );
});

Deno.test("changelog() can filter non-breaking changes", async () => {
  await using git = await tempRepository();
  await git.commits.create("initial", { allowEmpty: true });
  const commit1 = await git.commits.create("feat(name): introduce", {
    allowEmpty: true,
  });
  const commit2 = await git.commits.create("fix(name): fix code", {
    allowEmpty: true,
  });
  await git.commits.create("refactor(name)!: breaking", {
    allowEmpty: true,
  });
  await git.commits.create("docs(name): add docs", {
    allowEmpty: true,
  });
  const pkg = await testPackage(git.path(), { name: "@scope/name" });
  assertEquals(
    await changelog(pkg, { type: ["feat", "fix"], breaking: false }),
    [conventional(commit2), conventional(commit1)],
  );
});

Deno.test("changelog() can return breaking changes only", async () => {
  await using git = await tempRepository();
  await git.commits.create("initial", { allowEmpty: true });
  git.commits.create("feat(name): introduce", {
    allowEmpty: true,
  });
  await git.commits.create("fix(name): fix code", {
    allowEmpty: true,
  });
  const commit = await git.commits.create("refactor(name)!: breaking", {
    allowEmpty: true,
  });
  await git.commits.create("docs(name): add docs", {
    allowEmpty: true,
  });
  const pkg = await testPackage(git.path(), { name: "@scope/name" });
  assertEquals(
    await changelog(pkg, { breaking: true }),
    [conventional(commit)],
  );
});

Deno.test("changelog() returns from range", async () => {
  await using git = await tempRepository();
  await git.commits.create("initial", { allowEmpty: true });
  const from = await git.commits.create("feat(name): introduce", {
    allowEmpty: true,
  });
  await git.commits.create("fix(other): fix other", { allowEmpty: true });
  await git.commits.create("ci: unrelated", { allowEmpty: true });
  const to = await git.commits.create("fix(name): fix code", {
    allowEmpty: true,
  });
  await git.commits.create("docs(name): add docs", {
    allowEmpty: true,
  });
  const pkg = await testPackage(git.path(), { name: "@scope/name" });
  assertEquals(
    await changelog(pkg, { range: { from, to } }),
    [conventional(to)],
  );
});
