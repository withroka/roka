import { pool } from "@roka/async/pool";
import { find, type FindOptions } from "@roka/fs/find";
import { type TempDirectory, tempDirectory } from "@roka/fs/temp";
import { assertEquals } from "@std/assert";
import { distinct } from "@std/collections/distinct";
import { dirname, normalize } from "@std/path";

async function test(
  paths: string[],
  options?: FindOptions,
) {
  await using dir = await tempDirectory();
  await pool(["a", "b/c"], (x) => Deno.mkdir(dir.path(x), { recursive: true }));
  await pool(
    ["a/a.txt", "b/c/c.txt", "d.txt"],
    (x) => Deno.writeTextFile(dir.path(x), "content"),
  );
  const nameFilters = Array.isArray(options?.name)
    ? options?.name
    : (typeof options?.name === "string" ? [options.name] : []);
  const pathFilters = Array.isArray(options?.path)
    ? options?.path
    : (typeof options?.path === "string" ? [options.path] : []);
  const args = [...paths];
  if (options?.type?.file) args.push("-type", "f");
  if (options?.type?.directory) args.push("-type", "d");
  if (nameFilters[0]) args.push("-name", nameFilters[0]);
  for (const name of nameFilters.slice(1)) args.push("-o", "-name", name);
  if (pathFilters[0]) args.push("-path", pathFilters[0]);
  for (const path of pathFilters.slice(1)) args.push("-o", "-path", path);
  console.log("args:", args);
  const cmd = new Deno.Command("find", {
    args,
    stdout: "piped",
    stderr: "piped",
    cwd: dir.path(),
  });
  const { stdout, stderr, code } = await cmd.output();
  if (code !== 0) console.log("stderr:", new TextDecoder().decode(stderr));
  assertEquals(code, 0);
  const cwd = Deno.cwd();
  try {
    Deno.chdir(dir.path());
    let posix = new TextDecoder().decode(stdout).split("\n").filter((x) => x);
    const result = await Array.fromAsync(find(paths, options));
    console.log("posix:", posix);
    console.log("result:", result);
    assertEquals(posix.map(normalize), result);
  } finally {
    Deno.chdir(cwd);
  }
}

async function createFiles(dir: TempDirectory, files: string[]) {
  const paths = files.map((x) => dir.path(x));
  const directories = distinct(paths.map(dirname));
  await pool(directories, (x) => Deno.mkdir(x, { recursive: true }));
  await pool(paths, (x) => Deno.writeTextFile(x, "content"));
  return paths;
}

Deno.test("find() empty", async () => {
  await using dir = await tempDirectory();
  createFiles(dir, ["a.txt", "b/c.txt", "d/e/f.txt"]);
  const cwd = Deno.cwd();
  try {
    Deno.chdir(dir.path());
    const result = await Array.fromAsync(find([], {}));
    assertEquals(result, []);
  } finally {
    Deno.chdir(cwd);
  }
  assertEquals(result, []);
});

Deno.test("find() root", () => test(["."], {}));
Deno.test("find() dir", () => test(["a"], {}));
Deno.test("find() subdir", () => test(["b/c"], {}));
Deno.test("find() file", () => test(["d.txt"], {}));
Deno.test("find() mix", () => test(["a", "b/c", "d.txt"], {}));
Deno.test("find() type file", () => test(["."], { type: { file: true } }));
Deno.test("find() type dir", () => test(["."], { type: { directory: true } }));

Deno.test("find() name", () => test(["."], { name: "c" }));
Deno.test("find() names", () => test(["."], { name: ["c", "*.txt"] }));
Deno.test("find() path", () => test(["."], { path: "*/*.txt" }));
Deno.test("find() paths", () => test(["."], { path: ["?"] }));
