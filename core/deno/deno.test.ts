import { deno } from "@roka/deno";
import { fakeCommand } from "@roka/testing/fake";
import { assertEquals, assertExists } from "@std/assert";
import { omit } from "@std/collections";

async function assertDeno(
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

Deno.test("deno() passes correct common options", async () => {
  // @todo use the run command
  await assertDeno(() =>
    deno().lint(["file"], {
      config: false,
      quiet: true,
    }), {
    args: [
      "lint",
      "--no-config",
      "--quiet",
      "file",
    ],
  });
  await assertDeno(() =>
    deno().lint(["file"], {
      config: "deno.json",
      ext: "ts",
    }), {
    args: [
      "lint",
      "--config",
      "deno.json",
      "--ext=ts",
      "file",
    ],
  });
});

Deno.test("deno() passes correct file options", async () => {
  await assertDeno(() =>
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

Deno.test("deno() passes correct file watching options", async () => {
  // @todo use the run command
  await assertDeno(() =>
    deno().lint(["file"], {
      watch: false,
    }), {
    args: [
      "lint",
      "file",
    ],
  });
  await assertDeno(() =>
    deno().lint(["file"], {
      watch: true,
      watchExclude: ["exclude1", "exclude2"],
      clearScreen: false,
    }), {
    args: [
      "lint",
      "--watch",
      "--watch-exclude=exclude1,exclude2",
      "--no-clear-screen",
      "file",
    ],
  });
});

Deno.test("deno() passes correct type checking options", async () => {
  // @todo use the run command
  await assertDeno(() =>
    deno().compile("script", {
      check: false,
    }), {
    args: [
      "compile",
      "--no-check",
      "script",
    ],
  });
  await assertDeno(() =>
    deno().compile("script", {
      check: true,
    }), {
    args: [
      "compile",
      "--check",
      "script",
    ],
  });
  await assertDeno(() =>
    deno().compile("script", {
      check: "all",
    }), {
    args: [
      "compile",
      "--check=all",
      "script",
    ],
  });
});

Deno.test("deno() passes correct permission options", async () => {
  // @todo use the run command
  await assertDeno(() =>
    deno().compile("script", {
      allowAll: true,
    }), {
    args: [
      "compile",
      "--allow-all",
      "script",
    ],
  });
  await assertDeno(() =>
    deno().compile("script", {
      permissionSet: true,
    }), {
    args: [
      "compile",
      "--permission-set",
      "script",
    ],
  });
  await assertDeno(() =>
    deno().compile("script", {
      permissionSet: "test",
    }), {
    args: [
      "compile",
      "--permission-set=test",
      "script",
    ],
  });
  await assertDeno(() =>
    deno().compile("script", {
      prompt: false,
    }), {
    args: [
      "compile",
      "--no-prompt",
      "script",
    ],
  });
  await assertDeno(() =>
    deno().compile("script", {
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
      "compile",
      "--allow-read",
      "--allow-write",
      "--allow-import",
      "--allow-net",
      "--allow-env",
      "--allow-sys",
      "--allow-run",
      "--allow-ffi",
      "script",
    ],
  });
  await assertDeno(() =>
    deno().compile("script", {
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
      "compile",
      "--allow-read=read1,read2",
      "--allow-write=write1,write2",
      "--allow-import=import1,import2:8080",
      "--allow-net=net1,net2:8080",
      "--allow-env=VAR1,VAR2",
      "--allow-sys=uid,gid",
      "--allow-run=cmd1,cmd2",
      "--allow-ffi=ffi1,ffi2",
      "script",
    ],
  });
  await assertDeno(() =>
    deno().compile("script", {
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
      "compile",
      "--deny-read",
      "--deny-write",
      "--deny-import",
      "--deny-net",
      "--deny-env",
      "--deny-sys",
      "--deny-run",
      "--deny-ffi",
      "script",
    ],
  });
  await assertDeno(() =>
    deno().compile("script", {
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
      "compile",
      "--deny-read=read1,read2",
      "--deny-write=write1,write2",
      "--deny-import=import1,import2:8080",
      "--deny-net=net1,net2:8080",
      "--deny-env=VAR1,VAR2",
      "--deny-sys=uid,gid",
      "--deny-run=cmd1,cmd2",
      "--deny-ffi=ffi1,ffi2",
      "script",
    ],
  });
  await assertDeno(() =>
    deno().compile("script", {
      tracePermissions: true,
      auditPermissions: "audit.json",
    }), {
    args: [
      "compile",
      "script",
    ],
    env: {
      DENO_TRACE_PERMISSIONS: "1",
      DENO_AUDIT_PERMISSIONS: "audit.json",
    },
  });
});

Deno.test("deno() passes correct debugging options", async () => {
  // @todo use the run command
  await assertDeno(() =>
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
  await assertDeno(() =>
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
  // @todo use the run command
  await assertDeno(() =>
    deno().test(["file"], {
      cachedOnly: true,
      frozen: true,
      lock: false,
      npm: false,
      remote: false,
      reload: true,
      vendor: true,
    }), {
    args: [
      "test",
      "--cached-only",
      "--frozen",
      "--no-lock",
      "--no-npm",
      "--no-remote",
      "--reload",
      "--vendor",
      "file",
    ],
  });
  await assertDeno(() =>
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
  await assertDeno(() =>
    deno().test(["file"], {
      lock: true,
    }), {
    args: [
      "test",
      "file",
    ],
  });
});

Deno.test("deno().compile() passes correct options", async () => {
  await assertDeno(() => deno().compile("script"), {
    args: ["compile", "script"],
  });
  await assertDeno(() =>
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
  await assertDeno(() =>
    deno().compile("script", {
      scriptArgs: ["--arg1", "--arg2=value2"],
      include: ["include1", "include2"],
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
      "include2",
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
  await assertDeno(() => deno().fmt(["file"]), {
    args: [
      "fmt",
      "file",
    ],
  });
  await assertDeno(() =>
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
  await assertDeno(() => deno().lint(["file"]), {
    args: [
      "lint",
      "file",
    ],
  });
  await assertDeno(() =>
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
  await assertDeno(() => deno().test(["file"]), {
    args: ["test", "file"],
  });
  await assertDeno(() =>
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
  await assertDeno(() =>
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
  await assertDeno(() =>
    deno().test(["file"], {
      coverage: "cov/",
      failFast: 10,
      filter: "test()",
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
