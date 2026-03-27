/**
 * This module provides utilities to create packages for testing.
 *
 * ```ts
 * import { tempPackage } from "@roka/forge/testing";
 *
 * await using _ = await tempPackage({
 *   config: { name: "@scope/name" },
 * });
 * ```
 *
 * ```ts
 * import { tempWorkspace } from "@roka/forge/testing";
 *
 * await using _ = await tempWorkspace({
 *   config: [
 *     { name: "@scope/name1" },
 *     { name: "@scope/name2" },
 *   ],
 * });
 * ```
 *
 * @module testing
 * @internal
 */

import { tempRepository, type TempRepositoryOptions } from "@roka/git/testing";
import { dirname, fromFileUrl, join, relative } from "@std/path";
import {
  type Config,
  type Package,
  packageInfo,
  workspace,
} from "./workspace.ts";

/** Options for the {@linkcode tempPackage} function. */
export interface TempPackageOptions {
  /** File contents for package configuration (`deno.json`). */
  config?: Config;
  /** Options for the initialization of the Git repository. */
  repo?: TempRepositoryOptions;
  /** Commits and tags to create in the repository. */
  commit?: { subject: string; config?: Config[]; tag?: string[] }[];
}

/** Options for the {@linkcode tempWorkspace} function. */
export interface TempWorkspaceOptions {
  /** File contents for package configurations (`deno.json`). */
  config?: Config[];
  /** Options for the initialization of the Git repository. */
  repo?: TempRepositoryOptions;
  /** Commits and tags to create in the repository. */
  commit?: { subject: string; config?: Config[]; tag?: string[] }[];
}

/**
 * Creates a test package with given configuration.
 *
 * The package will be created under a temporary directory, which will be
 * automatically removed when the package is disposed.
 *
 * @example Create a temporary package from configuration
 * ```ts
 * import { tempPackage } from "@roka/forge/testing";
 * import { assertEquals } from "@std/assert";
 *
 * await using pkg = await tempPackage({
 *   config: { name: "@scope/name", version: "1.2.3" },
 * });
 *
 * assertEquals(pkg.name, "name");
 * assertEquals(pkg.version, "1.2.3");
 * ```
 *
 * @example Create a package with config version updates
 * ```ts
 * import { tempPackage } from "@roka/forge/testing";
 * import { assertEquals } from "@std/assert";
 *
 * await using pkg = await tempPackage({
 *   config: { name: "@scope/name", version: "1.2.3" },
 *   commit: [{
 *     subject: "bump",
 *     config: [
 *       { name: "@scope/name", version: "1.2.1" },
 *       { name: "@scope/name", version: "1.2.2" },
 *       { name: "@scope/name", version: "1.2.3" },
 *     ],
 *   }],
 * });
 *
 * assertEquals(pkg.version, "1.2.3");
 * ```
 *
 * @example Create a package with release tag
 * ```ts
 * import { tempPackage } from "@roka/forge/testing";
 * import { assertEquals } from "@std/assert";
 *
 * await using pkg = await tempPackage({
 *   config: { name: "@scope/name" },
 *   commit: [{ subject: "release", tag: ["name@1.2.3"] }],
 * });
 *
 * assertEquals(pkg.version, "1.2.3");
 * ```
 */
export async function tempPackage(
  options?: TempPackageOptions,
): Promise<Package & AsyncDisposable> {
  const repo = await createRepository({ workspace: false, ...options });
  const { pkg } = await createPackage(repo.path(), options?.config);
  return Object.assign(pkg, {
    [Symbol.asyncDispose]: repo[Symbol.asyncDispose],
  });
}

