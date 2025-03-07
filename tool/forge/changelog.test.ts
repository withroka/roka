import { changelog } from "@roka/forge/changelog";
import { packageInfo } from "@roka/forge/package";
import { tempRepository } from "@roka/git/testing";
import { assertEquals } from "@std/assert";

Deno.test("changelog() provides package changelog", async () => {
  await using repo = await tempRepository();
  const config = { name: "@scope/name", version: "0.0.0" };
  await Deno.writeTextFile(repo.path("deno.json"), JSON.stringify(config));
  await repo.index.add("deno.json");
  await repo.commits.create("feat(name): introduce package");
  await Deno.writeTextFile(repo.path("fix.ts"), "//fix");
  await repo.index.add("fix.ts");
  await repo.commits.create("fix(name): fix code");
  await Deno.writeTextFile(repo.path("README.md"), "docs");
  await repo.index.add("README.md");
  await repo.commits.create("docs(name): add docs");
  const pkg = await packageInfo({ directory: repo.path() });
  assertEquals(
    changelog(pkg),
    [
      " * docs(name): add docs",
      " * fix(name): fix code",
      " * feat(name): introduce package",
    ].join("\n"),
  );
});
