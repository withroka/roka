import { assertMatch, assertStringIncludes } from "@std/assert";
import { version } from "./version.ts";

Deno.test("version() provides version", async () => {
  assertMatch(await version(), /[^\s]+/);
});

Deno.test("version({ release: true }) includes release type", async () => {
  assertMatch(await version({ release: true }), /[^\s]+ \([^\s]+\)/);
});

Deno.test("version({ target: true }) includes target architecture", async () => {
  assertStringIncludes(await version({ target: true }), Deno.build.target);
});
