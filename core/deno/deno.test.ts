import { assertArrayObjectMatch } from "@roka/assert";
import { deno } from "@roka/deno";
import { fakeCommand } from "@roka/testing/fake";
import { assertEquals } from "@std/assert";

Deno.test("deno() passes correct file watching arguments", async () => {
  // @todo use the run command
  await using command = fakeCommand();
  await deno().lint(["input.ts"]);
  await deno().lint(["input.ts"], { watch: false });
  await deno().lint(["input.ts"], { watch: true });
  await deno().lint(["input.ts"], {
    watch: true,
    watchExclude: ["exclude1", "exclude2"],
  });
  await deno().lint(["input.ts"], { watch: true, clearScreen: false });
  assertEquals(
    command.runs.map((x) => x?.options?.args),
    [
      ["lint", "input.ts"],
      ["lint", "input.ts"],
      ["lint", "--watch", "input.ts"],
      ["lint", "--watch", "--watch-exclude=exclude1,exclude2", "input.ts"],
      ["lint", "--watch", "--no-clear-screen", "input.ts"],
    ],
  );
});

Deno.test("deno() passes correct type checking arguments", async () => {
  // @todo use the run command
  await using command = fakeCommand();
  await deno().compile("input.ts");
  await deno().compile("input.ts", { check: true });
  await deno().compile("input.ts", { check: "all" });
  await deno().compile("input.ts", { check: false });
  assertEquals(
    command.runs.map((x) => x?.options?.args),
    [
      ["compile", "input.ts"],
      ["compile", "--check", "input.ts"],
      ["compile", "--check=all", "input.ts"],
      ["compile", "--no-check", "input.ts"],
    ],
  );
});

Deno.test("deno() passes correct permission arguments", async () => {
  // @todo use the run command
  await using command = fakeCommand();
  await deno().compile("input.ts");
  await deno().compile("input.ts", { allowAll: true });
  await deno().compile("input.ts", { permissionSet: true });
  await deno().compile("input.ts", { permissionSet: "test" });
  await deno().compile("input.ts", { prompt: false });
  await deno().compile("input.ts", { allowRead: true });
  await deno().compile("input.ts", { allowRead: ["path1", "path2"] });
  await deno().compile("input.ts", { denyRead: true });
  await deno().compile("input.ts", { denyRead: ["path1", "path2"] });
  await deno().compile("input.ts", { allowWrite: true });
  await deno().compile("input.ts", { allowWrite: ["path1", "path2"] });
  await deno().compile("input.ts", { denyWrite: true });
  await deno().compile("input.ts", { denyWrite: ["path1", "path2"] });
  await deno().compile("input.ts", { allowImport: true });
  await deno().compile("input.ts", { allowImport: ["host1", "host2:8080"] });
  await deno().compile("input.ts", { denyImport: true });
  await deno().compile("input.ts", { denyImport: ["host1", "host2:8080"] });
  await deno().compile("input.ts", { allowNet: true });
  await deno().compile("input.ts", { allowNet: ["host1", "host2:8080"] });
  await deno().compile("input.ts", { denyNet: true });
  await deno().compile("input.ts", { denyNet: ["host1", "host2:8080"] });
  await deno().compile("input.ts", { allowEnv: true });
  await deno().compile("input.ts", { allowEnv: ["VAR1", "VAR2"] });
  await deno().compile("input.ts", { denyEnv: true });
  await deno().compile("input.ts", { denyEnv: ["VAR1", "VAR2"] });
  await deno().compile("input.ts", { allowSys: true });
  await deno().compile("input.ts", { allowSys: ["uid", "gid"] });
  await deno().compile("input.ts", { denySys: true });
  await deno().compile("input.ts", { denySys: ["uid", "gid"] });
  await deno().compile("input.ts", { allowRun: true });
  await deno().compile("input.ts", { allowRun: ["cmd1", "cmd2"] });
  await deno().compile("input.ts", { denyRun: true });
  await deno().compile("input.ts", { denyRun: ["cmd1", "cmd2"] });
  await deno().compile("input.ts", { allowFfi: true });
  await deno().compile("input.ts", { allowFfi: ["path1", "path2"] });
  await deno().compile("input.ts", { denyFfi: true });
  await deno().compile("input.ts", { denyFfi: ["path1", "path2"] });
  assertEquals(
    command.runs.map((x) => x?.options?.args),
    [
      ["compile", "input.ts"],
      ["compile", "--allow-all", "input.ts"],
      ["compile", "--permission-set", "input.ts"],
      ["compile", "--permission-set=test", "input.ts"],
      ["compile", "--no-prompt", "input.ts"],
      ["compile", "--allow-read", "input.ts"],
      ["compile", "--allow-read=path1,path2", "input.ts"],
      ["compile", "--deny-read", "input.ts"],
      ["compile", "--deny-read=path1,path2", "input.ts"],
      ["compile", "--allow-write", "input.ts"],
      ["compile", "--allow-write=path1,path2", "input.ts"],
      ["compile", "--deny-write", "input.ts"],
      ["compile", "--deny-write=path1,path2", "input.ts"],
      ["compile", "--allow-import", "input.ts"],
      ["compile", "--allow-import=host1,host2:8080", "input.ts"],
      ["compile", "--deny-import", "input.ts"],
      ["compile", "--deny-import=host1,host2:8080", "input.ts"],
      ["compile", "--allow-net", "input.ts"],
      ["compile", "--allow-net=host1,host2:8080", "input.ts"],
      ["compile", "--deny-net", "input.ts"],
      ["compile", "--deny-net=host1,host2:8080", "input.ts"],
      ["compile", "--allow-env", "input.ts"],
      ["compile", "--allow-env=VAR1,VAR2", "input.ts"],
      ["compile", "--deny-env", "input.ts"],
      ["compile", "--deny-env=VAR1,VAR2", "input.ts"],
      ["compile", "--allow-sys", "input.ts"],
      ["compile", "--allow-sys=uid,gid", "input.ts"],
      ["compile", "--deny-sys", "input.ts"],
      ["compile", "--deny-sys=uid,gid", "input.ts"],
      ["compile", "--allow-run", "input.ts"],
      ["compile", "--allow-run=cmd1,cmd2", "input.ts"],
      ["compile", "--deny-run", "input.ts"],
      ["compile", "--deny-run=cmd1,cmd2", "input.ts"],
      ["compile", "--allow-ffi", "input.ts"],
      ["compile", "--allow-ffi=path1,path2", "input.ts"],
      ["compile", "--deny-ffi", "input.ts"],
      ["compile", "--deny-ffi=path1,path2", "input.ts"],
    ],
  );
});

