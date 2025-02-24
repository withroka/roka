import type { Package } from "@roka/package";

/** Returns the changelog summary for a package since its last release. */
export function changelog(pkg: Package): string {
  return pkg.update?.changelog?.map((c) => ` * ${c.summary}`).join("\n") ?? "";
}
