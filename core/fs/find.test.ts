import { assertSameElements } from "@roka/assert";
import { pool } from "@roka/async/pool";
import { find } from "@roka/fs/find";
import { tempDirectory } from "@roka/fs/temp";
import { assert, assertEquals, assertRejects } from "@std/assert";
import { distinct } from "@std/collections/distinct";
import { dirname } from "@std/path";

async function createFiles(files: string[]) {
  const directories = distinct(files.map(dirname)).filter((x) => x !== ".");
  await pool(directories, (x) => Deno.mkdir(x, { recursive: true }));
  await pool(files, (x) => Deno.writeTextFile(x, "content"));
}

Deno.test("find() return empty results for empty input", async () => {
  await using _ = await tempDirectory({ chdir: true });
  await createFiles(["a.txt", "b/c.md", "d/e/f.txt"]);
  assertSameElements(await Array.fromAsync(find([])), []);
});

Deno.test("find() can find existing file", async () => {
  await using _ = await tempDirectory({ chdir: true });
  await createFiles(["a.txt"]);
  assertSameElements(await Array.fromAsync(find(["a.txt"])), [
    "a.txt",
  ]);
});

Deno.test("find() skips non-existing file", async () => {
  await using _ = await tempDirectory({ chdir: true });
  await createFiles(["a.txt"]);
  assertSameElements(await Array.fromAsync(find(["b.txt"])), []);
});

Deno.test("find() can reject non-existing file", async () => {
  await using _ = await tempDirectory({ chdir: true });
  await createFiles(["a.txt"]);
  assertRejects(
    () => Array.fromAsync(find(["b.txt"], { validate: true })),
    Deno.errors.NotFound,
    "b.txt",
  );
});

Deno.test("find() can find multiple files", async () => {
  await using _ = await tempDirectory({ chdir: true });
  await createFiles(["a.txt", "b.txt", "c.md"]);
  assertSameElements(await Array.fromAsync(find(["b.txt", "c.md", "d.txt"])), [
    "b.txt",
    "c.md",
  ]);
});

Deno.test("find() can find existing directory", async () => {
  await using _ = await tempDirectory({ chdir: true });
  await createFiles(["dir/a.txt"]);
  assertSameElements(await Array.fromAsync(find(["dir"])), [
    "dir",
    "dir/a.txt",
  ]);
});

Deno.test("find() skips non-existing directory", async () => {
  await using _ = await tempDirectory({ chdir: true });
  await createFiles(["a.txt"]);
  assertSameElements(await Array.fromAsync(find(["dir"])), []);
});

Deno.test("find() can find multiple directories", async () => {
  await using _ = await tempDirectory({ chdir: true });
  await createFiles(["a.txt", "dir1/b.txt", "dir2/c.md"]);
  assertSameElements(await Array.fromAsync(find(["dir1", "dir2", "dir3"])), [
    "dir1",
    "dir1/b.txt",
    "dir2",
    "dir2/c.md",
  ]);
});

Deno.test("find() can find files and directories", async () => {
  await using _ = await tempDirectory({ chdir: true });
  await createFiles(["a.txt", "dir1/b.txt", "dir2/c.md"]);
  assertSameElements(await Array.fromAsync(find(["a.txt", "dir1"])), [
    "a.txt",
    "dir1",
    "dir1/b.txt",
  ]);
});

Deno.test("find() can find in subdirectories", async () => {
  await using _ = await tempDirectory({ chdir: true });
  await createFiles(["a.txt", "b/c.md", "d/e/f.txt"]);
  assertSameElements(await Array.fromAsync(find(["."])), [
    ".",
    "a.txt",
    "b",
    "b/c.md",
    "d",
    "d/e",
    "d/e/f.txt",
  ]);
});

Deno.test("find() deduplicates results", async () => {
  await using _ = await tempDirectory({ chdir: true });
  await createFiles(["a.txt", "b/c.md", "d/e/f.txt"]);
  assertSameElements(
    await Array.fromAsync(find([".", "d", "d/e", "d/e/f.txt"])),
    [
      ".",
      "a.txt",
      "b",
      "b/c.md",
      "d",
      "d/e",
      "d/e/f.txt",
    ],
  );
});

