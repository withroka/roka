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
