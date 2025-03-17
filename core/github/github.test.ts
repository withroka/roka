import { tempRepository } from "@roka/git/testing";
import { mockFetch } from "@roka/http/testing";
import { tempDirectory } from "@roka/testing/temp";
import { assertEquals, assertExists } from "@std/assert";
import { github, type PullRequest, type Release } from "./github.ts";

const token = Deno.env.get("GITHUB_TOKEN") ?? "TOKEN";

Deno.test("github().repos.get() can use named repository", () => {
  const repo = github({ token }).repos.get("withroka", "test");
  assertEquals(repo.owner, "withroka");
  assertEquals(repo.repo, "test");
});

Deno.test("github().repos.get() can use local repository", async () => {
  await using git = await tempRepository();
  await git.remotes.add("https://github.com/withroka/test.git");
  const repo = await github({ token }).repos.get({ directory: git.path() });
  assertEquals(repo.owner, "withroka");
  assertEquals(repo.repo, "test");
});

Deno.test("github().repos.pulls", async (t) => {
  using _fetch = mockFetch(t, { ignore: { headers: true } });
  const repo = github({ token }).repos.get("withroka", "test");
  let pull: PullRequest;

  await t.step("create pull request", async () => {
    pull = await repo.pulls.create({
      head: "test-branch",
      base: "main",
      title: "Test PR",
      body: "Initial body",
    });
    assertEquals(pull.head, "test-branch");
    assertEquals(pull.base, "main");
    assertEquals(pull.title, "Test PR");
    assertEquals(pull.body, "Initial body");
  });

  await t.step("list pull requests", async () => {
    const pulls = await repo.pulls.list({
      head: "test-branch",
      closed: false,
    });
    assertEquals(pulls.length, 1);
    assertExists(pulls[0]);
    assertEquals(pulls[0].head, "test-branch");
    assertEquals(pulls[0].base, "main");
    assertEquals(pulls[0].title, "Test PR");
    assertEquals(pulls[0].body, "Initial body");
  });

  await t.step("update and close pull request", async () => {
    pull = await pull.update({ title: "Closed PR", body: "Updated body" });
    assertEquals(pull.title, "Closed PR");
    assertEquals(pull.body, "Updated body");
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

Deno.test("github().repos.releases", async (t) => {
  using _fetch = mockFetch(t, { ignore: { headers: true } });
  const repo = github({ token }).repos.get("withroka", "test");
  let release: Release;

  await t.step("create release", async () => {
    release = await repo.releases.create("test-tag", {
      name: "Test release",
      body: "Initial body",
      draft: true,
      prerelease: false,
    });
    assertEquals(release.repo, repo);
    assertEquals(release.tag, "test-tag");
    assertEquals(release.name, "Test release");
    assertEquals(release.body, "Initial body");
    assertEquals(release.draft, true);
    assertEquals(release.prerelease, false);
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
    assertEquals(release.tag, "test-tag");
    assertEquals(release.name, "Test release");
    assertEquals(release.body, "Initial body");
    assertEquals(release.draft, true);
    assertEquals(release.prerelease, false);
  });

  await t.step("update release", async () => {
    release = await release.update({
      name: "Updated release",
      body: "Updated body",
      draft: false,
      prerelease: true,
    });
    assertEquals(release.tag, "test-tag");
    assertEquals(release.name, "Updated release");
    assertEquals(release.body, "Updated body");
    assertEquals(release.draft, false);
    assertEquals(release.prerelease, true);
  });

  await t.step("upload release asset", async () => {
    await using directory = await tempDirectory();
    await Deno.writeTextFile(directory.path("file.txt"), "content");
    const asset = await release.assets.upload(directory.path("file.txt"));
    assertEquals(asset.release, release);
    assertEquals(asset.name, "file.txt");
    assertEquals(asset.size, "content".length);
  });

  await t.step("list release asset", async () => {
    const assets = await release.assets.list();
    assertEquals(assets.length, 1);
    assertExists(assets[0]);
    assertEquals(assets[0]?.name, "file.txt");
    assertEquals(assets[0]?.size, "content".length);
  });

  await t.step("delete release", async () => {
    await release.delete();
    const releases = await repo.releases.list();
    assertEquals(releases, []);
  });
});