Deno.test("find() returns absolute paths for absolute input", async () => {
  await using dir = await tempDirectory({ chdir: true });
  await createFiles(["a.txt", "b/c.md", "d/e/f.txt"]);
  assertSameElements(
    await Array.fromAsync(find([dir.path()])),
    [
      dir.path(),
      dir.path("a.txt"),
      dir.path("b"),
      dir.path("b/c.md"),
      dir.path("d"),
      dir.path("d/e"),
      dir.path("d/e/f.txt"),
    ],
  );
});

Deno.test("find() can limit maxDepth", async () => {
  await using _ = await tempDirectory({ chdir: true });
  await createFiles(["a.txt", "b/c.md", "d/e/f.txt"]);
  assertSameElements(await Array.fromAsync(find(["."], { maxDepth: 1 })), [
    ".",
    "a.txt",
    "b",
    "d",
  ]);
  assertSameElements(await Array.fromAsync(find(["."], { maxDepth: 2 })), [
    ".",
    "a.txt",
    "b",
    "b/c.md",
    "d",
    "d/e",
  ]);
  assertSameElements(await Array.fromAsync(find(["."], { maxDepth: 3 })), [
    ".",
    "a.txt",
    "b",
    "b/c.md",
    "d",
    "d/e",
    "d/e/f.txt",
  ]);
});

Deno.test("find() can filter files", async () => {
  await using _ = await tempDirectory({ chdir: true });
  await createFiles(["a.txt", "b/c.md", "d/e/f.txt"]);
  assertSameElements(await Array.fromAsync(find(["."], { type: "file" })), [
    "a.txt",
    "b/c.md",
    "d/e/f.txt",
  ]);
});

Deno.test("find() can filter files as input", async () => {
  await using _ = await tempDirectory({ chdir: true });
  await createFiles(["a.txt", "b/c.md"]);
  assertSameElements(
    await Array.fromAsync(find(["a.txt", "b"], { type: "file" })),
    [
      "a.txt",
      "b/c.md",
    ],
  );
});

Deno.test("find() can filter directories", async () => {
  await using _ = await tempDirectory({ chdir: true });
  await createFiles(["a.txt", "b/c.md", "d/e/f.txt"]);
  assertSameElements(await Array.fromAsync(find(["."], { type: "dir" })), [
    ".",
    "b",
    "d",
    "d/e",
  ]);
});

Deno.test("find() can filter directories as input", async () => {
  await using _ = await tempDirectory({ chdir: true });
  await createFiles(["a.txt", "b/c.md"]);
  assertSameElements(
    await Array.fromAsync(find(["a.txt", "b"], { type: "dir" })),
    [
      "b",
    ],
  );
});

Deno.test("find() rejects missing input", async () => {
  await using _ = await tempDirectory({ chdir: true });
  await createFiles(["a.txt", "b/c.md"]);
  await assertRejects(
    () => Array.fromAsync(find(["missing-input", "b"], { validate: true })),
    Deno.errors.NotFound,
    "missing-input",
  );
});

Deno.test("find() rejects input file if files are excluded", async () => {
  await using _ = await tempDirectory({ chdir: true });
  await createFiles(["a.txt", "b/c.md"]);
  await assertRejects(
    () =>
      Array.fromAsync(
        find(["a.txt", "b"], { type: "dir", validate: true }),
      ),
    Deno.errors.NotFound,
    "a.txt",
  );
});

Deno.test("find() does not reject input directory even if directories are excluded", async () => {
  await using _ = await tempDirectory({ chdir: true });
  await createFiles(["a.txt", "b/c.md"]);
  assertSameElements(
    await Array.fromAsync(
      find(["a.txt", "b"], { type: "file", validate: true }),
    ),
    [
      "a.txt",
      "b/c.md",
    ],
  );
});

Deno.test("find() does not follow symlinks by default", async () => {
  await using _ = await tempDirectory({ chdir: true });
  await createFiles(["a.txt", "b/c.md"]);
  await Deno.symlink("a.txt", "a-symlink.txt", { type: "file" });
  await Deno.symlink("b", "b-symlink", { type: "dir" });
  assertSameElements(await Array.fromAsync(find(["."])), [
    ".",
    "a.txt",
    "b",
    "b/c.md",
  ]);
});

Deno.test("find() does not follow input symlinks by default", async () => {
  await using _ = await tempDirectory({ chdir: true });
  await createFiles(["a.txt", "b/c.md"]);
  await Deno.symlink("a.txt", "a-symlink.txt", { type: "file" });
  await Deno.symlink("b", "b-symlink", { type: "dir" });
  assertSameElements(await Array.fromAsync(find(["b-symlink"])), []);
});