/**
 * Creates a test workspace of packages using given configurations.
 *
 * The workspace will be created under a temporary directory, which will be
 * automatically removed when the workspace is disposed.
 *
 * @example Create a temporary workspace from configurations
 * ```ts
 * import { tempWorkspace } from "@roka/forge/testing";
 * import { assertEquals } from "@std/assert";
 *
 * await using workspace = await tempWorkspace({
 *   config: [
 *     { name: "@scope/name1", version: "1.2.3" },
 *     { name: "@scope/name2", version: "3.2.1" },
 *   ],
 * });
 * const [pkg1, pkg2] = workspace;
 *
 * assertEquals(pkg1?.name, "name1");
 * assertEquals(pkg2?.name, "name2");
 * assertEquals(pkg1?.version, "1.2.3");
 * assertEquals(pkg2?.version, "3.2.1");
 * ```
 *
 * @example Create a workspace with given commits and tags
 * ```ts
 * import { tempWorkspace } from "@roka/forge/testing";
 * import { assertEquals } from "@std/assert";
 *
 * await using workspace = await tempWorkspace({
 *   config: [
 *     { name: "@scope/name1" },
 *     { name: "@scope/name2" },
 *   ],
 *   commit: [
 *     { subject: "fix(name1): bug", tag: ["name1@1.2.3"] },
 *     { subject: "fix(name2): bug", tag: ["name2@3.2.1"] },
 *   ],
 * });
 * const [pkg1, pkg2] = workspace;
 *
 * assertEquals(pkg1?.version, "1.2.3");
 * assertEquals(pkg2?.version, "3.2.1");
 * ```
 */
export async function tempWorkspace(
  options?: TempWorkspaceOptions,
): Promise<Package[] & AsyncDisposable> {
  const repo = await createRepository({ workspace: true, ...options });
  await Promise.all((options?.config ?? [])
    .map((config) =>
      createPackage(repo.path(memberDirectory(config)), config)
    ));
  await createPackage(repo.path(), {
    workspace: (options?.config ?? [])
      ?.map((config) => memberDirectory(config)),
  });
  const packages = await workspace({ root: repo.path() });
  return Object.assign(packages, {
    [Symbol.asyncDispose]: repo[Symbol.asyncDispose],
  });
}

/**
 * Creates an import map to use when compiling packages in tests.
 *
 * The import map includes all dependencies of the current workspace,
 * as well as its exports as a local file import map. The latter enables the
 * tests to compile packages against the local changes in the workspace.
 *
 * This is mainly useful for testing `forge` itself, and will be removed
 * in the future.
 */
export async function unstableTestImports(): Promise<Record<string, string>> {
  await Promise.resolve();
  const root = await packageInfo({
    directory: dirname(dirname(dirname(fromFileUrl(import.meta.url)))),
  });
  const packages = await workspace({ root: root.directory });
  const imports: Record<string, string> = {};
  packages.forEach((pkg) => {
    const exports = pkg.config.exports === undefined
      ? {}
      : typeof pkg.config.exports === "string"
      ? { ".": pkg.config.exports }
      : pkg.config.exports;
    Object.entries(exports).forEach(([name, path]) => {
      imports[join(pkg.config.name ?? pkg.name, name)] = `./${
        join(relative(pkg.root, pkg.directory), path)
      }`;
    });
  });
  return {
    ...root.config.imports,
    ...imports,
  };
}

async function createRepository(
  options: { workspace: boolean } & (TempPackageOptions | TempWorkspaceOptions),
) {
  const repo = await tempRepository(options?.repo);
  for (
    const { subject, tag: tags, config: configs } of options?.commit ?? []
  ) {
    for (const config of configs ?? []) {
      // deno-lint-ignore no-await-in-loop
      const { path } = await createPackage(
        options.workspace ? repo.path(memberDirectory(config)) : repo.path(),
        config,
      );
      // deno-lint-ignore no-await-in-loop
      await repo.index.add(path);
    }
    // deno-lint-ignore no-await-in-loop
    await repo.commit.create({ subject, allowEmpty: !configs?.length });
    for (const tag of tags ?? []) {
      // deno-lint-ignore no-await-in-loop
      await repo.tag.create(tag);
    }
  }
  return repo;
}

async function createPackage(directory: string, config: Config | undefined) {
  const path = join(directory, "deno.json");
  await Deno.mkdir(directory, { recursive: true });
  await Deno.writeTextFile(path, JSON.stringify(config ?? {}, undefined, 2));
  return { pkg: await packageInfo({ directory }), path };
}

function memberDirectory(config: Config) {
  if (!config.name) return "pkg";
  return config.name.replace(/^@[^/]+\//, "");
}
