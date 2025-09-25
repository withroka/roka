import { assertArrayObjectMatch } from "@roka/assert";
import { deno } from "@roka/deno";
import { fakeCommand } from "@roka/testing/fake";

Deno.test("deno().compile() passes correct arguments", async () => {
  await using command = fakeCommand();
  await deno().compile(["input.ts"], {
    allowAll: true,
    noPrompt: true,
    target: "x86_64-unknown-linux-gnu",
    output: "output",
    include: ["include1", "include2"],
    exclude: ["exclude1", "exclude2"],
  });
  assertArrayObjectMatch(
    command.runs,
    [{
      command: "deno",
      options: {
        args: [
          "compile",
          "--allow-all",
          "--no-prompt",
          "--exclude",
          "exclude1",
          "--exclude",
          "exclude2",
          "--include",
          "include1",
          "--include",
          "include2",
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
