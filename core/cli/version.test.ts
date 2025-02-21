import { version } from "@roka/cli/version";
import { assertMatch } from "@std/assert/match";

Deno.test("version() includes deno version", async () => {
  assertMatch(await version(), /\ndeno \d+\.\d+\.\d+(\n|$)/);
});

Deno.test("version() includes typescript version", async () => {
  assertMatch(await version(), /\ntypescript \d+\.\d+\.\d+(\n|$)/);
});
