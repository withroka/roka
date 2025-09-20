import { pool } from "@roka/async/pool";
import { omit } from "@std/collections";
import { walk } from "@std/fs";
import { basename, dirname, globToRegExp } from "@std/path";

/**
 * An error thrown by the `input` module.
 */
export class FindError extends Error {
  /** Construct InputError. */
  constructor(
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "InputError";
  }
}

export interface FindOptions {
  maxDepth?: number;
  type?: {
    file?: boolean;
    directory?: boolean;
    symlink?: boolean;
  };
  followSymlinks?: boolean;
  exts?: string[];
  match?: RegExp[];
  skip?: RegExp[];
}

export interface FindOptionsOld {
  /**
   * Include files in results.
   * @default {false}
   */
  files?: boolean | string;
  /**
   * Include directories in results.
   * @default {false}
   */
  directories?: boolean | string;
}

export async function* find(
  paths: string[],
  options?: FindOptions,
): AsyncGenerator<string> {
  const walkOptions = options && {
    ...omit(options, ["type"]),
    ...options?.type && { includeFiles: options.type.file === true },
    ...options?.type && { includeDirs: options.type.directory === true },
    ...options?.type && { includeSymlinks: options.type.symlink === true },
  };
  console.log("walk:", walkOptions);
  const stats = await pool(paths, async (path) => ({
    path,
    stat: await Deno.stat(path),
  }));
  for (const { path, stat } of stats) {
    if (stat.isFile) {
      yield path;
    }
    if (stat.isDirectory) {
      for await (const entry of walk(path, walkOptions)) {
        yield entry.path;
      }
    }
  }
}

export async function* findOld(
  paths: string[],
  options?: FindOptionsOld,
): AsyncGenerator<string> {
  const { files = false, directories = false } = options ?? {};
  function check(path: string, check: boolean | string) {
    return check === true ||
      (typeof check === "string" && globToRegExp(check).test(basename(path)));
  }
  const stats = await pool(paths, async (path) => ({
    path,
    stat: await Deno.stat(path),
  }));
  for (const { path, stat } of stats) {
    if (stat.isFile && check(path, files)) yield path;
    if (stat.isDirectory) {
      const matched = new Set();
      if (directories === true) {
        matched.add(path);
        yield path;
      }
      for await (
        const entry of walk(path, {
          includeFiles: (files !== false) || (typeof directories === "string"),
        })
      ) {
        if (entry.isFile) {
          if (check(entry.path, files)) yield entry.path;
          const dir = dirname(entry.path);
          if (!matched.has(dir) && check(entry.path, directories)) {
            matched.add(dir);
            yield dir;
          }
        }
      }
    }
  }
}
