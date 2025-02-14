import { Command, EnumType } from "@cliffy/command";
import { pool } from "@roka/async/pool";
import { getWorkspace, type Package, PackageError } from "@roka/package";
import { displayVersion } from "@roka/package/version";
import { assert } from "@std/assert/assert";
import { encodeHex } from "@std/encoding";
import { basename, join, relative } from "@std/path";
import type { Permissions } from "../../core/package/package.ts";

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
  /** Install at given directory. */
  install?: string;
  /** Max concurrent compilations. */
  concurrency?: number;
}

/** Return all compile targets support by `deno compile`. */
export async function compileTargets(): Promise<string[]> {
  const command = new Deno.Command("deno", { args: ["compile", "--target"] });
  const { code, stderr } = await command.output();
  assert(code !== 0, "Expected the command to fail");
  const match = new TextDecoder().decode(stderr).match(
    /\[possible values: (?<targets>.+)\]/,
  );
  assert(match?.groups?.targets, "Expected targets in stderr");
  return match.groups.targets.split(", ");
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
  const artifacts = await pool(target, async (target) => {
    const output = join(directory, target, pkg.module);
    const args = [
      "compile",
      `--target=${target}`,
      permissionArgs(permissions, "read", false),
      permissionArgs(permissions, "write", false),
      permissionArgs(permissions, "net", false),
      permissionArgs(permissions, "sys", true),
      permissionArgs(permissions, "env", true),
      permissionArgs(permissions, "run", true),
      permissionArgs(permissions, "ffi", true),
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
      await Deno.mkdir(options.install, { recursive: true });
      await Deno.copyFile(output, join(options.install, basename(output)));
    }
    if (!options?.bundle) return output;
    const isWindows = target.includes("windows");
    const build = join(directory, target);
    const bundle = `${build}.${isWindows ? "zip" : "tar.gz"}`;
    await (isWindows ? zip : tar)(build, bundle);
    return bundle;
  }, { concurrency });
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

function permissionArgs<P extends keyof Permissions>(
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

async function main(args: string[]) {
  const command = new Command()
    .name("compile")
    .description("Compile packages.")
    .version(await displayVersion())
    .arguments("[directories...:file]")
    .type("target", new EnumType(await compileTargets()))
    .option("--target=<architechture:target>", "Target OS architecture.", {
      collect: true,
    })
    .option("--release", "Use new release version.", { default: false })
    .option("--bundle", "Zip and bundle artfifacts.", { default: false })
    .option("--checksum", "Create a checksum file.", { default: false })
    .option("--install=<directory:file>", "Install at given directory.")
    .option("--concurrency=<number:number>", "Max concurrent compilations.")
    .action(
      async (options, ...directories) => {
        if (directories.length === 0) directories = ["."];
        const packages = await getWorkspace({ directories });
        await pool(
          packages.filter((pkg) => pkg.config.compile),
          async (pkg) => {
            const artifacts = await compile(pkg, options);
            console.log(`🏺 Compiled ${pkg.module}`);
            for (const artifact of artifacts) {
              console.log(`    ${artifact}`);
            }
          },
          options,
        );
      },
    );
  await command.parse(args);
}

if (import.meta.main) await main(Deno.args);
