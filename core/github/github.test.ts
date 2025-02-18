import { github, type PullRequest, type Release } from "@roka/github";
import { mockFetch } from "@roka/testing";
import { assert } from "@std/assert/assert";
import { assertEquals } from "@std/assert/equals";

const token = Deno.env.get("GITHUB_TOKEN") ?? "TOKEN";

Deno.test("github().repo().pulls", async (t) => {
  using _fetch = mockFetch(t);
  const repo = github({ token }).repo("withroka", "test");
  let pr: PullRequest;

  await t.step("create pull request", async () => {
    pr = await repo.pulls.create({
      head: "test-branch",
      base: "main",
      title: "Test PR",
      body: "Initial body",
    });
    assertEquals(pr.head, "test-branch");
    assertEquals(pr.base, "main");
    assertEquals(pr.title, "Test PR");
    assertEquals(pr.body, "Initial body");
  });

  await t.step("list pull requests", async () => {
    const prs = await repo.pulls.list({ head: "test-branch", isClosed: false });
    assertEquals(prs.length, 1);
    assert(prs[0]);
    assertEquals(prs[0].head, "test-branch");
    assertEquals(prs[0].base, "main");
    assertEquals(prs[0].title, "Test PR");
    assertEquals(prs[0].body, "Initial body");
  });

  await t.step("update and close pull request", async () => {
    pr = await pr.update({ title: "Closed PR", body: "Updated body" });
    assertEquals(pr.title, "Closed PR");
    assertEquals(pr.body, "Updated body");
  });

  await t.step("close pull request", async () => {
    pr = await pr.update({ isClosed: true });
    const prs = await repo.pulls.list({ head: "test-branch", isClosed: false });
    assertEquals(prs, []);
  });
});

Deno.test("github().repo().releases", async (t) => {
  using _fetch = mockFetch(t);
  const repo = github({ token }).repo("withroka", "test");
  let release: Release;

  await t.step("create release", async () => {
    release = await repo.releases.create("test-tag", {
      name: "Test release",
      body: "Initial body",
      isDraft: true,
      isPreRelease: false,
    });
    assertEquals(release.tag, "test-tag");
    assertEquals(release.name, "Test release");
    assertEquals(release.body, "Initial body");
    assertEquals(release.isDraft, true);
    assertEquals(release.isPreRelease, false);
  });

  await t.step("list releases", async () => {
    while (true) {
      // wait for the release to be available
      const releases = await repo.releases.list({ tag: "test-tag" });
      if (releases.length > 0) {
        assert(releases.length === 1);
        assert(releases[0]);
        break;
      }
    }
    assertEquals(release.tag, "test-tag");
    assertEquals(release.name, "Test release");
    assertEquals(release.body, "Initial body");
    assertEquals(release.isDraft, true);
    assertEquals(release.isPreRelease, false);
  });

  await t.step("update release", async () => {
    release = await release.update({
      name: "Updated release",
      body: "Updated body",
      isDraft: false,
      isPreRelease: true,
    });
    assertEquals(release.tag, "test-tag");
    assertEquals(release.name, "Updated release");
    assertEquals(release.body, "Updated body");
    assertEquals(release.isDraft, false);
    assertEquals(release.isPreRelease, true);
  });

  await t.step("delete release", async () => {
    await release.delete();
    const releases = await repo.releases.list();
    assertEquals(releases, []);
  });
});
