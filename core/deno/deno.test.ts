import { pool } from "@roka/async/pool";
import { tempDirectory } from "@roka/fs/temp";
import { maybe } from "@roka/maybe";
import { fakeCommand } from "@roka/testing/fake";
import { assertEquals, assertExists, assertGreater } from "@std/assert";
import { distinct, omit, withoutAll } from "@std/collections";
import { join } from "@std/path";
import { toCamelCase } from "@std/text";
import { type Deno, deno } from "./deno.ts";

let codeFlags: string[];

Deno.test.beforeAll(async () => {
  const codeFile = join(import.meta.dirname ?? ".", "deno.ts");
  const code = await Deno.readTextFile(codeFile);
  const match = code.match(/(?<=\n *)(\w+)(?=\??:)/g);
  assertExists(match);
  assertGreater(match.length, 0);
  codeFlags = distinct(match)
    .filter((flag) => !["cwd", "scriptArgs"].includes(flag));
});

async function assertDenoArgs(
  fn: () => Promise<unknown>,
  expected: { args?: string[]; env?: Record<string, string> },
) {
  await using command = fakeCommand();
  await fn();
  assertEquals(command.runs.length, 1);
  const run = command.runs[0];
  assertExists(run);
  assertEquals(run.command, "deno");
  assertEquals(run.options?.args, expected.args ?? []);
  assertEquals(omit(run.options?.env ?? {}, ["NO_COLOR"]), expected.env ?? {});
}

async function flagsFromCode(command: keyof Deno, name: string) {
  await using dir = await tempDirectory();
  const file = dir.path(`check-${command}-flags.ts`);
  await Deno.writeTextFile(
    file,
    [
      'import { assertType, type Has, type IsExact } from "@std/testing/types";',
      `import { type ${name} } from "@roka/deno";`,
      ...codeFlags.map((flag) =>
        `assertType<Has<keyof ${name}, "${flag}">>(true);`
      ),
      "",
    ].join("\n"),
  );
  const { error } = await maybe(() => deno().check([file]));
  assertExists(error);
  const missing = Array.from(
    error.message.match(
      /(?<=assertType<Has<keyof \w+, ")(\w+)(?=">>\(true\);)/g,
    ) ?? [],
  );
  return withoutAll(codeFlags, missing).toSorted();
}

async function flagsFromHelp(command: keyof Deno) {
  const help = await deno().help(command);
  const flagPattern = /(?:-\w, )?(?<flag>--[\w-]+|[A-Z_]+)/;
  const usagePattern = /(?<usage>(?:\[)?[ =]?<[\w-]+>(?:\.\.\.)?(?:\])?|)/;
  const descriptionPattern = /(?<description>[^\n\r]*)/;
  const pattern = new RegExp(
    `^ {1,10}${flagPattern.source}${usagePattern.source} +${descriptionPattern.source}$`,
  );
  return distinct(
    help.slice(help.indexOf("\nOptions:")).split("\n")
      .map((line) => line.match(pattern)?.groups)
      .filter((group) =>
        group && group["flag"] && !group["description"]?.includes("deprecated")
      )
      .map((group) => group?.["flag"] ?? "")
      .map((flag) => flag.replace(/^--no-/, "--").replace("DENO_", ""))
      .map(toCamelCase),
  ).toSorted();
}

Deno.test("deno() options are complete", async () => {
  async function check(
    command: keyof Deno,
    name: string,
    { ignore }: { ignore?: string[] } = {},
  ) {
    assertEquals(
      withoutAll(await flagsFromCode(command, name), ["cwd", "scriptArgs"]),
      withoutAll(await flagsFromHelp(command), ["help", ...ignore ?? []]),
      `Flags for \`${command} flags\` are not complete`,
    );
  }
  const { errors } = await maybe(() =>
    pool([
      () => check("check", "CheckOptions", { ignore: ["docOnly"] }),
      () => check("compile", "CompileOptions"),
      () => check("fmt", "FormatOptions"),
      () => check("lint", "LintOptions", { ignore: ["rules"] }),
      () => check("test", "TestOptions"),
    ])
  );
  if (errors) throw errors[0];
});

Deno.test("deno() passes correct common options", async () => {
  await assertDenoArgs(() =>
    deno().test(["file"], {
      config: false,
      quiet: true,
    }), {
    args: [
      "test",
      "--no-config",
      "--quiet",
      "file",
    ],
  });
  await assertDenoArgs(() =>
    deno().test(["file"], {
      config: "deno.json",
      ext: "ts",
    }), {
    args: [
      "test",
      "--config",
      "deno.json",
      "--ext=ts",
      "file",
    ],
  });
});

