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

Deno.test("tempDirectory({ chdir: true }) changes working directory", async () => {
  const originalCwd = Deno.cwd();
  let tempPath: string;

  {
    await using dir = await tempDirectory({ chdir: true });
    tempPath = dir.path();
    assertEquals(Deno.cwd(), tempPath);

    // Test that we can create files in the current directory
    await Deno.writeTextFile("test.txt", "Hello, world!");
    assertEquals(await Deno.readTextFile("test.txt"), "Hello, world!");
  }

  // Should be restored after disposal
  assertEquals(Deno.cwd(), originalCwd);
});

Deno.test("tempDirectory({ chdir: true }) without chdir option preserves cwd", async () => {
  const originalCwd = Deno.cwd();

  {
    await using dir = await tempDirectory();
    assertEquals(Deno.cwd(), originalCwd);
    // Directory should still be created at a different path
    assertEquals((await Deno.stat(dir.path())).isDirectory, true);
  }

  assertEquals(Deno.cwd(), originalCwd);
});

Deno.test("tempDirectory({ chdir: false }) preserves cwd", async () => {
  const originalCwd = Deno.cwd();

  {
    await using dir = await tempDirectory({ chdir: false });
    assertEquals(Deno.cwd(), originalCwd);
    assertEquals((await Deno.stat(dir.path())).isDirectory, true);
  }

  assertEquals(Deno.cwd(), originalCwd);
});

Deno.test("tempDirectory({ chdir: true }) can create nested files", async () => {
  const originalCwd = Deno.cwd();

  {
    await using dir = await tempDirectory({ chdir: true });
    assertEquals(Deno.cwd(), dir.path());

    // Create a file using relative path (since we're in the temp dir)
    await Deno.writeTextFile("nested.txt", "content");
    // Verify it exists using the absolute path
    assertEquals(
      await Deno.readTextFile(dir.path("nested.txt")),
      "content",
    );
  }

  assertEquals(Deno.cwd(), originalCwd);
});
