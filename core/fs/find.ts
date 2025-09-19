import { pool } from "@roka/async/pool";
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