Deno.test("find() can follow symlinks", async () => {
  await using other = await tempDirectory({ chdir: true });
  await createFiles(["a.txt", "b/c.md"]);
  {
    await using _ = await tempDirectory({ chdir: true });
    await Deno.symlink(other.path("a.txt"), "a-symlink.txt", { type: "file" });
    await Deno.symlink(other.path("b"), "b-symlink", { type: "dir" });
    assertSameElements(await Array.fromAsync(find(["."], { symlinks: true })), [
      ".",
      "a-symlink.txt",
      "b-symlink",
      "b-symlink/c.md",
    ]);
  }
});

Deno.test("find() deduplicates symlink results", async () => {
  await using _ = await tempDirectory({ chdir: true });
  await createFiles(["a.txt", "b/c.md"]);
  await Deno.symlink("a.txt", "a-symlink.txt", { type: "file" });
  await Deno.symlink("b", "b-symlink", { type: "dir" });
  const result = await Array.fromAsync(find(["."], { symlinks: true }));
  result.sort();
  assertEquals(result.length, 4);
  assert(result.includes("a.txt") || result.includes("a-symlink.txt"));
  assert(result.includes("b") || result.includes("b-symlink"));
  assert(result.includes("b/c.md") || result.includes("b-symlink/c.md"));
});

Deno.test("find() can follow input symlink", async () => {
  await using _ = await tempDirectory({ chdir: true });
  await createFiles(["a.txt", "b/c.md"]);
  await Deno.symlink("a.txt", "a-symlink.txt", { type: "file" });
  await Deno.symlink("b", "b-symlink", { type: "dir" });
  assertSameElements(
    await Array.fromAsync(find(["b-symlink"], { symlinks: true })),
    [
      "b-symlink",
      "b-symlink/c.md",
    ],
  );
});

Deno.test("find() handles loops with symlinks", async () => {
  await using _ = await tempDirectory({ chdir: true });
  await createFiles(["a.txt", "b/c.md"]);
  await Deno.symlink(".", "loop", { type: "dir" });
  assertSameElements(await Array.fromAsync(find(["."], { symlinks: true })), [
    ".",
    "a.txt",
    "b",
    "b/c.md",
  ]);
});

Deno.test("find() skips broken symlinks", async () => {
  await using _ = await tempDirectory({ chdir: true });
  await createFiles(["a.txt", "b/c.md"]);
  await Deno.symlink("missing.txt", "broken-symlink.txt", { type: "file" });
  await Deno.symlink("missing-dir", "broken-symlink-dir", { type: "dir" });
  assertSameElements(await Array.fromAsync(find(["."], { validate: true })), [
    ".",
    "a.txt",
    "b",
    "b/c.md",
  ]);
});

Deno.test("find() can find by name", async () => {
  await using _ = await tempDirectory({ chdir: true });
  await createFiles(["a.txt", "b/c.md"]);
  assertSameElements(await Array.fromAsync(find(["."], { name: "a.txt" })), [
    "a.txt",
  ]);
  assertSameElements(await Array.fromAsync(find(["."], { name: "b" })), [
    "b",
  ]);
  assertSameElements(await Array.fromAsync(find(["."], { name: "c.md" })), [
    "b/c.md",
  ]);
  assertSameElements(await Array.fromAsync(find(["."], { name: "d.txt" })), []);
});

Deno.test("find() can find by name glob", async () => {
  await using _ = await tempDirectory({ chdir: true });
  await createFiles(["a.txt", "b/c.md"]);
  assertSameElements(
    await Array.fromAsync(find(["."], { name: "*.{txt,md}" })),
    [
      "a.txt",
      "b/c.md",
    ],
  );
  assertSameElements(await Array.fromAsync(find(["."], { name: "?.md" })), [
    "b/c.md",
  ]);
  assertSameElements(await Array.fromAsync(find(["."], { name: "a.*" })), [
    "a.txt",
  ]);
  assertSameElements(await Array.fromAsync(find(["."], { name: "b*" })), [
    "b",
  ]);
  assertSameElements(await Array.fromAsync(find(["."], { name: "?" })), [
    ".",
    "b",
  ]);
});

