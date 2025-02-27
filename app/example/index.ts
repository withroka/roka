import { version } from "@roka/cli/version";

if (import.meta.main) {
  console.log(`Hello, world! [version: ${await version()}]`);
}