Deno.test("deno() passes correct file options", async () => {
  await assertDenoArgs(() =>
    deno().test(["file"], {
      permitNoFiles: true,
    }), {
    args: [
      "test",
      "--permit-no-files",
      "file",
    ],
  });
});

Deno.test("deno() passes correct runtime options", async () => {
  // @todo use run
  await assertDenoArgs(() =>
    deno().compile("file", {
      codeCache: false,
      envFile: true,
    }), {
    args: [
      "compile",
      "--no-code-cache",
      "--env-file",
      "file",
    ],
  });
  await assertDenoArgs(() =>
    deno().test(["file"], {
      cert: "ca.pem",
      envFile: ".env",
      location: new URL("https://example.com/"),
      preload: ["preload1", new URL("https://example.com/preload2")],
      seed: 12345,
      v8Flags: ["--expose_gc", "--lazy"],
    }), {
    args: [
      "test",
      "--cert",
      "ca.pem",
      "--env-file=.env",
      "--location",
      "https://example.com/",
      "--preload",
      "preload1",
      "--preload",
      "https://example.com/preload2",
      "--seed",
      "12345",
      "--v8-flags=--expose_gc,--lazy",
      "file",
    ],
  });
});

Deno.test("deno() passes correct file watching options", async () => {
  await assertDenoArgs(() =>
    deno().test(["file"], {
      watch: false,
    }), {
    args: [
      "test",
      "file",
    ],
  });
  await assertDenoArgs(() =>
    deno().test(["file"], {
      watch: true,
      watchExclude: ["exclude1", "exclude2"],
      clearScreen: false,
    }), {
    args: [
      "test",
      "--watch",
      "--watch-exclude=exclude1,exclude2",
      "--no-clear-screen",
      "file",
    ],
  });
});

Deno.test("deno() passes correct type checking options", async () => {
  await assertDenoArgs(() =>
    deno().test(["file"], {
      check: false,
    }), {
    args: [
      "test",
      "--no-check",
      "file",
    ],
  });
  await assertDenoArgs(() =>
    deno().test(["file"], {
      check: true,
    }), {
    args: [
      "test",
      "--check",
      "file",
    ],
  });
  await assertDenoArgs(() =>
    deno().test(["file"], {
      check: "all",
    }), {
    args: [
      "test",
      "--check=all",
      "file",
    ],
  });
});

Deno.test("deno() passes correct permission options", async () => {
  await assertDenoArgs(() =>
    deno().test(["file"], {
      allowAll: true,
    }), {
    args: [
      "test",
      "--allow-all",
      "file",
    ],
  });
  await assertDenoArgs(() =>
    deno().test(["file"], {
      permissionSet: true,
    }), {
    args: [
      "test",
      "--permission-set",
      "file",
    ],
  });
  await assertDenoArgs(() =>
    deno().test(["file"], {
      permissionSet: "test",
    }), {
    args: [
      "test",
      "--permission-set=test",
      "file",
    ],
  });
  await assertDenoArgs(() =>
    deno().test(["file"], {
      prompt: false,
    }), {
    args: [
      "test",
      "--no-prompt",
      "file",
    ],
  });
  await assertDenoArgs(() =>
    deno().test(["file"], {
      allowRead: true,
      allowWrite: true,
      allowImport: true,
      allowNet: true,
      allowEnv: true,
      allowSys: true,
      allowRun: true,
      allowFfi: true,
    }), {
    args: [
      "test",
      "--allow-read",
      "--allow-write",
      "--allow-import",
      "--allow-net",
      "--allow-env",
      "--allow-sys",
      "--allow-run",
      "--allow-ffi",
      "file",
    ],
  });
  await assertDenoArgs(() =>
    deno().test(["file"], {
      allowRead: ["read1", "read2"],
      allowWrite: ["write1", "write2"],
      allowImport: ["import1", "import2:8080"],
      allowNet: ["net1", "net2:8080"],
      allowEnv: ["VAR1", "VAR2"],
      allowSys: ["uid", "gid"],
      allowRun: ["cmd1", "cmd2"],
      allowFfi: ["ffi1", "ffi2"],
    }), {
    args: [
      "test",
      "--allow-read=read1,read2",
      "--allow-write=write1,write2",
      "--allow-import=import1,import2:8080",
      "--allow-net=net1,net2:8080",
      "--allow-env=VAR1,VAR2",
      "--allow-sys=uid,gid",
      "--allow-run=cmd1,cmd2",
      "--allow-ffi=ffi1,ffi2",
      "file",
    ],
  });
  await assertDenoArgs(() =>
    deno().test(["file"], {
      denyRead: true,
      denyWrite: true,
      denyImport: true,
      denyNet: true,
      denyEnv: true,
      denySys: true,
      denyRun: true,
      denyFfi: true,
    }), {
    args: [
      "test",
      "--deny-read",
      "--deny-write",
      "--deny-import",
      "--deny-net",
      "--deny-env",
      "--deny-sys",
      "--deny-run",
      "--deny-ffi",
      "file",
    ],
  });
  await assertDenoArgs(() =>
    deno().test(["file"], {
      denyRead: ["read1", "read2"],
      denyWrite: ["write1", "write2"],
      denyImport: ["import1", "import2:8080"],
      denyNet: ["net1", "net2:8080"],
      denyEnv: ["VAR1", "VAR2"],
      denySys: ["uid", "gid"],
      denyRun: ["cmd1", "cmd2"],
      denyFfi: ["ffi1", "ffi2"],
    }), {
    args: [
      "test",
      "--deny-read=read1,read2",
      "--deny-write=write1,write2",
      "--deny-import=import1,import2:8080",
      "--deny-net=net1,net2:8080",
      "--deny-env=VAR1,VAR2",
      "--deny-sys=uid,gid",
      "--deny-run=cmd1,cmd2",
      "--deny-ffi=ffi1,ffi2",
      "file",
    ],
  });
});

