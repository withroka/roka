import { runtime } from "@roka/runtime";
import { test } from "@roka/testing/test";
import { assertEquals, assertNotEquals, assertRejects } from "@std/assert";
import { readDir } from "@std/fs/unstable-read-dir";
import { readTextFile } from "@std/fs/unstable-read-text-file";
import { realPath } from "@std/fs/unstable-real-path";
import { stat } from "@std/fs/unstable-stat";
import { writeTextFile } from "@std/fs/unstable-write-text-file";
import { tempDirectory } from "./temp.ts";

test("tempDirectory() creates a disposable directory", async () => {
  const cwd = runtime.cwd();
  let path: string;
  {
    await using directory = await tempDirectory();
    path = directory.path();
    assertEquals((await stat(path)).isDirectory, true);
    assertEquals(await Array.fromAsync(readDir(path)), []);
    assertEquals(runtime.cwd(), cwd);
  }
  await assertRejects(() => stat(path));
  assertEquals(runtime.cwd(), cwd);
});

test("tempDirectory({ chdir }) changes working directory", async () => {
  const cwd = runtime.cwd();
  {
    await using directory = await tempDirectory({ chdir: true });
    assertEquals(
      await realPath(runtime.cwd()),
      await realPath(directory.path()),
    );
    await writeTextFile("test.txt", "Hello, world!");
    assertEquals(
      await readTextFile(directory.path("test.txt")),
      "Hello, world!",
    );
  }
  assertEquals(runtime.cwd(), cwd);
});

test("tempDirectory({ chdir }) works recursively", async () => {
  const cwd = runtime.cwd();
  {
    await using outer = await tempDirectory({ chdir: true });
    assertEquals(
      await realPath(runtime.cwd()),
      await realPath(outer.path()),
    );
    {
      await using inner = await tempDirectory({ chdir: true });
      assertNotEquals(
        await realPath(inner.path()),
        await realPath(outer.path()),
      );
      assertEquals(
        await realPath(runtime.cwd()),
        await realPath(inner.path()),
      );
    }
    assertEquals(
      await realPath(runtime.cwd()),
      await realPath(outer.path()),
    );
  }
  assertEquals(runtime.cwd(), cwd);
});
