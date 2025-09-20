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
    assertEquals(Deno.cwd(), directory.path());
    await Deno.writeTextFile("test.txt", "Hello, world!");
    assertEquals(await Deno.readTextFile("test.txt"), "Hello, world!");
    assertEquals(
      await Deno.readTextFile(directory.path("test.txt")),
      "Hello, world!",
    );
  }
  assertEquals(Deno.cwd(), cwd);
});
