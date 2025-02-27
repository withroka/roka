import { version } from "@roka/forge/app";
import { assertMatch } from "@std/assert";

Deno.test("version()", async () => {
  assertMatch(await version(), /[^\s]+/);
});

Deno.test("version({ build: true })", async () => {
  assertMatch(await version({ build: true }), /[^\s]+ \([^\s]+\)/);
});

Deno.test("version({ deno: true })", async () => {
  assertMatch(
    await version({ deno: true }),
    /[^\s]+\ndeno [^\s]+\nv8 [^\s]+\ntypescript [^\s]+/,
  );
});
