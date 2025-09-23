/**
 * This module provides the {@linkcode find} function to recursively find
 * files and directories, similar to the Unix `find` command.
 *
 * ```ts
 * import { find } from "@roka/fs/find";
 * for await (const path of find(["."], { type: "file", name: "*.ts" } )) {
 *   // do something with path
 * }
 * ```
 */

import { maybe } from "@roka/maybe";
import { assert } from "@std/assert";
import { basename, globToRegExp } from "@std/path";
import { join } from "node:path";

/** Options for the {@linkcode find} function. */
export interface FindOptions {
  /**
   * The maximum depth of the file tree to be walked recursively.
   * @default {Infinity}
   */
  maxDepth?: number;
  /**
   * Whether to validate the existence of the given paths.
   *
   * If `true`, an error will be thrown if any of the given paths do not exist.
   *
   * @default {false}
   */
  validate?: boolean;
  /**
   * Type of file system entry to find.
   *
   * If not specified, both files and directories are returned.
   */
  type?: "file" | "dir";
  /**
   * Whether to follow symbolic links.
   * @default {false}
   */
  symlinks?: boolean;
  /**
   * Extended glob pattern to match file or directory names.
   *
   * This only matches the name of the file or directory. Use
   * {@linkcode FindOptions.path} to match the full path.
   *
   * If not specified, all names are matched.
   */
  name?: string;
  /**
   * Extended glob pattern to match file or directory paths.
   *
   * This filter applies to the result paths returned by the function. Thus,
   * if absolute paths are given as input, the pattern should match absolute
   * paths. Similarly, if relative paths are given as input, the pattern should
   * match relative paths.
   *
   * Use {@linkcode FindOptions.name} to match only the name of the file or
   * directory.
   *
   * If not specified, all paths are matched.
   */
  path?: string;
}

/**
 * Recursively finds files and directories.
 *
 * This function is similar to the Unix `find` command. It searches for files
 * and directories starting from the specified paths, and yields the paths of
 * the entries that match the given criteria.
 *
 * Symbolic links are not followed by default, but they can be followed by
 * setting {@linkcode FindOptions.symlinks} to `true`. File system nodes that
 * are neither files nor directories, such as sockets and devices, are ignored.
 *
 * The function can be made to return only files or only directories by
 * setting {@linkcode FindOptions.type} to `"file"` or `"dir"`, respectively.
 *
 * The results contain no duplicates, even if there are multiple paths
 * leading to the same file or directory, for example via overlapping inputs or
 * symbolic links.
 *
 * The results are not guaranteed to be in any specific order.
 *
 * @example Find all files and directories recursively.
 * ```ts
 * import { find } from "@roka/fs/find";
 * import { tempDirectory } from "@roka/fs/temp";
 * import { assertSameElements } from "@roka/assert";
 * await using _ = await tempDirectory({ chdir: true });
 * await Deno.writeTextFile("a.txt", "a");
 * await Deno.mkdir("b");
 * await Deno.writeTextFile("b/c.md", "c");
 * assertSameElements(await Array.fromAsync(find(["."])), [
 *   ".",
 *   "a.txt",
 *   "b",
 *   "b/c.md",
 * ]);
 * ```
 *
 * @example Find only files with a specific name pattern.
 * ```ts
 * import { find } from "@roka/fs/find";
 * import { tempDirectory } from "@roka/fs/temp";
 * import { assertSameElements } from "@roka/assert";
 * await using _ = await tempDirectory({ chdir: true });
 * await Deno.writeTextFile("a.txt", "a");
 * await Deno.mkdir("b");
 * await Deno.writeTextFile("b/c.md", "c");
 * assertSameElements(
 *   await Array.fromAsync(find(["."], { name: "*.{txt,md}", type: "file" })),
 *   [ "a.txt", "b/c.md"],
 * );
 * ```
 *
 * @example Find only directories with a specific path pattern.
 * ```ts
 * import { find } from "@roka/fs/find";
 * import { tempDirectory } from "@roka/fs/temp";
 * import { assertSameElements } from "@roka/assert";
 * await using _ = await tempDirectory({ chdir: true });
 * await Deno.writeTextFile("a.txt", "a");
 * await Deno.mkdir("b");
 * await Deno.writeTextFile("b/c.md", "c");
 * assertSameElements(
 *   await Array.fromAsync(find(["."], { path: "!(b)", type: "dir" })),
 *   [ "." ],
 * );
 * ```
 *
 * @example Handle non-existing paths with validation.
 * ```ts
 * import { find } from "@roka/fs/find";
 * import { tempDirectory } from "@roka/fs/temp";
 * import { assertRejects } from "jsr:@std/assert";
 * await using _ = await tempDirectory({ chdir: true });
 * await assertRejects(
 *   async () => {
 *     for await (const _ of find(["non-existing"], { validate: true })) {
 *     }
 *   },
 *   Deno.errors.NotFound,
 * );
 * ```
 *
 * @param paths File or directory paths to start the search from.
 * @yields The paths of files and directories that match the specified criteria.
 * @throws {Deno.errors.NotFound} If {@linkcode FindOptions.validate} is `true`
 * and any of the given paths do not exist.
 */
export async function* find(
  paths: string[],
  options?: FindOptions,
): AsyncIterableIterator<string> {
  interface Stat {
    isFile: boolean;
    isDirectory: boolean;
    isSymlink: boolean;
  }
  const {
    maxDepth = Infinity,
    type,
    symlinks = false,
  } = options ?? {};
  const found = new Set<string>();
  const namePattern = options?.name ? globToRegExp(options.name) : undefined;
  const pathPattern = options?.path ? globToRegExp(options.path) : undefined;
  async function* internal(
    depth: number,
    validate: boolean,
    path: string,
    info?: { real: string; stat: Stat } | undefined,
  ): AsyncIterableIterator<string> {
    if (depth > maxDepth) return;
    const { value, error } = await maybe(async () => {
      if (info) return info;
      const [real, stat] = await Promise.all([
        Deno.realPath(path),
        symlinks ? Deno.stat(path) : Deno.lstat(path),
      ]);
      return { real, stat };
    });
    const { real, stat } = value ?? {};
    if (
      (!real || !stat) ||
      (!stat.isDirectory && !(stat.isFile && type !== "dir"))
    ) {
      if (validate) {
        if (error) throw error;
        throw new Deno.errors.NotFound(`No such file or directory: ${path}`);
      }
      return;
    }
    assert(stat.isFile || stat.isDirectory);
    if (found.has(real)) return;
    found.add(real);
    if (
      (stat.isFile || type !== "file") &&
      (namePattern === undefined || namePattern?.exec(basename(path))) &&
      (pathPattern === undefined || pathPattern?.exec(path))
    ) yield path;
    if (stat.isDirectory) {
      for await (const entry of Deno.readDir(real)) {
        yield* internal(
          depth + 1,
          false,
          join(path, entry.name),
          // reuse DirEntry to avoid a stat call
          !entry.isSymlink
            ? { real: join(real, entry.name), stat: entry }
            : undefined,
        );
      }
    }
  }
  for (const path of paths) {
    yield* internal(0, options?.validate ?? false, path);
  }
}
