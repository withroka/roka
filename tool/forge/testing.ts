/**
 * This module provides utilities to create packages for testing.
 *
 * ```ts
 * import { tempPackage } from "@roka/forge/testing";
 * await using pkg = await tempPackage({ name: "@scope/name" });
 * ```
 *
 * @module testing
 */

import { type Config, type Package, packageInfo } from "@roka/forge/package";
import { join } from "@std/path";

/**
 * Creates a test package under given directory with given configuration.
 *
 * @example
 *
 * ```ts
 * import { testPackage } from "@roka/forge/testing";
 * import { tempDirectory } from "@roka/testing/temp";
 * import { assertEquals } from "@std/assert";
 *
 * await using directory = await tempDirectory();
 * const pkg = await testPackage(directory.path(), {
 *   name: "@scope/name",
 *   version: "1.2.3",
 * });
 *
 * assertEquals(pkg.name, "name");
 * assertEquals(pkg.version, "1.2.3");
 * ```
 */
export async function testPackage(
  directory: string,
  config: Config & { root?: string },
): Promise<Package> {
  await Deno.mkdir(directory, { recursive: true });
  await Deno.writeTextFile(
    join(directory, "deno.json"),
    JSON.stringify(config, undefined, 2),
  );
  const pkg = await packageInfo({ directory });
  if (config.root) pkg.root = config.root;
  return pkg;
}

/**
 * Creates a test package with given configuration.
 *
 * The package will be created under a temporary directory, which will be
 * automatically removed when the package is disposed.
 *
 * @example
 *
 * ```ts
 * import { tempPackage } from "@roka/forge/testing";
 * import { assertEquals } from "@std/assert";
 *
 * await using pkg = await tempPackage({
 *   name: "@scope/name",
 *   version: "1.2.3",
 * });
 *
 * assertEquals(pkg.name, "name");
 * assertEquals(pkg.version, "1.2.3");
 * ```
 */
export async function tempPackage(
  config: Config,
): Promise<AsyncDisposable & Package> {
  const directory = await Deno.makeTempDir();
  const pkg = await testPackage(directory, config);
  return Object.assign(pkg, {
    [Symbol.asyncDispose]: () => Deno.remove(directory, { recursive: true }),
  });
}
