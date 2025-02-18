import { pool } from "@roka/async/pool";
import type { Permissions } from "@roka/package";
import { type Package, PackageError } from "@roka/package";
import { assert } from "@std/assert/assert";
import { encodeHex } from "@std/encoding";
import { basename, join, relative } from "@std/path";

/** Options for compiling a package. */
export interface CompileOptions {
  /**
   * Target OS architectures.
   * @default {[Deno.build.target]}
   */
  target?: string[];
  /** Use update version. */
  release?: boolean;
  /** Bundle artifacts. */
  bundle?: boolean;
  /** Create a checksum file. */
  checksum?: boolean;
  /**
   * Install at given directory.
   *
   * If set to `true`, the artifacts will be installed to `$HOME/.local/bin`.
   */
  install?: string | true;
  /** Max concurrent compilations. */
  concurrency?: number;
}

/** Compile a package using the given options. */
export async function compile(
  pkg: Package,
  options?: CompileOptions,
): Promise<string[]> {
  assert(pkg.config.compile, "Compile configuration is required");
  const {
    target = [Deno.build.target],
    concurrency = navigator.hardwareConcurrency,
  } = options ?? {};
  const { main, include = [], kv = false, permissions = {} } =
    pkg.config.compile ?? {};
  assert(main, "Compile entrypoint is required");
  const version = options?.release ? pkg.config?.version : pkg.version;
  const directory = version
    ? join("dist", pkg.module, version)
    : join("dist", pkg.module);
  try {
    await Deno.remove(directory, { recursive: true });
  } catch (e: unknown) {
    if (!(e instanceof Deno.errors.NotFound)) throw e;
  }
  await Deno.mkdir(directory, { recursive: true });
  const config = join(directory, "deno.json");
  if (version) pkg.config.version = version;
  await Deno.writeTextFile(config, JSON.stringify(pkg.config, null, 2));
  const artifacts = await pool(
    target.map(async (target) => {
      const output = join(directory, target, pkg.module);
      const args = [
        "compile",
        `--target=${target}`,
        permission(permissions, "read", false),
        permission(permissions, "write", false),
        permission(permissions, "net", false),
        permission(permissions, "sys", true),
        permission(permissions, "env", true),
        permission(permissions, "run", true),
        permission(permissions, "ffi", true),
        "--no-prompt",
        kv ? "--unstable-kv" : [],
        `--include=${config}`,
        include.map((path) => `--include=${join(pkg.directory, path)}`),
        `--output=${output}`,
        join(pkg.directory, main),
      ].flat();
      const command = new Deno.Command("deno", { args });
      const { code, stderr } = await command.output();
      if (code !== 0) {
        console.error(new TextDecoder().decode(stderr));
        throw new PackageError(`Compile failed for ${pkg.config.name}`);
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
    }),
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

/** Return all compile targets support by `deno compile`. */
export async function targets(): Promise<string[]> {
  const command = new Deno.Command("deno", { args: ["compile", "--target"] });
  const { code, stderr } = await command.output();
  assert(code !== 0, "Expected the command to fail");
  const match = new TextDecoder().decode(stderr).match(
    /\[possible values: (?<targets>.+)\]/,
  );
  assert(match?.groups?.targets, "Expected targets in stderr");
  return match.groups.targets.split(", ");
}

function permission<P extends keyof Permissions>(
  permissions: Permissions,
  name: P,
  merge: boolean,
): string[] {
  const value = permissions[name];
  if (value === undefined) return [];
  if (typeof value === "boolean") {
    return value ? [`--allow-${name}`] : [`--no-allow-${name}`];
  }
  const values = Array.isArray(value) ? value : [value];
  if (merge) return [`--allow-${name}=${values.join(",")}`];
  return values.map((v) => `--allow-${name}=${v}`);
}

async function tar(directory: string, output: string) {
  const command = new Deno.Command("tar", {
    args: ["-czf", output, "-C", directory, "."],
  });
  const { code, stderr } = await command.output();
  if (code !== 0) {
    console.error(new TextDecoder().decode(stderr));
    throw new PackageError(`Bundle failed for ${output}`);
  }
}

async function zip(directory: string, output: string) {
  const command = new Deno.Command("zip", {
    cwd: directory,
    args: ["-r", relative(directory, output), "."],
  });
  const { code, stderr } = await command.output();
  if (code !== 0) {
    console.error(new TextDecoder().decode(stderr));
    throw new PackageError(`Bundle failed for ${output}`);
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
