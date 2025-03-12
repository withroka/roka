import { compile } from "@roka/forge/compile";
import { PackageError } from "@roka/forge/package";
import {
  assertEquals,
  assertExists,
  assertMatch,
  assertRejects,
} from "@std/assert";
import { basename, dirname, join } from "@std/path";
import { tempPackage } from "./testing.ts";

const IMPORT_MAP = {
  "@std/assert": "jsr:@std/assert",
  "@std/async": "jsr:@std/async",
  "@std/collections": "jsr:@std/collections",
  "@std/fs": "jsr:@std/fs",
  "@std/path": "jsr:@std/path",
  "@std/semver": "jsr:@std/semver",
  "@roka/async/pool": "./core/async/pool.ts",
  "@roka/git": "./core/git/git.ts",
  "@roka/git/conventional": "./core/git/conventional.ts",
  "@roka/forge/changelog": "./tool/forge/changelog.ts",
  "@roka/forge/package": "./tool/forge/package.ts",
  "@roka/forge/version": "./tool/forge/version.ts",
};

Deno.test("compile() rejects package without compile config", async () => {
  await using pkg = await tempPackage({
    config: {
      name: "@scope/name",
      version: "0.0.0",
    },
  });
  await assertRejects(() => compile(pkg), PackageError);
});

Deno.test("compile() compiles into a binary", async () => {
  await using pkg = await tempPackage({
    config: {
      name: "@scope/name",
      version: "1.2.3",
      compile: { main: "./main.ts", permissions: { prompt: true } },
      exports: { ".": "./main.ts" },
      imports: IMPORT_MAP,
    },
    repo: {
      // run this test inside a clone of roka repository
      // so we can test local changes to the version import below
      clone: dirname(dirname(import.meta.dirname ?? ".")),
    },
  });
  await Deno.writeTextFile(
    join(pkg.directory, "main.ts"),
    [
      'import { version } from "@roka/forge/version";',
      "console.log(await version());",
    ].join("\n"),
  );
  const artifacts = await compile(pkg, { dist: join(pkg.directory, "dist") });
  assertExists(artifacts[0]);
  assertEquals(basename(artifacts[0]), "name");
  const command = new Deno.Command(artifacts[0], { stderr: "inherit" });
  const { code, stdout } = await command.output();
  assertEquals(code, 0);
  assertEquals(new TextDecoder().decode(stdout), "1.2.3\n");
});

Deno.test("compile() can create release bundles", async () => {
  await using pkg = await tempPackage({
    config: {
      name: "@scope/name",
      version: "1.2.3",
      compile: { main: "./main.ts", permissions: { prompt: true } },
      exports: { ".": "./main.ts" },
      imports: IMPORT_MAP,
    },
    repo: {
      // run this test inside a clone of roka repository
      // so we can test local changes to the version import below
      clone: dirname(dirname(import.meta.dirname ?? ".")),
    },
  });
  await Deno.writeTextFile(
    join(pkg.directory, "main.ts"),
    [
      'import { version } from "@roka/forge/version";',
      "console.log(await version());",
    ].join("\n"),
  );
  const artifacts = await compile(pkg, {
    dist: join(pkg.directory, "dist"),
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
