import { assertSameElements } from "@roka/assert";
import { pool } from "@roka/async/pool";
import { runtime } from "@roka/runtime";
import { test } from "@roka/testing/test";
import { assert, assertRejects } from "@std/assert";
import { distinct } from "@std/collections";
import { mkdir } from "@std/fs/unstable-mkdir";
import { realPath } from "@std/fs/unstable-real-path";
import { remove } from "@std/fs/unstable-remove";
import { symlink } from "@std/fs/unstable-symlink";
import { writeTextFile } from "@std/fs/unstable-write-text-file";
import { dirname, resolve, toFileUrl } from "@std/path";
import { find } from "./find.ts";
import { tempDirectory } from "./temp.ts";

async function createFiles(files: string[]) {
  const directories = distinct(files.map(dirname)).filter((x) => x !== ".");
  await pool(directories, (x) => mkdir(x, { recursive: true }));
  await pool(files, (x) => writeTextFile(x, "content"));
}

test("find() return empty results for empty input", async () => {
  await using _ = await tempDirectory({ chdir: true });
  await createFiles(["a.txt", "b/c.md", "d/e/f.txt"]);
  assertSameElements(await Array.fromAsync(find([])), []);
});

test("find() can find existing file", async () => {
  await using _ = await tempDirectory({ chdir: true });
  await createFiles(["a.txt"]);
  assertSameElements(await Array.fromAsync(find(["a.txt"])), [
    "a.txt",
  ]);
});

test("find() skips non-existing file", async () => {
  await using _ = await tempDirectory({ chdir: true });
  await createFiles(["a.txt"]);
  assertSameElements(await Array.fromAsync(find(["b.txt"])), []);
});

test("find() can find multiple files", async () => {
  await using _ = await tempDirectory({ chdir: true });
  await createFiles(["a.txt", "b.txt", "c.md"]);
  assertSameElements(await Array.fromAsync(find(["b.txt", "c.md", "d.txt"])), [
    "b.txt",
    "c.md",
  ]);
});

test("find() can find existing directory", async () => {
  await using _ = await tempDirectory({ chdir: true });
  await createFiles(["dir/a.txt"]);
  assertSameElements(await Array.fromAsync(find(["dir"])), [
    "dir",
    "dir/a.txt",
  ]);
});

test("find() skips non-existing directory", async () => {
  await using _ = await tempDirectory({ chdir: true });
  await createFiles(["a.txt"]);
  assertSameElements(await Array.fromAsync(find(["dir"])), []);
});

test("find() can find multiple directories", async () => {
  await using _ = await tempDirectory({ chdir: true });
  await createFiles(["a.txt", "dir1/b.txt", "dir2/c.md"]);
  assertSameElements(await Array.fromAsync(find(["dir1", "dir2", "dir3"])), [
    "dir1",
    "dir1/b.txt",
    "dir2",
    "dir2/c.md",
  ]);
});

test("find() can find files and directories", async () => {
  await using _ = await tempDirectory({ chdir: true });
  await createFiles(["a.txt", "dir1/b.txt", "dir2/c.md"]);
  assertSameElements(await Array.fromAsync(find(["a.txt", "dir1"])), [
    "a.txt",
    "dir1",
    "dir1/b.txt",
  ]);
});

