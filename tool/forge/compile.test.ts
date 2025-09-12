import { tempDirectory } from "@roka/testing/temp";
import {
  assertEquals,
  assertExists,
  assertMatch,
  assertRejects,
} from "@std/assert";
import { basename, dirname, join } from "@std/path";
import { compile } from "./compile.ts";
import { PackageError } from "./package.ts";
import { tempPackage, unstableTestImports } from "./testing.ts";

Deno.test("compile() rejects package without compile config", async () => {
  await using pkg = await tempPackage({
    config: {
      name: "@scope/name",
      version: "0.0.0",
    },
  });
  await assertRejects(() => compile(pkg), PackageError);
});

Deno.test("compile() compiles and installs a binary", async () => {
  await using install = await tempDirectory();
  const config = {
    name: "@scope/name",
    version: "1.2.3",
    forge: { main: "./main.ts" },
    compile: { permissions: { write: false, read: ["."], env: ["HOME"] } },
    exports: { ".": "./main.ts" },
    imports: await unstableTestImports(),
  };
  await using pkg = await tempPackage({
    config,
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
    install: install.path(),
  });
  assertExists(artifacts[0]);
  assertEquals(basename(artifacts[0]), "name");
  assertExists(await Deno.stat(artifacts[0]));
  assertExists(await Deno.stat(install.path("name")));
  assertEquals(
    new TextDecoder().decode(await Deno.readFile(install.path("name"))),
    new TextDecoder().decode(await Deno.readFile(artifacts[0])),
  );
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
      forge: { main: "./main.ts" },
      exports: { ".": "./main.ts" },
      imports: await unstableTestImports(),
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

Deno.test("compile() rejects code with errors", async () => {
  const config = { forge: { main: "./main.ts" } };
  await using pkg = await tempPackage({ config });
  await Deno.writeTextFile(
    join(pkg.directory, "main.ts"),
    [
      "#include <iostream>",
      'int main() { std::cout << "Hello, World!"; return 0; }',
    ].join("\n"),
  );
  await assertRejects(
    () => compile(pkg, { concurrency: 1, dist: join(pkg.directory, "dist") }),
  );
});
