import { pool } from "@roka/async/pool";
import { maybe } from "@roka/maybe";
import { omit } from "@std/collections";
import { walk } from "@std/fs";

export interface FindOptions {
  validate?: boolean;
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

export async function* find(
  paths: string[],
  options?: FindOptions,
): AsyncIterableIterator<string> {
  const walkOptions = options && {
    ...omit(options, ["type"]),
    ...options?.type && { includeFiles: options.type.file === true },
    ...options?.type && { includeDirs: options.type.directory === true },
    ...options?.type && { includeSymlinks: options.type.symlink === true },
  };
  const { value: stats, error, errors } = await maybe(() =>
    pool(paths, async (path) => {
      const { value: stat, error } = await maybe(() => Deno.stat(path));
      if (error && options?.validate) throw error;
      return { path, stat };
    })
  );
  if (error) throw errors.length === 1 ? errors[0] : error;
  for (const { path, stat } of stats) {
    if (!stat) continue;
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
