/**
 * This module provides the {@linkcode compile} function for compiling Deno
 * packages into standalone executables for various target platforms. Supports
 * bundling, checksums, and local installation.
 *
 * ```ts
 * import { compile } from "@roka/forge/compile";
 * import { packageInfo } from "@roka/forge/package";
 * async function usage() {
 *   const pkg = await packageInfo();
 *   await compile(pkg, { target: ["x86_64-unknown-linux-gnu"] });
 * }
 * ```
 *
 * The package configuration file (`deno.json`) must contain an entry of
 * type {@linkcode ForgeConfig}. This configuration declares the main entry
 * point and the additional files to bundle.
 *
 * ```json
 * {
 *   "forge": {
 *     "main": "main.ts",
 *     "include": ["README.md", "LICENSE"]
 *   }
 * }
 * ```
 *
 * @module compile
 */

import { pool } from "@roka/async/pool";
import { assertExists, assertNotEquals } from "@std/assert";
import { encodeHex } from "@std/encoding";
import { basename, join, relative } from "@std/path";
import { type Package, PackageError } from "./package.ts";

/** Options for the {@linkcode compile} function. */
export interface CompileOptions {
  /**
   * Output directory for compiled artifacts.
   * @default {"dist"}
   */
  dist?: string;
  /**
   * Target OS architectures.
   * @default {[Deno.build.target]}
   */
  target?: string[];
  /** Bundle artifacts. */
  bundle?: boolean;
  /** Create a checksum file. */
  checksum?: boolean;
  /**
   * Install at the given directory.
   *
   * If set to `true`, the artifacts will be installed to `$HOME/.local/bin`.
   */
  install?: string | true;
  /** Max concurrent compilations. */
  concurrency?: number;
}

/**
 * Compile a package using the given options.
 *
 * @param pkg Package to compile.
 * @throws {PackageError} If the package does not have a compile configuration.
 */
export async function compile(
  pkg: Package,
  options?: CompileOptions,
): Promise<string[]> {
  if (!pkg.config.forge) {
    throw new PackageError("Compile configuration is required");
  }
  const {
    dist = join(pkg.root, "dist"),
    target = [Deno.build.target],
    concurrency = navigator.hardwareConcurrency,
  } = options ?? {};
  const { main, include = [] } = pkg.config.forge ?? {};
  assertExists(main, "Compile entrypoint is required");
  const directory = join(dist, pkg.name, pkg.version);
  try {
    await Deno.remove(directory, { recursive: true });
  } catch (e: unknown) {
    if (!(e instanceof Deno.errors.NotFound)) throw e;
  }
  await Deno.mkdir(directory, { recursive: true });
  const config = join(directory, "deno.json");
  await Deno.writeTextFile(
    config,
    JSON.stringify({ ...pkg.config, version: pkg.version }, undefined, 2),
  );
  const artifacts = await pool(
    target,
    async (target) => {
      const output = join(directory, target, pkg.name);
      const args = [
        "compile",
        "--permission-set",
        "--no-prompt",
        `--target=${target}`,
        `--include=${config}`,
        include.map((path) => `--include=${join(pkg.directory, path)}`),
        `--output=${output}`,
        join(pkg.directory, main),
      ].flat();
      const command = new Deno.Command("deno", { args });
      const { code, stderr } = await command.output();
      if (code !== 0) {
        const error = new TextDecoder().decode(stderr);
        throw new PackageError(`Compile failed for ${pkg.name}`, {
          cause: { command: "deno", args, code, error },
        });
      }
      if (options?.install) {
        const install = options.install === true
          ? `${Deno.env.get("HOME")}/.local/bin`
          : options.install;
        await Deno.mkdir(install, { recursive: true });
        await Deno.copyFile(output, join(install, basename(output)));
      }
      if (!options?.bundle) return output;
      const isWindows = target.includes("windows");
      const build = join(directory, target);
      const bundle = `${build}.${isWindows ? "zip" : "tar.gz"}`;
      await (isWindows ? zip : tar)(build, bundle);
      return bundle;
    },
    { concurrency },
  );
  if (options?.checksum) {
    const checksumFile = join(directory, "sha256.txt");
    await Deno.writeTextFile(
      checksumFile,
      await sha256sum(directory, artifacts),
    );
    artifacts.push(checksumFile);
  }
  return artifacts;
}

/** Return all compile targets supported by `deno compile`. */
export async function targets(): Promise<string[]> {
  const command = new Deno.Command("deno", { args: ["compile", "--target"] });
  const { code, stderr } = await command.output();
  assertNotEquals(code, 0, "Expected the command to fail");
  const match = new TextDecoder().decode(stderr).match(
    /\[possible values: (?<targets>.+)\]/,
  );
  assertExists(match?.groups?.targets, "Expected targets in stderr");
  return match.groups.targets.split(", ");
}

async function tar(directory: string, output: string) {
  const args = ["-czf", output, "-C", directory, "."];
  const command = new Deno.Command("tar", { args });
  const { code, stderr } = await command.output();
  if (code !== 0) {
    const error = new TextDecoder().decode(stderr);
    throw new PackageError(`Bundle failed for ${output}`, {
      cause: { command: "tar", args, code, error },
    });
  }
}

async function zip(cwd: string, output: string) {
  const args = ["-r", relative(cwd, output), "."];
  const command = new Deno.Command("zip", { cwd, args });
  const { code, stderr } = await command.output();
  if (code !== 0) {
    const error = new TextDecoder().decode(stderr);
    throw new PackageError(`Bundle failed for ${output}`, {
      cause: { command: "zip", cwd, args, code, error },
    });
  }
}

async function sha256sum(directory: string, artifacts: string[]) {
  const checksums = await Promise.all(artifacts.map(async (artifact) => {
    const content = await Deno.readFile(artifact);
    const checksum = encodeHex(await crypto.subtle.digest("SHA-256", content));
    return `${checksum}  ${relative(directory, artifact)}\n`;
  }));
  return checksums.join("");
}
