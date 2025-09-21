import { assertEquals, assertRejects } from "@std/assert";
import { tempDirectory } from "./temp.ts";

Deno.test("tempDirectory() creates a disposable directory", async () => {
  const cwd = Deno.cwd();
  let path: string;
  {
    await using directory = await tempDirectory();
    path = directory.path();
    assertEquals((await Deno.stat(path)).isDirectory, true);
    assertEquals(await Array.fromAsync(Deno.readDir(path)), []);
    assertEquals(Deno.cwd(), cwd);
  }
  await assertRejects(() => Deno.stat(path), Deno.errors.NotFound);
  assertEquals(Deno.cwd(), cwd);
});

Deno.test("tempDirectory({ chdir: true }) changes working directory", async () => {
  const cwd = Deno.cwd();
  {
    await using directory = await tempDirectory({ chdir: true });
    assertEquals(
      await Deno.realPath(Deno.cwd()),
      await Deno.realPath(directory.path()),
    );
    await Deno.writeTextFile("test.txt", "Hello, world!");
    assertEquals(
      await Deno.readTextFile(directory.path("test.txt")),
      "Hello, world!",
    );
  }
  assertEquals(Deno.cwd(), cwd);
});

Deno.test("tempDirectory({ chdir: true }) works recursively", async () => {
  const originalCwd = Deno.cwd();
  {
    await using outerDirectory = await tempDirectory({ chdir: true });
    const outerPath = await Deno.realPath(Deno.cwd());
    assertEquals(outerPath, await Deno.realPath(outerDirectory.path()));

    await Deno.writeTextFile("outer.txt", "outer content");

    {
      await using innerDirectory = await tempDirectory({ chdir: true });
      const innerPath = await Deno.realPath(Deno.cwd());
      assertEquals(innerPath, await Deno.realPath(innerDirectory.path()));

      // Inner directory should be different from outer
      assertEquals(innerPath === outerPath, false);

      await Deno.writeTextFile("inner.txt", "inner content");
      assertEquals(await Deno.readTextFile("inner.txt"), "inner content");

      // Should not be able to see outer file directly
      await assertRejects(() => Deno.readTextFile("outer.txt"));
      // But should be able to access it via the outer directory path
      assertEquals(
        await Deno.readTextFile(outerDirectory.path("outer.txt")),
        "outer content",
      );
    }

    // After inner directory is disposed, should be back in outer directory
    assertEquals(
      await Deno.realPath(Deno.cwd()),
      await Deno.realPath(outerDirectory.path()),
    );
    assertEquals(await Deno.readTextFile("outer.txt"), "outer content");

    // Inner directory should be cleaned up
    await assertRejects(() => Deno.readTextFile("inner.txt"));
  }

  // After outer directory is disposed, should be back to original
  assertEquals(Deno.cwd(), originalCwd);
});