Deno.test("deno() passes correct debugging options", async () => {
  await assertDenoArgs(() =>
    deno().test(["file"], {
      inspect: true,
      inspectBrk: true,
      inspectWait: true,
    }), {
    args: [
      "test",
      "--inspect",
      "--inspect-brk",
      "--inspect-wait",
      "file",
    ],
  });
  await assertDenoArgs(() =>
    deno().test(["file"], {
      inspect: "host:9229",
      inspectBrk: "host:9228",
      inspectWait: "host:9227",
    }), {
    args: [
      "test",
      "--inspect=host:9229",
      "--inspect-brk=host:9228",
      "--inspect-wait=host:9227",
      "file",
    ],
  });
});

Deno.test("deno() passes correct dependency management options", async () => {
  await assertDenoArgs(() =>
    deno().test(["file"], {
      frozen: true,
      lock: false,
      npm: false,
      remote: false,
      reload: true,
      vendor: true,
    }), {
    args: [
      "test",
      "--frozen",
      "--no-lock",
      "--no-npm",
      "--no-remote",
      "--reload",
      "--vendor",
      "file",
    ],
  });
  await assertDenoArgs(() =>
    deno().test(["file"], {
      importMap: "deno.json",
      lock: "deno.lock",
      nodeModulesDir: "manual",
      reload: ["jsr:@roka/deno", "npm:"],
    }), {
    args: [
      "test",
      "--import-map",
      "deno.json",
      "--lock",
      "deno.lock",
      "--node-modules-dir=manual",
      "--reload=jsr:@roka/deno,npm:",
      "file",
    ],
  });
  await assertDenoArgs(() =>
    deno().test(["file"], {
      importMap: new URL("https://example.com/deno.json"),
    }), {
    args: [
      "test",
      "--import-map",
      "https://example.com/deno.json",
      "file",
    ],
  });
  await assertDenoArgs(() =>
    deno().test(["file"], {
      lock: true,
    }), {
    args: [
      "test",
      "file",
    ],
  });
});

Deno.test("deno().help() passes correct options", async () => {
  await assertDenoArgs(() => deno().help(), {
    args: [
      "help",
    ],
  });
  await assertDenoArgs(() => deno().help("test"), {
    args: [
      "test",
      "--help",
    ],
  });
  await assertDenoArgs(() => deno().help("test", { context: "full" }), {
    args: [
      "test",
      "--help=full",
    ],
  });
  await assertDenoArgs(() => deno().help("help"), {
    args: [
      "help",
      "--help",
    ],
  });
});

Deno.test("deno().check() passes correct options", async () => {
  await assertDenoArgs(() => deno().check(["file1", "file2"]), {
    args: [
      "check",
      "file1",
      "file2",
    ],
  });
  await assertDenoArgs(() =>
    deno().check(["file"], {
      all: true,
      doc: true,
    }), {
    args: [
      "check",
      "--all",
      "--doc",
      "file",
    ],
  });
  await assertDenoArgs(() =>
    deno().check(["file"], {
      doc: "only",
    }), {
    args: [
      "check",
      "--doc-only",
      "file",
    ],
  });
});

