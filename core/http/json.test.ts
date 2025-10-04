import { mockFetch } from "@roka/http/testing";
import { assertSnapshot } from "@std/testing/snapshot";
import { client } from "./json.ts";

Deno.test("client() can make requests", async (t) => {
  let issue: Partial<{ number: number; state: string }>;
  using _fetch = mockFetch(t);
  const token = _fetch.mode === "update"
    ? Deno.env.get("GITHUB_TOKEN") ?? ""
    : "token";
  const api = client("https://api.github.com", { token });
  await t.step("post", async (t) => {
    issue = await api.post(
      "/repos/withroka/test/issues",
      { body: { title: "Test issue" } },
    );
    await assertSnapshot(t, issue);
  });
  await t.step("get", async (t) => {
    issue = await api
      .get(`/repos/withroka/test/issues/${issue?.number}`);
    await assertSnapshot(t, issue);
  });
  await t.step("put", async (t) => {
    const result = await api.put(
      `/repos/withroka/test/issues/${issue?.number}/lock`,
      { body: { lock_reason: "resolved" } },
    );
    await assertSnapshot(t, result);
  });
  await t.step("delete", async (t) => {
    const result = await api.delete(
      `/repos/withroka/test/issues/${issue?.number}/lock`,
    );
    await assertSnapshot(t, result);
  });
  await t.step("patch", async (t) => {
    issue = await api.patch(
      `/repos/withroka/test/issues/${issue?.number}`,
      { body: { state: "closed" } },
    );
    await assertSnapshot(t, issue);
  });
});
