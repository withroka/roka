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

Deno.test("deno() passes correct file watching arguments", async () => {
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

Deno.test("deno() passes correct type checking arguments", async () => {
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

Deno.test("deno() passes correct permission arguments", async () => {
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
});

Deno.test("deno() passes correct permission environment variables", async () => {
  // @todo use the run command
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

Deno.test("deno().compile() passes correct arguments", async () => {
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

Deno.test("deno().fmt() passes correct arguments", async () => {
  await assertDeno(() => deno().fmt(["file"]), {
    args: [
      "fmt",
      "file",
    ],
  });
  await assertDeno(() =>
    deno().fmt(["file"], {
      check: true,
      ext: ".ts",
      ignore: ["ignore1", "ignore2"],
      indentWidth: 4,
      lineWidth: 120,
      semicolons: false,
      proseWrap: "preserve",
      useTabs: true,
      unstableComponent: true,
      unstableSql: true,
    }), {
    args: [
      "fmt",
      "--check",
      "--ext",
      ".ts",
      "--ignore=ignore1,ignore2",
      "--indent-width",
      "4",
      "--line-width",
      "120",
      "--no-semicolons",
      "--prose-wrap",
      "preserve",
      "--use-tabs",
      "--unstable-component",
      "--unstable-sql",
      "file",
    ],
  });
});

Deno.test("deno().lint() passes correct arguments", async () => {
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