Deno.test("deno().compile() passes correct options", async () => {
  await assertDenoArgs(() => deno().compile("script"), {
    args: ["compile", "script"],
  });
  await assertDenoArgs(() =>
    deno().compile("script", {
      scriptArgs: ["--arg1", "--arg2=value2"],
    }), {
    args: [
      "compile",
      "script",
      "--arg1",
      "--arg2=value2",
    ],
  });
  await assertDenoArgs(() =>
    deno().compile("script", {
      scriptArgs: ["--arg1", "--arg2=value2"],
      include: ["include1", new URL("https://example.com/include2")],
      exclude: ["exclude1", "exclude2"],
      icon: "icon.ico",
      terminal: false,
      output: "output",
      target: "x86_64-unknown-linux-gnu",
    }), {
    args: [
      "compile",
      "--exclude",
      "exclude1",
      "--exclude",
      "exclude2",
      "--include",
      "include1",
      "--include",
      "https://example.com/include2",
      "--icon",
      "icon.ico",
      "--no-terminal",
      "--output",
      "output",
      "--target",
      "x86_64-unknown-linux-gnu",
      "script",
      "--arg1",
      "--arg2=value2",
    ],
  });
});

Deno.test("deno().fmt() passes correct options", async () => {
  await assertDenoArgs(() => deno().fmt(["file1", "file2"]), {
    args: [
      "fmt",
      "file1",
      "file2",
    ],
  });
  await assertDenoArgs(() =>
    deno().fmt(["file"], {
      check: true,
      ignore: ["ignore1", "ignore2"],
      indentWidth: 4,
      lineWidth: 120,
      semicolons: false,
      proseWrap: "preserve",
      singleQuote: true,
      useTabs: true,
      unstableComponent: true,
      unstableSql: true,
    }), {
    args: [
      "fmt",
      "--check",
      "--ignore=ignore1,ignore2",
      "--indent-width",
      "4",
      "--line-width",
      "120",
      "--no-semicolons",
      "--prose-wrap",
      "preserve",
      "--single-quote",
      "--use-tabs",
      "--unstable-component",
      "--unstable-sql",
      "file",
    ],
  });
});

Deno.test("deno().lint() passes correct options", async () => {
  await assertDenoArgs(() => deno().lint(["file1", "file2"]), {
    args: [
      "lint",
      "file1",
      "file2",
    ],
  });
  await assertDenoArgs(() =>
    deno().lint(["file"], {
      compact: true,
      fix: true,
      ignore: ["ignore1", "ignore2"],
      json: true,
      rulesExclude: ["rulesExclude1", "rulesExclude2"],
      rulesInclude: ["rulesInclude1", "rulesInclude2"],
      rulesTags: ["rulesTags1", "rulesTags2"],
    }), {
    args: [
      "lint",
      "--compact",
      "--fix",
      "--ignore=ignore1,ignore2",
      "--json",
      "--rules-exclude=rulesExclude1,rulesExclude2",
      "--rules-include=rulesInclude1,rulesInclude2",
      "--rules-tags=rulesTags1,rulesTags2",
      "file",
    ],
  });
});

Deno.test("deno().test() passes correct options", async () => {
  await assertDenoArgs(() => deno().test(["file1", "file2"]), {
    args: [
      "test",
      "file1",
      "file2",
    ],
  });
  await assertDenoArgs(() =>
    deno().test(["file"], {
      scriptArgs: ["--arg1", "--arg2=value2"],
    }), {
    args: [
      "test",
      "file",
      "--arg1",
      "--arg2=value2",
    ],
  });
  await assertDenoArgs(() =>
    deno().test(["file"], {
      scriptArgs: ["--arg1", "--arg2=value2"],
      clean: true,
      coverage: true,
      coverageRawDataOnly: true,
      doc: true,
      failFast: true,
      parallel: true,
      run: false,
      shuffle: true,
      hideStacktraces: true,
      traceLeaks: true,
    }), {
    args: [
      "test",
      "--clean",
      "--coverage",
      "--coverage-raw-data-only",
      "--doc",
      "--fail-fast",
      "--parallel",
      "--no-run",
      "--shuffle",
      "--hide-stacktraces",
      "--trace-leaks",
      "file",
      "--arg1",
      "--arg2=value2",
    ],
  });
  await assertDenoArgs(() =>
    deno().test(["file"], {
      coverage: "cov/",
      failFast: 10,
      filter: "test()",
      ignore: ["ignore1", "ignore2"],
      junitPath: "junit.xml",
      parallel: 4,
      reporter: "junit",
      shuffle: 12345,
    }), {
    args: [
      "test",
      "--coverage=cov/",
      "--fail-fast=10",
      "--filter",
      "test()",
      "--ignore=ignore1,ignore2",
      "--junit-path",
      "junit.xml",
      "--parallel",
      "--reporter",
      "junit",
      "--shuffle=12345",
      "file",
    ],
    env: {
      DENO_JOBS: "4",
    },
  });
});
