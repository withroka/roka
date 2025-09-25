import { deno } from "@roka/deno";
import { tempDirectory } from "@roka/fs/temp";
import { fakeEnv } from "@roka/testing/fake";
import { assertEquals } from "@std/assert";

async function assertDenoArguments(
  fn: () => Promise<unknown>,
  args: string[],
): Promise<void> {
  await using dir = await tempDirectory({ chdir: true });
  Deno.env.set("PATH", dir.path());
  await using _ = fakeEnv({ PATH: dir.path() });
  await Deno.writeTextFile("deno", '#!sh\necho "$@" > output.txt\n');
  await Deno.chmod("deno", 0o755);
  console.log(await Array.fromAsync(Deno.readDir(".")));
  console.log(await Deno.stat("deno"));
  await fn();
  const output = await Deno.readTextFile("output.txt");
  console.log({ output });
  const parts = output.split("\n").filter((x) => x.length);
  assertEquals(parts, args);
}

Deno.test("deno().compile() passes correct arguments", async () => {
  await assertDenoArguments(
    () =>
      deno().compile(["input.ts"], {
        allowAll: true,
        noPrompt: true,
        target: "x86_64-unknown-linux-gnu",
        output: "output",
        include: ["include1", "include2"],
        exclude: ["exclude1", "exclude2"],
      }),
    [
      "compile",
      "-A",
      "--no-prompt",
      "--target",
      "x86_64-unknown-linux-gnu",
      "--output",
      "output",
      "--include",
      "include1",
      "--include",
      "include2",
      "--exclude",
      "exclude1",
      "--exclude",
      "exclude2",
      "input.ts",
    ],
  );
});
