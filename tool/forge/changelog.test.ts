import { changelog } from "@roka/forge/changelog";
import { packageInfo } from "@roka/forge/package";
import { tempRepository } from "@roka/git/testing";
import { assertEquals } from "@std/assert";
import { testPackage } from "./testing.ts";

Deno.test("changelog() provides package changelog", async () => {
  await using repo = await tempRepository();
  await repo.commits.create("initial", { allowEmpty: true });
  await repo.tags.create("name@0.1.0");
  testPackage(repo.path(), { name: "@scope/name", version: "0.1.0" });
  await repo.commits.create("feat(name): introduce", { allowEmpty: true });
  await Deno.writeTextFile(repo.path("fix.ts"), "//fix");
  await repo.index.add("fix.ts");
  await repo.commits.create("fix(name): fix code");
  await Deno.writeTextFile(repo.path("README.md"), "docs");
  await repo.index.add("README.md");
  await repo.commits.create("docs(name): add docs");
  await repo.commits.create("refactor(name)!: rewrite", { allowEmpty: true });
  const pkg = await packageInfo({ directory: repo.path() });
  assertEquals(
    changelog(pkg),
    [
      " * refactor(name)!: rewrite",
      " * fix(name): fix code",
      " * feat(name): introduce",
    ].join("\n"),
  );
});
