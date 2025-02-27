import { version } from "@roka/forge/app";

if (import.meta.main) {
  console.log(`Hello, world! [version: ${await version()}]`);
}
