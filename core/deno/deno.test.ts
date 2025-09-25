import { assertArrayObjectMatch } from "@roka/assert";
import { deno, DenoError } from "@roka/deno";
import { fakeCommand } from "@roka/testing/fake";
import { assertEquals, assertRejects } from "@std/assert";

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
  await deno().lint(["input.ts"], { watch: true, noClearScreen: true });
  assertEquals(
    command.runs.map((x) => x?.options?.args),
    [
      ["lint", "input.ts"],
      ["lint", "input.ts"],
      ["lint", "--watch", "input.ts"],
      [
        "lint",
        "--watch",
        "--watch-exclude",
        "exclude1",
        "--watch-exclude",
        "exclude2",
        "input.ts",
      ],
      ["lint", "--watch", "--no-clear-screen", "input.ts"],
    ],
  );
  assertRejects(
    () => deno().lint(["input"], { watchExclude: ["exclude"] }),
    DenoError,
  );
  assertRejects(
    () => deno().lint(["input"], { noClearScreen: true }),
    DenoError,
  );
});

Deno.test("deno() passes correct type checking arguments", async () => {
  // @todo use the run command
  await using command = fakeCommand();
  await deno().compile(["input.ts"]);
  await deno().compile(["input.ts"], { check: true });
  await deno().compile(["input.ts"], { check: "all" });
  await deno().compile(["input.ts"], { check: false });
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

Deno.test("deno().compile() passes correct arguments", async () => {
  await using command = fakeCommand();
  await deno().compile(["input1.ts", "input2.ts"], {
    include: ["include1", "include2"],
    exclude: ["exclude1", "exclude2"],
    icon: "icon.ico",
    noTerminal: true,
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
          "--ignore",
          "ignore1",
          "--ignore",
          "ignore2",
          "--json",
          "--rules-exclude",
          "rulesExclude1",
          "--rules-exclude",
          "rulesExclude2",
          "--rules-include",
          "rulesInclude1",
          "--rules-include",
          "rulesInclude2",
          "--rules-tags",
          "rulesTags1",
          "--rules-tags",
          "rulesTags2",
          "input1.ts",
          "input2.ts",
        ],
      },
      stdin: null,
    }],
  );
});
