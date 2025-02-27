import { version } from "@roka/forge/app";
import { assertMatch } from "@std/assert";

Deno.test("version() provides version", async () => {
  assertMatch(await version(), /[^\s]+/);
});

Deno.test("version({ build: true }) includes build target", async () => {
  assertMatch(await version({ build: true }), /[^\s]+ \([^\s]+\)/);
});

Deno.test("version({ deno: true }) include deno versions as lines", async () => {
  assertMatch(
    await version({ deno: true }),
    /[^\s]+\ndeno [^\s]+\nv8 [^\s]+\ntypescript [^\s]+/,
  );
});
