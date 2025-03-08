import {
  fakePullRequest,
  fakeRelease,
  fakeReleaseAsset,
  fakeRepository,
} from "@roka/github/testing";
import { assertEquals, assertExists, assertNotEquals } from "@std/assert";

Deno.test("fakeRepository() creates a repository with default data", () => {
  const repo = fakeRepository();
  assertExists(repo.url);
  assertExists(repo.owner);
  assertExists(repo.repo);
});

Deno.test("fakeRepository() creates a repository with custom data", () => {
  const repo = fakeRepository({
    url: "custom-url",
    owner: "custom-owner",
    repo: "custom-repo",
  });
  assertEquals(repo.url, "custom-url");
  assertEquals(repo.owner, "custom-owner");
  assertEquals(repo.repo, "custom-repo");
});

Deno.test("fakeRepository() manages pull requests", async () => {
  const repo = fakeRepository();
  assertEquals(await repo.pulls.list(), []);
  const pull = await repo.pulls.create({ title: "test pull" });
  assertEquals(pull.title, "test pull");
  assertEquals(pull.repo, repo);
  assertEquals(await repo.pulls.list(), [pull]);
  const another = await repo.pulls.create({ title: "another pull" });
  assertNotEquals(pull.number, another.number);
  assertEquals(await repo.pulls.list(), [pull, another]);
});

Deno.test("fakeRepository() manages releases", async () => {
  const repo = fakeRepository();
  assertEquals(await repo.releases.list(), []);
  const release = await repo.releases.create("1.0.0");
  assertEquals(release.tag, "1.0.0");
  assertEquals(release.repo, repo);
  assertEquals(await repo.releases.list(), [release]);
  const another = await repo.releases.create("1.1.0");
  assertNotEquals(release.id, another.id);
  assertEquals(await repo.releases.list(), [release, another]);
  await release.delete();
  assertEquals(await repo.releases.list(), [another]);
  await another.delete();
  assertEquals(await repo.releases.list(), []);
});

Deno.test("fakePullRequest() creates a pull request with default data", () => {
  const pull = fakePullRequest();
  assertExists(pull.repo);
  assertExists(pull.url);
  assertExists(pull.number);
  assertExists(pull.title);
  assertExists(pull.body);
  assertExists(pull.head);
  assertExists(pull.base);
});

Deno.test("fakePullRequest() creates a pull request with custom data", () => {
  const repo = fakeRepository();
  const pull = fakePullRequest({
    repo,
    url: "custom-url",
    number: 42,
    title: "custom-title",
    body: "custom-body",
    head: "custom-head",
    base: "custom-base",
    draft: true,
    closed: true,
    locked: true,
  });
  assertEquals(pull.repo, repo);
  assertEquals(pull.url, "custom-url");
  assertEquals(pull.number, 42);
  assertEquals(pull.title, "custom-title");
  assertEquals(pull.body, "custom-body");
  assertEquals(pull.head, "custom-head");
  assertEquals(pull.base, "custom-base");
  assertEquals(pull.draft, true);
  assertEquals(pull.closed, true);
  assertEquals(pull.locked, true);
});

Deno.test("fakePullRequest() can update data", async () => {
  const pull = fakePullRequest({ title: "title", body: "body", closed: false });
  assertEquals(pull.title, "title");
  assertEquals(pull.body, "body");
  assertEquals(pull.closed, false);
  await pull.update({ title: "new title", closed: true });
  assertEquals(pull.title, "new title");
  assertEquals(pull.body, "body");
  assertEquals(pull.closed, true);
});

Deno.test("fakeRelease() creates a release with default data", () => {
  const release = fakeRelease();
  assertExists(release.repo);
  assertExists(release.url);
  assertExists(release.id);
  assertExists(release.name);
  assertExists(release.tag);
  assertExists(release.commit);
  assertExists(release.body);
});

Deno.test("fakeRelease() creates a release with custom data", () => {
  const repo = fakeRepository();
  const release = fakeRelease({
    repo,
    url: "custom-url",
    id: 42,
    name: "custom-name",
    tag: "custom-tag",
    commit: "custom-commit",
    body: "custom-body",
    draft: true,
    preRelease: true,
  });
  assertEquals(release.repo, repo);
  assertEquals(release.url, "custom-url");
  assertEquals(release.id, 42);
  assertEquals(release.name, "custom-name");
  assertEquals(release.tag, "custom-tag");
  assertEquals(release.commit, "custom-commit");
  assertEquals(release.body, "custom-body");
  assertEquals(release.draft, true);
  assertEquals(release.preRelease, true);
});

Deno.test("fakeRelease() can update data", async () => {
  const release = fakeRelease({ tag: "tag", name: "name", draft: true });
  assertEquals(release.tag, "tag");
  assertEquals(release.name, "name");
  assertEquals(release.draft, true);
  await release.update({ name: "new name", draft: false });
  assertEquals(release.tag, "tag");
  assertEquals(release.name, "new name");
  assertEquals(release.draft, false);
});

Deno.test("fakeRelease() manages assets", async () => {
  const release = fakeRelease();
  assertEquals(await release.assets.list(), []);
  const asset = await release.assets.upload("file.txt");
  assertEquals(asset.name, "file.txt");
  assertEquals(asset.release, release);
  assertEquals(await release.assets.list(), [asset]);
  const another = await release.assets.upload("data.json");
  assertNotEquals(asset.id, another.id);
  assertEquals(await release.assets.list(), [asset, another]);
  await asset.delete();
  assertEquals(await release.assets.list(), [another]);
  await another.delete();
  assertEquals(await release.assets.list(), []);
});

Deno.test("fakeReleaseAsset() creates asset with default values", () => {
  const asset = fakeReleaseAsset();
  assertExists(asset.release);
  assertExists(asset.url);
  assertExists(asset.id);
  assertExists(asset.name);
  assertExists(asset.size);
  assertExists(asset.downloadCount);
});

Deno.test("fakeReleaseAsset() creates asset with custom values", () => {
  const release = fakeRelease({ tag: "custom-tag" });
  const asset = fakeReleaseAsset({
    release,
    url: "custom-url",
    id: 42,
    name: "custom-name",
    size: 1024,
    downloadCount: 100,
  });
  assertEquals(asset.release, release);
  assertEquals(asset.url, "custom-url");
  assertEquals(asset.id, 42);
  assertEquals(asset.name, "custom-name");
  assertEquals(asset.size, 1024);
  assertEquals(asset.downloadCount, 100);
});
