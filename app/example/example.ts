// deno-lint-ignore-file no-console
import { version } from "@roka/forge/version";

if (import.meta.main) {
  console.log(`Hello, world! [version: ${await version()}]`);
}
