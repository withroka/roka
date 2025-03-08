import { compile } from "@roka/forge/compile";
import { PackageError, packageInfo } from "@roka/forge/package";
import { tempRepository } from "@roka/git/testing";
import {
  assertEquals,
  assertExists,
  assertMatch,
  assertRejects,
} from "@std/assert";
import { copy } from "@std/fs";
import { basename, dirname } from "@std/path";

const IMPORT_MAP = {
  "@std/assert": "jsr:@std/assert",
  "@std/async": "jsr:@std/async",
  "@std/collections": "jsr:@std/collections",
  "@std/fs": "jsr:@std/fs",
  "@std/path": "jsr:@std/path",
  "@std/semver": "jsr:@std/semver",
  "@roka/async/pool": "./roka/core/async/pool.ts",
  "@roka/git": "./roka/core/git/git.ts",
  "@roka/git/conventional": "./roka/core/git/conventional.ts",
  "@roka/forge/package": "./roka/tool/forge/package.ts",
  "@roka/forge/version": "./roka/tool/forge/version.ts",
};

Deno.test("compile() rejects package without compile config", async () => {
  await using repo = await tempRepository();
  const config = { name: "@scope/name", version: "0.0.0" };
  await Deno.writeTextFile(repo.path("deno.json"), JSON.stringify(config));
  const pkg = await packageInfo({ directory: repo.path() });
  await assertRejects(() => compile(pkg), PackageError);
});

Deno.test("compile() compiles into a binary", async () => {
  await using repo = await tempRepository();
  // make a copy of the roka repository for testing local changes
  await copy(dirname(dirname(import.meta.dirname ?? ".")), repo.path("roka"));
  const config = {
    name: "@scope/name",
    version: "1.2.3",
    compile: { main: "./main.ts", permissions: { prompt: true } },
    exports: { ".": "./main.ts" },
    imports: IMPORT_MAP,
  };
  await Deno.writeTextFile(repo.path("deno.json"), JSON.stringify(config));
  await Deno.writeTextFile(
    repo.path("main.ts"),
    [
      'import { version } from "@roka/forge/version";',
      "console.log(await version());",
    ].join("\n"),
  );
  const pkg = await packageInfo({ directory: repo.path() });
  const artifacts = await compile(pkg, { dist: repo.path("dist") });
  assertExists(artifacts[0]);
  assertEquals(basename(artifacts[0]), "name");
  const command = new Deno.Command(artifacts[0], { stderr: "inherit" });
  const { code, stdout } = await command.output();
  assertEquals(code, 0);
  assertEquals(new TextDecoder().decode(stdout), "1.2.3\n");
});

Deno.test("compile() can create release bundles", async () => {
  await using repo = await tempRepository();
  // make a copy of the roka repository for testing local changes
  await copy(dirname(dirname(import.meta.dirname ?? ".")), repo.path("roka"));
  const config = {
    name: "@scope/name",
    version: "1.2.3",
    compile: { main: "./main.ts", permissions: { prompt: true } },
    exports: { ".": "./main.ts" },
    imports: IMPORT_MAP,
  };
  await Deno.writeTextFile(repo.path("deno.json"), JSON.stringify(config));
  await Deno.writeTextFile(
    repo.path("main.ts"),
    [
      'import { version } from "@roka/forge/version";',
      "console.log(await version());",
    ].join("\n"),
  );
  const pkg = await packageInfo({ directory: repo.path() });
  const artifacts = await compile(pkg, {
    dist: repo.path("dist"),
    bundle: true,
    checksum: true,
    target: ["x86_64-unknown-linux-gnu", "x86_64-pc-windows-msvc"],
  });
  assertEquals(artifacts.map((x) => basename(x)), [
    "x86_64-unknown-linux-gnu.tar.gz",
    "x86_64-pc-windows-msvc.zip",
    "sha256.txt",
  ]);
  const checksumFile = artifacts.pop();
  assertExists(checksumFile);
  const checksumContent = await Deno.readTextFile(checksumFile);
  assertMatch(
    checksumContent,
    /[A-Fa-f0-9]{64}\s+x86_64-unknown-linux-gnu.tar.gz/,
  );
  assertMatch(
    checksumContent,
    /[A-Fa-f0-9]{64}\s+x86_64-pc-windows-msvc.zip/,
  );
});
