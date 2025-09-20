import { assertEquals, assertRejects } from "@std/assert";
import { tempDirectory } from "./temp.ts";

Deno.test("tempDirectory() creates a disposable directory", async () => {
  let path: string;
  {
    await using directory = await tempDirectory();
    path = directory.path();
    assertEquals((await Deno.stat(path)).isDirectory, true);
    assertEquals(await Array.fromAsync(Deno.readDir(path)), []);
  }
  await assertRejects(() => Deno.stat(path), Deno.errors.NotFound);
});

Deno.test("tempDirectory.chdir() temporarily changes working directory", async () => {
  const originalCwd = Deno.cwd();
  await using directory = await tempDirectory();
  const tempPath = directory.path();

  {
    using cwd = directory.chdir();
    assertEquals(Deno.cwd(), tempPath);
    assertEquals(cwd.restored, false);

    // Test that we can create files in the current directory
    await Deno.writeTextFile("test.txt", "Hello, world!");
    assertEquals(await Deno.readTextFile("test.txt"), "Hello, world!");
  }

  // Should be restored after disposal
  assertEquals(Deno.cwd(), originalCwd);
});

Deno.test("tempDirectory.chdir() can be manually restored", async () => {
  const originalCwd = Deno.cwd();
  await using directory = await tempDirectory();
  const tempPath = directory.path();

  const cwd = directory.chdir();
  assertEquals(Deno.cwd(), tempPath);
  assertEquals(cwd.restored, false);

  cwd.restore();
  assertEquals(Deno.cwd(), originalCwd);
  assertEquals(cwd.restored, true);

  // Should throw if restored again
  try {
    cwd.restore();
    throw new Error("Expected error but none was thrown");
  } catch (error) {
    assertEquals(
      (error as Error).message,
      "Cannot restore: chdir already restored",
    );
  }
});

Deno.test("tempDirectory.chdir() integrates with using statement", async () => {
  const originalCwd = Deno.cwd();
  await using directory = await tempDirectory();
  const tempPath = directory.path();

  {
    using _cwd = directory.chdir();
    assertEquals(Deno.cwd(), tempPath);

    // Create a file to verify we're in the right directory
    await Deno.writeTextFile("nested.txt", "content");
    assertEquals(
      await Deno.readTextFile(directory.path("nested.txt")),
      "content",
    );
  }

  // Should restore automatically
  assertEquals(Deno.cwd(), originalCwd);
});

Deno.test("tempDirectory.chdir() restored property works correctly", async () => {
  const _originalCwd = Deno.cwd();
  await using directory = await tempDirectory();

  const cwd = directory.chdir();
  assertEquals(cwd.restored, false);

  cwd.restore();
  assertEquals(cwd.restored, true);
});