test("find() can find in subdirectories", async () => {
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

test("find() deduplicates results", async () => {
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

test("find() returns absolute paths for absolute input", async () => {
  await using _ = await tempDirectory({ chdir: true });
  await createFiles(["a.txt", "b/c.md", "d/e/f.txt"]);
  assertSameElements(
    await Array.fromAsync(find([runtime.cwd()])),
    [
      ".",
      "a.txt",
      "b",
      "b/c.md",
      "d",
      "d/e",
      "d/e/f.txt",
    ].map((path) => resolve(runtime.cwd(), path)),
  );
});

test("find() handles file URLs", async () => {
  await using _ = await tempDirectory({ chdir: true });
  await createFiles(["a.txt", "b/c.md", "d/e/f.txt"]);
  assertSameElements(
    await Array.fromAsync(find([toFileUrl(runtime.cwd())])),
    [
      ".",
      "a.txt",
      "b",
      "b/c.md",
      "d",
      "d/e",
      "d/e/f.txt",
    ].map((path) => resolve(runtime.cwd(), path)),
  );
});

test("find() does not follow symlinks by default", async () => {
  await using other = await tempDirectory({ chdir: true });
  await createFiles(["d/e.txt"]);
  {
    await using _ = await tempDirectory({ chdir: true });
    await createFiles(["a.txt", "b/c.md"]);
    await symlink(other.path("d"), "dir-symlink", { type: "dir" });
    await symlink(other.path("d/e.txt"), "file-symlink", { type: "file" });
    assertSameElements(await Array.fromAsync(find(["."])), [
      ".",
      "a.txt",
      "b",
      "b/c.md",
      "dir-symlink",
      "file-symlink",
    ]);
  }
});

test("find() does not follow input symlinks by default", async () => {
  await using other = await tempDirectory({ chdir: true });
  await createFiles(["d/e.txt"]);
  {
    await using _ = await tempDirectory({ chdir: true });
    await createFiles(["a.txt", "b/c.md"]);
    await symlink(other.path("d"), "dir-symlink", { type: "dir" });
    await symlink(other.path("d/e.txt"), "file-symlink", { type: "file" });
    assertSameElements(
      await Array.fromAsync(find(["dir-symlink", "file-symlink"])),
      [
        "dir-symlink",
        "file-symlink",
      ],
    );
  }
});

test("find() can return types other than file, directory or symlink", {
  ignore: runtime.build.os === "windows" || runtime.title !== "deno",
}, async () => {
  await using _ = await tempDirectory({ chdir: true });
  await createFiles(["a.txt", "b/c.md"]);
  const command = runtime.command("mkfifo", {
    args: ["fifo"],
    stdout: "null",
    stderr: "null",
  });
  const { success } = await command.output();
  assert(success);
  try {
    assertSameElements(
      await Array.fromAsync(find(["."])),
      [
        ".",
        "a.txt",
        "b",
        "b/c.md",
        "fifo",
      ],
    );
    assertSameElements(
      await Array.fromAsync(find(["."], { type: "file" })),
      [
        "a.txt",
        "b/c.md",
      ],
    );
    assertSameElements(
      await Array.fromAsync(find(["."], { type: "dir" })),
      [
        ".",
        "b",
      ],
    );
  } finally {
    await remove("fifo", { recursive: true });
  }
});

test("find({ type }) can filter files", async () => {
  await using _ = await tempDirectory({ chdir: true });
  await createFiles(["a.txt", "b/c.md", "d/e/f.txt"]);
  assertSameElements(await Array.fromAsync(find(["."], { type: "file" })), [
    "a.txt",
    "b/c.md",
    "d/e/f.txt",
  ]);
});

test("find({ type }) can filter files as input", async () => {
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

test("find({ type }) can filter directories", async () => {
  await using _ = await tempDirectory({ chdir: true });
  await createFiles(["a.txt", "b/c.md", "d/e/f.txt"]);
  assertSameElements(await Array.fromAsync(find(["."], { type: "dir" })), [
    ".",
    "b",
    "d",
    "d/e",
  ]);
});

test("find({ type }) can filter directories as input", async () => {
  await using _ = await tempDirectory({ chdir: true });
  await createFiles(["a.txt", "b/c.md"]);
  assertSameElements(
    await Array.fromAsync(find(["a.txt", "b"], { type: "dir" })),
    [
      "b",
    ],
  );
});

test("find({ type }) can filter symlinks", async () => {
  await using other = await tempDirectory({ chdir: true });
  await createFiles(["d/e.txt"]);
  {
    await using _ = await tempDirectory({ chdir: true });
    await createFiles(["a.txt", "b/c.md"]);
    await symlink(other.path("d"), "dir-symlink", { type: "dir" });
    await symlink(other.path("d/e.txt"), "file-symlink", { type: "file" });
    assertSameElements(
      await Array.fromAsync(find(["."], { type: "symlink" })),
      [
        "dir-symlink",
        "file-symlink",
      ],
    );
  }
});

test("find({ type }) can filter symlinks as input", async () => {
  await using other = await tempDirectory({ chdir: true });
  await createFiles(["d/e.txt"]);
  {
    await using _ = await tempDirectory({ chdir: true });
    await createFiles(["a.txt", "b/c.md"]);
    await symlink(other.path("d"), "dir-symlink", { type: "dir" });
    await symlink(other.path("d/e.txt"), "file-symlink", { type: "file" });
    assertSameElements(
      await Array.fromAsync(find(["dir-symlink"], { type: "symlink" })),
      [
        "dir-symlink",
      ],
    );
    assertSameElements(
      await Array.fromAsync(find(["file-symlink"], { type: "symlink" })),
      [
        "file-symlink",
      ],
    );
  }
});

test("find({ name }) finds by name", async () => {
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

test("find({ name }) can find by name glob", async () => {
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

test("find({ name }) can find by alternative names", async () => {
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

test("find({ name }) can exclude by name", async () => {
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

test("find({ name }) finds by name only on basename", async () => {
  await using _ = await tempDirectory({ chdir: true });
  await createFiles(["b/c.md"]);
  assertSameElements(await Array.fromAsync(find(["."], { name: "b/*" })), []);
});

test("find({ path }) finds by path", async () => {
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

test("find({ path }) can find by path glob", async () => {
  await using _ = await tempDirectory({ chdir: true });
  await createFiles(["a.txt", "b/c.md", "b/d/e.txt"]);
  assertSameElements(await Array.fromAsync(find(["."], { path: "*.txt" })), [
    "a.txt",
  ]);
  assertSameElements(await Array.fromAsync(find(["."], { path: "**/*.txt" })), [
    "a.txt",
    "b/d/e.txt",
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

test("find({ path }) can find by path glob with absolute paths", async () => {
  await using _ = await tempDirectory({ chdir: true });
  await createFiles(["a.txt", "b/c.md", "b/d/e.txt"]);
  assertSameElements(
    await Array.fromAsync(
      find([runtime.cwd()], { path: "*.txt" }),
    ),
    [],
  );
  await createFiles(["a.txt", "b/c.md", "b/d/e.txt"]);
  assertSameElements(
    await Array.fromAsync(
      find([runtime.cwd()], { path: "**/*.txt" }),
    ),
    [
      resolve(runtime.cwd(), "a.txt"),
      resolve(runtime.cwd(), "b/d/e.txt"),
    ],
  );
});

test("find({ path }) can exclude by path", async () => {
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

test("find({ path }) can ignore paths", async () => {
  await using _ = await tempDirectory({ chdir: true });
  await createFiles(["a.txt", "b/c.md", "b/d/e.txt", "f/g/h.txt"]);
  assertSameElements(
    await Array.fromAsync(find(["."], { ignore: ["b"] })),
    [
      ".",
      "a.txt",
      "f",
      "f/g",
      "f/g/h.txt",
    ],
  );
  assertSameElements(
    await Array.fromAsync(find(["b"], { ignore: ["b"] })),
    [],
  );
  assertSameElements(
    await Array.fromAsync(find(["."], { ignore: ["**/*.md"] })),
    [
      ".",
      "a.txt",
      "b",
      "b/d",
      "b/d/e.txt",
      "f",
      "f/g",
      "f/g/h.txt",
    ],
  );
  assertSameElements(
    await Array.fromAsync(find(["."], { ignore: ["**/d"] })),
    [
      ".",
      "a.txt",
      "b",
      "b/c.md",
      "f",
      "f/g",
      "f/g/h.txt",
    ],
  );
  assertSameElements(
    await Array.fromAsync(find(["."], { ignore: ["**"] })),
    [],
  );
});

test("find({ followSymlinks }) follows symlinks", async () => {
  await using other = await tempDirectory({ chdir: true });
  await createFiles(["d/e.txt", "f/g.txt"]);
  {
    await using _ = await tempDirectory({ chdir: true });
    await createFiles(["a.txt", "b/c.md"]);
    await symlink(other.path("d"), "dir-symlink", { type: "dir" });
    await symlink(other.path("f/g.txt"), "file-symlink", { type: "file" });
    assertSameElements(
      await Array.fromAsync(find(["."], { followSymlinks: true })),
      [
        ".",
        "a.txt",
        "b",
        "b/c.md",
        "dir-symlink",
        "dir-symlink/e.txt",
        "file-symlink",
      ],
    );
  }
});

test("find({ followSymlinks }) follows input symlink", async () => {
  await using other = await tempDirectory({ chdir: true });
  await createFiles(["d/e.txt"]);
  {
    await using _ = await tempDirectory({ chdir: true });
    await createFiles(["a.txt", "b/c.md"]);
    await symlink(other.path("d"), "dir-symlink", { type: "dir" });
    await symlink(other.path("d/e.txt"), "file-symlink", { type: "file" });
    assertSameElements(
      await Array.fromAsync(find(["dir-symlink"], { followSymlinks: true })),
      [
        "dir-symlink",
        "dir-symlink/e.txt",
      ],
    );
    assertSameElements(
      await Array.fromAsync(find(["file-symlink"], { followSymlinks: true })),
      [
        "file-symlink",
      ],
    );
  }
});

test("find({ followSymlinks }) deduplicates symlink results", async () => {
  await using _ = await tempDirectory({ chdir: true });
  await createFiles(["a.txt", "b/c.md"]);
  await symlink("a.txt", "file-symlink.txt", { type: "file" });
  await symlink("b", "dir-symlink", { type: "dir" });
  assertSameElements(
    await pool(find(["."], { followSymlinks: true }), realPath),
    await pool([
      ".",
      "a.txt",
      "b",
      "b/c.md",
    ], realPath),
  );
});

test("find({ followSymlinks }) handles loops with symlinks", async () => {
  await using _ = await tempDirectory({ chdir: true });
  await createFiles(["a.txt", "b/c.md"]);
  await symlink(".", "loop", { type: "dir" });
  assertSameElements(
    await Array.fromAsync(find(["."], { followSymlinks: true })),
    [
      ".",
      "a.txt",
      "b",
      "b/c.md",
    ],
  );
});

test("find({ followSymlinks }) skips broken symlinks", async () => {
  await using _ = await tempDirectory({ chdir: true });
  await createFiles(["a.txt", "b/c.md"]);
  await symlink("missing.txt", "broken-symlink.txt", { type: "file" });
  await symlink("missing-dir", "broken-symlink-dir", { type: "dir" });
  assertSameElements(await Array.fromAsync(find(["."], { validate: true })), [
    ".",
    "a.txt",
    "b",
    "b/c.md",
  ]);
  assertSameElements(
    await Array.fromAsync(
      find(["."], { followSymlinks: true, validate: true }),
    ),
    [
      ".",
      "a.txt",
      "b",
      "b/c.md",
    ],
  );
});

test("find({ maxDepth }) limit search depth", async () => {
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
  assertSameElements(await Array.fromAsync(find(["."], { maxDepth: 0 })), [
    ".",
  ]);
});

test("find({ maxDepth }) rejects negative numbers", async () => {
  await using _ = await tempDirectory({ chdir: true });
  await createFiles(["a.txt", "b/c.md", "d/e/f.txt"]);
  await assertRejects(
    () => Array.fromAsync(find(["."], { maxDepth: -1 })),
    TypeError,
    "maxDepth",
  );
});

test("find({ validate }) rejects missing input", async () => {
  await using _ = await tempDirectory({ chdir: true });
  await createFiles(["a.txt", "b/c.md"]);
  await assertRejects(
    () => Array.fromAsync(find(["missing-input", "b"], { validate: true })),
    // errors.NotFound,
    // "missing-input",
  );
});

test("find({ validate }) rejects input file if files are excluded", async () => {
  await using _ = await tempDirectory({ chdir: true });
  await createFiles(["a.txt", "b/c.md"]);
  await assertRejects(
    () =>
      Array.fromAsync(
        find(["a.txt", "b"], { type: "dir", validate: true }),
      ),
    // errors.NotFound,
    // "a.txt",
  );
});

test("find({ validate } does not reject input directory even if directories are excluded", async () => {
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

test("find({ validate }) can reject input symlink if symlinks are excluded", async () => {
  await using other = await tempDirectory({ chdir: true });
  await createFiles(["d/e.txt"]);
  {
    await using _ = await tempDirectory({ chdir: true });
    await createFiles(["a.txt", "b/c.md"]);
    await symlink(other.path("d"), "dir-symlink", { type: "dir" });
    await symlink(other.path("d/e.txt"), "file-symlink", { type: "file" });
    await assertRejects(
      () =>
        Array.fromAsync(
          find(["dir-symlink"], { type: "file", validate: true }),
        ),
      // errors.NotFound,
      // "dir-symlink",
    );
    await assertRejects(
      () =>
        Array.fromAsync(
          find(["file-symlink"], { type: "dir", validate: true }),
        ),
      // errors.NotFound,
      // "file-symlink",
    );
  }
});
