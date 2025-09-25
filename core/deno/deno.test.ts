import { assertArrayObjectMatch } from "@roka/assert";
import { deno } from "@roka/deno";
import { fakeCommand } from "@roka/testing/fake";
import { assertEquals } from "@std/assert";

Deno.test("deno() passes correct type checking arguments", async () => {
  // @todo use the check command
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
  await deno().compile(["input.ts"], {
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
          "input.ts",
        ],
      },
      stdin: null,
    }],
  );
});
