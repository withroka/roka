import { changelog } from "@roka/forge/changelog";
import { packageInfo } from "@roka/forge/package";
import { tempRepository } from "@roka/git/testing";
import { assertEquals } from "@std/assert";

Deno.test("changelog() provides package changelog", async () => {
  await using repo = await tempRepository();
  const config = { name: "@scope/module", version: "0.0.0" };
  await Deno.writeTextFile(repo.path("deno.json"), JSON.stringify(config));
  await repo.index.add("deno.json");
  await repo.commits.create("feat(module): introduce module");
  await Deno.writeTextFile(repo.path("fix.ts"), "//fix");
  await repo.index.add("fix.ts");
  await repo.commits.create("fix(module): fix module");
  await Deno.writeTextFile(repo.path("README.md"), "docs");
  await repo.index.add("README.md");
  await repo.commits.create("docs(module): add docs");
  const pkg = await packageInfo({ directory: repo.path() });
  assertEquals(
    changelog(pkg),
    [
      " * docs(module): add docs",
      " * fix(module): fix module",
      " * feat(module): introduce module",
    ].join("\n"),
  );
});
