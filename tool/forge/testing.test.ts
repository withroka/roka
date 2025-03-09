import { tempPackage, testPackage } from "@roka/forge/testing";
import { tempDirectory } from "@roka/testing/temp";
import { assertEquals } from "@std/assert";

Deno.test("testPackage() creates a package at given directory", async () => {
  await using directory = await tempDirectory();
  const pkg = await testPackage(directory.path("subdirectory"), {
    name: "@scope/name",
    version: "1.2.3",
  });
  assertEquals(pkg.directory, directory.path("subdirectory"));
  assertEquals(pkg.name, "name");
  assertEquals(pkg.version, "1.2.3");
});

Deno.test("tempPackage() creates a disposable package", async () => {
  await using pkg = await tempPackage({
    name: "@scope/name",
    version: "1.2.3",
  });
  assertEquals(pkg.name, "name");
  assertEquals(pkg.version, "1.2.3");
});