Deno.test("find() can find by alternative names", async () => {
  await using _ = await tempDirectory({ chdir: true });
  await createFiles(["a.txt", "b/c.md"]);
  assertSameElements(
    await Array.fromAsync(find(["."], { name: "{a.txt,c.md}" })),
    [
      "a.txt",
      "b/c.md",
    ],
  );
  assertSameElements(
    await Array.fromAsync(find(["."], { name: "{a,c}.*" })),
    [
      "a.txt",
      "b/c.md",
    ],
  );
  assertSameElements(
    await Array.fromAsync(find(["."], { name: "{?,*.txt}" })),
    [
      ".",
      "a.txt",
      "b",
    ],
  );
});

Deno.test("find() can exclude by name", async () => {
  await using _ = await tempDirectory({ chdir: true });
  await createFiles(["a.txt", "b/c.md"]);
  assertSameElements(
    await Array.fromAsync(find(["."], { name: "!(a.txt)", type: "file" })),
    [
      "b/c.md",
    ],
  );
  assertSameElements(
    await Array.fromAsync(find(["."], { name: "!(c.md)", type: "file" })),
    [
      "a.txt",
    ],
  );
  assertSameElements(
    await Array.fromAsync(find(["."], { name: "!(d.txt)", type: "file" })),
    [
      "a.txt",
      "b/c.md",
    ],
  );
  assertSameElements(
    await Array.fromAsync(find(["."], { name: "!(.|a.txt|c.md)" })),
    [
      "b",
    ],
  );
  assertSameElements(
    await Array.fromAsync(find(["."], { name: "*.!(txt|md)", type: "file" })),
    [],
  );
});

Deno.test("find() finds by name only on basename", async () => {
  await using _ = await tempDirectory({ chdir: true });
  await createFiles(["b/c.md"]);
  assertSameElements(await Array.fromAsync(find(["."], { name: "b/*" })), []);
});

Deno.test("find() can find by path", async () => {
  await using _ = await tempDirectory({ chdir: true });
  await createFiles(["a.txt", "b/c.md", "b/d/e.txt"]);
  assertSameElements(await Array.fromAsync(find(["."], { path: "a.txt" })), [
    "a.txt",
  ]);
  assertSameElements(await Array.fromAsync(find(["."], { path: "b/c.md" })), [
    "b/c.md",
  ]);
  assertSameElements(
    await Array.fromAsync(find(["."], { path: "b/d/e.txt" })),
    [
      "b/d/e.txt",
    ],
  );
  assertSameElements(
    await Array.fromAsync(find(["."], { path: "b/d" })),
    [
      "b/d",
    ],
  );
  assertSameElements(
    await Array.fromAsync(find(["."], { path: "d/e.txt" })),
    [],
  );
});

Deno.test("find() can find by path glob", async () => {
  await using _ = await tempDirectory({ chdir: true });
  await createFiles(["a.txt", "b/c.md", "b/d/e.txt"]);
  assertSameElements(await Array.fromAsync(find(["."], { path: "*.txt" })), [
    "a.txt",
  ]);
  assertSameElements(await Array.fromAsync(find(["."], { path: "b/*.md" })), [
    "b/c.md",
  ]);
  assertSameElements(
    await Array.fromAsync(find(["."], { path: "b/**/?.{txt,md}" })),
    [
      "b/c.md",
      "b/d/e.txt",
    ],
  );
  assertSameElements(
    await Array.fromAsync(find(["."], { path: "**/e.txt" })),
    [
      "b/d/e.txt",
    ],
  );
  assertSameElements(
    await Array.fromAsync(find(["."], { path: "d/*" })),
    [],
  );
  assertSameElements(
    await Array.fromAsync(find(["."], { path: "?" })),
    [
      ".",
      "b",
    ],
  );
});

Deno.test("find() can exclude by path", async () => {
  await using _ = await tempDirectory({ chdir: true });
  await createFiles(["a.txt", "b/c.md", "b/d/e.txt"]);
  assertSameElements(
    await Array.fromAsync(find(["."], { path: "**/!(a).*", type: "file" })),
    [
      "b/c.md",
      "b/d/e.txt",
    ],
  );
  assertSameElements(
    await Array.fromAsync(
      find(["."], { path: "**/!(a|c).txt", type: "file" }),
    ),
    [
      "b/d/e.txt",
    ],
  );
  assertSameElements(
    await Array.fromAsync(find(["."], { path: "!(*.txt)", type: "file" })),
    [],
  );
});