Deno.test("deno().compile() passes correct arguments", async () => {
  await using command = fakeCommand();
  await deno().compile("input.ts", {
    scriptArgs: ["--arg1", "--arg2=value2"],
    include: ["include1", "include2"],
    exclude: ["exclude1", "exclude2"],
    icon: "icon.ico",
    terminal: false,
    output: "output",
    target: "x86_64-unknown-linux-gnu",
  });
  assertArrayObjectMatch(
    command.runs,
    [{
      command: "deno",
      options: {
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
          "input.ts",
          "--arg1",
          "--arg2=value2",
        ],
      },
      stdin: null,
    }],
  );
});

Deno.test("deno().fmt() passes correct arguments", async () => {
  await using command = fakeCommand();
  await deno().fmt(["input1.ts", "input2.ts"], {
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
  });
  assertArrayObjectMatch(
    command.runs,
    [{
      command: "deno",
      options: {
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
          "input1.ts",
          "input2.ts",
        ],
      },
      stdin: null,
    }],
  );
});

Deno.test("deno().lint() passes correct arguments", async () => {
  await using command = fakeCommand();
  await deno().lint(["input1.ts", "input2.ts"], {
    compact: true,
    fix: true,
    ignore: ["ignore1", "ignore2"],
    json: true,
    rulesExclude: ["rulesExclude1", "rulesExclude2"],
    rulesInclude: ["rulesInclude1", "rulesInclude2"],
    rulesTags: ["rulesTags1", "rulesTags2"],
  });
  assertArrayObjectMatch(
    command.runs,
    [{
      command: "deno",
      options: {
        args: [
          "lint",
          "--compact",
          "--fix",
          "--ignore=ignore1,ignore2",
          "--json",
          "--rules-exclude=rulesExclude1,rulesExclude2",
          "--rules-include=rulesInclude1,rulesInclude2",
          "--rules-tags=rulesTags1,rulesTags2",
          "input1.ts",
          "input2.ts",
        ],
      },
      stdin: null,
    }],
  );
});
