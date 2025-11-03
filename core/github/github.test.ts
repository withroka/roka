import { assertArrayObjectMatch } from "@roka/assert";
import { tempDirectory } from "@roka/fs/temp";
import { tempRepository } from "@roka/git/testing";
import { mockFetch } from "@roka/http/testing";
import type { Mock } from "@roka/testing/mock";
import { assertEquals, assertExists, assertObjectMatch } from "@std/assert";
import { github, type PullRequest, type Release } from "./github.ts";

function token(mock?: Mock<typeof fetch>) {
  return mock?.mode === "update" ? Deno.env.get("GITHUB_TOKEN") ?? "" : "token";
}

Deno.test("github().repos.get() uses a named repository", () => {
  const repo = github({ token: token() }).repos.get("withroka", "test");
  assertObjectMatch(repo, { owner: "withroka", repo: "test" });
});

Deno.test("github().repos.get({ directory }) uses a local repository", async () => {
  await using git = await tempRepository();
  await git.remote.add(
    "origin",
    new URL("https://github.com/withroka/test.git"),
  );
  const repo = await github({ token: token() }).repos.get({
    directory: git.path(),
  });
  assertObjectMatch(repo, { owner: "withroka", repo: "test" });
});

Deno.test("github().repos.get().pulls", async (t) => {
  using _fetch = mockFetch(t, { ignore: { headers: true } });
  const repo = github({ token: token(_fetch) }).repos.get("withroka", "test");
  let pull: PullRequest;

  await t.step("create pull request", async () => {
    pull = await repo.pulls.create({
      head: "test-branch",
      base: "main",
      title: "Test PR",
      body: "Initial body",
    });
    assertObjectMatch(pull, {
      head: "test-branch",
      base: "main",
      title: "Test PR",
      body: "Initial body",
    });
  });

  await t.step("list pull requests", async () => {
    const pulls = await repo.pulls.list({
      head: "test-branch",
      closed: false,
    });
    assertArrayObjectMatch(pulls, [{
      head: "test-branch",
      base: "main",
      title: "Test PR",
      body: "Initial body",
    }]);
  });

  await t.step("update and close pull request", async () => {
    pull = await pull.update({ title: "Closed PR", body: "Updated body" });
    assertObjectMatch(pull, {
      title: "Closed PR",
      body: "Updated body",
    });
  });

  await t.step("close pull request", async () => {
    pull = await pull.update({ closed: true });
    const pulls = await repo.pulls.list({
      head: "test-branch",
      closed: false,
    });
    assertEquals(pulls, []);
  });
});

Deno.test("github().repos.get().releases", async (t) => {
  using _fetch = mockFetch(t, { ignore: { headers: true } });
  const repo = github({ token: token(_fetch) }).repos.get("withroka", "test");
  let release: Release;

  await t.step("create release", async () => {
    release = await repo.releases.create("test-tag", {
      name: "Test release",
      body: "Initial body",
      draft: true,
      prerelease: false,
    });
    assertObjectMatch(release, {
      tag: "test-tag",
      name: "Test release",
      body: "Initial body",
      draft: true,
      prerelease: false,
    });
  });

  await t.step("list releases", async () => {
    while (true) {
      // wait for the release to be available
      // deno-lint-ignore no-await-in-loop
      const releases = await repo.releases.list({ tag: "test-tag" });
      if (releases.length > 0) {
        assertEquals(releases.length, 1);
        assertExists(releases[0]);
        break;
      }
    }
    assertObjectMatch(release, {
      tag: "test-tag",
      name: "Test release",
      body: "Initial body",
      draft: true,
      prerelease: false,
    });
  });

  await t.step("update release", async () => {
    release = await release.update({
      name: "Updated release",
      body: "Updated body",
      draft: false,
      prerelease: true,
    });
    assertObjectMatch(release, {
      tag: "test-tag",
      name: "Updated release",
      body: "Updated body",
      draft: false,
      prerelease: true,
    });
  });

  await t.step("upload release asset", async () => {
    await using directory = await tempDirectory();
    await Deno.writeTextFile(directory.path("file.txt"), "content");
    const asset = await release.assets.upload(directory.path("file.txt"));
    assertObjectMatch(asset, {
      release,
      name: "file.txt",
      size: "content".length,
    });
  });

  await t.step("list release asset", async () => {
    const assets = await release.assets.list();
    assertArrayObjectMatch(assets, [{
      name: "file.txt",
      size: "content".length,
    }]);
  });

  await t.step("delete release", async () => {
    await release.delete();
    const releases = await repo.releases.list();
    assertEquals(releases, []);
  });
});
