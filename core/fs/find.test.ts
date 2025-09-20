import { assertSameElements } from "@roka/assert";
import { pool } from "@roka/async/pool";
import { find } from "@roka/fs/find";
import { type TempDirectory, tempDirectory } from "@roka/fs/temp";
import { assertRejects } from "@std/assert";
import { distinct } from "@std/collections/distinct";
import { dirname } from "@std/path";

async function createFiles(dir: TempDirectory, files: string[]) {
  const directories = distinct(files.map(dirname)).filter((x) => x !== ".");
  await pool(directories, (x) => Deno.mkdir(dir.path(x), { recursive: true }));
  await Deno.writeTextFile(dir.path("a.txt"), "content");
  await pool(files, (x) => Deno.writeTextFile(dir.path(x), "content"));
}

Deno.test("find() return empty results for empty input", async () => {
  await using dir = await tempDirectory({ chdir: true });
  await createFiles(dir, ["a.txt", "b/c.txt", "d/e/f.txt"]);
  assertSameElements(await Array.fromAsync(find([])), []);
});

Deno.test("find() can find existing file", async () => {
  await using dir = await tempDirectory({ chdir: true });
  await createFiles(dir, ["a.txt"]);
  assertSameElements(await Array.fromAsync(find(["a.txt"])), [
    "a.txt",
  ]);
});

Deno.test("find() skips non-existing file", async () => {
  await using dir = await tempDirectory({ chdir: true });
  await createFiles(dir, ["a.txt"]);
  assertSameElements(await Array.fromAsync(find(["b.txt"])), []);
});

Deno.test("find() can reject non-existing file", async () => {
  await using dir = await tempDirectory({ chdir: true });
  await createFiles(dir, ["a.txt"]);
  assertRejects(
    () => Array.fromAsync(find(["b.txt"], { validate: true })),
    Deno.errors.NotFound,
  );
});

Deno.test("find() can find multiple files", async () => {
  await using dir = await tempDirectory({ chdir: true });
  await createFiles(dir, ["a.txt", "b.txt", "c.txt"]);
  assertSameElements(await Array.fromAsync(find(["b.txt", "c.txt", "d.txt"])), [
    "b.txt",
    "c.txt",
  ]);
});

Deno.test("find() can find existing directory", async () => {
  await using dir = await tempDirectory({ chdir: true });
  await createFiles(dir, ["dir/a.txt"]);
  assertSameElements(await Array.fromAsync(find(["dir"])), [
    "dir",
    "dir/a.txt",
  ]);
});

Deno.test("find() skips non-existing directory", async () => {
  await using dir = await tempDirectory({ chdir: true });
  await createFiles(dir, ["a.txt"]);
  assertSameElements(await Array.fromAsync(find(["dir"])), []);
});

Deno.test("find() can reject non-existing directory", async () => {
  await using dir = await tempDirectory({ chdir: true });
  await createFiles(dir, ["a.txt"]);
  assertRejects(
    () => Array.fromAsync(find(["dir"], { validate: true })),
    Deno.errors.NotFound,
  );
});

Deno.test("find() can find multiple directories", async () => {
  await using dir = await tempDirectory({ chdir: true });
  await createFiles(dir, ["a.txt", "dir1/b.txt", "dir2/c.txt"]);
  assertSameElements(await Array.fromAsync(find(["dir1", "dir2", "dir3"])), [
    "dir1",
    "dir1/b.txt",
    "dir2",
    "dir2/c.txt",
  ]);
});

Deno.test("find() rejects with AggregateError for multiple failures", async () => {
  await using dir = await tempDirectory({ chdir: true });
  await createFiles(dir, ["a.txt"]);
  assertRejects(
    () => Array.fromAsync(find(["b.txt", "c.txt"], { validate: true })),
    AggregateError,
  );
});

Deno.test("find() can find files and directories", async () => {
  await using dir = await tempDirectory({ chdir: true });
  await createFiles(dir, ["a.txt", "dir1/b.txt", "dir2/c.txt"]);
  assertSameElements(await Array.fromAsync(find(["a.txt", "dir1"])), [
    "a.txt",
    "dir1",
    "dir1/b.txt",
  ]);
});

Deno.test("find() can find in subdirectories", async () => {
  await using dir = await tempDirectory({ chdir: true });
  await createFiles(dir, ["a.txt", "b/c.txt", "d/e/f.txt"]);
  assertSameElements(await Array.fromAsync(find(["."])), [
    ".",
    "a.txt",
    "b",
    "b/c.txt",
    "d",
    "d/e",
    "d/e/f.txt",
  ]);
});
