/**
 * This module provides the {@linkcode find} function to recursively find
 * files and directories, similar to the Unix `find` command.
 *
 * ```ts
 * import { find } from "@roka/fs/find";
 * for await (
 *   const _ of find(["."], {
 *     type: "file",
 *     name: "*.ts",
 *     ignore: ["node_modules"],
 *   })
 * ) {
 *   // ...
 * }
 * ```
 *
 * @module find
 */

import { maybe } from "@roka/maybe";
import { basename, globToRegExp, join } from "@std/path";

/** Options for the {@linkcode find} function. */
export interface FindOptions {
  /**
   * Type of file system entry to find.
   *
   * If not specified, both files and directories are returned.
   */
  type?: "file" | "dir" | "symlink";
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
  /**
   * List of paths to ignore.
   *
   * This is an array of extended glob patterns applied both to intermediate
   * and the result paths returned by the function. If a file matches any of
   * the patterns, it will not be returned. If a directory matches any of
   * the patterns, it and its contents will be skipped entirely.
   *
   * Similar to {@linkcode FindOptions.path | path}, if absolute paths are
   * given as input, the patterns should match absolute paths, and if relative
   * paths are given as input, the patterns should match relative paths.
   *
   * If not specified, no paths are ignored.
   */
  ignore?: string[];
  /**
   * Whether to follow symbolic links.
   * @default {false}
   */
  followSymlinks?: boolean;
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
}

/**
 * Recursively finds files and directories.
 *
 * This function is similar to the Unix `find` command. It searches for files
 * and directories starting from the specified paths, and yields the paths of
 * the entries that match the given criteria.
 *
 * Symbolic links are not followed by default, but they can be followed by
 * setting {@linkcode FindOptions.followSymlinks} to `true`. File system nodes
 * that are neither files nor directories, such as sockets and devices, are
 * ignored.
 *
 * This functions returns all file system node types by default. Filtering by
 * type can be done with {@linkcode FindOptions.type}.
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
 *   ["a.txt", "b/c.md"],
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
 *   ["."],
 * );
 * ```
 *
 * @example Ignore specific paths.
 * ```ts
 * import { find } from "@roka/fs/find";
 * import { tempDirectory } from "@roka/fs/temp";
 * import { assertSameElements } from "@roka/assert";
 * await using _ = await tempDirectory({ chdir: true });
 * await Deno.writeTextFile("a.txt", "a");
 * await Deno.mkdir("b");
 * await Deno.writeTextFile("b/c.md", "c");
 * assertSameElements(
 *   await Array.fromAsync(find(["."], { ignore: ["b"] })),
 *   [".", "a.txt"],
 * );
 * ```
 *
 * @example Handle non-existing paths with validation.
 * ```ts
 * import { find } from "@roka/fs/find";
 * import { tempDirectory } from "@roka/fs/temp";
 * import { assertRejects } from "@std/assert";
 * await using _ = await tempDirectory({ chdir: true });
 * await assertRejects(
 *   async () => {
 *     for await (const _ of find(["non-existing"], { validate: true })) {
 *       // ...
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
    followSymlinks = false,
  } = options ?? {};
  const namePattern = options?.name ? globToRegExp(options.name) : undefined;
  const pathPattern = options?.path ? globToRegExp(options.path) : undefined;
  const ignorePatterns = options?.ignore?.map((p) => globToRegExp(p)) ?? [];
  const found = new Set<string>();
  async function* internal(
    depth: number,
    validate: boolean,
    path: string,
    info?: { real: string; stat: Stat } | undefined,
  ): AsyncIterableIterator<string> {
    if (depth > maxDepth) return;
    if (ignorePatterns.some((p) => p.exec(path))) return;
    const { value, error } = await maybe(async () => {
      if (info) return info;
      const [real, stat] = await Promise.all([
        Deno.realPath(path),
        followSymlinks ? Deno.stat(path) : Deno.lstat(path),
      ]);
      return { real, stat };
    });
    const { real, stat } = value ?? {};
    if (
      (!real || !stat) ||
      (type === "dir" && !stat.isDirectory) ||
      (type === "file" && !stat.isFile && !stat.isDirectory) ||
      (type === "symlink" && !stat.isSymlink && !stat.isDirectory)
    ) {
      if (validate) {
        if (error) throw error;
        throw new Deno.errors.NotFound(`No such file or directory: ${path}`);
      }
      return;
    }
    if (found.has(real)) return;
    found.add(real);
    if (
      (type === undefined || type === "dir" || !stat.isDirectory) &&
      (namePattern === undefined || namePattern?.exec(basename(path))) &&
      (pathPattern === undefined || pathPattern?.exec(path)) &&
      !ignorePatterns.some((p) => p.exec(path))
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
