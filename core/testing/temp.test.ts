import { tempDirectory } from "@roka/testing/temp";
import { assertEquals, assertRejects } from "@std/assert";

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
