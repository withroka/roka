/**
 * A library with helpers for CLI applications.
 *
 * This package only provides the {@link [config]} module to manage a local
 * file system user configuration.
 *
 * ```ts
 * import { config } from "@roka/cli/config";
 * async function usage() {
 *   type AppConfig = { username: string };
 *   using cfg = config<AppConfig>();
 *   const data = await cfg.get();
 *   await cfg.set({ username: "USER" });
 * }
 * ```
 *
 * ## Modules
 *
 *  -  {@link [config]}: Store user configuration.
 *
 * @module cli
 */
